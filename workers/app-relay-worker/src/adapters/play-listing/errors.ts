// Error Classes for Play Store Listing Pipeline

export class PlayListingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PlayListingError';
  }
}

export class AppNotFoundError extends PlayListingError {
  constructor(packageId: string) {
    super('APP_NOT_FOUND', `Google Play store listing not found for package "${packageId}".`);
    this.name = 'AppNotFoundError';
  }
}

export class ListingParseError extends PlayListingError {
  constructor(message: string) {
    super('LISTING_PARSE_FAILED', `Failed to parse Google Play listing HTML: ${message}`);
    this.name = 'ListingParseError';
  }
}

export class ListingDownloadError extends PlayListingError {
  constructor(message: string) {
    super('DOWNLOAD_FAILED', `Failed to download store asset: ${message}`);
    this.name = 'ListingDownloadError';
  }
}
