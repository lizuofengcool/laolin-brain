// PM2 配置文件
// 使用方式：pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      // 应用名称
      name: "laolin-brain",

      // 启动脚本（使用Next.js standalone模式）
      script: ".next/standalone/server.js",

      // 应用目录
      cwd: process.cwd(),

      // 实例数量（集群模式）
      instances: 1, // SQLite不支持多进程写入，建议单实例
      // instances: "max", // 如果使用PostgreSQL等支持并发的数据库，可以用集群模式

      // 执行模式：cluster（集群）或 fork（单进程）
      exec_mode: "fork",

      // 环境变量
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // 开发环境（pm2 start ecosystem.config.js --env development）
      env_development: {
        NODE_ENV: "development",
        PORT: 3000,
      },

      // 测试环境
      env_test: {
        NODE_ENV: "test",
        PORT: 3001,
      },

      // 日志配置
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      out_file: "./logs/pm2/out.log",
      error_file: "./logs/pm2/error.log",
      pid_file: "./logs/pm2/app.pid",

      // 日志轮转
      // 需要安装 pm2-logrotate: pm2 install pm2-logrotate
      // log_date_format: "YYYY-MM-DD_HH-mm-ss",
      // max_size: "10M",
      // retain: 30,
      // compress: true,

      // 错误自动重启
      autorestart: true,

      // 最大内存限制（超过则重启）
      max_memory_restart: "500M",

      // 监听文件变化重启（开发环境用）
      watch: false,
      // watch: [
      //   "src",
      //   "prisma",
      // ],
      // ignore_watch: [
      //   "node_modules",
      //   "data",
      //   "uploads",
      //   "logs",
      //   ".next",
      // ],

      // 优雅关闭超时时间
      kill_timeout: 5000,

      // 启动延迟（毫秒）
      listen_timeout: 10000,

      // 等待就绪信号
      wait_ready: false,

      // 最小运行时间（小于此时间的重启视为异常）
      min_uptime: "30s",

      // 最大重启次数（超过则停止重启）
      max_restarts: 10,

      // 重启间隔
      restart_delay: 5000,

      // 合并日志（集群模式下所有实例日志合并）
      merge_logs: true,
    },
  ],

  // 部署配置（pm2 deploy）
  deploy: {
    production: {
      user: "deploy",
      host: "your-server.com",
      ref: "origin/main",
      repo: "https://gitee.com/fay1314/laolin-brain.git",
      path: "/var/www/laolin-brain",
      "post-deploy":
        "npm install && npx prisma generate && npx prisma db push && npm run build && pm2 reload ecosystem.config.js --env production",
      env: {
        NODE_ENV: "production",
      },
    },
  },
};
