// Device Preflight Inspector & Readiness Validator

import { AdbClient, AdbDeviceProperties } from './adb-client';
import { ensureEmulatorRunning, EnsureEmulatorOptions } from './emulator-launcher';

export interface AppRelayDeviceProfile {
  sdk: number;
  abi: string;
  density: number;
  locale: string;
}

export interface PreflightOptions extends EnsureEmulatorOptions {
  serial?: string;
  adbClient?: AdbClient;
}

export interface PreflightResult {
  ready: boolean;
  serial: string;
  deviceProfile: AppRelayDeviceProfile;
  playStoreInstalled: boolean;
  wasLaunched?: boolean;
  warnings?: string[];
}

export async function runDevicePreflight(
  serialOrOptions: string | PreflightOptions,
  adbClientParam?: AdbClient
): Promise<PreflightResult> {
  const options: PreflightOptions =
    typeof serialOrOptions === 'string'
      ? { serial: serialOrOptions, adbClient: adbClientParam }
      : serialOrOptions;

  const serial = options.serial || process.env.ADB_DEVICE_SERIAL || 'emulator-5554';
  const adb = options.adbClient || adbClientParam || new AdbClient();

  // Stage 2: Ensure emulator is booted and ready
  const bootRes = await ensureEmulatorRunning({
    ...options,
    serial,
    adbClient: adb,
  });

  const devices = await adb.getDevices();
  const targetDevice = devices.find((d) => d.serial === serial);

  if (!targetDevice) {
    throw new Error(`DEVICE_UNAVAILABLE: Configured ADB device "${serial}" is not connected.`);
  }

  if (targetDevice.state !== 'device') {
    throw new Error(`DEVICE_UNAVAILABLE: Configured ADB device "${serial}" state is "${targetDevice.state}". Must be "device".`);
  }

  const props: AdbDeviceProperties = await adb.getDeviceProperties(serial);

  if (!props.bootCompleted) {
    throw new Error(`EMULATOR_BOOT_TIMEOUT: Device "${serial}" sys.boot_completed is not 1.`);
  }

  // Check Google Play Store package presence
  const playPaths = await adb.checkPackagePath(serial, 'com.android.vending');
  const playStoreInstalled = playPaths.length > 0;

  if (!playStoreInstalled) {
    throw new Error(`DEVICE_UNAVAILABLE: Google Play Store (com.android.vending) is not installed on device "${serial}".`);
  }

  return {
    ready: true,
    serial,
    deviceProfile: {
      sdk: props.sdk,
      abi: props.abi,
      density: props.density,
      locale: props.locale,
    },
    playStoreInstalled: true,
    wasLaunched: bootRes.wasLaunched,
  };
}

