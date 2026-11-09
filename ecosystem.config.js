const path = require('node:path');

module.exports = {
  apps: [{
    name: 'daclion-online',
    cwd: path.join(__dirname, 'server'),
    script: 'dist/server/src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: path.join(__dirname, 'logs/err.log'),
    out_file: path.join(__dirname, 'logs/out.log'),
    log_file: path.join(__dirname, 'logs/combined.log'),
    time: true
  }]
};
