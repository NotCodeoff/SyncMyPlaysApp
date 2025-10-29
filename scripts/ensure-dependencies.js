#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Ensuring dependencies are installed...');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageLockPath = path.join(process.cwd(), 'package-lock.json');
const nodeModulesPath = path.join(process.cwd(), 'node_modules');

// Read package.json
let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.error('❌ Error reading package.json:', error.message);
  process.exit(1);
}

// Check if dependencies are listed
const deps = packageJson.dependencies || {};
const devDeps = packageJson.devDependencies || {};
const totalDeps = Object.keys(deps).length + Object.keys(devDeps).length;

console.log(`📋 Found ${Object.keys(deps).length} production dependencies`);
console.log(`📋 Found ${Object.keys(devDeps).length} development dependencies`);

// Check if node_modules exists and has content
let needsInstall = false;

if (!fs.existsSync(nodeModulesPath)) {
  console.log('📦 node_modules directory not found');
  needsInstall = true;
} else {
  try {
    const nodeModulesContents = fs.readdirSync(nodeModulesPath);
    const installedPackages = nodeModulesContents.filter(item => 
      !item.startsWith('.') && fs.statSync(path.join(nodeModulesPath, item)).isDirectory()
    );
    
    console.log(`📦 Found ${installedPackages.length} installed packages`);
    
    // Simple heuristic: if we have significantly fewer packages than expected, reinstall
    if (installedPackages.length < totalDeps * 0.7) {
      console.log('⚠️  Installed packages seem incomplete');
      needsInstall = true;
    }
  } catch (error) {
    console.log('⚠️  Could not read node_modules directory');
    needsInstall = true;
  }
}

// Check if package-lock.json exists
if (!fs.existsSync(packageLockPath)) {
  console.log('📝 package-lock.json not found');
  needsInstall = true;
}

// Install dependencies if needed
if (needsInstall) {
  console.log('🔧 Installing dependencies...');
  try {
    execSync('npm install', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('✅ Dependencies installed successfully');
  } catch (error) {
    console.error('❌ Error installing dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Dependencies are already installed');
}

// Check for backend dependencies
const backendPath = path.join(process.cwd(), 'backend');
const backendPackageJsonPath = path.join(backendPath, 'package.json');
const backendNodeModulesPath = path.join(backendPath, 'node_modules');

if (fs.existsSync(backendPackageJsonPath)) {
  console.log('🔍 Checking backend dependencies...');
  
  if (!fs.existsSync(backendNodeModulesPath)) {
    console.log('🔧 Installing backend dependencies...');
    try {
      execSync('npm install', { 
        stdio: 'inherit',
        cwd: backendPath
      });
      console.log('✅ Backend dependencies installed successfully');
    } catch (error) {
      console.error('❌ Error installing backend dependencies:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ Backend dependencies are already installed');
  }
}

console.log('✅ All dependencies ensured successfully');
