import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const adbPath = process.env.ADB_PATH || 'adb';

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

export async function wakeAndUnlockDevice(): Promise<void> {
  try {
    await execAdb('shell input keyevent KEYCODE_WAKEUP');
    await execAdb('shell input keyevent 82');
    await execAdb('shell input swipe 540 1800 540 600 300');
    await execAdb('shell settings put system screen_off_timeout 1800000');
  } catch (err) {
    console.warn(`[ADB] Wakeup device warning: ${err}`);
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
