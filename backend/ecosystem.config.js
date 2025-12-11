module.exports = {
  apps: [{
    name: 'product-docs-api',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // 优雅关闭
    kill_timeout: 5000,
    // 健康检查
    health_check: {
      enabled: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  }]
};
