module.exports = {
  apps: [{
    name: 'amazfit',
    script: 'dist/index.js',
    exec_mode: 'cluster',
    instances: 1,
    interpreter: '/usr/local/n/versions/node/20.20.2/bin/node',
  }]
};
