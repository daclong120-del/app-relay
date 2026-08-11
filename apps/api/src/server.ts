import 'dotenv/config';
import app from './app.js';
import { startArtifactCleanupCron } from './background/cleanup.js';

// 5500 là cổng DUY NHẤT của dự án: API nghe ở đây bên trong container, compose
// publish đúng số đó ra 127.0.0.1, và Cloudflare Tunnel trỏ vào http://api:5500.
// Một con số ở mọi tầng — đổi thì phải đổi cả deploy/compose.yml, Caddyfile,
// compose.tunnel.yaml và RELAY_API_URL của worker.
const PORT = parseInt(process.env.PORT || '5500', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 App Relay API running on http://0.0.0.0:${PORT}`);
  startArtifactCleanupCron();
});

