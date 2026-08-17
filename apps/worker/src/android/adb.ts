import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const adbPath = process.env.ADB_PATH || 'adb';

/**
 * INT32_MAX mili-giây (~24,8 ngày) — Android hiểu là "không bao giờ tắt màn hình".
 *
 * Giá trị này BỊ TRÙNG LẶP có chủ đích ở `docker/wait-for-emulator.sh`: shell
 * không import được TypeScript, mà màn hình phải chống ngủ ngay từ lúc boot chứ
 * không đợi tới job đầu tiên. Đổi ở đây thì đổi cả bên đó — hoặc đặt
 * EMULATOR_SCREEN_OFF_TIMEOUT, cả hai cùng đọc biến này.
 *
 * Trước đây file này ghi 1800000 (30 phút) và nó chạy SAU script boot, nên nó
 * âm thầm ghi đè giá trị của script. Màn hình ngủ giữa hai job làm job kế tiếp
 * fail ở bước tìm phần tử UI — lỗi hiện ra không liên quan gì tới màn hình.
 */
const SCREEN_OFF_TIMEOUT = process.env.EMULATOR_SCREEN_OFF_TIMEOUT || '2147483647';

export async function execAdb(args: string, options?: { timeout?: number }): Promise<string> {
  const cmd = `"${adbPath}" ${args}`;
  try {
    const { stdout } = await execAsync(cmd, { encoding: 'utf-8', timeout: options?.timeout ?? 600000, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (err: any) {
    throw new Error(`ADB command failed (${cmd}): ${err.message || err.stderr || err}`);
  }
}

export async function isDeviceReady(): Promise<boolean> {
  try {
    const raw = await execAdb('devices');
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.some((line) => {
      if (line.startsWith('List of devices')) return false;
      const parts = line.split(/\s+/);
      return parts.length >= 2 && parts[1] === 'device';
    });
  } catch {
    return false;
  }
}

/**
 * Ghi `screen_off_timeout` rồi ĐỌC LẠI để kiểm chứng.
 *
 * `adb shell settings put` thoát mã 0 kể cả khi lệnh bên trong thiết bị hỏng
 * (điển hình: adb chưa authorized), nên execAdb không bao giờ throw ở đây. Cách
 * duy nhất biết lệnh có ăn hay không là đọc lại giá trị.
 */
async function applyScreenOffTimeout(want: string, attempts = 3): Promise<void> {
  let got = '';
  for (let i = 0; i < attempts; i++) {
    try {
      await execAdb(`shell settings put system screen_off_timeout ${want}`);
      got = (await execAdb('shell settings get system screen_off_timeout')).trim();
      if (got === want) return;
    } catch (err) {
      got = `<lỗi: ${err}>`;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Failed to set screen_off_timeout after ${attempts} attempts: got '${got}', expected '${want}'. ` +
      'Refusing to run the job — a screen that sleeps mid-job fails later with an unrelated UI error.'
  );
}

export async function wakeAndUnlockDevice(): Promise<void> {
  // Đánh thức và mở khoá là best-effort: máy đang sáng sẵn thì các keyevent này
  // vô hại, và một cú swipe trượt không phải lý do để huỷ job.
  try {
    await execAdb('shell input keyevent KEYCODE_WAKEUP');
    await execAdb('shell input keyevent 82');
    await execAdb('shell input swipe 540 1800 540 600 300');
  } catch (err) {
    console.warn(`[ADB] Wakeup device warning: ${err}`);
  }

  // Còn timeout màn hình thì KHÔNG best-effort — đặt không được là job sau đó
  // gần như chắc chắn fail, chỉ là fail muộn hơn và khó lần ra hơn.
  await applyScreenOffTimeout(SCREEN_OFF_TIMEOUT);
}

/** Cửa sổ đang giữ focus, ví dụ "com.android.vending/...MainActivity". '' nếu không đọc được. */
export async function getCurrentFocus(): Promise<string> {
  try {
    const raw = await execAdb('shell dumpsys window');
    const m = raw.match(/mCurrentFocus=Window\{[^}]*\}/);
    return m ? m[0] : '';
  } catch {
    return '';
  }
}

/**
 * Đóng hộp thoại "Application Not Responding" nếu có.
 *
 * ANR là kẻ phá hoại tệ nhất với mọi tự động hoá UI, và tệ vì nó VÔ HÌNH với
 * code không đi tìm nó: hộp thoại nằm đè lên tất cả và giữ focus, nên
 * `uiautomator dump` chụp được ĐÚNG NÓ (khoảng 12 node, package `android`)
 * thay vì màn hình thật, còn mọi `input tap` thì rơi vào nó. Nhìn từ phía
 * pipeline, triệu chứng chỉ là "không tìm thấy nút cần bấm" — hoàn toàn không
 * gợi ý gì tới nguyên nhân.
 *
 * Trả về tên package đang treo nếu có xử lý, chuỗi rỗng nếu màn hình sạch.
 */
export async function dismissAnrDialog(maxAttempts = 3): Promise<string> {
  let blocker = '';

  for (let i = 0; i < maxAttempts; i++) {
    const focus = await getCurrentFocus();
    const anr = focus.match(/Application Not Responding:\s*([A-Za-z0-9._]+)/);
    if (!anr) return blocker;

    blocker = anr[1];
    console.warn(`[ADB] ANR dialog detected for ${blocker} — dismissing (attempt ${i + 1}/${maxAttempts}).`);

    // BACK đóng hộp thoại; force-stop để nó đừng treo lại ngay sau đó.
    try {
      await execAdb('shell input keyevent KEYCODE_BACK');
      await execAdb(`shell am force-stop ${blocker}`);
    } catch (err) {
      console.warn(`[ADB] Failed to dismiss ANR for ${blocker}: ${err}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const still = await getCurrentFocus();
  if (/Application Not Responding/.test(still)) {
    // Không ném lỗi ở đây: người gọi mới biết ANR này có chặn việc của mình
    // hay không, và thông báo lỗi nên nói theo ngữ cảnh của họ.
    console.warn(`[ADB] ANR dialog still present after ${maxAttempts} attempts: ${still}`);
  }
  return blocker;
}

/**
 * Gỡ app khỏi thiết bị sau khi đã kéo xong APK.
 *
 * `/data` của emulator là tài nguyên dùng chung giữa mọi job, mà job chỉ cần
 * app đủ lâu để `pm path` + `adb pull`. Giữ lại là rò rỉ tích luỹ: mỗi app vài
 * trăm MB, vài chục job sau thì Play Store từ chối cài với "device is out of
 * storage" — và lỗi đó nổ ở một job hoàn toàn khác, không dính gì tới job đã
 * làm đầy đĩa. Rất tốn công lần ngược.
 *
 * Không ném lỗi: dọn dẹp thất bại không được phép làm hỏng một job đã kéo xong.
 */
export async function uninstallPackage(packageId: string): Promise<boolean> {
  if (!packageId || !/^[a-zA-Z0-9._]+$/.test(packageId)) return false;
  try {
    // `pm uninstall` thoát mã 0 kể cả khi in "Failure", nên phải đọc output.
    const out = await execAdb(`shell pm uninstall ${packageId}`);
    const ok = /Success/i.test(out);
    if (ok) {
      console.log(`[ADB] Đã gỡ ${packageId} khỏi thiết bị.`);
    } else {
      console.warn(`[ADB] Gỡ ${packageId} không thành công: ${out.trim() || 'no output'}`);
    }
    return ok;
  } catch (err) {
    console.warn(`[ADB] Gỡ ${packageId} lỗi: ${err}`);
    return false;
  }
}

export async function getInstalledPaths(packageId: string): Promise<string[]> {
  if (!packageId || !/^[a-zA-Z0-9._]+$/.test(packageId)) {
    return [];
  }
  try {
    const raw = await execAdb(`shell pm path ${packageId}`);
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('package:'));
    return lines.map((l) => l.replace(/^package:/, ''));
  } catch {
    return [];
  }
}
