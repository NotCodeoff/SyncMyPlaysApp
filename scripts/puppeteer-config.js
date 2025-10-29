const path = require('path');
const fs = require('fs');

// Use regular puppeteer (no plugins) - Stealth plugin causes issues with pkg compilation
let puppeteer;
try {
  // Try puppeteer-core first (no bundled Chromium, lighter)
  puppeteer = require('puppeteer-core');
  console.log('✅ Using puppeteer-core (production-ready)');
} catch (e) {
  try {
    // Fallback to regular puppeteer
    puppeteer = require('puppeteer');
    console.log('✅ Using puppeteer (with bundled Chromium)');
  } catch (e2) {
    console.error('❌ Neither puppeteer-core nor puppeteer available');
    throw new Error('Puppeteer not available. Please install puppeteer or puppeteer-core.');
  }
}

// ❌ STEALTH PLUGIN DISABLED
// The puppeteer-extra-plugin-stealth causes issues with pkg compilation
// because it tries to dynamically require 'chrome.app' files that aren't packaged.
// For Apple Music token fetching, we don't actually need stealth mode.

class PuppeteerConfig {
  constructor() {
    this.options = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain'
      ]
    };
  }

  // Get system browser path for Windows (Edge is pre-installed on Windows 10/11)
  getSystemBrowserPath() {
    const possiblePaths = [
      // Microsoft Edge (pre-installed on Windows 10/11) - PRIORITY
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.PROGRAMFILES, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft\\Edge\\Application\\msedge.exe'),
      
      // Google Chrome (if user has it)
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'], 'Google\\Chrome\\Application\\chrome.exe'),
      
      // Brave (if user has it)
      path.join(process.env.LOCALAPPDATA, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      path.join(process.env.PROGRAMFILES, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      
      // Chromium (if user has it)
      path.join(process.env.LOCALAPPDATA, 'Chromium\\Application\\chrome.exe')
    ];

    for (const browserPath of possiblePaths) {
      if (browserPath && fs.existsSync(browserPath)) {
        console.log(`✅ Found system browser: ${browserPath}`);
        return browserPath;
      }
    }
    return null;
  }

  // Get best available browser (prioritizes system browsers - NO DOWNLOAD NEEDED)
  getBrowserPath() {
    console.log('🔍 Searching for browser executable (Edge/Chrome/Chromium)...');
    
    // PRIORITY 1: Use system browser (Edge is pre-installed on Windows 10/11)
    const systemBrowser = this.getSystemBrowserPath();
    if (systemBrowser) {
      return systemBrowser;
    }
    
    console.log('⚠️  No system browser found, checking Puppeteer cache...');
    
    // PRIORITY 2: Check if user has downloaded Chromium via Puppeteer before
    const possiblePaths = [
      // User cache paths (where Puppeteer downloads Chromium)
      path.join(process.env.USERPROFILE || process.env.HOME, '.cache', 'puppeteer', 'chrome'),
      path.join(process.env.LOCALAPPDATA, 'puppeteer', 'chrome'),
      path.join(process.env.APPDATA, 'puppeteer', 'chrome'),
      
      // Legacy .local-chromium paths
      path.join(process.env.USERPROFILE || process.env.HOME, '.cache', 'puppeteer'),
      path.join(process.env.LOCALAPPDATA, 'puppeteer')
    ];

    for (const basePath of possiblePaths) {
      if (fs.existsSync(basePath)) {
        // Look for Chrome/Chromium executable in subdirectories
        const findChromeInDir = (dir, depth = 0) => {
          if (depth > 3) return null; // Limit recursion depth
          try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const itemPath = path.join(dir, item);
              try {
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory()) {
                  const chromePath = findChromeInDir(itemPath, depth + 1);
                  if (chromePath) return chromePath;
                } else if (item === 'chrome.exe' || item === 'msedge.exe' || item === 'chrome' || item === 'chromium.exe' || item === 'chromium') {
                  return itemPath;
                }
              } catch (e) {
                // Skip files we can't stat
              }
            }
          } catch (e) {
            // Ignore errors reading directory
          }
          return null;
        };

        const chromePath = findChromeInDir(basePath);
        if (chromePath) {
          console.log(`✅ Found cached Chromium at: ${chromePath}`);
          return chromePath;
        }
      }
    }

    console.log('❌ No browser executable found');
    return null;
  }

  async canLaunch() {
    try {
      // Get the best available browser (Edge/Chrome/Chromium)
      const executablePath = this.getBrowserPath();
      
      if (!executablePath) {
        console.error('❌ No browser found. Please install Microsoft Edge or Google Chrome.');
        return false;
      }

      this.options.executablePath = executablePath;
      console.log(`🚀 Testing browser launch: ${executablePath}`);

      const browser = await puppeteer.launch(this.options);
      await browser.close();
      console.log('✅ Browser launch successful');
      return true;
    } catch (error) {
      console.error('❌ Browser launch test failed:', error.message);
      return false;
    }
  }

  getLaunchOptions() {
    // Ensure we have the best available executable path
    if (!this.options.executablePath) {
      this.options.executablePath = this.getBrowserPath();
    }
    
    // If no browser found, throw descriptive error
    if (!this.options.executablePath) {
      throw new Error('No browser found. Microsoft Edge should be pre-installed on Windows 10/11. If not, please install Microsoft Edge or Google Chrome.');
    }
    
    console.log(`✅ Using browser: ${this.options.executablePath}`);
    return this.options;
  }

  async launch() {
    return await puppeteer.launch(this.getLaunchOptions());
  }
}

module.exports = PuppeteerConfig;
