// Play Store App Listing Scraper Script for Test Endpoints Output
// Reads Play Store URLs from tests/list-app-test.md and downloads metadata + assets to tests/test-endpoints/output/<packageId>

import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import { PlayListingClient } from '../../workers/app-relay-worker/src/adapters/play-listing/client';

const ROOT_DIR = join(__dirname, '..', '..');
const LIST_APP_FILE = join(ROOT_DIR, 'tests', 'list-app-test.md');
const OUTPUT_DIR = join(__dirname, 'output');

export async function runScrapeApps() {
  console.log('================================================================');
  console.log('📱 Play Store Batch App Listing Scraper & Downloader');
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

      const result = await client.fetchAndProcessListing(playUrl, targetAppDir, {
        downloadAssets: true,
      });

      console.log(`  ✅ Title: ${result.data.title}`);
      console.log(`  👤 Developer: ${result.data.developer}`);
      console.log(`  ⭐ Rating: ${result.data.rating ?? 'N/A'}`);
      console.log(`  📥 Installs: ${result.data.installs ?? 'N/A'}`);
      console.log(`  🖼️ Icon Saved: ${result.iconPath ? 'Yes' : 'No'}`);
      console.log(`  📸 Screenshots Saved: ${result.screenshotPaths.length} images`);
      console.log(`  📁 Saved to: ${result.playstoreDir}\n`);

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
