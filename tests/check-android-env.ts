/**
 * check-android-env.ts
 *
 * Diagnostics script to verify local Android SDK, ADB, Emulator binaries,
 * AVD availability (chpay), active devices, and Play Store installation.
 *
 * Usage:
 *   npx tsx tests/check-android-env.ts
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const localSdkDir = join(rootDir, 'tools', 'android-sdk');
const localJdkDir = join(rootDir, 'tools', 'jdk');

const adbPath = existsSync(join(localSdkDir, 'platform-tools', 'adb.exe'))
  ? join(localSdkDir, 'platform-tools', 'adb.exe')
  : 'adb';

const emulatorPath = existsSync(join(localSdkDir, 'emulator', 'emulator.exe'))
  ? join(localSdkDir, 'emulator', 'emulator.exe')
  : 'emulator';

const avdManagerPath = existsSync(join(localSdkDir, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat'))
  ? join(localSdkDir, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat')
  : 'avdmanager';

const javaHome = existsSync(localJdkDir) ? localJdkDir : process.env.JAVA_HOME;

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║        ANDROID ENVIRONMENT DIAGNOSTICS & CHECK          ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let allGood = true;

// 1. JAVA_HOME / Java executable
console.log('1. Java / JDK Status:');
if (javaHome && existsSync(javaHome)) {
  console.log(`   ✓ JAVA_HOME : ${javaHome}`);
} else {
  console.log('   ✗ JAVA_HOME : Not set or directory missing');
  allGood = false;
}

// 2. ADB
console.log('\n2. ADB (Android Debug Bridge):');
if (existsSync(adbPath) || adbPath === 'adb') {
  try {
    const out = execSync(`"${adbPath}" version`, { encoding: 'utf-8' });
    const firstLine = out.split('\n')[0].trim();
    console.log(`   ✓ ADB Path  : ${adbPath}`);
    console.log(`   ✓ Version   : ${firstLine}`);
  } catch (err: any) {
    console.log(`   ✗ ADB Exec  : Failed to run (${err.message})`);
    allGood = false;
  }
} else {
  console.log(`   ✗ ADB Path  : Missing at ${adbPath}`);
  allGood = false;
}

// 3. Emulator Executable
console.log('\n3. Android Emulator Executable:');
if (existsSync(emulatorPath) || emulatorPath === 'emulator') {
  try {
    const out = execSync(`"${emulatorPath}" -version`, { encoding: 'utf-8' });
    const firstLine = out.split('\n')[0].trim();
    console.log(`   ✓ Emulator  : ${emulatorPath}`);
    console.log(`   ✓ Version   : ${firstLine}`);
  } catch (err: any) {
    console.log(`   ✗ Emulator  : Failed to run (${err.message})`);
    allGood = false;
  }
} else {
  console.log(`   ✗ Emulator  : Missing at ${emulatorPath}`);
  allGood = false;
}

// 4. AVD List Check
console.log('\n4. Android Virtual Devices (AVD):');
try {
  const env = { ...process.env, JAVA_HOME: javaHome };
  const avdOut = execSync(`"${avdManagerPath}" list avd`, { encoding: 'utf-8', env });
  console.log('   Available AVDs:');
  const lines = avdOut.split('\n');
  let hasChpay = false;

  for (const line of lines) {
    if (line.includes('Name:')) {
      const name = line.replace(/.*Name:\s*/, '').trim();
      const isChpay = name === 'chpay';
      if (isChpay) hasChpay = true;
      console.log(`     ${isChpay ? '⭐' : '•'} ${name}${isChpay ? ' (TARGET AVD)' : ''}`);
    }
  }

  if (hasChpay) {
    console.log('   ✓ AVD "chpay" is CREATED and READY.');
  } else {
    console.log('   ✗ AVD "chpay" is MISSING! Needs to be created.');
    allGood = false;
  }
} catch (err: any) {
  console.log(`   ✗ AVD Manager error: ${err.message}`);
  allGood = false;
}

// 5. Active ADB Devices Check
console.log('\n5. Active ADB Devices:');
try {
  const devOut = execSync(`"${adbPath}" devices`, { encoding: 'utf-8' });
  const lines = devOut.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('List of'));
  if (lines.length === 0) {
    console.log('   ℹ No online device / emulator running currently.');
    console.log('   → Run emulator with:');
    console.log(`     "${emulatorPath}" -avd chpay`);
  } else {
    for (const dev of lines) {
      console.log(`   • Connected Device: ${dev}`);
      // Check boot_completed
      const serial = dev.split(/\s+/)[0];
      try {
        const boot = execSync(`"${adbPath}" -s ${serial} shell getprop sys.boot_completed`, { encoding: 'utf-8' }).trim();
        console.log(`     - sys.boot_completed : ${boot}`);

        // Check Play Store
        const pmOut = execSync(`"${adbPath}" -s ${serial} shell pm path com.android.vending`, { encoding: 'utf-8' }).trim();
        if (pmOut.includes('package:')) {
          console.log(`     - Google Play Store  : ✓ INSTALLED (${pmOut.split('\n')[0]})`);
        } else {
          console.log(`     - Google Play Store  : ✗ NOT INSTALLED on device`);
        }
      } catch {
        console.log('     - Device properties fetch failed');
      }
    }
  }
} catch (err: any) {
  console.log(`   ✗ ADB devices error: ${err.message}`);
}

console.log('\n══════════════════════════════════════════════════════════');
if (allGood) {
  console.log('  STATUS: ✅ ALL ENVIRONMENT PREREQUISITES ARE SET UP!');
} else {
  console.log('  STATUS: ❌ SOME PREREQUISITES ARE MISSING OR FAILED.');
}
console.log('══════════════════════════════════════════════════════════\n');
