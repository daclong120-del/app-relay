// Types for Google Play Store Listing Data & Outputs

export interface PlayListingData {
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

export interface PlayListingResult {
  playstoreDir: string;
  listingJsonPath: string;
  descriptionMdPath: string;
  iconPath?: string;
  pageHtmlPath: string;
  screenshotPaths: string[];
  data: PlayListingData;
}
