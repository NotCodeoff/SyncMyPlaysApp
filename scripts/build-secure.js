#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔒 Starting secure build process...');

async function buildSecure() {
  try {
    const projectDir = process.cwd();
    
    // Step 1: Pre-installation checks
    console.log('📋 Step 1: Running pre-installation checks...');
    execSync('npm run pre-install-deps', { stdio: 'inherit' });
    
    // Step 2: Ensure dependencies
    console.log('📋 Step 2: Ensuring all dependencies are installed...');
    execSync('npm run ensure-deps', { stdio: 'inherit' });
    
    // Step 3: Install Chromium
    console.log('📋 Step 3: Installing Chromium browser...');
    execSync('npm run install-chromium', { stdio: 'inherit' });
    
    // Step 4: Bundle dependencies
    console.log('📋 Step 4: Bundling dependencies for production...');
    execSync('npm run bundle-deps', { stdio: 'inherit' });
    
    // Step 5: Build backend
    console.log('📋 Step 5: Building backend executables...');
    execSync('npm run build:backend', { stdio: 'inherit' });
    
    // Step 6: Build frontend
    console.log('📋 Step 6: Building frontend...');
    execSync('npm run build', { stdio: 'inherit' });
    
    // Step 7: Verify electron files exist
    console.log('📋 Step 7: Verifying electron files...');
    const electronDir = path.join(projectDir, 'electron');
    const requiredFiles = [
      'main.js',
      'preload.js',
      'secureConsole.js',
      'secureLogger.js',
      'config.js'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(electronDir, file);
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Required electron file missing: ${file}`);
      }
    }
    console.log('✅ All electron files verified');
    
    // Step 8: Create secure build
    console.log('📋 Step 8: Creating secure build with electron-builder...');
    execSync('electron-builder --config electron-builder-secure.json', { stdio: 'inherit' });
    
    // Step 9: Verify security
    console.log('📋 Step 9: Verifying security measures...');
    execSync('npm run verify:security', { stdio: 'inherit' });
    
    console.log('✅ Secure build completed successfully!');
    console.log('🔒 Your application is now self-contained and secure');
    console.log('📦 The build output is in the dist-new-secure directory');
    
  } catch (error) {
    console.error('❌ Secure build failed:', error.message);
    process.exit(1);
  }
}

buildSecure();
