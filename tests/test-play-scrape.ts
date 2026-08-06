/**
 * test-play-scrape.ts
 * 
 * End-to-end integration test: Fetches a REAL Google Play listing page,
 * parses it, downloads assets (icon + screenshots), and validates output.
 * 
 * Usage:
 *   npx tsx tests/test-play-scrape.ts
 * 
 * Target:
 *   https://play.google.com/store/apps/details?id=colorwidgets.ios.widget.topwidgets
 */

import { promises as fs } from 'fs';
import { join } from 'path';

// ── Import one-off scraper (standalone — NOT from workers/) ────────────
// Spec L177: "Không implement src/adapters/playstore.ts trong bước pull thủ công"
import { parsePlayHtml, scrapePlayListingOneOff } from './helpers/play-scrape-oneoff';

// ── Config ─────────────────────────────────────────────────────────────
const TEST_URL = 'https://play.google.com/store/apps/details?id=colorwidgets.ios.widget.topwidgets&hl=en';
const PACKAGE_ID = 'colorwidgets.ios.widget.topwidgets';
const OUTPUT_DIR = join(__dirname, '..', 'work', 'test-output', PACKAGE_ID);

// ── Helpers ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function skip(testName: string, reason: string) {
  console.log(`  ⊘ ${testName} (SKIP: ${reason})`);
  skipped++;
}

function sectionHeader(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Main Test ──────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  PLAY STORE SCRAPE — INTEGRATION TEST                   ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Package : ${PACKAGE_ID.padEnd(44)}║`);
  console.log(`║  URL     : ${TEST_URL.substring(0, 44).padEnd(44)}║`);
  console.log(`║  Output  : ${OUTPUT_DIR.substring(0, 44).padEnd(44)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  // ── Clean previous output ────────────────────────────────────────────
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 1: RAW HTML FETCH
  // ════════════════════════════════════════════════════════════════════
  sectionHeader('PHASE 1 — Raw HTML Fetch');

  let rawHtml = '';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(TEST_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeoutId);

    assert(response.ok, `HTTP GET returned status ${response.status}`, `Expected 2xx`);

    rawHtml = await response.text();
    assert(rawHtml.length > 1000, `HTML body received (${formatBytes(rawHtml.length)})`, `Too small`);

    // Save raw HTML for debug
    const debugHtmlPath = join(OUTPUT_DIR, '_debug_raw.html');
    await fs.writeFile(debugHtmlPath, rawHtml, 'utf-8');
    console.log(`  → Raw HTML saved to ${debugHtmlPath}`);
  } catch (err: any) {
    console.error(`\n  ✗ FATAL: Could not fetch Play Store page: ${err.message}`);
    console.error(`    Is the network available? Is the URL valid?`);
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 2: HTML PARSER (parsePlayHtml — one-off)
  // ════════════════════════════════════════════════════════════════════
  sectionHeader('PHASE 2 — HTML Parser (parsePlayHtml — one-off)');

  let parsedData: ReturnType<typeof parsePlayHtml> | null = null;
  try {
    parsedData = parsePlayHtml(rawHtml, PACKAGE_ID);

    assert(!!parsedData.title && parsedData.title.length > 0, `Title parsed: "${parsedData.title}"`);
    assert(!!parsedData.developer && parsedData.developer.length > 0, `Developer parsed: "${parsedData.developer}"`);

    if (parsedData.rating !== undefined) {
      assert(parsedData.rating >= 0 && parsedData.rating <= 5, `Rating parsed: ${parsedData.rating}`);
    } else {
      skip('Rating', 'Not found in HTML — may be hidden for this app');
    }

    if (parsedData.installs) {
      assert(parsedData.installs.length > 0, `Installs parsed: "${parsedData.installs}"`);
    } else {
      skip('Installs', 'Not found in HTML');
    }

    assert(
      parsedData.descriptionText.length > 10,
      `Description parsed (${parsedData.descriptionText.length} chars)`,
      'Description too short'
    );

    if (parsedData.iconUrl) {
      assert(parsedData.iconUrl.startsWith('http'), `Icon URL found: ${parsedData.iconUrl.substring(0, 80)}...`);
    } else {
      skip('Icon URL', 'Not found via og:image or itemprop');
    }

    assert(
      parsedData.screenshotUrls.length >= 0,
      `Screenshot URLs found: ${parsedData.screenshotUrls.length}`,
    );

    // Print parsed data summary
    console.log(`\n  📋 Parsed Data Summary:`);
    console.log(`     Title       : ${parsedData.title}`);
    console.log(`     Developer   : ${parsedData.developer}`);
    console.log(`     Rating      : ${parsedData.rating ?? 'N/A'}`);
    console.log(`     Installs    : ${parsedData.installs ?? 'N/A'}`);
    console.log(`     Description : ${parsedData.descriptionText.substring(0, 100)}...`);
    console.log(`     Icon URL    : ${parsedData.iconUrl ? 'Yes' : 'No'}`);
    console.log(`     Screenshots : ${parsedData.screenshotUrls.length}`);
  } catch (err: any) {
    console.error(`\n  ✗ Parser error: ${err.message}`);
    failed++;
  }

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 3: FULL ONE-OFF PIPELINE (fetch + parse + download)
  // ════════════════════════════════════════════════════════════════════
  sectionHeader('PHASE 3 — Full One-Off Scrape Pipeline');

  try {
    const result = await scrapePlayListingOneOff(TEST_URL, OUTPUT_DIR, {
      timeoutMs: 30000,
      downloadAssets: true,
    });

    // Verify output files
    const checkFile = async (path: string, label: string, minBytes = 1) => {
      try {
        const stat = await fs.stat(path);
        if (stat.isFile() && stat.size >= minBytes) {
          assert(true, `${label} exists (${formatBytes(stat.size)})`);
          return true;
        }
        assert(false, `${label} — file too small or not a file`, `${stat.size} bytes`);
        return false;
      } catch {
        assert(false, `${label} — file missing`, path);
        return false;
      }
    };

    // Core outputs
    await checkFile(result.pageHtmlPath, 'playstore/page.html', 1000);
    await checkFile(result.descriptionMdPath, 'playstore/description.md', 10);
    await checkFile(result.listingJsonPath, 'playstore/listing.json', 10);

    // Icon
    if (result.iconPath) {
      await checkFile(result.iconPath, 'playstore/icon.png', 100);
    } else {
      skip('playstore/icon.png', 'Icon URL not found or download failed');
    }

    // Screenshots
    if (result.screenshotPaths.length > 0) {
      console.log(`\n  📸 Downloaded ${result.screenshotPaths.length} screenshot(s):`);
      for (const sp of result.screenshotPaths) {
        const stat = await fs.stat(sp).catch(() => null);
        const size = stat ? formatBytes(stat.size) : 'MISSING';
        const fileName = sp.split(/[/\\]/).pop();
        assert(stat !== null && stat.size > 100, `  ${fileName} (${size})`);
      }
    } else {
      skip('Screenshots download', 'No screenshot URLs extracted from listing');
    }

    // Validate listing.json content
    const listingJson = JSON.parse(await fs.readFile(result.listingJsonPath, 'utf-8'));
    assert(listingJson.packageId === PACKAGE_ID, `listing.json packageId matches`);
    assert(!!listingJson.title, `listing.json has title: "${listingJson.title}"`);
    assert(!!listingJson.scrapedAt, `listing.json has scrapedAt timestamp`);

    // Validate description.md content
    const descMd = await fs.readFile(result.descriptionMdPath, 'utf-8');
    assert(descMd.startsWith('#'), `description.md starts with markdown heading`);
    assert(descMd.includes('Developer'), `description.md contains Developer field`);

    // Show output directory tree
    console.log(`\n  📁 Output directory contents:`);
    await printTree(OUTPUT_DIR, '     ');
  } catch (err: any) {
    console.error(`\n  ✗ One-off scrape pipeline failed: ${err.message}`);
    console.error(`    ${err.stack?.split('\n').slice(1, 3).join('\n    ')}`);
    failed++;
  }

  // ════════════════════════════════════════════════════════════════════
  //  RESULTS
  // ════════════════════════════════════════════════════════════════════
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS — ${elapsed}s elapsed`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✓ Passed  : ${passed}`);
  console.log(`  ✗ Failed  : ${failed}`);
  console.log(`  ⊘ Skipped : ${skipped}`);
  console.log(`${'═'.repeat(60)}`);

  if (failed > 0) {
    console.log(`\n  ❌ SOME TESTS FAILED\n`);
    process.exit(1);
  } else {
    console.log(`\n  ✅ ALL TESTS PASSED — Output saved to:\n     ${OUTPUT_DIR}\n`);
  }
}

// ── Tree printer ───────────────────────────────────────────────────────
async function printTree(dir: string, prefix: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      console.log(`${prefix}${connector}${entry.name}/`);
      await printTree(fullPath, prefix + (isLast ? '    ' : '│   '));
    } else {
      const stat = await fs.stat(fullPath);
      console.log(`${prefix}${connector}${entry.name} (${formatBytes(stat.size)})`);
    }
  }
}

// ── Run ────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error(`\nFATAL: Unhandled error in test script:`, err);
  process.exit(1);
});
