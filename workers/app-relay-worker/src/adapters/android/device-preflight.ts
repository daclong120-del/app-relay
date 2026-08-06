// Device Preflight Inspector & Readiness Validator

import { AdbClient, AdbDeviceProperties } from './adb-client';

export interface AppRelayDeviceProfile {
  sdk: number;
  abi: string;
  density: number;
  locale: string;
}

export interface PreflightResult {
  ready: boolean;
  serial: string;
  deviceProfile: AppRelayDeviceProfile;
  playStoreInstalled: boolean;
  warnings?: string[];
}

export async function runDevicePreflight(
  serial: string,
  adbClient: AdbClient
): Promise<PreflightResult> {
  const devices = await adbClient.getDevices();
  const targetDevice = devices.find((d) => d.serial === serial);

  if (!targetDevice) {
    throw new Error(`DEVICE_UNAVAILABLE: Configured ADB device "${serial}" is not connected.`);
  }

  if (targetDevice.state !== 'device') {
    throw new Error(`DEVICE_UNAVAILABLE: Configured ADB device "${serial}" state is "${targetDevice.state}". Must be "device".`);
  }

  const props: AdbDeviceProperties = await adbClient.getDeviceProperties(serial);

  if (!props.bootCompleted) {
    throw new Error(`EMULATOR_BOOT_TIMEOUT: Device "${serial}" sys.boot_completed is not 1.`);
  }

  // Wake and unlock screen
  try {
    await adbClient.wakeAndUnlockScreen(serial);
  } catch {}

  // Check Google Play Store package presence
  const playPaths = await adbClient.checkPackagePath(serial, 'com.android.vending');
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
  };
}
