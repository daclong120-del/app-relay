import { runScrapeApps } from '../../tests/test-endpoints/scrape-apps';

runScrapeApps().catch((err) => {
  console.error('❌ Scrape apps runner failed:', err);
  process.exit(1);
});
