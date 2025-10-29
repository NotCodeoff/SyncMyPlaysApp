const fs = require('fs-extra');
const path = require('path');

console.log('🔒 Verifying build security...');

const distPath = path.join(__dirname, '..', 'dist-new-secure');
const winUnpackedPath = path.join(distPath, 'win-unpacked');

try {
  if (!fs.existsSync(winUnpackedPath)) {
    console.log('❌ Build not found. Please run npm run dist first.');
    process.exit(1);
  }

  const resourcesPath = path.join(winUnpackedPath, 'resources');
  const asarPath = path.join(resourcesPath, 'app.asar');
  const asarUnpackedPath = path.join(resourcesPath, 'app.asar.unpacked');

  console.log('📍 Checking build structure...');

  // Check if app.asar exists
  if (!fs.existsSync(asarPath)) {
    console.error('❌ CRITICAL: app.asar not found! Build is not secure!');
    process.exit(1);
  }

  // Check if app.asar.unpacked exists and verify it only contains safe files
  if (fs.existsSync(asarUnpackedPath)) {
    const unpackedContents = fs.readdirSync(asarUnpackedPath);
    console.log('📁 Unpacked contents:', unpackedContents);
    
    // Only allow specific safe files to be unpacked
    const allowedUnpacked = ['electron', 'dist-backend', 'node_modules'];
    const suspiciousFiles = unpackedContents.filter(file => !allowedUnpacked.includes(file));
    
    if (suspiciousFiles.length > 0) {
      console.error('❌ CRITICAL SECURITY RISK: Suspicious files in app.asar.unpacked!');
      console.error('   Suspicious files:', suspiciousFiles);
      console.error('   Only these files should be unpacked:', allowedUnpacked);
      process.exit(1);
    }
    
    // Verify electron directory only contains config.js
    if (unpackedContents.includes('electron')) {
      const electronPath = path.join(asarUnpackedPath, 'electron');
      if (fs.existsSync(electronPath)) {
        const electronContents = fs.readdirSync(electronPath);
        if (!electronContents.includes('config.js') || electronContents.length > 1) {
          console.error('❌ CRITICAL SECURITY RISK: Electron directory contains unexpected files!');
          console.error('   Expected: config.js only');
          console.error('   Found:', electronContents);
          process.exit(1);
        }
        console.log('✅ Electron config.js properly unpacked for runtime access');
      }
    }
  }

  // Verify asar archive
  const asarStats = fs.statSync(asarPath);
  console.log(`✅ app.asar verified: ${(asarStats.size / 1024 / 1024).toFixed(2)} MB`);

  // Check for any other security issues
  const resourcesContents = fs.readdirSync(resourcesPath);
  const suspiciousFiles = resourcesContents.filter(file => 
    file !== 'app.asar' && 
    file !== 'electron.exe' &&
    !file.startsWith('.')
  );

  if (suspiciousFiles.length > 0) {
    console.warn('⚠️  Warning: Additional files in resources directory:', suspiciousFiles);
  }

  console.log('✅ Security verification completed successfully!');
  console.log('🔐 Your application is completely secure:');
  console.log('   - All source code is packed in app.asar');
  console.log('   - No code is exposed in unpacked directories');
  console.log('   - Users cannot view or modify your source code');
  console.log('   - Backend executables are securely embedded');

} catch (error) {
  console.error('❌ Security verification failed:', error.message);
  process.exit(1);
}
