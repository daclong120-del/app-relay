// Emulator Launcher & Lifecycle Controller for Stage 2 (chpay AVD)

import { spawn } from 'child_process';
import { AdbClient } from './adb-client';

export interface EnsureEmulatorOptions {
  avdName?: string;
  serial?: string;
  emulatorPath?: string;
  adbClient?: AdbClient;
  bootTimeoutMs?: number;
  pollIntervalMs?: number;
  headless?: boolean;
  gpuMode?: string;
  isCancelled?: () => boolean;
}

export interface EnsureEmulatorResult {
  serial: string;
  booted: boolean;
  wasLaunched: boolean;
}

export async function ensureEmulatorRunning(
  options?: EnsureEmulatorOptions
): Promise<EnsureEmulatorResult> {
  const avdName = options?.avdName || process.env.AVD_NAME || 'chpay';
  const serial = options?.serial || process.env.ADB_DEVICE_SERIAL || 'emulator-5554';
  const emulatorPath = options?.emulatorPath || process.env.EMULATOR_PATH || 'emulator';
  const adb = options?.adbClient || new AdbClient(process.env.ADB_PATH || 'adb');
  const bootTimeoutMs = options?.bootTimeoutMs || 180000;
  const pollIntervalMs = options?.pollIntervalMs || 2000;
  const isCancelled = options?.isCancelled || (() => false);
  // HEADLESS explicit ('true'/'false') luôn thắng; nếu không set thì mới suy ra từ NODE_ENV.
  const headlessEnv = (process.env.HEADLESS || '').trim().toLowerCase();
  const isHeadless =
    options?.headless ??
    (headlessEnv === 'true'
      ? true
      : headlessEnv === 'false'
        ? false
        : process.env.NODE_ENV === 'production');
  // Chế độ GPU cho lần chạy có GUI. Phải truyền tường minh: nếu AVD có
  // hw.gpu.enabled=no thì emulator vẫn khởi động nhưng KHÔNG dựng được cửa sổ nào.
  // swiftshader_indirect (render phần mềm) chạy được ở mọi nơi, kể cả WSL không có /dev/dri.
  const gpuMode = options?.gpuMode || process.env.EMULATOR_GPU_MODE || 'swiftshader_indirect';

  // 1. Check if device is already online and sys.boot_completed == 1
  try {
    const devices = await adb.getDevices();
    const target = devices.find((d) => d.serial === serial && d.state === 'device');
    if (target) {
      const booted = await adb.getDeviceProperty(serial, 'sys.boot_completed');
      if (booted === '1') {
        console.log(`[EmulatorLauncher] Device "${serial}" is already online and booted. Reusing device.`);
        await unlockAndConfigureDevice(adb, serial);
        return { serial, booted: true, wasLaunched: false };
      }
    }
  } catch (err: any) {
    // ADB check failed, proceed with launch attempt
  }

  // 2. Launch emulator in background process (detached)
  console.log(`[EmulatorLauncher] Device "${serial}" not ready. Launching AVD "${avdName}" via "${emulatorPath}" (headless=${isHeadless}, gpu=${isHeadless ? 'off' : gpuMode})...`);

  const emulatorArgs = [
    '-avd', avdName,
    '-no-snapshot-save',
    '-netdelay', 'none',
    '-netspeed', 'full',
  ];

  if (isHeadless) {
    emulatorArgs.push('-no-window', '-no-audio', '-no-boot-anim', '-gpu', 'off');
  } else {
    emulatorArgs.push('-gpu', gpuMode, '-no-audio', '-no-boot-anim');
  }

  try {
    const child = spawn(emulatorPath, emulatorArgs, {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.on('error', (err) => {
      console.warn(`[EmulatorLauncher] Emulator process error: ${err.message}`);
    });
    child.unref();
  } catch (err: any) {
    throw new Error(`EMULATOR_LAUNCH_FAILED: Failed to start emulator executable "${emulatorPath}": ${err.message}`);
  }


  // 3. Poll until boot_completed === '1'
  const startTime = Date.now();
  let isBooted = false;

  while (Date.now() - startTime < bootTimeoutMs) {
    if (isCancelled()) {
      throw new Error('JOB_CANCELLED: Job cancelled while waiting for emulator to boot.');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    try {
      const booted = await adb.getDeviceProperty(serial, 'sys.boot_completed');
      if (booted === '1') {
        isBooted = true;
        break;
      }
    } catch {
      // Emulator still starting up
    }
  }

  if (!isBooted) {
    throw new Error(`EMULATOR_BOOT_TIMEOUT: AVD "${avdName}" on serial "${serial}" failed to complete boot within ${Math.floor(bootTimeoutMs / 1000)}s.`);
  }

  console.log(`[EmulatorLauncher] AVD "${avdName}" successfully booted on "${serial}". Configuring screen...`);

  // 4. Unlock screen & set screen timeout
  await unlockAndConfigureDevice(adb, serial);

  return { serial, booted: true, wasLaunched: true };
}

export async function unlockAndConfigureDevice(adb: AdbClient, serial: string): Promise<void> {
  try {
    await adb.wakeAndUnlockScreen(serial);
    await adb.swipe(serial, 540, 1800, 540, 600, 300);
    await adb.setScreenOffTimeout(serial, 1800000); // 30 mins
  } catch (err: any) {
    console.warn(`[EmulatorLauncher] Warning: Could not configure screen unlock on "${serial}": ${err.message}`);
  }
}
