// PM2 process definition for the WACRM WhatsApp QR worker.
//   pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'wacrm-wa-qr-worker',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1, // MUST stay 1 — Baileys sockets are stateful, not clusterable.
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      time: true,
    },
  ],
};
