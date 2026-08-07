/**
 * test-headless-pull.ts
 * 
 * Test script to demonstrate Headless Emulator Auto-Spawn & Pull Pipeline.
 * If the emulator is stopped/closed, this script automatically boots AVD 'chpay'
 * in Headless mode (-no-window -no-audio -no-boot-anim -gpu off), waits for boot completion,
 * installs the target app via Play Store UI Automation, and pulls APK splits + listing.
 * 
 * Usage:
 *   npx tsx scripts/test-headless-pull.ts [play_url]
 * 
 * Target default:
 *   https://play.google.com/store/apps/details?id=com.facemoji.lite
 */

import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { basename, join } from 'path';
import { scrapePlayListingOneOff } from '../tests/helpers/play-scrape-oneoff';

// ── Root Paths ────────────────────────────────────────────────────────
const rootDir = join(__dirname, '..');
const localSdkDir = join(rootDir, 'tools', 'android-sdk');

const adbPath = existsSync(join(localSdkDir, 'platform-tools', 'adb.exe'))
  ? join(localSdkDir, 'platform-tools', 'adb.exe')
  : 'adb';

const emulatorPath = existsSync(join(localSdkDir, 'emulator', 'emulator.exe'))
  ? join(localSdkDir, 'emulator', 'emulator.exe')
  : 'emulator';

// ── Helpers ───────────────────────────────────────────────────────────
function execAdb(args: string, options?: { timeout?: number }): string {
  const cmd = `"${adbPath}" ${args}`;
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: options?.timeout ?? 30000 });
  } catch (err: any) {
    if (err.stdout) return err.stdout.toString();
    throw new Error(`ADB command failed (${cmd}): ${err.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sha256File(filePath: string): string {
  const content = require('fs').readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function wakeAndUnlockDevice(): void {
  try {
    execAdb('shell input keyevent KEYCODE_WAKEUP');
    execAdb('shell input keyevent 82');
    execAdb('shell input swipe 540 1800 540 600 300');
    execAdb('shell settings put system screen_off_timeout 1800000');
  } catch (err) {
    console.warn(`  ⚠️ Could not wake/unlock device screen: ${err}`);
  }
}

// ── Headless Emulator Launcher ─────────────────────────────────────────
async function ensureHeadlessEmulator(avdName = 'chpay', serial = 'emulator-5554'): Promise<void> {
  console.log(`  → Checking ADB device "${serial}" status...`);
  let isAlreadyOnline = false;
  try {
    const devices = execAdb('devices');
    if (devices.includes(`${serial}\tdevice`)) {
      const booted = execAdb(`shell getprop sys.boot_completed`).trim();
      if (booted === '1') {
        console.log(`  ✓ Device "${serial}" is ALREADY online and booted. Reusing device.`);
        isAlreadyOnline = true;
      }
    }
  } catch {}

  if (!isAlreadyOnline) {
    // HEADLESS=false => mở emulator có GUI. Mặc định vẫn là headless.
    const isHeadless = (process.env.HEADLESS || '').trim().toLowerCase() !== 'false';
    console.log(`  🚀 Device not online. Auto-spawning AVD "${avdName}" in ${isHeadless ? 'HEADLESS (-no-window)' : 'GUI'} mode...`);
    const emulatorArgs = [
      '-avd', avdName,
      ...(isHeadless ? ['-no-window', '-no-audio', '-no-boot-anim', '-gpu', 'off'] : []),
      '-no-snapshot-save',
      '-netdelay', 'none',
      '-netspeed', 'full',
    ];

    try {
      const child = spawn(emulatorPath, emulatorArgs, {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.unref();
    } catch (err: any) {
      throw new Error(`Failed to start headless emulator: ${err.message}`);
    }

    console.log(`  → Polling ADB until emulator completes boot (timeout 180s)...`);
    const startTime = Date.now();
    let isBooted = false;

    while (Date.now() - startTime < 180000) {
      await sleep(3000);
      try {
        const booted = execAdb(`shell getprop sys.boot_completed`).trim();
        if (booted === '1') {
          isBooted = true;
          break;
        }
      } catch {}
      if ((Date.now() - startTime) % 15000 < 3000) {
        console.log(`    ... booting emulator ngầm (${Math.round((Date.now() - startTime) / 1000)}s)`);
      }
    }

    if (!isBooted) {
      throw new Error(`Timeout waiting for Headless Emulator "${avdName}" to complete boot.`);
    }

    console.log(`  ✓ Headless Emulator booted successfully!`);
  }

  // Always wake & unlock screen
  wakeAndUnlockDevice();
}

// ── UI Automation Helper for Play Store ────────────────────────────────
async function triggerPlayStoreInstall(packageId: string): Promise<boolean> {
  wakeAndUnlockDevice();
  console.log(`  → Opening Play Store for package: ${packageId}...`);
  execAdb('shell am force-stop com.android.vending');
  execAdb(`shell am start -a android.intent.action.VIEW -d "market://details?id=${packageId}"`);

  console.log(`  → Waiting 8 seconds for details page to render...`);
  await sleep(8000);

  wakeAndUnlockDevice();

  const dumpPath = join(rootDir, 'work', `ui_dump_${packageId}.xml`);
  try {
    execAdb('shell uiautomator dump /sdcard/window_dump.xml');
    execAdb(`pull /sdcard/window_dump.xml "${dumpPath}"`);
  } catch (err) {
    console.warn(`  ⚠️ Could not dump UI XML: ${err}`);
  }

  let tapped = false;
  if (existsSync(dumpPath)) {
    const xmlContent = await fs.readFile(dumpPath, 'utf-8');
    await fs.rm(dumpPath, { force: true });

    const installMatch = xmlContent.match(/text="(Install|Cài đặt|Get)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i) ||
      xmlContent.match(/content-desc="(Install|Cài đặt|Get)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i) ||
      xmlContent.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="(Install|Cài đặt|Get)"/i);

    if (installMatch) {
      let x1: number, y1: number, x2: number, y2: number;
      if (installMatch[2]) {
        x1 = parseInt(installMatch[2], 10);
        y1 = parseInt(installMatch[3], 10);
        x2 = parseInt(installMatch[4], 10);
        y2 = parseInt(installMatch[5], 10);
      } else {
        x1 = parseInt(installMatch[1], 10);
        y1 = parseInt(installMatch[2], 10);
        x2 = parseInt(installMatch[3], 10);
        y2 = parseInt(installMatch[4], 10);
      }
      const cx = Math.round((x1 + x2) / 2);
      const cy = Math.round((y1 + y2) / 2);
      console.log(`  → Found Install button at bounds [${x1},${y1}][${x2},${y2}]. Tapping (${cx}, ${cy})...`);
      execAdb(`shell input tap ${cx} ${cy}`);
      tapped = true;
    }
  }

  if (!tapped) {
    console.log(`  → Tapping default Install location (541, 1310) / (850, 780)...`);
    execAdb('shell input tap 541 1310');
    execAdb('shell input tap 850 780');
  }

  return true;
}

async function getInstalledPaths(packageId: string): Promise<string[]> {
  try {
    const raw = execAdb(`shell pm path ${packageId}`);
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('package:'));
    return lines.map((l) => l.replace(/^package:/, ''));
  } catch {
    return [];
  }
}

// ── Main Execution ──────────────────────────────────────────────────────
async function main() {
  const playUrl = process.argv[2] || 'https://play.google.com/store/apps/details?id=com.facemoji.lite';
  const urlObj = new URL(playUrl);
  const packageId = urlObj.searchParams.get('id') || 'com.facemoji.lite';

  const startTime = Date.now();
  console.log(`\n============================================================`);
  console.log(`  HEADLESS EXPERIMENT — PULL APK & LISTING FOR ${packageId}`);
  console.log(`  Target URL: ${playUrl}`);
  console.log(`============================================================`);

  const pkgWorkDir = join(rootDir, 'work', 'apks', packageId);
  await fs.mkdir(pkgWorkDir, { recursive: true });

  // Step 1: Scrape Play Listing
  console.log(`\n[STEP 1/5] Scraping Play Store listing...`);
  const scrapeResult = await scrapePlayListingOneOff(playUrl, pkgWorkDir, { downloadAssets: true });
  console.log(`  ✓ Title       : ${scrapeResult.data.title}`);
  console.log(`  ✓ Developer   : ${scrapeResult.data.developer}`);
  console.log(`  ✓ Screenshots : ${scrapeResult.screenshotPaths.length} downloaded`);

  // Step 2: Ensure Headless Emulator
  console.log(`\n[STEP 2/5] Ensuring Headless Emulator (-no-window)...`);
  await ensureHeadlessEmulator('chpay', 'emulator-5554');

  // Step 3: Install app via Play Store UI
  console.log(`\n[STEP 3/5] Verifying / Installing app on device...`);
  let paths = await getInstalledPaths(packageId);

  if (paths.length === 0) {
    console.log(`  → Package ${packageId} is NOT installed yet.`);
    await triggerPlayStoreInstall(packageId);

    console.log(`  → Polling 'pm path ${packageId}' until installation completes (timeout 6 mins)...`);
    const maxPollMs = 360000;
    const pollIntervalMs = 5000;
    let elapsed = 0;

    while (elapsed < maxPollMs) {
      await sleep(pollIntervalMs);
      elapsed += pollIntervalMs;
      paths = await getInstalledPaths(packageId);
      if (paths.length > 0) {
        console.log(`  ✓ Package installed successfully after ${Math.round(elapsed / 1000)}s!`);
        break;
      }
      if (elapsed % 15000 === 0) {
        console.log(`    ... still waiting for installation (${Math.round(elapsed / 1000)}s elapsed)`);
      }
    }

    if (paths.length === 0) {
      throw new Error(`Timeout waiting for ${packageId} to install from Play Store.`);
    }
  } else {
    console.log(`  ✓ Package ${packageId} is already installed on device.`);
  }

  // Step 4: Pull APK splits and metadata
  console.log(`\n[STEP 4/5] Pulling APK splits and generating metadata...`);
  const pulledApks: string[] = [];

  for (const remotePath of paths) {
    const fileBase = basename(remotePath);
    let localName = fileBase === 'base.apk' ? 'base.apk' : fileBase;
    const localPath = join(pkgWorkDir, localName);
    console.log(`  → Pulling ${fileBase} → ${localName}`);
    execAdb(`pull "${remotePath}" "${localPath}"`);
    pulledApks.push(localPath);
  }

  // Device dir listing
  const deviceDir = paths[0].substring(0, paths[0].lastIndexOf('/'));
  try {
    const deviceDirListing = execAdb(`shell ls -la "${deviceDir}"`);
    await fs.writeFile(join(pkgWorkDir, 'device-dir.listing'), deviceDirListing, 'utf-8');
    console.log(`  ✓ Wrote device-dir.listing`);
  } catch {}

  // Package info
  try {
    const pkgInfo = execAdb(`shell dumpsys package ${packageId}`);
    await fs.writeFile(join(pkgWorkDir, 'package-info.txt'), pkgInfo, 'utf-8');
    console.log(`  ✓ Wrote package-info.txt`);
  } catch {}

  // PULL_MANIFEST.txt
  console.log(`  → Generating PULL_MANIFEST.txt...`);
  const manifestLines = [
    `package=${packageId}`,
    `play_url=${playUrl}`,
    `pulled_at=${new Date().toISOString()}`,
    `splits:`,
  ];
  for (const apkPath of pulledApks) {
    const name = basename(apkPath);
    const stat = await fs.stat(apkPath);
    manifestLines.push(`  ${name} (${formatBytes(stat.size)})`);
  }
  manifestLines.push(`sha256:`);
  for (const apkPath of pulledApks) {
    const name = basename(apkPath);
    manifestLines.push(`  ${sha256File(apkPath)}  ${name}`);
  }

  await fs.writeFile(join(pkgWorkDir, 'PULL_MANIFEST.txt'), manifestLines.join('\n'), 'utf-8');
  console.log(`  ✓ Wrote PULL_MANIFEST.txt`);

  // Step 5: Verification
  console.log(`\n[STEP 5/5] Final Verification...`);
  const baseApkPath = join(pkgWorkDir, 'base.apk');
  if (!existsSync(baseApkPath)) {
    throw new Error(`Verification failed: base.apk missing at ${baseApkPath}`);
  }
  const baseStat = await fs.stat(baseApkPath);
  const elapsedTotal = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`  HEADLESS EXPERIMENT COMPLETED IN ${elapsedTotal}s FOR ${packageId}`);
  console.log(`════════════════════════════════════════════════════════════`);
  console.log(`  📁 Target Directory : ${pkgWorkDir}`);
  console.log(`  📦 Base APK Size     : ${formatBytes(baseStat.size)}`);
  console.log(`  🧩 Total Splits      : ${pulledApks.length}`);
  console.log(`  📸 Screenshots       : ${scrapeResult.screenshotPaths.length}`);
  console.log(`════════════════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error(`\n❌ ERROR: ${err.message}`);
  process.exit(1);
});
