// Integration Test Suite for Android, Play UI & APK Extraction Pipeline (Phase 7)

import { promises as fs } from 'fs';
import { join } from 'path';
import { pullApksFromDevice } from '../src/adapters/android/apk-puller';
import {
  parseBoundsCenter,
  parsePlayUiAutomatorXml,
} from '../src/adapters/android/play-ui-automator';

class MockAdbClient {
  public pulledFiles: Map<string, string> = new Map();

  async checkPackagePath(serial: string, packageId: string): Promise<string[]> {
    if (packageId === 'com.example.single') {
      return ['/data/app/~~v1/com.example.single/base.apk'];
    }
    if (packageId === 'com.example.splits') {
      return [
        '/data/app/~~v2/com.example.splits/base.apk',
        '/data/app/~~v2/com.example.splits/split_config.arm64_v8a.apk',
        '/data/app/~~v2/com.example.splits/split_config.xxhdpi.apk',
      ];
    }
    return [];
  }

  async pullFile(serial: string, remotePath: string, localPath: string): Promise<void> {
    this.pulledFiles.set(remotePath, localPath);
    await fs.mkdir(join(localPath, '..'), { recursive: true });
    await fs.writeFile(localPath, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // Dummy ZIP magic bytes
  }

  async dumpsysPackage(serial: string, packageId: string): Promise<string> {
    return `Activity Resolver Table:\n  Full Package [${packageId}]:\n    userId=10189`;
  }
}

async function runAndroidPipelineTests() {
  console.log('--- STARTING ANDROID, PLAY UI & APK EXTRACTION PIPELINE TESTS (PHASE 7) ---');

  const fixturesDir = join(__dirname, 'fixtures', 'uiautomator');
  const installXml = await fs.readFile(join(fixturesDir, 'install-btn.xml'), 'utf-8');
  const alreadyInstalledXml = await fs.readFile(join(fixturesDir, 'already-installed.xml'), 'utf-8');
  const loginRequiredXml = await fs.readFile(join(fixturesDir, 'login-required.xml'), 'utf-8');
  const unsupportedRegionXml = await fs.readFile(join(fixturesDir, 'unsupported-region.xml'), 'utf-8');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Test Bounds Center Calculation
  const center = parseBoundsCenter('[100,500][980,620]');
  assert(center !== null && center.x === 540 && center.y === 560, 'Calculates UI element center coordinates accurately');

  // 2. Test UIAutomator XML State Machine - Ready to Install
  const target1 = parsePlayUiAutomatorXml(installXml);
  assert(target1.state === 'READY_TO_INSTALL', 'Recognizes READY_TO_INSTALL UI state');
  assert(target1.x === 540 && target1.y === 560, 'Returns correct Install button tap coordinates');

  // 3. Test UIAutomator XML State Machine - Already Installed
  const target2 = parsePlayUiAutomatorXml(alreadyInstalledXml);
  assert(target2.state === 'ALREADY_INSTALLED', 'Recognizes ALREADY_INSTALLED UI state');

  // 4. Test UIAutomator XML State Machine - Login Required
  const target3 = parsePlayUiAutomatorXml(loginRequiredXml);
  assert(target3.state === 'LOGIN_REQUIRED', 'Recognizes LOGIN_REQUIRED UI state');

  // 5. Test UIAutomator XML State Machine - Unsupported Region
  const target4 = parsePlayUiAutomatorXml(unsupportedRegionXml);
  assert(target4.state === 'UNSUPPORTED_REGION', 'Recognizes UNSUPPORTED_REGION UI state');

  // 6. Test APK Extraction - Single Base APK
  const mockAdb = new MockAdbClient();
  const tmpDirSingle = join(__dirname, 'scratch_test_single');
  await fs.rm(tmpDirSingle, { recursive: true, force: true });

  const resultSingle = await pullApksFromDevice('emulator-5554', 'com.example.single', tmpDirSingle, mockAdb as any);
  assert(resultSingle.allApkPaths.length === 1, 'Pulls single base APK');
  assert(resultSingle.splitApkPaths.length === 0, 'No split APKs for single package');

  const pkgInfoExists = await fs.stat(resultSingle.packageInfoPath).then((s) => s.isFile()).catch(() => false);
  assert(pkgInfoExists, 'Generates package-info.txt');

  await fs.rm(tmpDirSingle, { recursive: true, force: true });

  // 7. Test APK Extraction - Base + Multiple Split APKs
  const tmpDirSplits = join(__dirname, 'scratch_test_splits');
  await fs.rm(tmpDirSplits, { recursive: true, force: true });

  const resultSplits = await pullApksFromDevice('emulator-5554', 'com.example.splits', tmpDirSplits, mockAdb as any);
  assert(resultSplits.allApkPaths.length === 3, 'Pulls base APK and 2 split APKs');
  assert(resultSplits.splitApkPaths.length === 2, 'Identifies 2 split APKs');

  const listingExists = await fs.stat(resultSplits.deviceDirListingPath).then((s) => s.isFile()).catch(() => false);
  assert(listingExists, 'Generates device-dir.listing file');

  await fs.rm(tmpDirSplits, { recursive: true, force: true });

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAndroidPipelineTests().catch((err) => {
  console.error('Fatal error in android pipeline test:', err);
  process.exit(1);
});
