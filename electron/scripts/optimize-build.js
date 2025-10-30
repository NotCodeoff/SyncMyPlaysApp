const fs = require('fs-extra');
const path = require('path');

console.log('⚡ Optimizing build process for cleaner output...');

try {
  const backendPath = path.join(__dirname, '..', 'backend');
  
  // Update the backend package.json build script with compatible options
  const backendPackagePath = path.join(backendPath, 'package.json');
  const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
  
  backendPackage.scripts.build = 'pkg index.js --targets node18-win-x64,node18-macos-x64,node18-linux-x64 --out-path ../dist-backend --assets data.json,server.cert --public-packages --public';
  
  fs.writeFileSync(backendPackagePath, JSON.stringify(backendPackage, null, 2));
  console.log('✅ Updated backend build script with compatible options');

  console.log('⚡ Build optimization complete');
  console.log('💡 This should significantly reduce warnings and errors');

} catch (error) {
  console.error('❌ Build optimization failed:', error.message);
  process.exit(1);
}
