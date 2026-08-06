// Unit & Contract Test Suite for Google Play Listing Pipeline (Phase 6)

import { promises as fs } from 'fs';
import { join } from 'path';
import { PlayListingClient } from '../src/adapters/play-listing/client';
import { AppNotFoundError } from '../src/adapters/play-listing/errors';
import { parsePlayListingHtml } from '../src/adapters/play-listing/parser';

async function runPlayListingTests() {
  console.log('--- STARTING PLAY LISTING PIPELINE TESTS (PHASE 6) ---');

  const fixturesDir = join(__dirname, 'fixtures', 'play-store');
  const validHtml = await fs.readFile(join(fixturesDir, 'sample-valid.html'), 'utf-8');
  const noScreenshotsHtml = await fs.readFile(join(fixturesDir, 'sample-no-screenshots.html'), 'utf-8');
  const error404Html = await fs.readFile(join(fixturesDir, 'sample-404.html'), 'utf-8');

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

  // 1. Valid Listing HTML Parser Test
  const data = parsePlayListingHtml(validHtml, 'com.sinomedia.apptest');
  assert(data.title === 'SinoMedia App', 'Parses title correctly');
  assert(data.developer === 'SinoMedia Dev Group', 'Parses developer correctly');
  assert(data.rating === 4.8, 'Parses rating correctly');
  assert(data.installs === '1,000,000+ Downloads', 'Parses downloads correctly');
  assert(data.descriptionText.includes('SinoMedia Official Mobile Application'), 'Parses clean description text');
  assert(data.iconUrl === 'https://play-lh.googleusercontent.com/icon-mock-12345.png', 'Parses icon URL');
  assert(data.screenshotUrls.length === 3, 'Parses screenshot URLs array');

  // 2. No Screenshots HTML Parser Test
  const noScreenshotsData = parsePlayListingHtml(noScreenshotsHtml, 'com.minimal.app');
  assert(noScreenshotsData.title === 'Minimal App', 'Parses title for app without screenshots');
  assert(noScreenshotsData.screenshotUrls.length === 0, 'Handles app with 0 screenshots gracefully');

  // 3. 404 App Not Found Error Test
  let caught404 = false;
  try {
    parsePlayListingHtml(error404Html, 'com.nonexistent.app');
  } catch (err: any) {
    if (err instanceof AppNotFoundError || err.code === 'APP_NOT_FOUND') {
      caught404 = true;
    }
  }
  assert(caught404, 'Throws AppNotFoundError on 404 HTML');

  // 4. File System Persistence Test (PlayListingClient)
  const tmpDir = join(__dirname, 'scratch_test_listing');
  await fs.rm(tmpDir, { recursive: true, force: true });

  const client = new PlayListingClient();
  const result = await client.fetchAndProcessListing(
    'https://play.google.com/store/apps/details?id=com.sinomedia.apptest&hl=en',
    tmpDir,
    { downloadAssets: false, mockHtml: validHtml }
  );

  const listingJsonExists = await fs.stat(result.listingJsonPath).then((s) => s.isFile()).catch(() => false);
  const descriptionMdExists = await fs.stat(result.descriptionMdPath).then((s) => s.isFile()).catch(() => false);
  const pageHtmlExists = await fs.stat(result.pageHtmlPath).then((s) => s.isFile()).catch(() => false);

  assert(listingJsonExists, 'Generates playstore/listing.json file');
  assert(descriptionMdExists, 'Generates playstore/description.md file');
  assert(pageHtmlExists, 'Generates playstore/page.html file');

  const listingJsonContent = JSON.parse(await fs.readFile(result.listingJsonPath, 'utf-8'));
  assert(listingJsonContent.packageId === 'com.sinomedia.apptest', 'listing.json contains packageId');
  assert(listingJsonContent.title === 'SinoMedia App', 'listing.json contains title');

  // Cleanup temporary test directory
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPlayListingTests().catch((err) => {
  console.error('Fatal error in play listing test:', err);
  process.exit(1);
});
