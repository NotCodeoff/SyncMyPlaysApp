const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

console.log('🔒 Adding integrity protection to ASAR...');

// Function to generate hash of a file
function generateFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return null;
  }
  
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Find ASAR files in dist directory
const distPath = path.join(__dirname, '../dist');
const possiblePaths = [
  path.join(distPath, '../app.asar'),
  path.join(distPath, '../resources/app.asar'),
  path.join(distPath, '../win-unpacked/resources/app.asar')
];

let asarPath = null;
for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    asarPath = possiblePath;
    break;
  }
}

if (asarPath) {
  const hash = generateFileHash(asarPath);
  if (hash) {
    console.log(`✅ ASAR integrity hash: ${hash}`);
    
    // Create integrity file
    const integrityPath = path.join(path.dirname(asarPath), 'app.integrity');
    fs.writeFileSync(integrityPath, hash);
    console.log(`✅ Integrity file created: ${integrityPath}`);
  }
} else {
  console.log('ℹ️  ASAR file not found (this is normal during development)');
}

console.log('🔒 Security enhancement complete!'); 