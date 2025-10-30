const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

async function beforeBuild(context) {
  console.log('🔧 Running before-build checks and dependency installation...');
  try {
    const projectDir = context.projectDir || process.cwd();
    const distPath = path.join(projectDir, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');

    if (!await fs.pathExists(indexHtmlPath)) {
      throw new Error('Build not completed. Please run "npm run build" first.');
    }

    // Ensure no source tree is accidentally shipped in dist
    const srcInDist = path.join(distPath, 'src');
    if (await fs.pathExists(srcInDist)) {
      console.warn('⚠️  Source directory found in dist. Removing...');
      await fs.remove(srcInDist);
    }

    // Ensure electron directory has required files
    const electronDir = path.join(projectDir, 'electron');
    const requiredElectronFiles = [
      'main.js',
      'preload.js',
      'secureConsole.js',
      'secureLogger.js',
      'config.js'
    ];

    for (const file of requiredElectronFiles) {
      const filePath = path.join(electronDir, file);
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Missing required electron file: ${file}`);
      }
    }

    // Create config.json from env.example if it doesn't exist
    const configPath = path.join(projectDir, 'config.json');
    const envExamplePath = path.join(projectDir, 'env.example');

    if (!await fs.pathExists(configPath) && await fs.pathExists(envExamplePath)) {
      console.log('📋 Creating config.json from env.example...');
      // Create a basic config structure
      const defaultConfig = {
        APP_VERSION: '1.0.0',
        UPDATE_URLS: {
          versionCheck: 'https://example.com/version_status.txt',
          downloadUrl: 'https://example.com/syncmyplays.exe'
        },
        KILL_SWITCH_URL: 'https://example.com/kill_switch.txt',
        VERSION_URL: 'https://example.com/version_status.txt'
      };
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    // Install all dependencies for distribution
    console.log('📦 Installing all dependencies for distribution build...');
    
    try {
      // Install main project dependencies
      console.log('Installing main project dependencies...');
      execSync('npm install', { 
        stdio: 'inherit', 
        cwd: projectDir,
        timeout: 300000 // 5 minutes timeout
      });
      
      // Ensure electron-builder binaries are available
      console.log('Ensuring electron-builder binaries are available...');
      try {
        execSync('npx electron-builder install-app-deps', { 
          stdio: 'pipe', 
          cwd: projectDir,
          timeout: 300000 // 5 minutes timeout
        });
        console.log('✅ Electron-builder binaries verified');
      } catch (error) {
        console.warn('⚠️  Could not verify electron-builder binaries, but continuing...');
      }
      
      // Install Puppeteer with Chromium
      console.log('Installing Puppeteer with Chromium browser...');
      execSync('npx puppeteer browsers install chrome', { 
        stdio: 'inherit', 
        cwd: projectDir,
        timeout: 300000 // 5 minutes timeout
      });
      
      // Verify Puppeteer installation
      console.log('Verifying Puppeteer installation...');
      const puppeteer = require('puppeteer-extra');
      const executablePath = puppeteer.executablePath();
      if (fs.existsSync(executablePath)) {
        console.log('✅ Puppeteer Chromium browser verified');
      } else {
        console.warn('⚠️  Puppeteer Chromium browser not found, but continuing...');
      }
      
      console.log('✅ All dependencies installed successfully for distribution');
      
    } catch (installError) {
      console.error('❌ Failed to install dependencies:', installError.message);
      console.log('⚠️  Continuing build without automatic dependency installation...');
      console.log('💡 Dependencies will be installed automatically when the app runs');
    }

    console.log('✅ Before-build checks completed');
  } catch (error) {
    console.error('❌ Before-build check failed:', error.message);
    throw error;
  }
}

module.exports = beforeBuild;

