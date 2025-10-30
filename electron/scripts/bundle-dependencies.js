#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Bundling dependencies for production...');

// Create dist-backend directory if it doesn't exist
const distBackendPath = path.join(process.cwd(), 'dist-backend');
if (!fs.existsSync(distBackendPath)) {
  fs.mkdirSync(distBackendPath, { recursive: true });
  console.log('📁 Created dist-backend directory');
}

// Copy backend files to dist-backend
const backendPath = path.join(process.cwd(), 'backend');
if (fs.existsSync(backendPath)) {
  console.log('📋 Copying backend files...');
  
  // Files to copy
  const filesToCopy = [
    'package.json',
    'index.js',
    'data.json',
    'server.cert'
  ];
  
  for (const file of filesToCopy) {
    const srcPath = path.join(backendPath, file);
    const destPath = path.join(distBackendPath, file);
    
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Copied ${file}`);
    } else {
      console.log(`⚠️  Warning: ${file} not found in backend directory`);
    }
  }
  
  // Copy node_modules if it exists
  const backendNodeModulesPath = path.join(backendPath, 'node_modules');
  const distNodeModulesPath = path.join(distBackendPath, 'node_modules');
  
  if (fs.existsSync(backendNodeModulesPath)) {
    console.log('📦 Copying backend node_modules...');
    try {
      // Use system copy command for efficiency
      if (process.platform === 'win32') {
        execSync(`xcopy "${backendNodeModulesPath}" "${distNodeModulesPath}" /E /I /H /Y`, { stdio: 'inherit' });
      } else {
        execSync(`cp -r "${backendNodeModulesPath}" "${distNodeModulesPath}"`, { stdio: 'inherit' });
      }
      console.log('✅ Backend node_modules copied');
    } catch (error) {
      console.error('❌ Error copying node_modules:', error.message);
      // Try alternative approach
      console.log('🔄 Trying alternative approach...');
      try {
        // Install dependencies directly in dist-backend
        execSync('npm install --production', { 
          stdio: 'inherit',
          cwd: distBackendPath
        });
        console.log('✅ Dependencies installed in dist-backend');
      } catch (installError) {
        console.error('❌ Error installing dependencies in dist-backend:', installError.message);
      }
    }
  } else {
    console.log('📦 Installing backend dependencies in dist-backend...');
    try {
      execSync('npm install --production', { 
        stdio: 'inherit',
        cwd: distBackendPath
      });
      console.log('✅ Dependencies installed in dist-backend');
    } catch (error) {
      console.error('❌ Error installing dependencies:', error.message);
    }
  }
} else {
  console.error('❌ Backend directory not found');
  process.exit(1);
}

// Create logs directory in dist-backend
const distLogsPath = path.join(distBackendPath, 'logs');
if (!fs.existsSync(distLogsPath)) {
  fs.mkdirSync(distLogsPath, { recursive: true });
  console.log('📁 Created logs directory in dist-backend');
}

// Bundle frontend dependencies if needed
console.log('🔍 Checking frontend bundle...');
const distPath = path.join(process.cwd(), 'dist');
const webpackConfigPath = path.join(process.cwd(), 'webpack.config.js');

if (fs.existsSync(webpackConfigPath)) {
  if (!fs.existsSync(distPath) || fs.readdirSync(distPath).length === 0) {
    console.log('🔧 Building frontend bundle...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('✅ Frontend bundle created');
    } catch (error) {
      console.error('❌ Error building frontend:', error.message);
    }
  } else {
    console.log('✅ Frontend bundle already exists');
  }
} else {
  console.log('⚠️  Webpack config not found, skipping frontend bundle');
}

console.log('✅ Dependency bundling completed');
