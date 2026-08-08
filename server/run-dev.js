'use strict';

/*
 * 一键启动演示模式：同时拉起 Node 后端 + Vue 3 前端
 * 用法：npm run demo（仓库根目录提供 npm script 时）或 node server/run-dev.js
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');

const api = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env }
});

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fe = spawn(npmCmd, ['run', 'dev'], {
  cwd: WEB_DIR,
  stdio: 'inherit',
  env: { ...process.env }
});

function shutdown() {
  api.kill();
  fe.kill();
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

api.on('exit', (code) => {
  if (code !== null) fe.kill();
});
fe.on('exit', (code) => {
  if (code !== null) api.kill();
});

console.log('智盾演示模式启动中……');
console.log('  后端接口: http://127.0.0.1:3000');
console.log('  前端页面: http://127.0.0.1:8081');
