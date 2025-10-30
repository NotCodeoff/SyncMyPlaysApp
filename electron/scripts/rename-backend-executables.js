const fs = require('fs-extra');
const path = require('path');

console.log('🔄 Renaming backend executables to match expected names...');

try {
  const distBackendPath = path.join(__dirname, '..', 'dist-backend');
  
  if (!fs.existsSync(distBackendPath)) {
    console.error('❌ dist-backend directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(distBackendPath);
  console.log('📁 Found files:', files.join(', '));

  // Rename Windows executable
  const windowsExe = files.find(file => file.includes('win') && file.endsWith('.exe'));
  if (windowsExe) {
    const oldPath = path.join(distBackendPath, windowsExe);
    const newPath = path.join(distBackendPath, 'server.exe');
    
    if (fs.existsSync(newPath)) {
      fs.removeSync(newPath);
    }
    
    fs.moveSync(oldPath, newPath);
    console.log(`✅ Renamed ${windowsExe} to server.exe`);
  }

  // Rename macOS executable
  const macosExe = files.find(file => file.includes('macos') && !file.includes('syncmyplays'));
  if (macosExe) {
    const oldPath = path.join(distBackendPath, macosExe);
    const newPath = path.join(distBackendPath, 'server');
    
    if (fs.existsSync(newPath)) {
      fs.removeSync(newPath);
    }
    
    fs.moveSync(oldPath, newPath);
    console.log(`✅ Renamed ${macosExe} to server`);
  }

  // Rename Linux executable
  const linuxExe = files.find(file => file.includes('linux') && !file.includes('syncmyplays'));
  if (linuxExe) {
    const oldPath = path.join(distBackendPath, linuxExe);
    const newPath = path.join(distBackendPath, 'server-linux');
    
    if (fs.existsSync(newPath)) {
      fs.removeSync(newPath);
    }
    
    fs.moveSync(oldPath, newPath);
    console.log(`✅ Renamed ${linuxExe} to server-linux`);
  }

  // Clean up duplicate executables
  console.log('🧹 Cleaning up duplicate executables...');
  const filesToRemove = [
    'syncmyplays-backend-linux',
    'syncmyplays-backend-macos', 
    'syncmyplays-backend-win.exe'
  ];
  
  filesToRemove.forEach(file => {
    const filePath = path.join(distBackendPath, file);
    if (fs.existsSync(filePath)) {
      fs.removeSync(filePath);
      console.log(`🗑️  Removed duplicate: ${file}`);
    }
  });

  // Show final clean state
  const remainingFiles = fs.readdirSync(distBackendPath);
  console.log('📁 Final clean files:', remainingFiles.join(', '));
  
  console.log('✅ Backend executable renaming and cleanup completed successfully');

} catch (error) {
  console.error('❌ Failed to rename backend executables:', error.message);
  process.exit(1);
}
