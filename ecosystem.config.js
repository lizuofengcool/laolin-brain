module.exports = {
  apps: [{
    name: 'knowledge-brain',
    script: '.next/standalone/server.js',
    cwd: process.cwd(),
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'file:/home/z/my-project/db/custom.db',
      TOKEN_SECRET: 'kb-local-dev-secret-change-in-production',
    },
  }],
};
