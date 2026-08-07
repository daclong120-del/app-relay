import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CreateJobRequestSchema,
  JobStatusSchema,
  StepSchema,
  WorkerHeartbeatRequestSchema,
  CompleteJobRequestSchema,
} from './index.js';

describe('Contracts Schema Tests', () => {
  it('validates JobStatusSchema correctly', () => {
    assert.strictEqual(JobStatusSchema.parse('queued'), 'queued');
    assert.strictEqual(JobStatusSchema.parse('running'), 'running');
    assert.throws(() => JobStatusSchema.parse('invalid_status'));
  });

  it('validates StepSchema correctly', () => {
    assert.strictEqual(StepSchema.parse('booting_emulator'), 'booting_emulator');
    assert.throws(() => StepSchema.parse('non_existent_step'));
  });

  it('validates CreateJobRequestSchema with valid URL', () => {
    const valid = { playUrl: 'https://play.google.com/store/apps/details?id=com.example.app' };
    const parsed = CreateJobRequestSchema.parse(valid);
    assert.strictEqual(parsed.playUrl, valid.playUrl);
    assert.strictEqual(parsed.includeListing, true);
    assert.strictEqual(parsed.includeScreenshots, true);
  });

  it('rejects CreateJobRequestSchema with invalid URL', () => {
    const invalid = { playUrl: 'not-a-url' };
    assert.throws(() => CreateJobRequestSchema.parse(invalid));
  });

  it('validates WorkerHeartbeatRequestSchema with defaults', () => {
    const req = { workerId: 'worker-1' };
    const parsed = WorkerHeartbeatRequestSchema.parse(req);
    assert.strictEqual(parsed.workerId, 'worker-1');
    assert.deepStrictEqual(parsed.capabilities, {});
  });

  it('validates CompleteJobRequestSchema with scraped metadata fields', () => {
    const req = {
      workerId: 'worker-1',
      result: {
        versionName: '1.2.3',
        versionCode: 123,
        splitCount: 2,
        screenshotCount: 5,
        baseApkSizeBytes: 1048576,
        title: 'Test App',
        developer: 'Test Dev',
        rating: '4.5',
        installsText: '10M+',
        description: 'Test description',
        listingMetadata: { iconUrl: 'https://example.com/icon.png' },
      },
    };
    const parsed = CompleteJobRequestSchema.parse(req);
    assert.strictEqual(parsed.result.title, 'Test App');
    assert.strictEqual(parsed.result.rating, '4.5');
    assert.strictEqual(parsed.result.installsText, '10M+');
  });
});
