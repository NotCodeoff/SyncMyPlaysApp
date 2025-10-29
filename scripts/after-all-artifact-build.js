const fs = require('fs-extra');
const path = require('path');

async function afterAllArtifactBuild(context) {
  console.log('🧹 Running final artifact cleanup...');
  try {
    const outDir = context.outDir;

    // Optionally remove win-unpacked to avoid exposing raw resources
    // Users will install via NSIS installer artifact instead.
    const unpackedDir = path.join(outDir, 'win-unpacked');
    if (await fs.pathExists(unpackedDir)) {
      await fs.remove(unpackedDir);
      console.log('   Removed win-unpacked directory');
    }

    console.log('✅ Final artifact cleanup completed');
  } catch (error) {
    console.error('❌ Final artifact cleanup failed:', error.message);
    throw error;
  }
}

module.exports = afterAllArtifactBuild;

