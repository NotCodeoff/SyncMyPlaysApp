#!/usr/bin/env node

/**
 * PostInstall Script - Fixes common Windows build issues
 * Runs automatically after npm install
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Running post-install fixes...');

// Fix 1: Create fsevents stub (Mac-specific module causes issues on Windows)
const fseventsPath = path.join(__dirname, '..', 'node_modules', 'fsevents');
if (!fs.existsSync(fseventsPath)) {
  console.log('📦 Creating fsevents stub...');
  fs.mkdirSync(fseventsPath, { recursive: true });
  
  const packageJson = {
    name: 'fsevents',
    version: '2.3.2',
    description: 'Native file watching for macOS (stub for Windows)',
    main: 'index.js'
  };
  
  fs.writeFileSync(
    path.join(fseventsPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  fs.writeFileSync(
    path.join(fseventsPath, 'index.js'),
    '// Stub for Windows - fsevents only works on macOS\nmodule.exports = {};'
  );
  
  console.log('   ✅ fsevents stub created');
} else {
  console.log('   ✅ fsevents already exists');
}

// Fix 2: Verify no backend/package.json exists (should use root)
const backendPackageJson = path.join(__dirname, '..', 'backend', 'package.json');
if (fs.existsSync(backendPackageJson)) {
  console.log('⚠️  WARNING: backend/package.json found!');
  console.log('   This should not exist. Backend should use root node_modules/.');
  console.log('   Run: Remove-Item backend/package.json -Force');
}

// Fix 3: Verify no backend/node_modules exists
const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules)) {
  console.log('⚠️  WARNING: backend/node_modules/ found!');
  console.log('   This should not exist. Backend should use root node_modules/.');
  console.log('   Run: Remove-Item backend/node_modules -Recurse -Force');
}

// Fix 4: Verify bcryptjs is installed (not bcrypt)
const bcryptjsPath = path.join(__dirname, '..', 'node_modules', 'bcryptjs');
const bcryptPath = path.join(__dirname, '..', 'node_modules', 'bcrypt');

if (!fs.existsSync(bcryptjsPath)) {
  console.log('⚠️  WARNING: bcryptjs not found!');
  console.log('   Run: npm install bcryptjs');
}

if (fs.existsSync(bcryptPath)) {
  console.log('⚠️  WARNING: bcrypt found (should use bcryptjs instead)!');
  console.log('   bcrypt requires compilation and causes distribution issues.');
  console.log('   Run: npm uninstall bcrypt && npm install bcryptjs');
}

console.log('✅ Post-install fixes complete!');
console.log('');

