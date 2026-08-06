// Listing Output Directory Mapper & File System Persistence Writer

import { promises as fs } from 'fs';
import { join } from 'path';
import { downloadAsset } from './downloader';
import { PlayListingData, PlayListingResult } from './types';

export async function writePlayListingToDisk(
  data: PlayListingData,
  rawHtml: string,
  targetDir: string,
  downloadAssets = true
): Promise<PlayListingResult> {
  const playstoreDir = join(targetDir, 'playstore');
  const screenshotsDir = join(playstoreDir, 'screenshots');

  await fs.mkdir(playstoreDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  // 1. Write page.html
  const pageHtmlPath = join(playstoreDir, 'page.html');
  await fs.writeFile(pageHtmlPath, rawHtml, 'utf-8');

  // 2. Write description.md
  const descriptionMdPath = join(playstoreDir, 'description.md');
  const mdContent = `# ${data.title}\n\n**Developer**: ${data.developer}\n**Rating**: ${data.rating ?? 'N/A'}\n**Installs**: ${data.installs ?? 'N/A'}\n\n## Description\n\n${data.descriptionText}\n`;
  await fs.writeFile(descriptionMdPath, mdContent, 'utf-8');

  // 3. Download icon.png if present
  let iconPath: string | undefined;
  if (downloadAssets && data.iconUrl) {
    try {
      const targetIconPath = join(playstoreDir, 'icon.png');
      iconPath = await downloadAsset({
        url: data.iconUrl,
        outputPath: targetIconPath,
      });
    } catch (err: any) {
      console.warn(`[PlayListing] Icon download skipped: ${err.message}`);
    }
  }

  // 4. Download screenshots if present
  const screenshotPaths: string[] = [];
  if (downloadAssets && data.screenshotUrls && data.screenshotUrls.length > 0) {
    for (let i = 0; i < data.screenshotUrls.length; i++) {
      const url = data.screenshotUrls[i];
      const indexStr = String(i + 1).padStart(2, '0');
      const targetScreenshotPath = join(screenshotsDir, `screenshot_${indexStr}.png`);

      try {
        const savedPath = await downloadAsset({
          url,
          outputPath: targetScreenshotPath,
        });
        screenshotPaths.push(savedPath);
      } catch (err: any) {
        console.warn(`[PlayListing] Screenshot ${i + 1} download skipped: ${err.message}`);
      }
    }
  }

  // 5. Write listing.json
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
