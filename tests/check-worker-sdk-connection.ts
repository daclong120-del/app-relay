/**
 * check-worker-sdk-connection.ts
 *
 * Verifies if the backend worker config correctly resolves ADB_PATH and EMULATOR_PATH,
 * and tests actual process execution from worker code perspective.
 */

import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const workerDir = resolve(__dirname, '../workers/app-relay-worker');
const envPath = resolve(workerDir, '.env');

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║      WORKER SDK PATH RESOLUTION & CONNECTION CHECK      ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// 1. Check raw env without .env file
console.log('1. Checking Raw Process Environment:');
console.log(`   ADB_PATH (process.env)      : ${process.env.ADB_PATH || '(undefined -> default fallback: "adb")'}`);
console.log(`   EMULATOR_PATH (process.env) : ${process.env.EMULATOR_PATH || '(undefined -> default fallback: "emulator")'}`);

// 2. Read worker .env file
console.log(`\n2. Reading Worker .env File (${envPath}):`);
const envVars: Record<string, string> = {};

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        envVars[key] = value;
      }
    }
  }
  console.log(`   ✓ Found worker .env file.`);
} else {
  console.log(`   ✗ Worker .env file NOT FOUND at ${envPath}`);
}

const configuredAdbPath = process.env.ADB_PATH || envVars['ADB_PATH'] || 'adb';
const configuredEmulatorPath = process.env.EMULATOR_PATH || envVars['EMULATOR_PATH'] || 'emulator';

console.log(`   Configured ADB_PATH      : ${configuredAdbPath}`);
console.log(`   Configured EMULATOR_PATH : ${configuredEmulatorPath}`);

// 3. Resolve relative paths from worker working directory
const resolvedAdbPath = resolve(workerDir, configuredAdbPath);
const resolvedEmulatorPath = resolve(workerDir, configuredEmulatorPath);

console.log('\n3. Path Resolution Verification:');
console.log(`   Resolved ADB Path      : ${resolvedAdbPath}`);
console.log(`   Resolved ADB Exists    : ${existsSync(resolvedAdbPath) ? '✅ YES' : '❌ NO'}`);

console.log(`   Resolved Emulator Path : ${resolvedEmulatorPath}`);
console.log(`   Resolved Emu Exists    : ${existsSync(resolvedEmulatorPath) ? '✅ YES' : '❌ NO'}`);

// 4. Attempt Execution from Worker Directory Context
console.log('\n4. Live Execution Test from Worker Directory Context:');
let adbExecutionOk = false;
try {
  const out = execFileSync(resolvedAdbPath, ['version'], { cwd: workerDir, encoding: 'utf-8' });
  console.log(`   ✅ ADB Execution SUCCESS!`);
  console.log(`      Version Output: ${out.split('\n')[0].trim()}`);
  adbExecutionOk = true;
} catch (err: any) {
  console.log(`   ❌ ADB Execution FAILED: ${err.message}`);
}

let emuExecutionOk = false;
try {
  const out = execFileSync(resolvedEmulatorPath, ['-version'], { cwd: workerDir, encoding: 'utf-8' });
  console.log(`   ✅ Emulator Execution SUCCESS!`);
  console.log(`      Version Output: ${out.split('\n')[0].trim()}`);
  emuExecutionOk = true;
} catch (err: any) {
  console.log(`   ❌ Emulator Execution FAILED: ${err.message}`);
}

console.log('\n══════════════════════════════════════════════════════════');
if (adbExecutionOk && emuExecutionOk) {
  console.log('  RESULT: ✅ BACKEND WORKER SDK CONNECTION IS WORKING PERFECTLY!');
} else {
  console.log('  RESULT: ❌ BACKEND WORKER CANNOT CONNECT TO SDK PATHS.');
}
console.log('══════════════════════════════════════════════════════════\n');
