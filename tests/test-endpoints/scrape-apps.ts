// Play Store App Listing Scraper & APK Pull Simulator for Test Endpoints Output
// Reads Play Store URLs from tests/list-app-test.md and downloads metadata + assets + APK splits to tests/test-endpoints/output/<packageId>

import { createHash } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import { PlayListingClient } from '../../workers/app-relay-worker/src/adapters/play-listing/client';

const ROOT_DIR = join(__dirname, '..', '..');
const LIST_APP_FILE = join(ROOT_DIR, 'tests', 'list-app-test.md');
const OUTPUT_DIR = join(__dirname, 'output');

async function populateApksFolder(targetAppDir: string, packageId: string) {
  const apksDir = join(targetAppDir, 'apks');
  await fs.mkdir(apksDir, { recursive: true });

  const baseApkPath = join(apksDir, 'base.apk');
  const splitArmPath = join(apksDir, 'split_config.arm64_v8a.apk');
  const splitEnPath = join(apksDir, 'split_config.en.apk');
  const packageInfoPath = join(apksDir, 'package-info.txt');
  const deviceDirListingPath = join(apksDir, 'device-dir.listing');
  const manifestPath = join(apksDir, 'PULL_MANIFEST.txt');

  // Valid PK Zip / APK Magic Header (PK\x03\x04)
  const apkHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00]);
  const baseBuffer = Buffer.concat([apkHeader, Buffer.alloc(24500, 0xab)]);
  const splitArmBuffer = Buffer.concat([apkHeader, Buffer.alloc(6200, 0xbc)]);
  const splitEnBuffer = Buffer.concat([apkHeader, Buffer.alloc(3800, 0xcd)]);

  await fs.writeFile(baseApkPath, baseBuffer);
  await fs.writeFile(splitArmPath, splitArmBuffer);
  await fs.writeFile(splitEnPath, splitEnBuffer);

  const baseSha256 = createHash('sha256').update(baseBuffer).digest('hex');
  const splitArmSha256 = createHash('sha256').update(splitArmBuffer).digest('hex');
  const splitEnSha256 = createHash('sha256').update(splitEnBuffer).digest('hex');

  const nowIso = new Date().toISOString();

  await fs.writeFile(
    packageInfoPath,
    `PackageName: ${packageId}\nVersionCode: 100\nVersionName: 1.0.0\nTargetSdk: 34\nExtractedAt: ${nowIso}\n`,
    'utf-8'
  );

  await fs.writeFile(
    deviceDirListingPath,
    `/data/app/~~random/${packageId}-base/base.apk\n/data/app/~~random/${packageId}-base/split_config.arm64_v8a.apk\n/data/app/~~random/${packageId}-base/split_config.en.apk\n`,
    'utf-8'
  );

  const manifestContent = [
    `PACKAGE_ID=${packageId}`,
    `VERSION_CODE=100`,
    `VERSION_NAME=1.0.0`,
    `EXTRACTED_AT=${nowIso}`,
    `BASE_APK_SIZE=${baseBuffer.length}`,
    `BASE_APK_SHA256=${baseSha256}`,
    `SPLIT_COUNT=2`,
    `SPLIT_1_NAME=split_config.arm64_v8a.apk`,
    `SPLIT_1_SIZE=${splitArmBuffer.length}`,
    `SPLIT_1_SHA256=${splitArmSha256}`,
    `SPLIT_2_NAME=split_config.en.apk`,
    `SPLIT_2_SIZE=${splitEnBuffer.length}`,
    `SPLIT_2_SHA256=${splitEnSha256}`,
  ].join('\n');

  await fs.writeFile(manifestPath, manifestContent, 'utf-8');

  return {
    apksDir,
    baseApkPath,
    splitArmPath,
    splitEnPath,
    manifestPath,
  };
}

export async function runScrapeApps() {
  console.log('================================================================');
  console.log('📱 Play Store Batch App Listing Scraper & APK Downloader');
  console.log(`📂 Reading targets from: ${LIST_APP_FILE}`);
  console.log(`📁 Saving output to: ${OUTPUT_DIR}`);
  console.log('================================================================\n');

  if (!existsSync(LIST_APP_FILE)) {
    console.error(`❌ Input file not found: ${LIST_APP_FILE}`);
    process.exit(1);
  }

  const fileContent = await fs.readFile(LIST_APP_FILE, 'utf-8');
  const urls = fileContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('http://') || line.startsWith('https://'));

  console.log(`📋 Found ${urls.length} Play Store app URLs to process:\n`);
  urls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
  console.log('');

  const client = new PlayListingClient({ timeoutMs: 20000 });
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const playUrl = urls[i];
    try {
      const parsedUrl = new URL(playUrl);
      const packageId = parsedUrl.searchParams.get('id');

      if (!packageId) {
        console.error(`❌ [${i + 1}/${urls.length}] Missing ?id= parameter in URL: ${playUrl}`);
        failCount++;
        continue;
      }

      console.log(`🚀 [${i + 1}/${urls.length}] Processing package: ${packageId}...`);
      const targetAppDir = join(OUTPUT_DIR, packageId);
      await fs.mkdir(targetAppDir, { recursive: true });

      // 1. Process Web Store Metadata (playstore/)
      const result = await client.fetchAndProcessListing(playUrl, targetAppDir, {
        downloadAssets: true,
      });

      // 2. Process APK Splits & Manifest (apks/)
      const apksResult = await populateApksFolder(targetAppDir, packageId);

      console.log(`  ✅ Title: ${result.data.title}`);
      console.log(`  👤 Developer: ${result.data.developer}`);
      console.log(`  ⭐ Rating: ${result.data.rating ?? 'N/A'}`);
      console.log(`  📥 Installs: ${result.data.installs ?? 'N/A'}`);
      console.log(`  🖼️ Icon Saved: ${result.iconPath ? 'Yes' : 'No'}`);
      console.log(`  📸 Screenshots Saved: ${result.screenshotPaths.length} images`);
      console.log(`  📦 APK Base Saved: base.apk (${apksResult.baseApkPath})`);
      console.log(`  📑 Manifest Saved: PULL_MANIFEST.txt (${apksResult.manifestPath})`);
      console.log(`  📁 Saved to: ${targetAppDir}\n`);

      successCount++;
    } catch (err: any) {
      console.error(`  ❌ Failed to process ${playUrl}: ${err.message}\n`);
      failCount++;
    }
  }

  console.log('================================================================');
  console.log(`📊 Scraper Pipeline Summary:`);
  console.log(`   Processed Successfully: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log('================================================================\n');

  if (failCount > 0 && successCount === 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runScrapeApps().catch((err) => {
    console.error('❌ Scraper script crashed:', err);
    process.exit(1);
  });
}
