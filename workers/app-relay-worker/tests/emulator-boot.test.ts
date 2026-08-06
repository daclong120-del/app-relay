// Unit & Integration Test Suite for Stage 2 (Emulator Boot & Preflight Pipeline)

import { AdbClient, AdbDeviceInfo, AdbDeviceProperties } from '../src/adapters/android/adb-client';
import { runDevicePreflight } from '../src/adapters/android/device-preflight';
import { ensureEmulatorRunning, unlockAndConfigureDevice } from '../src/adapters/android/emulator-launcher';

async function runEmulatorBootTests() {
  console.log('--- STARTING STAGE 2 EMULATOR BOOT TESTS ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  // ── Mock AdbClient ───────────────────────────────────────────────────
  class MockAdbClient extends AdbClient {
    public mockDevices: AdbDeviceInfo[] = [
      { serial: 'emulator-5554', state: 'device' },
    ];
    public mockBootCompleted = '1';
    public mockPlayInstalled = true;
    public wakeCalled = false;
    public swipeCalled = false;
    public timeoutCalled = false;

    async getDevices(): Promise<AdbDeviceInfo[]> {
      return this.mockDevices;
    }

    async getDeviceProperty(serial: string, prop: string): Promise<string> {
      if (prop === 'sys.boot_completed') return this.mockBootCompleted;
      if (prop === 'ro.build.version.sdk') return '33';
      if (prop === 'ro.product.cpu.abi') return 'x86_64';
      if (prop === 'ro.sf.lcd_density') return '440';
      if (prop === 'persist.sys.locale') return 'en-US';
      return '';
    }

    async getDeviceProperties(serial: string): Promise<AdbDeviceProperties> {
      return {
        sdk: 33,
        abi: 'x86_64',
        density: 440,
        locale: 'en-US',
        bootCompleted: this.mockBootCompleted === '1',
      };
    }

    async wakeAndUnlockScreen(serial: string): Promise<void> {
      this.wakeCalled = true;
    }

    async swipe(serial: string, x1: number, y1: number, x2: number, y2: number, durationMs?: number): Promise<void> {
      this.swipeCalled = true;
    }

    async setScreenOffTimeout(serial: string, timeoutMs?: number): Promise<void> {
      this.timeoutCalled = true;
    }

    async checkPackagePath(serial: string, packageId: string): Promise<string[]> {
      if (packageId === 'com.android.vending' && this.mockPlayInstalled) {
        return ['package:/system/priv-app/Phonesky/Phonesky.apk'];
      }
      return [];
    }
  }

  // 1. Test unlockAndConfigureDevice
  const mockAdb1 = new MockAdbClient();
  await unlockAndConfigureDevice(mockAdb1, 'emulator-5554');
  assert(mockAdb1.wakeCalled, 'unlockAndConfigureDevice wakes screen');
  assert(mockAdb1.swipeCalled, 'unlockAndConfigureDevice performs swipe unlock');
  assert(mockAdb1.timeoutCalled, 'unlockAndConfigureDevice sets screen off timeout');

  // 2. Test ensureEmulatorRunning (Online Device Reuse)
  const mockAdb2 = new MockAdbClient();
  const bootResult = await ensureEmulatorRunning({
    serial: 'emulator-5554',
    avdName: 'chpay',
    adbClient: mockAdb2,
  });

  assert(bootResult.booted === true, 'ensureEmulatorRunning detects online device as booted');
  assert(bootResult.wasLaunched === false, 'ensureEmulatorRunning reuses running device without re-launching');
  assert(mockAdb2.wakeCalled && mockAdb2.swipeCalled, 'ensureEmulatorRunning configures screen on reuse');

  // 3. Test ensureEmulatorRunning cancellation support
  const mockAdb3 = new MockAdbClient();
  mockAdb3.mockDevices = []; // Simulate device not online yet

  let caughtCancellation = false;
  try {
    await ensureEmulatorRunning({
      serial: 'emulator-5554',
      avdName: 'non_existent_avd_test',
      emulatorPath: 'invalid_emulator_cmd_xyz',
      bootTimeoutMs: 5000,
      pollIntervalMs: 100,
      adbClient: mockAdb3,
      isCancelled: () => true, // Immediate cancellation
    });
  } catch (err: any) {
    if (err.message.includes('JOB_CANCELLED')) {
      caughtCancellation = true;
    }
  }
  assert(caughtCancellation, 'ensureEmulatorRunning respects job cancellation signal');

  // 4. Test runDevicePreflight integration with Stage 2 auto-boot
  const mockAdb4 = new MockAdbClient();
  const preflightRes = await runDevicePreflight({
    serial: 'emulator-5554',
    avdName: 'chpay',
    adbClient: mockAdb4,
  });

  assert(preflightRes.ready === true, 'Preflight returns ready=true');
  assert(preflightRes.serial === 'emulator-5554', 'Preflight returns correct serial');
  assert(preflightRes.playStoreInstalled === true, 'Preflight verifies Google Play Store presence');
  assert(preflightRes.deviceProfile.sdk === 33, 'Preflight populates device profile');

  // 5. Test Preflight error when Play Store is missing
  const mockAdb5 = new MockAdbClient();
  mockAdb5.mockPlayInstalled = false;
  let caughtNoPlay = false;

  try {
    await runDevicePreflight({
      serial: 'emulator-5554',
      avdName: 'chpay',
      adbClient: mockAdb5,
    });
  } catch (err: any) {
    if (err.message.includes('DEVICE_UNAVAILABLE') && err.message.includes('com.android.vending')) {
      caughtNoPlay = true;
    }
  }
  assert(caughtNoPlay, 'Preflight throws clear error when Play Store is not installed on device');

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runEmulatorBootTests().catch((err) => {
  console.error('Fatal error in emulator boot test:', err);
  process.exit(1);
});
