// HTML Parser for Google Play Store Web Page Listings

import { AppNotFoundError, ListingParseError } from './errors';
import { PlayListingData } from './types';

export function parsePlayListingHtml(html: string, packageId: string): PlayListingData {
  if (!html || !html.trim()) {
    throw new ListingParseError('HTML content is empty.');
  }

  // 1. Detect 404 / App Not Found
  if (
    html.includes("We're sorry, the requested URL was not found") ||
    html.includes('itemprop="name" content="Google Play"') && html.includes('404')
  ) {
    throw new AppNotFoundError(packageId);
  }

  // Helper regex extractors
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

  // 2. Title
  let title = getMetaContent('og:title') || getMetaContent('name');
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }
  }
  if (!title) {
    throw new ListingParseError(`Could not extract app title for package "${packageId}".`);
  }

  // Clean title (remove " - Apps on Google Play" suffix if present)
  title = title.replace(/\s*-\s*Apps on Google Play$/i, '').trim();

  // 3. Developer
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

  // 4. Rating
  let rating: number | undefined;
  const ratingMatch = html.match(/itemprop=["']ratingValue["']\s+content=["']([0-9.]+)["']/i) ||
                      html.match(/aria-label=["']Rated ([0-9.]+) stars out of/i);
  if (ratingMatch) {
    const val = parseFloat(ratingMatch[1]);
    if (!isNaN(val)) rating = val;
  }

  // 5. Installs
  let installs: string | undefined;
  const installsMatch = html.match(/<div>([0-9,+]+\+?\s*Downloads)<\/div>/i) ||
                        html.match(/itemprop=["']numDownloads["']>([\s\S]*?)<\/div>/i);
  if (installsMatch) {
    installs = installsMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // 6. Description
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

  // 7. Icon URL
  let iconUrl = getMetaContent('og:image');
  if (!iconUrl) {
    const iconMatch = html.match(/<img[^>]+itemprop=["']image["'][^>]+src=["']([^"']+)["']/i) ||
                      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+itemprop=["']image["']/i);
    if (iconMatch) {
      iconUrl = iconMatch[1];
    }
  }

  // 8. Screenshot URLs
  const screenshotUrls: string[] = [];
  const screenshotRegex = /<img[^>]+(?:alt=["'][^"']*screenshot[^"']*["']|data-src=["'][^"']+screenshot|itemprop=["']screenshot["'])[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = screenshotRegex.exec(html)) !== null) {
    const url = match[1];
    if (url && !screenshotUrls.includes(url)) {
      screenshotUrls.push(url);
    }
  }

  // Fallback screenshot extraction: look for Google Play image server URLs with screenshot indicators
  if (screenshotUrls.length === 0) {
    const genericImgRegex = /src=["'](https:\/\/play-lh\.googleusercontent\.com\/[^"']+)["']/gi;
    while ((match = genericImgRegex.exec(html)) !== null) {
      const url = match[1];
      if (url !== iconUrl && !screenshotUrls.includes(url)) {
        screenshotUrls.push(url);
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
