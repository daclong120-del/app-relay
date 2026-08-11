import { execAdb, getInstalledPaths, getCurrentFocus, dismissAnrDialog } from '../android/adb.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const PLAY_STORE_PKG = 'com.android.vending';

/** Chờ nút Install xuất hiện. Máy yếu có thể mất hàng chục giây mới vẽ xong trang. */
const INSTALL_BUTTON_TIMEOUT_MS = 120000;
const UI_POLL_INTERVAL_MS = 5000;

/** Sau khi bấm, chờ ngần này rồi kiểm tra xem cú bấm có ăn không. */
const TAP_VERIFY_DELAY_MS = 20000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getScreenDimensions(): Promise<{ width: number; height: number }> {
  try {
    const output = await execAdb('shell wm size');
    // Ưu tiên "Override size" — `wm size 720x1600` đặt override mà vẫn giữ
    // nguyên dòng "Physical size", nên đọc nhầm dòng là tính toạ độ trên một
    // độ phân giải không còn hiệu lực.
    const override = output.match(/Override size:\s*(\d+)x(\d+)/i);
    const physical = output.match(/Physical size:\s*(\d+)x(\d+)/i);
    const match = override || physical;
    if (match) {
      return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    }
  } catch (err) {
    console.warn(`[Installer] Failed to get screen dimensions via wm size: ${err}`);
  }
  return { width: 1080, height: 1920 };
}

/**
 * Toạ độ ĐOÁN của nút Install — chỉ dùng khi đã đọc UI thất bại.
 *
 * Giá trị cũ (0.78w, 0.40h) hiệu chỉnh cho một layout Play Store đời trước, nơi
 * Install là nút nhỏ lệch phải phía trên. Bố cục hiện tại là bottom sheet với
 * thanh Install rộng gần hết bề ngang, nằm quanh giữa màn hình — bấm theo số cũ
 * là rơi vào vùng đánh giá sao.
 *
 * Đây vẫn là phỏng đoán và Google đổi layout bất cứ lúc nào. Đường tin cậy là
 * đọc bounds từ `uiautomator dump`; hàm này chỉ là lối thoát cuối, và người gọi
 * phải biết mình đang đoán — xem giá trị trả về của triggerPlayStoreInstall().
 */
export async function getEstimatedInstallCoordinates(): Promise<{ x: number; y: number }> {
  const { width, height } = await getScreenDimensions();
  const x = Math.round(width * 0.5);
  const y = Math.round(height * 0.53);
  return { x, y };
}

/** Tìm bounds của nút Install trong XML dump. null nếu không có. */
export function findInstallButton(xmlContent: string): { x: number; y: number } | null {
  const installMatch =
    xmlContent.match(/text="(Install|Cài đặt|Get)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i) ||
    xmlContent.match(/content-desc="(Install|Cài đặt|Get)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i) ||
    xmlContent.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="(Install|Cài đặt|Get)"/i);

  if (!installMatch) return null;

  let x1: number, y1: number, x2: number, y2: number;
  if (/^\d+$/.test(installMatch[1])) {
    // Regex 3: bounds đứng TRƯỚC text (nhóm 1..4 là toạ độ, nhóm 5 là chữ)
    x1 = parseInt(installMatch[1], 10);
    y1 = parseInt(installMatch[2], 10);
    x2 = parseInt(installMatch[3], 10);
    y2 = parseInt(installMatch[4], 10);
  } else {
    // Regex 1 hoặc 2: chữ đứng trước bounds
    x1 = parseInt(installMatch[2], 10);
    y1 = parseInt(installMatch[3], 10);
    x2 = parseInt(installMatch[4], 10);
    y2 = parseInt(installMatch[5], 10);
  }

  if ([x1, y1, x2, y2].some(Number.isNaN)) return null;

  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
}

/** Chụp cây UI về file. Trả về nội dung XML, hoặc null nếu không lấy được. */
async function dumpUi(dumpPath: string): Promise<string | null> {
  try {
    await execAdb('shell uiautomator dump /sdcard/window_dump.xml');
    await execAdb(`pull /sdcard/window_dump.xml "${dumpPath}"`);
  } catch (err) {
    console.warn(`[Installer] UI dump warning: ${err}`);
    return null;
  }
  if (!existsSync(dumpPath)) return null;

  const xml = await fs.readFile(dumpPath, 'utf-8');
  await fs.rm(dumpPath, { force: true }).catch(() => {});
  return xml;
}

/**
 * Mở trang app và bấm Install.
 *
 * Trả về `true` khi đã bấm đúng vào nút đọc được từ cây UI, `false` khi phải
 * bấm theo toạ độ đoán. Giá trị này KHÔNG phải trang trí: người gọi dùng nó để
 * quyết định có nên chờ lâu hay fail sớm. Bản cũ luôn `return true` nên không
 * ai phân biệt được "đã bấm trúng" với "bấm đại rồi hy vọng".
 *
 * Ném lỗi khi có thứ chặn hẳn (ANR dai dẳng, Play Store không mở được).
 */
export async function triggerPlayStoreInstall(packageId: string, workDir: string): Promise<boolean> {
  if (!packageId || !/^[a-zA-Z0-9._]+$/.test(packageId)) {
    throw new Error(`Invalid packageId format: ${packageId}`);
  }
  console.log(`[Installer] Triggering Play Store install for ${packageId}...`);

  // Dọn ANR TRƯỚC khi mở Play Store. Hộp thoại còn đó thì mọi dump sau này chỉ
  // chụp được nó, và mọi cú bấm rơi vào nó.
  const preBlocker = await dismissAnrDialog();
  if (preBlocker) {
    console.warn(`[Installer] Cleared a pre-existing ANR dialog from ${preBlocker} before opening Play Store.`);
  }

  await execAdb(`shell am force-stop ${PLAY_STORE_PKG}`);
  await execAdb(`shell am start -a android.intent.action.VIEW -d "market://details?id=${packageId}"`);

  const dumpPath = path.join(workDir, `ui_dump_${packageId}.xml`);
  const deadline = Date.now() + INSTALL_BUTTON_TIMEOUT_MS;
  let lastAnr = '';
  let sawPlayStore = false;

  // Chờ theo ĐIỀU KIỆN, không theo đồng hồ. Bản cũ ngủ cứng 8 giây rồi dump một
  // lần duy nhất — trên máy chậm, trang chưa vẽ xong nên dump không bao giờ có
  // nút Install, và nó im lặng rơi xuống nhánh bấm đoán.
  while (Date.now() < deadline) {
    const anr = await dismissAnrDialog();
    if (anr) lastAnr = anr;

    const focus = await getCurrentFocus();
    if (focus.includes(PLAY_STORE_PKG)) sawPlayStore = true;

    const xml = await dumpUi(dumpPath);
    if (xml) {
      const btn = findInstallButton(xml);
      if (btn) {
        const waited = Math.round((INSTALL_BUTTON_TIMEOUT_MS - (deadline - Date.now())) / 1000);
        console.log(`[Installer] Install button found at (${btn.x}, ${btn.y}) after ${waited}s — tapping.`);
        await execAdb(`shell input tap ${btn.x} ${btn.y}`);
        return true;
      }
    }

    await sleep(UI_POLL_INTERVAL_MS);
  }

  // Hết giờ mà không thấy nút. Phân biệt nguyên nhân thay vì gộp làm một.
  const finalFocus = await getCurrentFocus();
  if (/Application Not Responding/.test(finalFocus)) {
    throw new Error(
      `INSTALL_BLOCKED_BY_ANR: an ANR dialog (${lastAnr || 'unknown package'}) kept the screen after ` +
        `${INSTALL_BUTTON_TIMEOUT_MS / 1000}s and swallowed every tap. The device is too overloaded to drive the UI.`
    );
  }
  if (!sawPlayStore) {
    throw new Error(
      `INSTALL_PLAY_STORE_NOT_FOREGROUND: Play Store never reached the foreground within ` +
        `${INSTALL_BUTTON_TIMEOUT_MS / 1000}s (last focus: ${finalFocus || 'unknown'}).`
    );
  }

  // Play Store có lên tiền cảnh nhưng không đọc được nút — thử đoán, và nói rõ
  // là đang đoán.
  const estimated = await getEstimatedInstallCoordinates();
  console.warn(
    `[Installer] Install button not found in UI dump after ${INSTALL_BUTTON_TIMEOUT_MS / 1000}s. ` +
      `Falling back to estimated coordinates (${estimated.x}, ${estimated.y}) — this is a guess.`
  );
  await execAdb(`shell input tap ${estimated.x} ${estimated.y}`);
  return false;
}

export async function ensureAppInstalled(packageId: string, workDir: string, maxWaitMs = 360000): Promise<string[]> {
  let paths = await getInstalledPaths(packageId);
  if (paths.length > 0) {
    console.log(`[Installer] App ${packageId} is already installed on emulator. Uninstalling previous version to ensure fresh pull...`);
    try {
      await execAdb(`shell pm uninstall ${packageId}`);
    } catch (err) {
      console.warn(`[Installer] Uninstall warning for ${packageId}: ${err}`);
    }
  }

  const tappedRealButton = await triggerPlayStoreInstall(packageId, workDir);

  // Kiểm chứng cú bấm có ăn không, thay vì poll mù suốt maxWaitMs.
  //
  // `adb shell input tap` luôn thành công — nó chỉ bơm sự kiện chạm, không quan
  // tâm dưới ngón tay có gì. Nên cách duy nhất biết Play Store đã nhận lệnh là
  // nhìn hệ quả: app đã cài xong, hoặc Play Store vẫn ở tiền cảnh (đang tải).
  await sleep(TAP_VERIFY_DELAY_MS);
  paths = await getInstalledPaths(packageId);
  if (paths.length === 0) {
    const focus = await getCurrentFocus();
    if (!focus.includes(PLAY_STORE_PKG)) {
      throw new Error(
        `INSTALL_DID_NOT_START: ${TAP_VERIFY_DELAY_MS / 1000}s after the Install tap, ${packageId} is not ` +
          `installed and Play Store is no longer in the foreground (focus: ${focus || 'unknown'}). ` +
          (tappedRealButton
            ? 'The tap hit the button read from the UI tree but nothing happened.'
            : 'The tap used estimated coordinates and most likely missed.')
      );
    }
  }

  const pollIntervalMs = 5000;
  let elapsed = TAP_VERIFY_DELAY_MS;

  while (elapsed < maxWaitMs) {
    if (paths.length > 0) {
      console.log(`[Installer] App ${packageId} installed successfully after ${Math.round(elapsed / 1000)}s!`);
      return paths;
    }
    await sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
    paths = await getInstalledPaths(packageId);

    if (elapsed % 15000 === 0) {
      console.log(`[Installer] Still waiting for Play Store install (${Math.round(elapsed / 1000)}s elapsed)...`);
    }
  }

  if (paths.length > 0) return paths;

  throw new Error(
    `INSTALL_TIMEOUT: Play Store did not finish installing ${packageId} within ${Math.round(maxWaitMs / 1000)}s ` +
      `(Install tap ${tappedRealButton ? 'hit the real button' : 'used estimated coordinates'}).`
  );
}
