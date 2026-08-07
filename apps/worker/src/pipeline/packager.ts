import archiver from 'archiver';
import fs from 'fs';
import { createHash } from 'crypto';
import path from 'path';

export interface PackageResult {
  zipFilePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

export function packageWorkDirToZip(pkgWorkDir: string, packageId: string): Promise<PackageResult> {
  return new Promise((resolve, reject) => {
    const parentDir = path.dirname(pkgWorkDir);
    const zipFileName = `${packageId}.zip`;
    const zipFilePath = path.join(parentDir, zipFileName);

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    const hash = createHash('sha256');

    archive.on('data', (chunk) => {
      hash.update(chunk);
    });

    output.on('close', () => {
      const sha256 = hash.digest('hex');
      resolve({
        zipFilePath,
        fileName: zipFileName,
        sizeBytes: archive.pointer(),
        sha256,
      });
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(pkgWorkDir, false);
    archive.finalize();
  });
}
