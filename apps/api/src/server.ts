import 'dotenv/config';
import app from './app.js';
import { startArtifactCleanupCron } from './background/cleanup.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 App Relay API running on http://0.0.0.0:${PORT}`);
  startArtifactCleanupCron();
});

