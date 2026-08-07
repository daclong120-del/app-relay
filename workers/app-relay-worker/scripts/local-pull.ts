/**
 * local-pull.ts — Local harness chạy THẲNG bộ source worker (src/adapters/*).
 *
 * Khác với scripts/test-headless-pull.ts ở repo root (code ADB tự viết lại),
 * file này chỉ đóng vai trò "driver": mọi bước đều gọi đúng module production
 * mà runApkAcquisitionPipeline dùng:
 *
 *   loadWorkerConfig        (src/config/env)
 *   PlayListingClient       (src/adapters/play-listing/client)
 *   runDevicePreflight      (src/adapters/android/device-preflight)
 *   AdbClient               (src/adapters/android/adb-client)
 *   parsePlayUiAutomatorXml (src/adapters/android/play-ui-automator)
 *   pullApksFromDevice      (src/adapters/android/apk-puller)
 *   validateApkFiles        (src/adapters/artifact/validator)
 *   generatePullManifestText / createZipArchiveFile (src/adapters/artifact/packager)
 *
 * Bỏ GatewayClient + uploadArtifactToStorage + safeDeviceCleanup/safeWorkspaceCleanup
 * để chạy offline và GIỮ LẠI file tải về (pipeline thật xoá workDir ở finally).
 *
 * Usage:
 *   npx --yes tsx workers/app-relay-worker/scripts/local-pull.ts <playUrl|packageId> [...]
 *
 * Env:
 *   OUT_DIR=<path>     thư mục output (default: <repo>/work/apks)
 *   HEADLESS=true      boot emulator ngầm nếu chưa chạy
 *   KEEP_INSTALLED=0   gỡ app khỏi device sau khi pull (default: giữ nguyên)
 */

import { existsSync, promises as fs } from 'fs';
import { join, resolve } from 'path';

import { AdbClient } from '../src/adapters/android/adb-client';
import { pullApksFromDevice } from '../src/adapters/android/apk-puller';
import { runDevicePreflight } from '../src/adapters/android/device-preflight';
import { parsePlayUiAutomatorXml } from '../src/adapters/android/play-ui-automator';
import { createZipArchiveFile, generatePullManifestText } from '../src/adapters/artifact/packager';
import { validateApkFiles } from '../src/adapters/artifact/validator';
import { PlayListingClient } from '../src/adapters/play-listing/client';
import { loadWorkerConfig } from '../src/config/env';

// ── Paths ─────────────────────────────────────────────────────────────
const repoRoot = resolve(__dirname, '..', '..', '..');
const localSdk = join(repoRoot, 'tools', 'android-sdk');

/** loadWorkerConfig() mặc định 'adb'/'emulator' (cần có trong PATH). Trên máy local
 *  binary nằm trong tools/android-sdk nên fallback về đó khi env không set. */
function resolveBinary(envValue: string, defaultName: string, sdkRelPath: string): string {
  if (envValue && envValue !== defaultName) return envValue;
  const local = join(localSdk, sdkRelPath);
  return existsSync(local) ? local : defaultName;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function toPlayUrl(arg: string): { playUrl: string; packageId: string } {
  if (arg.startsWith('http')) {
    const id = new URL(arg).searchParams.get('id');
    if (!id) throw new Error(`Play URL thiếu tham số ?id=: ${arg}`);
    return { playUrl: arg, packageId: id };
  }
  return { playUrl: `https://play.google.com/store/apps/details?id=${arg}`, packageId: arg };
}

/** Diagnostic của HARNESS (không phải của worker): parsePlayUiAutomatorXml chưa
 *  nhận diện các trạng thái này nên chỉ trả UI_UNKNOWN. In ra để biết lý do thật. */
function diagnoseUnknownUi(xml: string): string | null {
  const known: Array<[RegExp, string]> = [
    [/isn't compatible with this version|not compatible with your device|isn.t compatible with your/i,
      'DEVICE_INCOMPATIBLE: Play Store báo thiết bị không tương thích — không có nút Install trên trang.'],
    [/isn't available in your country|not available in your country/i,
      'UNSUPPORTED_REGION: App bị chặn theo quốc gia.'],
    [/Item not found|couldn't be found|We're sorry, the requested URL was not found/i,
      'APP_NOT_FOUND: Trang app không tồn tại trên Play Store.'],
    [/Sign in|Add a Google Account/i,
      'PLAY_LOGIN_REQUIRED: Cần đăng nhập tài khoản Google trên device.'],
  ];
  for (const [re, msg] of known) {
    if (re.test(xml)) return msg;
  }
  return null;
}

// ── Một lượt pull cho 1 package ────────────────────────────────────────
async function pullOne(arg: string, outRoot: string): Promise<void> {
  const { playUrl, packageId } = toPlayUrl(arg);
  const config = loadWorkerConfig();
  config.adbPath = resolveBinary(config.adbPath, 'adb', join('platform-tools', 'adb.exe'));
  config.emulatorPath = resolveBinary(config.emulatorPath, 'emulator', join('emulator', 'emulator.exe'));

  // Pipeline thật gọi `new AdbClient()` (bỏ qua config.adbPath) — ở đây truyền vào
  // để chạy được khi adb không nằm trong PATH.
  const adb = new AdbClient(config.adbPath);

  const workDir = join(outRoot, packageId);
  await fs.mkdir(workDir, { recursive: true });

  const started = Date.now();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  LOCAL PULL (worker source) — ${packageId}`);
  console.log(`  play_url : ${playUrl}`);
  console.log(`  out_dir  : ${workDir}`);
  console.log(`  adb      : ${config.adbPath}`);
  console.log(`${'='.repeat(64)}`);

  // Stage 1 — scraping_listing
  console.log(`\n[1/6] PlayListingClient.fetchAndProcessListing()`);
  const listing = new PlayListingClient();
  const listingRes = await listing.fetchAndProcessListing(playUrl, workDir, { downloadAssets: true });
  console.log(`  ✓ title=${listingRes.data.title} | developer=${listingRes.data.developer}`);
  console.log(`  ✓ screenshots=${listingRes.screenshotPaths.length} | listing.json + description.md + page.html`);

  // Stage 2 — preparing_device
  console.log(`\n[2/6] runDevicePreflight()`);
  const preflight = await runDevicePreflight({
    serial: config.adbDeviceSerial,
    avdName: config.avdName,
    emulatorPath: config.emulatorPath,
    bootTimeoutMs: config.bootTimeoutMs,
    headless: config.headless,
    adbClient: adb,
    isCancelled: () => false,
  });
  const p = preflight.deviceProfile;
  console.log(`  ✓ serial=${preflight.serial} sdk=${p.sdk} abi=${p.abi} density=${p.density} locale=${p.locale}`);
  console.log(`  ✓ play_store_installed=${preflight.playStoreInstalled} launched_now=${preflight.wasLaunched}`);

  // Stage 3 — installing_app
  console.log(`\n[3/6] Play Store UI automation`);
  let installedByUs = false;
  const existing = await adb.checkPackagePath(config.adbDeviceSerial, packageId);

  if (existing.length > 0) {
    console.log(`  ✓ ${packageId} đã cài sẵn (${existing.length} apk) — bỏ qua bước install.`);
  } else {
    console.log(`  → chưa cài. openMarketUrl() + dumpUiXml() + parsePlayUiAutomatorXml()`);
    try {
      await adb.forceStopPackage(config.adbDeviceSerial, 'com.android.vending');
    } catch {
      /* Play Store chưa chạy */
    }
    await adb.openMarketUrl(config.adbDeviceSerial, packageId);

    // Pipeline chỉ chờ 3s rồi dump 1 lần. Ở đây dump lại vài lần vì trang details
    // render chậm — nếu vẫn UI_UNKNOWN thì đó là trạng thái thật, không phải race.
    const uiXmlPath = join(workDir, 'ui_dump.xml');
    let target = parsePlayUiAutomatorXml('');
    let lastXml = '';

    for (let attempt = 1; attempt <= 4; attempt++) {
      await sleep(attempt === 1 ? 4000 : 3000);
      lastXml = await adb.dumpUiXml(config.adbDeviceSerial, uiXmlPath);
      target = parsePlayUiAutomatorXml(lastXml);
      console.log(`    attempt ${attempt}/4 → state=${target.state}${target.label ? ` label="${target.label}"` : ''}`);
      if (target.state !== 'UI_UNKNOWN') break;
    }

    if (target.state === 'UI_UNKNOWN') {
      const why = diagnoseUnknownUi(lastXml);
      throw new Error(
        `${target.errorMessage}\n     [harness diagnostic] ${why ?? 'Không khớp mẫu nào đã biết — xem ' + uiXmlPath}`
      );
    }
    if (target.state === 'LOGIN_REQUIRED' || target.state === 'UNSUPPORTED_REGION' || target.state === 'PAYMENT_REQUIRED') {
      throw new Error(target.errorMessage || target.state);
    }

    if (target.state === 'READY_TO_INSTALL' && target.x != null && target.y != null) {
      console.log(`  → tapCoordinates(${target.x}, ${target.y}) trên "${target.label}"`);
      await adb.tapCoordinates(config.adbDeviceSerial, target.x, target.y);
      installedByUs = true;

      const maxPolls = Math.ceil(config.installTimeoutMs / 3000);
      let ok = false;
      for (let i = 0; i < maxPolls; i++) {
        await sleep(3000);
        const paths = await adb.checkPackagePath(config.adbDeviceSerial, packageId);
        if (paths.length > 0) {
          ok = true;
          console.log(`  ✓ cài xong sau ${(i + 1) * 3}s`);
          break;
        }
        if ((i + 1) % 5 === 0) console.log(`    ... đang cài (${(i + 1) * 3}s)`);
      }
      if (!ok) throw new Error(`INSTALL_TIMEOUT: quá ${config.installTimeoutMs / 1000}s mà ${packageId} chưa cài xong.`);
    } else {
      console.log(`  ✓ state=${target.state} — app đã có trên device.`);
    }
  }

  // Stage 4 — pulling_apks
  console.log(`\n[4/6] pullApksFromDevice()`);
  const pullRes = await pullApksFromDevice(config.adbDeviceSerial, packageId, workDir, adb);
  console.log(`  ✓ base=${pullRes.baseApkPath}`);
  console.log(`  ✓ splits=${pullRes.splitApkPaths.length} | package-info.txt + device-dir.listing`);

  // Stage 5 — validating_apks
  console.log(`\n[5/6] validateApkFiles()`);
  const validation = await validateApkFiles(pullRes.baseApkPath, pullRes.splitApkPaths);
  for (const apk of validation.allApks) {
    console.log(`  ✓ ${apk.fileName.padEnd(30)} ${fmtBytes(apk.sizeBytes).padStart(10)}  ${apk.sha256.slice(0, 16)}…`);
  }

  // Stage 6 — packaging_zip
  console.log(`\n[6/6] generatePullManifestText() + createZipArchiveFile()`);
  const manifestPath = join(workDir, 'PULL_MANIFEST.txt');
  await fs.writeFile(
    manifestPath,
    generatePullManifestText({
      packageId,
      playUrl,
      versionName: '1.0.0',
      versionCode: 100,
      deviceProfile: preflight.deviceProfile as unknown as Record<string, unknown>,
      validationResult: validation,
    }),
    'utf-8'
  );

  const zipFiles = [
    { relativePath: 'PULL_MANIFEST.txt', absolutePath: manifestPath },
    { relativePath: 'package-info.txt', absolutePath: pullRes.packageInfoPath },
    { relativePath: 'device-dir.listing', absolutePath: pullRes.deviceDirListingPath },
    { relativePath: 'playstore/listing.json', absolutePath: listingRes.listingJsonPath },
    { relativePath: 'playstore/description.md', absolutePath: listingRes.descriptionMdPath },
    { relativePath: 'playstore/page.html', absolutePath: listingRes.pageHtmlPath },
    ...validation.allApks.map((a) => ({ relativePath: `apks/${a.fileName}`, absolutePath: a.filePath })),
  ];
  const zip = await createZipArchiveFile(zipFiles, join(workDir, `${packageId}-v100.zip`));
  console.log(`  ✓ ${zip.zipPath} (${fmtBytes(zip.sizeBytes)}) sha256=${zip.sha256.slice(0, 16)}…`);

  if (installedByUs && process.env.KEEP_INSTALLED === '0') {
    console.log(`\n  → KEEP_INSTALLED=0: uninstallPackage(${packageId})`);
    await adb.uninstallPackage(config.adbDeviceSerial, packageId);
  }

  console.log(`\n  ✅ ${packageId} XONG trong ${Math.round((Date.now() - started) / 1000)}s`);
}

// ── Entry ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx --yes tsx workers/app-relay-worker/scripts/local-pull.ts <playUrl|packageId> [...]');
    process.exit(2);
  }

  const outRoot = process.env.OUT_DIR ? resolve(process.env.OUT_DIR) : join(repoRoot, 'work', 'apks');
  const results: Array<{ id: string; ok: boolean; err?: string }> = [];

  for (const arg of args) {
    const { packageId } = toPlayUrl(arg);
    try {
      await pullOne(arg, outRoot);
      results.push({ id: packageId, ok: true });
    } catch (err: any) {
      console.error(`\n  ❌ ${packageId} THẤT BẠI: ${err.message}`);
      results.push({ id: packageId, ok: false, err: err.message });
    }
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  TỔNG KẾT`);
  console.log(`${'='.repeat(64)}`);
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.id}${r.ok ? '' : ` — ${r.err?.split('\n')[0]}`}`);
  }
  console.log('');

  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(`\n❌ FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
