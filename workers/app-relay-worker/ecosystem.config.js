/**
 * PM2 Ecosystem Configuration for AppRelay Worker Daemon
 * 
 * Deployment Instructions for Linux VPS:
 * 1. Build worker: cd workers/app-relay-worker && npm run build
 * 2. Start PM2: pm2 start ecosystem.config.js
 * 3. Save process state: pm2 save && pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'app-relay-worker',
      script: './dist/main.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        HEADLESS: 'true',
        GATEWAY_URL: 'http://localhost:3000/api/release-ops/worker/v1',
        WORKER_TOKEN: 'dev-worker-token-secret-key',
        AVD_NAME: 'chpay',
        ADB_DEVICE_SERIAL: 'emulator-5554',
      },
      env_production: {
        NODE_ENV: 'production',
        HEADLESS: 'true',
        GATEWAY_URL: 'https://your-production-domain.com/api/release-ops/worker/v1',
        WORKER_TOKEN: 'your-production-worker-secret-token',
        AVD_NAME: 'chpay',
        ADB_DEVICE_SERIAL: 'emulator-5554',
      },
    },
  ],
};
