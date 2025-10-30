#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Pre-installation dependency checks...');

// Check if Node.js version is compatible
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 16) {
  console.error('❌ Error: Node.js version 16 or higher is required.');
  console.error(`Current version: ${nodeVersion}`);
  process.exit(1);
}

console.log(`✅ Node.js version ${nodeVersion} is compatible`);

// Check if npm is available
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  console.log(`✅ npm version ${npmVersion} is available`);
} catch (error) {
  console.error('❌ Error: npm is not available');
  process.exit(1);
}

// Check available disk space
try {
  const stats = fs.statSync(process.cwd());
  console.log('✅ Project directory is accessible');
} catch (error) {
  console.error('❌ Error: Cannot access project directory');
  process.exit(1);
}

// Check if package.json exists
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found');
  process.exit(1);
}

console.log('✅ package.json found');

// Check if package-lock.json exists
const packageLockPath = path.join(process.cwd(), 'package-lock.json');
if (fs.existsSync(packageLockPath)) {
  console.log('✅ package-lock.json found');
} else {
  console.log('⚠️  Warning: package-lock.json not found, will be created');
}

// Check if node_modules exists
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('✅ node_modules directory exists');
} else {
  console.log('📦 node_modules directory will be created');
}

// Check for Python (needed for some native dependencies)
try {
  execSync('python --version', { encoding: 'utf8', stdio: 'ignore' });
  console.log('✅ Python is available');
} catch (error) {
  try {
    execSync('python3 --version', { encoding: 'utf8', stdio: 'ignore' });
    console.log('✅ Python3 is available');
  } catch (error3) {
    console.log('⚠️  Warning: Python not found, some native dependencies may fail');
  }
}

// Check for build tools on Windows
if (process.platform === 'win32') {
  try {
    execSync('where cl', { encoding: 'utf8', stdio: 'ignore' });
    console.log('✅ Visual Studio Build Tools detected');
  } catch (error) {
    console.log('⚠️  Warning: Visual Studio Build Tools not detected, some native dependencies may fail');
  }
}

console.log('✅ Pre-installation checks completed successfully');
