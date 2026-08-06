// Integration Test Suite for Artifact, Upload & Safe Cleanup Pipeline (Phase 8)

import { promises as fs } from 'fs';
import { join } from 'path';
import { safeDeviceCleanup, reconcileStaleWorkspaces } from '../src/adapters/artifact/cleanup';
import { createZipArchiveFile, generatePullManifestText } from '../src/adapters/artifact/packager';
import { computeFileSha256, validateApkFiles } from '../src/adapters/artifact/validator';

class MockAdbClientForCleanup {
  public uninstalledPackage: string | null = null;
  async uninstallPackage(serial: string, packageId: string): Promise<boolean> {
    this.uninstalledPackage = packageId;
    return true;
  }
}

async function runArtifactPipelineTests() {
  console.log('--- STARTING ARTIFACT, UPLOAD & SAFE CLEANUP TESTS (PHASE 8) ---');

  const tmpDir = join(__dirname, 'scratch_test_phase8');
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

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

  // Create dummy APK file (ZIP header 0x50, 0x4B, 0x03, 0x04)
  const dummyBaseApkPath = join(tmpDir, 'base.apk');
  const dummyBaseContent = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
  await fs.writeFile(dummyBaseApkPath, dummyBaseContent);

  const dummySplitApkPath = join(tmpDir, 'split_config.arm64_v8a.apk');
  const dummySplitContent = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
  await fs.writeFile(dummySplitApkPath, dummySplitContent);

  // 1. Test SHA-256 Calculation
  const sha256 = await computeFileSha256(dummyBaseApkPath);
  assert(typeof sha256 === 'string' && sha256.length === 64, 'Computes valid 64-character hex SHA-256 string');

  // 2. Test APK File Validation
  const valResult = await validateApkFiles(dummyBaseApkPath, [dummySplitApkPath]);
  assert(valResult.allApks.length === 2, 'Validates base APK and split APKs');
  assert(valResult.baseApk.fileName === 'base.apk', 'Validates base APK header');

  // 3. Test Manifest Text Generation
  const manifestText = generatePullManifestText({
    packageId: 'com.sinomedia.testpkg',
    versionName: '2.1.0',
    versionCode: 210,
    deviceProfile: { sdk: 34, abi: 'arm64-v8a' },
    validationResult: valResult,
  });
  assert(manifestText.includes('Package ID:     com.sinomedia.testpkg'), 'Manifest contains package ID');
  assert(manifestText.includes('base.apk'), 'Manifest contains APK file hash list');

  // 4. Test ZIP Archive Stream & Atomic Rename
  const targetZipPath = join(tmpDir, 'com.sinomedia.testpkg-v210.zip');
  const zipResult = await createZipArchiveFile(
    [
      { relativePath: 'apks/base.apk', absolutePath: dummyBaseApkPath },
      { relativePath: 'apks/split.apk', absolutePath: dummySplitApkPath },
    ],
    targetZipPath
  );

  const zipExists = await fs.stat(targetZipPath).then((s) => s.isFile()).catch(() => false);
  const partialExists = await fs.stat(`${targetZipPath}.partial`).then((s) => s.isFile()).catch(() => false);

  assert(zipExists, 'Generates target ZIP archive file');
  assert(!partialExists, 'Removes .partial temporary file after atomic rename');
  assert(zipResult.sizeBytes > 0, 'ZIP archive has non-zero size');

  // 5. Test Pre-existing App Safety Cleanup (wasInstalledBefore = true)
  const mockAdb = new MockAdbClientForCleanup();
  const cleanupRes1 = await safeDeviceCleanup({
    serial: 'emulator-5554',
    packageId: 'com.sinomedia.existing',
    wasInstalledBefore: true,
    jobInstalledApp: false,
    adbClient: mockAdb as any,
  });

  assert(cleanupRes1.uninstalled === false, 'SKIPS uninstall when app was installed before job execution');
  assert(mockAdb.uninstalledPackage === null, 'Does not call uninstall on ADB client for pre-existing app');

  // 6. Test App Safety Cleanup (wasInstalledBefore = false, jobInstalledApp = true)
  const cleanupRes2 = await safeDeviceCleanup({
    serial: 'emulator-5554',
    packageId: 'com.sinomedia.new',
    wasInstalledBefore: false,
    jobInstalledApp: true,
    adbClient: mockAdb as any,
  });

  assert(cleanupRes2.uninstalled === true, 'UNINSTALLS app when job installed it and wasInstalledBefore is false');
  assert(mockAdb.uninstalledPackage === 'com.sinomedia.new', 'Calls ADB uninstall for newly installed app');

  // 7. Test Stale Workspace Reconciliation
  const stalePartialPath = join(tmpDir, 'stale_job.partial');
  await fs.writeFile(stalePartialPath, 'stale content');

  const cleanedCount = await reconcileStaleWorkspaces(tmpDir, 0);
  assert(cleanedCount >= 1, 'Reconciles and removes stale .partial files');

  // Cleanup test folder
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runArtifactPipelineTests().catch((err) => {
  console.error('Fatal error in artifact pipeline test:', err);
  process.exit(1);
});
