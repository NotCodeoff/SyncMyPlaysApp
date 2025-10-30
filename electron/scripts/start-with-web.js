#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting SyncMyPlays Desktop App + Web Version...\n');

// Check if web directory exists
const webDir = path.join(__dirname, '..', 'web');
if (!fs.existsSync(webDir)) {
  console.error('❌ Web directory not found! Please run setup first.');
  process.exit(1);
}

// Check if web package.json exists
const webPackageJson = path.join(webDir, 'package.json');
if (!fs.existsSync(webPackageJson)) {
  console.error('❌ Web package.json not found! Please run setup first.');
  process.exit(1);
}

let electronProcess = null;
let webProcess = null;

// Function to cleanup processes on exit
function cleanup() {
  console.log('\n🛑 Shutting down...');
  if (electronProcess) {
    electronProcess.kill();
  }
  if (webProcess) {
    webProcess.kill();
  }
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// Start Electron app
console.log('📱 Starting Desktop App...');
electronProcess = spawn('electron', ['.'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
});

electronProcess.on('error', (err) => {
  console.error('❌ Failed to start Electron:', err.message);
});

// Wait 3 seconds then start web version
setTimeout(() => {
  console.log('🌐 Starting Web Version...');
  
  webProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    cwd: webDir
  });

  webProcess.on('error', (err) => {
    console.error('❌ Failed to start web version:', err.message);
  });

  webProcess.on('exit', (code) => {
    if (code !== 0) {
      console.log(`🌐 Web version exited with code ${code}`);
    }
  });

}, 3000);

electronProcess.on('exit', (code) => {
  console.log(`📱 Desktop app exited with code ${code}`);
  if (webProcess) {
    webProcess.kill();
  }
  process.exit(code);
});

console.log('✅ Both apps starting...');
console.log('📱 Desktop App: Electron window will open');
console.log('🌐 Web Version: http://localhost:8080');
console.log('\n💡 Press Ctrl+C to stop both apps\n');
