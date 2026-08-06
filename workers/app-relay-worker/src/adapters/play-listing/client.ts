// Main Google Play Listing Client Component

import { AppNotFoundError, ListingDownloadError } from './errors';
import { writePlayListingToDisk } from './mapper';
import { parsePlayListingHtml } from './parser';
import { PlayListingResult } from './types';

export interface PlayListingClientOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxPageSizeBytes?: number;
}

export class PlayListingClient {
  private userAgent: string;
  private timeoutMs: number;
  private maxPageSizeBytes: number;

  constructor(options?: PlayListingClientOptions) {
    this.userAgent = options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.timeoutMs = options?.timeoutMs || 15000;
    this.maxPageSizeBytes = options?.maxPageSizeBytes || 5 * 1024 * 1024; // 5 MB HTML cap
  }

  async fetchAndProcessListing(
    playUrl: string,
    targetDir: string,
    options?: { downloadAssets?: boolean; mockHtml?: string }
  ): Promise<PlayListingResult> {
    const parsedUrl = new URL(playUrl);
    const packageId = parsedUrl.searchParams.get('id') || 'unknown';

    let html = options?.mockHtml || '';

    if (!html) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await fetch(playUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept-Language': parsedUrl.searchParams.get('hl') || 'en',
          },
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw new ListingDownloadError(`Failed to fetch Google Play store listing from ${playUrl}: ${err.message}`);
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 404) {
        throw new AppNotFoundError(packageId);
      }

      if (!response.ok) {
        throw new ListingDownloadError(`HTTP status ${response.status} fetching store page.`);
      }

      html = await response.text();
      if (html.length > this.maxPageSizeBytes) {
        throw new ListingDownloadError(`HTML page size ${html.length} bytes exceeds cap of ${this.maxPageSizeBytes} bytes.`);
      }
    }

    // 1. Parse HTML
    const data = parsePlayListingHtml(html, packageId);

    // 2. Persist to target directory
    return writePlayListingToDisk(data, html, targetDir, options?.downloadAssets ?? true);
  }
}
