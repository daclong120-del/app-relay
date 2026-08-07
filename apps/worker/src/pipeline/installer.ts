import { execAdb, getInstalledPaths } from '../android/adb.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getScreenDimensions(): Promise<{ width: number; height: number }> {
  try {
    const output = await execAdb('shell wm size');
    const match = output.match(/Physical size:\s*(\d+)x(\d+)/i);
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

export async function getEstimatedInstallCoordinates(): Promise<{ x: number; y: number }> {
  const { width, height } = await getScreenDimensions();
  const x = Math.round(width * 0.78);
  const y = Math.round(height * 0.40);
  return { x, y };
}

export async function triggerPlayStoreInstall(packageId: string, workDir: string): Promise<boolean> {
  if (!packageId || !/^[a-zA-Z0-9._]+$/.test(packageId)) {
    throw new Error(`Invalid packageId format: ${packageId}`);
  }
  console.log(`[Installer] Triggering Play Store install for ${packageId}...`);

  await execAdb('shell am force-stop com.android.vending');
  await execAdb(`shell am start -a android.intent.action.VIEW -d "market://details?id=${packageId}"`);

  console.log(`[Installer] Waiting 8s for details sheet to render...`);
  await sleep(8000);

  const dumpPath = path.join(workDir, `ui_dump_${packageId}.xml`);
  try {
    await execAdb('shell uiautomator dump /sdcard/window_dump.xml');
    await execAdb(`pull /sdcard/window_dump.xml "${dumpPath}"`);
  } catch (err) {
    console.warn(`[Installer] UI dump warning: ${err}`);
  }

  const estimated = await getEstimatedInstallCoordinates();

  if (existsSync(dumpPath)) {
    const xmlContent = await fs.readFile(dumpPath, 'utf-8');
    await fs.rm(dumpPath, { force: true }).catch(() => {});

    const installMatch = xmlContent.match(/text="(Install|Cài đặt|Get)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i) ||
      xmlContent.match(/content-desc="(Install|Cài đặt|Get)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i) ||
      xmlContent.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="(Install|Cài đặt|Get)"/i);

    if (installMatch) {
      let x1: number, y1: number, x2: number, y2: number;
      if (/^\d+$/.test(installMatch[1])) {
        // Regex 3 matched: bounds appear BEFORE text (groups 1..4 are coords, group 5 is text)
        x1 = parseInt(installMatch[1], 10);
        y1 = parseInt(installMatch[2], 10);
        x2 = parseInt(installMatch[3], 10);
        y2 = parseInt(installMatch[4], 10);
      } else {
        // Regex 1 or 2 matched: text appears BEFORE bounds (group 1 is text, groups 2..5 are coords)
        x1 = parseInt(installMatch[2], 10);
        y1 = parseInt(installMatch[3], 10);
        x2 = parseInt(installMatch[4], 10);
        y2 = parseInt(installMatch[5], 10);
      }

      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
        const cx = Math.round((x1 + x2) / 2);
        const cy = Math.round((y1 + y2) / 2);
        console.log(`[Installer] Tapping Install CTA at bounds (${cx}, ${cy})...`);
        await execAdb(`shell input tap ${cx} ${cy}`);
      } else {
        console.warn(`[Installer] Parsed coordinates contain NaN, tapping calculated fallback (${estimated.x}, ${estimated.y})...`);
        await execAdb(`shell input tap ${estimated.x} ${estimated.y}`);
      }
    } else {
      console.log(`[Installer] Tapping calculated Play Store Install location (${estimated.x}, ${estimated.y})...`);
      await execAdb(`shell input tap ${estimated.x} ${estimated.y}`);
    }
  } else {
    console.log(`[Installer] Dump missing, tapping calculated Install coordinates (${estimated.x}, ${estimated.y})...`);
    await execAdb(`shell input tap ${estimated.x} ${estimated.y}`);
  }

  return true;
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

  await triggerPlayStoreInstall(packageId, workDir);

  const pollIntervalMs = 5000;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    await sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
    paths = await getInstalledPaths(packageId);
    if (paths.length > 0) {
      console.log(`[Installer] App ${packageId} installed successfully after ${Math.round(elapsed / 1000)}s!`);
      return paths;
    }
    if (elapsed % 15000 === 0) {
      console.log(`[Installer] Still waiting for Play Store install (${Math.round(elapsed / 1000)}s elapsed)...`);
    }
  }

  throw new Error(`Timeout waiting for Play Store to install ${packageId} after ${Math.round(maxWaitMs / 1000)}s`);
}
