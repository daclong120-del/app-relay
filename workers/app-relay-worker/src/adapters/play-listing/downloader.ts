// Asset Downloader with Bounded Timeouts, Size Caps, and Content-Type Checks

import { promises as fs } from 'fs';
import { dirname } from 'path';
import { ListingDownloadError } from './errors';

export interface DownloadAssetOptions {
  url: string;
  outputPath: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
}

export async function downloadAsset(options: DownloadAssetOptions): Promise<string> {
  const maxSizeBytes = options.maxSizeBytes || 10 * 1024 * 1024; // 10 MB default cap
  const timeoutMs = options.timeoutMs || 10000; // 10s timeout
  const allowedContentTypes = options.allowedContentTypes || [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/octet-stream',
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(options.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ListingDownloadError(`Download timed out after ${timeoutMs}ms for URL ${options.url}`);
    }
    throw new ListingDownloadError(`Network request failed for URL ${options.url}: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new ListingDownloadError(`HTTP status ${response.status} downloading URL ${options.url}`);
  }

  // Validate Content-Length if present
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
    throw new ListingDownloadError(`Asset size ${contentLength} bytes exceeds limit of ${maxSizeBytes} bytes.`);
  }

  // Validate Content-Type
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !allowedContentTypes.includes(contentType)) {
    throw new ListingDownloadError(`Disallowed content type "${contentType}" for URL ${options.url}`);
  }

  // Ensure output parent directory exists
  await fs.mkdir(dirname(options.outputPath), { recursive: true });

  // Stream/read array buffer and check actual size
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxSizeBytes) {
    throw new ListingDownloadError(`Downloaded asset size ${buffer.length} bytes exceeds limit of ${maxSizeBytes} bytes.`);
  }

  await fs.writeFile(options.outputPath, buffer);
  return options.outputPath;
}
