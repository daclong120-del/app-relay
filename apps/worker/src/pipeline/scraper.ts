import fetch from 'node-fetch';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface ScrapeResult {
  title: string;
  developer: string;
  rating?: string;
  installs?: string;
  description: string;
  iconUrl?: string;
  screenshotUrls: string[];
}

export interface ScrapeOptions {
  includeScreenshots?: boolean;
}

export async function scrapePlayStoreListing(
  playUrl: string,
  targetDir: string,
  options: ScrapeOptions = { includeScreenshots: true }
): Promise<ScrapeResult> {
  const playstoreDir = path.join(targetDir, 'playstore');
  const screenshotDir = path.join(playstoreDir, 'screenshots');

  await fs.mkdir(playstoreDir, { recursive: true });
  const includeScreenshots = options.includeScreenshots !== false;
  if (includeScreenshots) {
    await fs.mkdir(screenshotDir, { recursive: true });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const response = await fetch(playUrl, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch Play Store URL (${response.status} ${response.statusText})`);
  }

  const html = await response.text();
  await fs.writeFile(path.join(playstoreDir, 'page.html'), html, 'utf-8');

  // JSON-LD structured metadata extraction
  let jsonLdData: any = null;
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
  if (jsonLdMatch) {
    try {
      jsonLdData = JSON.parse(jsonLdMatch[1]);
    } catch {
      // Ignore JSON parse failure in script tag
    }
  }

  // Title extraction
  let title = 'Unknown App';
  if (jsonLdData && jsonLdData.name) {
    title = String(jsonLdData.name).trim();
  } else {
    const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*><span>(.*?)<\/span><\/h1>/i) ||
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<title>(.*?) - Apps on Google Play<\/title>/i) ||
      html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }
  }

  // Developer extraction
  let developer = 'Unknown Developer';
  if (jsonLdData && jsonLdData.author && jsonLdData.author.name) {
    developer = String(jsonLdData.author.name).trim();
  } else {
    const devMatch = html.match(/href="\/store\/apps\/(?:developer|dev)\?id=[^"]+"[^>]*><span>(.*?)<\/span>/i) ||
      html.match(/itemprop="author"[^>]*>(?:<[^>]+>)*([^<]+)/i) ||
      html.match(/<span>([A-Za-z0-9\s.,]+)<\/span><\/a>/i);
    if (devMatch && devMatch[1]) {
      developer = devMatch[1].replace(/<[^>]+>/g, '').trim();
    }
  }

  // Rating extraction
  let rating: string | undefined;
  if (jsonLdData && jsonLdData.aggregateRating && jsonLdData.aggregateRating.ratingValue) {
    rating = String(jsonLdData.aggregateRating.ratingValue).trim();
  } else {
    const ratingMatch = html.match(/aria-label="Rated ([0-9.]+)\s*stars/i) ||
      html.match(/aria-label="([0-9.]+)\s*stars out of five"/i) ||
      html.match(/<div[^>]*aria-label="([0-9.]+)\s*star/i) ||
      html.match(/itemprop="ratingValue" content="([0-9.]+)"/i) ||
      html.match(/([0-9]\.[0-9])\s*★/i);
    if (ratingMatch && ratingMatch[1]) {
      rating = ratingMatch[1].trim();
    }
  }

  // Installs extraction
  const installsMatch = html.match(/<span>([0-9,MK.]+\+?)\s*(?:downloads|Downloads|lượt tải)<\/span>/i) ||
    html.match(/aria-label="([0-9,MK.]+\+?\s*(?:downloads|Downloads|lượt tải))"/i) ||
    html.match(/([0-9,MK.]+\+?)\s*(?:downloads|Downloads|lượt tải)/i);
  const installs = installsMatch ? installsMatch[1].trim() : undefined;

  // Description extraction
  let description = '';
  if (jsonLdData && jsonLdData.description) {
    description = String(jsonLdData.description).trim();
  } else {
    const descMatch = html.match(/<div[^>]*itemprop="description"[^>]*>(.*?)<\/div>/s) ||
      html.match(/<div[^>]*data-g-id="description"[^>]*>(.*?)<\/div>/s) ||
      html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    let rawDesc = descMatch ? descMatch[1] : '';
    description = rawDesc
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  // Icon extraction
  const iconMatch = html.match(/<meta property="og:image" content="(.*?)"/i);
  const iconUrl = iconMatch ? iconMatch[1] : undefined;

  // Screenshot URLs extraction (only if includeScreenshots is true)
  const screenshotUrls: string[] = [];
  if (includeScreenshots) {
    const ssRegex = /<img[^>]*src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"[^>]*data-screenshot-index/gi;
    let match: RegExpExecArray | null;
    while ((match = ssRegex.exec(html)) !== null) {
      let imgUrl = match[1];
      imgUrl = imgUrl.replace(/=w\d+-h\d+.*$/, '=w1080-h1920');
      if (!screenshotUrls.includes(imgUrl)) {
        screenshotUrls.push(imgUrl);
      }
    }

    // Fallback screenshot regex if none found
    if (screenshotUrls.length === 0) {
      const fallbackRegex = /src="(https:\/\/play-lh\.googleusercontent\.com\/[a-zA-Z0-9_-]+)"/g;
      let fbMatch: RegExpExecArray | null;
      while ((fbMatch = fallbackRegex.exec(html)) !== null) {
        const imgUrl = `${fbMatch[1]}=w1080-h1920`;
        if (!screenshotUrls.includes(imgUrl) && screenshotUrls.length < 10) {
          screenshotUrls.push(imgUrl);
        }
      }
    }
  }

  // Save description.md
  const descMd = `# ${title}\n**Developer:** ${developer}\n\n## Description\n${description}\n`;
  await fs.writeFile(path.join(playstoreDir, 'description.md'), descMd, 'utf-8');

  // Save listing.json
  const listingJson = {
    title,
    developer,
    rating,
    installs,
    description,
    iconUrl,
    screenshotCount: screenshotUrls.length,
    scrapedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(playstoreDir, 'listing.json'), JSON.stringify(listingJson, null, 2), 'utf-8');

  // Download icon
  if (iconUrl) {
    try {
      const res = await fetch(iconUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        await fs.writeFile(path.join(playstoreDir, 'icon.png'), Buffer.from(buffer));
      }
    } catch (err) {
      console.warn(`[Scraper] Icon download failed: ${err}`);
    }
  }

  // Download screenshots
  if (includeScreenshots) {
    let ssIndex = 1;
    for (const ssUrl of screenshotUrls) {
      try {
        const res = await fetch(ssUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const fileName = `screenshot_${String(ssIndex).padStart(2, '0')}.png`;
          await fs.writeFile(path.join(screenshotDir, fileName), Buffer.from(buffer));
          ssIndex++;
        }
      } catch (err) {
        console.warn(`[Scraper] Screenshot download failed (${ssUrl}): ${err}`);
      }
    }
  }

  return {
    title,
    developer,
    rating,
    installs,
    description,
    iconUrl,
    screenshotUrls,
  };
}
