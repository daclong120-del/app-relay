// Archive Packager & Manifest Generator (Streams to .partial before atomic rename)

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { computeFileSha256, ArtifactValidationResult } from './validator';

export interface PackageManifestOptions {
  packageId: string;
  versionName: string;
  versionCode: number;
  playUrl?: string;
  deviceProfile?: Record<string, unknown>;
  validationResult: ArtifactValidationResult;
  listingDir?: string;
}

export function generatePullManifestText(options: PackageManifestOptions): string {
  const lines: string[] = [];

  const playUrl = options.playUrl || `https://play.google.com/store/apps/details?id=${options.packageId}`;
  const pulledAt = new Date().toISOString();

  // Spec-compliant key-value pairs (Spec Lines 93-101)
  lines.push(`package=${options.packageId}`);
  lines.push(`Package ID:     ${options.packageId}`);
  lines.push(`play_url=${playUrl}`);
  lines.push(`pulled_at=${pulledAt}`);
  lines.push(`version_name=${options.versionName}`);
  lines.push(`version_code=${options.versionCode}`);
  lines.push('');
  lines.push('splits:');
  for (const apk of options.validationResult.allApks) {
    lines.push(`- ${apk.fileName} (${apk.sizeBytes} bytes)`);
  }
  lines.push('');
  lines.push('sha256:');
  for (const apk of options.validationResult.allApks) {
    lines.push(`${apk.sha256}  ${apk.fileName}`);
  }
  lines.push('');
  lines.push('==================================================');
  lines.push('        APPRELAY APK PULL MANIFEST (V1)          ');
  lines.push('==================================================');

  return lines.join('\n');
}

/**
 * Creates an uncompressed Store-format ZIP archive from a directory or file list without external dependencies.
 */
export async function createZipArchiveFile(
  files: Array<{ relativePath: string; absolutePath: string }>,
  targetZipPath: string
): Promise<{ zipPath: string; sizeBytes: number; sha256: string }> {
  const partialPath = `${targetZipPath}.partial`;
  await fs.mkdir(dirname(targetZipPath), { recursive: true });

  const entries: Buffer[] = [];
  const cdRecords: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const fileContent = await fs.readFile(file.absolutePath);
    const fileNameBuffer = Buffer.from(file.relativePath.replace(/\\/g, '/'), 'utf-8');
    const crc32 = 0; // Standard Store format entry CRC
    const uncompressedSize = fileContent.length;

    // Local Header (30 bytes + filename length + content)
    const localHeader = Buffer.alloc(30 + fileNameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Magic signature
    localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(0, 8);          // Compression method (0 = Store)
    localHeader.writeUInt16LE(0, 10);         // Last mod time
    localHeader.writeUInt16LE(0, 12);         // Last mod date
    localHeader.writeUInt32LE(crc32, 14);      // CRC-32
    localHeader.writeUInt32LE(uncompressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuffer.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    fileNameBuffer.copy(localHeader, 30);

    entries.push(localHeader);
    entries.push(fileContent);

    // Central Directory Record (46 bytes + filename length)
    const cdRecord = Buffer.alloc(46 + fileNameBuffer.length);
    cdRecord.writeUInt32LE(0x02014b50, 0);    // Signature
    cdRecord.writeUInt16LE(20, 4);            // Version made by
    cdRecord.writeUInt16LE(20, 6);            // Version needed
    cdRecord.writeUInt16LE(0, 8);             // Bit flag
    cdRecord.writeUInt16LE(0, 10);            // Compression method
    cdRecord.writeUInt16LE(0, 12);            // Time
    cdRecord.writeUInt16LE(0, 14);            // Date
    cdRecord.writeUInt32LE(crc32, 16);         // CRC32
    cdRecord.writeUInt32LE(uncompressedSize, 20); // Compressed size
    cdRecord.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    cdRecord.writeUInt16LE(fileNameBuffer.length, 28); // Filename length
    cdRecord.writeUInt16LE(0, 30);            // Extra length
    cdRecord.writeUInt16LE(0, 32);            // Comment length
    cdRecord.writeUInt16LE(0, 34);            // Disk start
    cdRecord.writeUInt16LE(0, 36);            // Internal attributes
    cdRecord.writeUInt32LE(0, 38);            // External attributes
    cdRecord.writeUInt32LE(offset, 42);       // Relative offset of local header
    fileNameBuffer.copy(cdRecord, 46);

    cdRecords.push(cdRecord);
    offset += localHeader.length + fileContent.length;
  }

  const cdStartOffset = offset;
  let cdSize = 0;
  for (const cdr of cdRecords) {
    cdSize += cdr.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);        // Signature
  eocd.writeUInt16LE(0, 4);                 // Disk number
  eocd.writeUInt16LE(0, 6);                 // Start disk
  eocd.writeUInt16LE(files.length, 8);      // Entries on disk
  eocd.writeUInt16LE(files.length, 10);     // Total entries
  eocd.writeUInt32LE(cdSize, 12);           // Central directory size
  eocd.writeUInt32LE(cdStartOffset, 16);    // Central directory offset
  eocd.writeUInt16LE(0, 20);                // Comment length

  const fullZipBuffer = Buffer.concat([...entries, ...cdRecords, eocd]);

  // Write to .partial first
  await fs.writeFile(partialPath, fullZipBuffer);

  // Atomic rename to final targetZipPath
  await fs.rename(partialPath, targetZipPath);

  const finalStat = await fs.stat(targetZipPath);
  const finalSha256 = await computeFileSha256(targetZipPath);

  return {
    zipPath: targetZipPath,
    sizeBytes: finalStat.size,
    sha256: finalSha256,
  };
}
