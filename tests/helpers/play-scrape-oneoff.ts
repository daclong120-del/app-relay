/**
 * play-scrape-oneoff.ts
 *
 * Standalone, self-contained Play Store scraper for the MANUAL pull flow.
 * This file intentionally does NOT import from workers/app-relay-worker/.
 *
 * Spec reference: pull-from-play (3).md L177
 *   "Không implement src/adapters/playstore.ts trong bước pull thủ công này
 *    (scrape one-off ra folder)."
 *
 * This is a one-off scrape helper — not a reusable adapter.
 */

import { promises as fs } from 'fs';
import { dirname, join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────

export interface OneOffListingData {
  packageId: string;
  title: string;
  developer: string;
  rating?: number;
  installs?: string;
  descriptionText: string;
  descriptionHtml?: string;
  iconUrl?: string;
  screenshotUrls: string[];
}

export interface OneOffListingResult {
  playstoreDir: string;
  listingJsonPath: string;
  descriptionMdPath: string;
  iconPath?: string;
  pageHtmlPath: string;
  screenshotPaths: string[];
  data: OneOffListingData;
}

// ─── Fetch ────────────────────────────────────────────────────────────

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchPlayPageHtml(
  playUrl: string,
  options?: { timeoutMs?: number; userAgent?: string }
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  const ua = options?.userAgent ?? DEFAULT_UA;

  const parsedUrl = new URL(playUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(playUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        'Accept-Language': parsedUrl.searchParams.get('hl') || 'en',
      },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`[OneOff] Fetch timed out after ${timeoutMs}ms for ${playUrl}`);
    }
    throw new Error(`[OneOff] Network error fetching ${playUrl}: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    throw new Error(`[OneOff] App not found (404) at ${playUrl}`);
  }
  if (!response.ok) {
    throw new Error(`[OneOff] HTTP ${response.status} fetching ${playUrl}`);
  }

  const html = await response.text();
  if (html.length > 5 * 1024 * 1024) {
    throw new Error(`[OneOff] HTML too large: ${html.length} bytes`);
  }

  return html;
}

// ─── Parse ────────────────────────────────────────────────────────────

export function parsePlayHtml(html: string, packageId: string): OneOffListingData {
  if (!html || !html.trim()) {
    throw new Error('[OneOff] HTML content is empty.');
  }

  // Detect 404 / removed app
  if (
    html.includes("We're sorry, the requested URL was not found") ||
    (html.includes('itemprop="name" content="Google Play"') && html.includes('404'))
  ) {
    throw new Error(`[OneOff] App not found for package "${packageId}".`);
  }

  // Helper: extract <meta> content
  function getMetaContent(propertyOrName: string): string | null {
    const regex = new RegExp(
      `<meta\\s+(?:property|name|itemprop)=["']${propertyOrName}["']\\s+content=["']([^"']+)["']`,
      'i'
    );
    const match = html.match(regex);
    if (match) return match[1].trim();

    const reverseRegex = new RegExp(
      `<meta\\s+content=["']([^"']+)["']\\s+(?:property|name|itemprop)=["']${propertyOrName}["']`,
      'i'
    );
    const revMatch = html.match(reverseRegex);
    return revMatch ? revMatch[1].trim() : null;
  }

  // Title
  let title = getMetaContent('og:title') || getMetaContent('name');
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }
  }
  if (!title) {
    throw new Error(`[OneOff] Could not extract title for "${packageId}".`);
  }
  title = title.replace(/\s*-\s*Apps on Google Play$/i, '').trim();

  // Developer
  let developer = getMetaContent('author');
  if (!developer) {
    const devMatch = html.match(/href=["']\/store\/apps\/dev[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
                     html.match(/href=["']\/store\/apps\/developer[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (devMatch) {
      developer = devMatch[1].replace(/<[^>]+>/g, '').trim();
    }
  }
  if (!developer) {
    developer = 'Unknown Developer';
  }

  // Rating
  let rating: number | undefined;
  const ratingMatch = html.match(/itemprop=["']ratingValue["']\s+content=["']([0-9.]+)["']/i) ||
                      html.match(/aria-label=["']Rated ([0-9.]+) stars out of/i);
  if (ratingMatch) {
    const val = parseFloat(ratingMatch[1]);
    if (!isNaN(val)) rating = val;
  }

  // Installs
  let installs: string | undefined;
  const installsMatch = html.match(/<div>([0-9,+]+\+?\s*Downloads)<\/div>/i) ||
                        html.match(/itemprop=["']numDownloads["']>([\s\S]*?)<\/div>/i);
  if (installsMatch) {
    installs = installsMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Description — strip HTML, keep full text (spec: KHÔNG cắt ngắn)
  let descriptionHtml = '';
  let descriptionText = '';

  const descMatch = html.match(/itemprop=["']description["'][^>]*>([\s\S]*?)<\/div>/i) ||
                    html.match(/data-g-id=["']description["'][^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    descriptionHtml = descMatch[1].trim();
    descriptionText = descriptionHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  } else {
    descriptionText = title;
  }

  // Icon URL (og:image)
  let iconUrl = getMetaContent('og:image');
  if (!iconUrl) {
    const iconMatch = html.match(/<img[^>]+itemprop=["']image["'][^>]+src=["']([^"']+)["']/i) ||
                      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+itemprop=["']image["']/i);
    if (iconMatch) {
      iconUrl = iconMatch[1];
    }
  }

  // Helper to ensure high-resolution screenshot URL (Spec Line 63: =w1080-h1920 if possible)
  function toHighResScreenshotUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl;
    if (rawUrl.includes('=w') || rawUrl.includes('=s') || rawUrl.includes('=h')) {
      return rawUrl.replace(/=(?:w\d+|h\d+|s\d+)[^"']*/, '=w1080-h1920');
    }
    return `${rawUrl}=w1080-h1920`;
  }

  // Screenshot URLs
  const screenshotUrls: string[] = [];
  const screenshotRegex = /<img[^>]+(?:alt=["'][^"']*screenshot[^"']*["']|data-src=["'][^"']+screenshot|itemprop=["']screenshot["'])[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = screenshotRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    if (rawUrl) {
      const url = toHighResScreenshotUrl(rawUrl);
      if (!screenshotUrls.includes(url)) {
        screenshotUrls.push(url);
      }
    }
  }

  // Fallback: Google Play image server URLs
  if (screenshotUrls.length === 0) {
    const genericImgRegex = /src=["'](https:\/\/play-lh\.googleusercontent\.com\/[^"']+)["']/gi;
    while ((match = genericImgRegex.exec(html)) !== null) {
      const rawUrl = match[1];
      if (rawUrl && rawUrl !== iconUrl) {
        const url = toHighResScreenshotUrl(rawUrl);
        if (!screenshotUrls.includes(url)) {
          screenshotUrls.push(url);
        }
      }
    }
  }

  return {
    packageId,
    title,
    developer,
    rating,
    installs,
    descriptionText,
    descriptionHtml: descriptionHtml || undefined,
    iconUrl: iconUrl || undefined,
    screenshotUrls,
  };
}

// ─── Download Asset (one-off, bounded) ────────────────────────────────

async function downloadAssetOneOff(
  url: string,
  outputPath: string,
  options?: { maxSizeBytes?: number; timeoutMs?: number }
): Promise<string> {
  const maxSize = options?.maxSizeBytes ?? 10 * 1024 * 1024;
  const timeout = options?.timeoutMs ?? 10000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': DEFAULT_UA },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`[OneOff] Download timed out: ${url}`);
    }
    throw new Error(`[OneOff] Download failed: ${url} — ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`[OneOff] HTTP ${response.status} downloading ${url}`);
  }

  await fs.mkdir(dirname(outputPath), { recursive: true });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxSize) {
    throw new Error(`[OneOff] Asset too large: ${buffer.length} bytes (cap ${maxSize})`);
  }

  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

// ─── Write to Disk (one-off layout) ──────────────────────────────────

export async function writeOneOffListingToDisk(
  data: OneOffListingData,
  rawHtml: string,
  targetDir: string,
  downloadAssets = true
): Promise<OneOffListingResult> {
  const playstoreDir = join(targetDir, 'playstore');
  const screenshotsDir = join(playstoreDir, 'screenshots');

  await fs.mkdir(playstoreDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  // page.html
  const pageHtmlPath = join(playstoreDir, 'page.html');
  await fs.writeFile(pageHtmlPath, rawHtml, 'utf-8');

  // description.md
  const descriptionMdPath = join(playstoreDir, 'description.md');
  const mdContent = `# ${data.title}\n\n**Developer**: ${data.developer}\n**Rating**: ${data.rating ?? 'N/A'}\n**Installs**: ${data.installs ?? 'N/A'}\n\n## Description\n\n${data.descriptionText}\n`;
  await fs.writeFile(descriptionMdPath, mdContent, 'utf-8');

  // icon.png
  let iconPath: string | undefined;
  if (downloadAssets && data.iconUrl) {
    try {
      const targetIconPath = join(playstoreDir, 'icon.png');
      iconPath = await downloadAssetOneOff(data.iconUrl, targetIconPath);
    } catch (err: any) {
      console.warn(`[OneOff] Icon download skipped: ${err.message}`);
    }
  }

  // screenshots
  const screenshotPaths: string[] = [];
  if (downloadAssets && data.screenshotUrls.length > 0) {
    for (let i = 0; i < data.screenshotUrls.length; i++) {
      const url = data.screenshotUrls[i];
      const indexStr = String(i + 1).padStart(2, '0');
      const targetPath = join(screenshotsDir, `screenshot_${indexStr}.png`);
      try {
        const saved = await downloadAssetOneOff(url, targetPath);
        screenshotPaths.push(saved);
      } catch (err: any) {
        console.warn(`[OneOff] Screenshot ${i + 1} skipped: ${err.message}`);
      }
    }
  }

  // listing.json
  const listingJsonPath = join(playstoreDir, 'listing.json');
  const listingJson = {
    packageId: data.packageId,
    title: data.title,
    developer: data.developer,
    rating: data.rating ?? null,
    installs: data.installs ?? null,
    iconUrl: data.iconUrl ?? null,
    iconPath: iconPath ? 'icon.png' : null,
    screenshotUrls: data.screenshotUrls,
    screenshotCount: screenshotPaths.length,
    descriptionLength: data.descriptionText.length,
    scrapedAt: new Date().toISOString(),
  };
  await fs.writeFile(listingJsonPath, JSON.stringify(listingJson, null, 2), 'utf-8');

  return {
    playstoreDir,
    listingJsonPath,
    descriptionMdPath,
    iconPath,
    pageHtmlPath,
    screenshotPaths,
    data,
  };
}

// ─── Full one-off pipeline (fetch → parse → write) ───────────────────

export async function scrapePlayListingOneOff(
  playUrl: string,
  targetDir: string,
  options?: { timeoutMs?: number; downloadAssets?: boolean }
): Promise<OneOffListingResult> {
  const parsedUrl = new URL(playUrl);
  const packageId = parsedUrl.searchParams.get('id') || 'unknown';

  const html = await fetchPlayPageHtml(playUrl, { timeoutMs: options?.timeoutMs });
  const data = parsePlayHtml(html, packageId);
  return writeOneOffListingToDisk(data, html, targetDir, options?.downloadAssets ?? true);
}
