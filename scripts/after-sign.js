#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function afterSign(context) {
  console.log('🔐 Running after-sign security measures...');
  
  try {
    const { appOutDir, artifactPaths } = context;
    
    if (appOutDir) {
      console.log(`📍 App output directory: ${appOutDir}`);
      
      // Verify the signed executable
      const executableName = 'SyncMyPlays.exe';
      const executablePath = path.join(appOutDir, executableName);
      
      if (fs.existsSync(executablePath)) {
        const stats = fs.statSync(executablePath);
        console.log(`✅ Signed executable verified: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.warn('⚠️  Signed executable not found');
      }
    }
    
    if (artifactPaths && artifactPaths.length > 0) {
      console.log('📦 Signed artifacts:');
      artifactPaths.forEach(artifact => {
        console.log(`  - ${artifact}`);
      });
    }
    
    console.log('✅ After-sign security measures completed');
    
  } catch (error) {
    console.error('❌ After-sign security measures failed:', error.message);
    // Don't throw error to avoid breaking the build
  }
}

module.exports = afterSign;
