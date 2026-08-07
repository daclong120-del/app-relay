/**
 * PM2 Ecosystem Configuration for AppRelay Worker Daemon
 *
 * Deployment Instructions for Linux VPS:
 * 1. Build worker: cd workers/app-relay-worker && npm run build
 * 2. Put secrets in workers/app-relay-worker/.env (git-ignored) — see .env.example
 * 3. Start PM2: pm2 start ecosystem.config.js
 * 4. Save process state: pm2 save && pm2 startup
 *
 * No secret is defined in this file. It is committed to git, so anything
 * written here is published; WORKER_TOKEN must come from the environment or
 * the .env file. The worker refuses to start when it is missing.
 */

module.exports = {
  apps: [
    {
      name: 'app-relay-worker',
      script: './dist/main.js',
      cwd: __dirname,
      instances: 1,
      // Fork, khong phai cluster: worker nay giu trang thai (so slot job, mot
      // emulator duy nhat) nen khong the nhan ban. Cluster mode con bo qua
      // node_args ben duoi, khien .env khong duoc nap.
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // Nap .env canh file nay. Luu y: --env-file KHONG ghi de bien da co san,
      // nen bat cu key nao liet ke trong `env` duoi day se thang gia tri trong .env.
      node_args: '--env-file=.env',
      env: {
        NODE_ENV: 'development',
        // 'false' = emulator mở cửa sổ GUI; đổi thành 'true' nếu muốn chạy ngầm
        HEADLESS: 'false',
        // Dashboard chay trong docker, map 3001:3000 nen tu host phai goi 3001.
        GATEWAY_URL: 'http://localhost:3001/api/release-ops/worker/v1',
        AVD_NAME: 'chpay',
        ADB_DEVICE_SERIAL: 'emulator-5554',
      },
      env_production: {
        NODE_ENV: 'production',
        HEADLESS: 'true',
        AVD_NAME: 'chpay',
        ADB_DEVICE_SERIAL: 'emulator-5554',
        // GATEWAY_URL and WORKER_TOKEN come from the environment / .env file.
      },
    },
  ],
};
