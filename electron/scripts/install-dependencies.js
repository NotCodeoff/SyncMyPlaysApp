#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Installing all project dependencies...');

// Main project dependencies
console.log('🔧 Installing main project dependencies...');
try {
  execSync('npm install', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Main project dependencies installed');
} catch (error) {
  console.error('❌ Error installing main dependencies:', error.message);
  process.exit(1);
}

// Backend dependencies
const backendPath = path.join(process.cwd(), 'backend');
const backendPackageJsonPath = path.join(backendPath, 'package.json');

if (fs.existsSync(backendPackageJsonPath)) {
  console.log('🔧 Installing backend dependencies...');
  try {
    execSync('npm install', { 
      stdio: 'inherit',
      cwd: backendPath
    });
    console.log('✅ Backend dependencies installed');
  } catch (error) {
    console.error('❌ Error installing backend dependencies:', error.message);
    console.log('🔄 Trying with --force flag...');
    try {
      execSync('npm install --force', { 
        stdio: 'inherit',
        cwd: backendPath
      });
      console.log('✅ Backend dependencies installed with --force');
    } catch (forceError) {
      console.error('❌ Error installing backend dependencies even with --force:', forceError.message);
    }
  }
} else {
  console.log('⚠️  Backend package.json not found, skipping backend dependencies');
}

// Check for any additional project directories
const projectDirs = ['syncmyplays-next'];

for (const dir of projectDirs) {
  const dirPath = path.join(process.cwd(), dir);
  const packageJsonPath = path.join(dirPath, 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    console.log(`🔧 Installing ${dir} dependencies...`);
    try {
      execSync('npm install', { 
        stdio: 'inherit',
        cwd: dirPath
      });
      console.log(`✅ ${dir} dependencies installed`);
    } catch (error) {
      console.error(`❌ Error installing ${dir} dependencies:`, error.message);
      console.log(`⚠️  Continuing without ${dir} dependencies...`);
    }
  }
}

// Audit dependencies for security vulnerabilities
console.log('🔍 Running security audit...');
try {
  execSync('npm audit --audit-level moderate', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Security audit completed');
} catch (error) {
  console.log('⚠️  Security audit found issues, but continuing...');
  console.log('💡 Run "npm audit fix" manually if needed');
}

// Clean up any cache issues
console.log('🧹 Cleaning up npm cache...');
try {
  execSync('npm cache clean --force', { stdio: 'pipe' });
  console.log('✅ npm cache cleaned');
} catch (error) {
  console.log('⚠️  Could not clean npm cache, but continuing...');
}

console.log('✅ All dependencies installation completed successfully');
