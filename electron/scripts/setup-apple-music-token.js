#!/usr/bin/env node

/**
 * Apple Music Token Setup Script
 * This script helps users set up their Apple Music developer token
 * when the automatic setup fails in distribution builds.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🍎 Apple Music Developer Token Setup');
console.log('=====================================\n');

console.log('This script will help you set up your Apple Music developer token.');
console.log('You need this token to use Apple Music features in SyncMyPlays.\n');

console.log('Steps to get your token:');
console.log('1. Visit: https://developer.apple.com/account/resources/authkeys/list');
console.log('2. Sign in with your Apple ID');
console.log('3. Click "Generate API Key" or use an existing key');
console.log('4. Copy the generated token\n');

// Open the browser automatically
console.log('Opening Apple Developer portal in your browser...');
const os = require('os');
let openCommand;
if (os.platform() === 'win32') {
  openCommand = 'start';
} else if (os.platform() === 'darwin') {
  openCommand = 'open';
} else {
  openCommand = 'xdg-open';
}

exec(`${openCommand} "https://developer.apple.com/account/resources/authkeys/list"`, (error) => {
  if (error) {
    console.log('⚠️ Could not open browser automatically. Please visit the URL manually.');
  } else {
    console.log('✅ Browser opened successfully.');
  }
  
  // Ask for the token
  rl.question('\nPlease paste your Apple Music developer token here: ', (token) => {
    if (!token || token.trim() === '') {
      console.log('❌ No token provided. Setup cancelled.');
      rl.close();
      return;
    }
    
    const cleanToken = token.trim();
    
    // Validate token format (basic check)
    if (cleanToken.length < 20) {
      console.log('⚠️ Warning: The token seems too short. Please make sure you copied the full token.');
    }
    
    // Save the token to a .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add the token
    const lines = envContent.split('\n');
    let tokenLineIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('APPLE_MUSIC_DEVELOPER_TOKEN=')) {
        tokenLineIndex = i;
        break;
      }
    }
    
    const tokenLine = `APPLE_MUSIC_DEVELOPER_TOKEN=${cleanToken}`;
    
    if (tokenLineIndex >= 0) {
      lines[tokenLineIndex] = tokenLine;
    } else {
      lines.push(tokenLine);
    }
    
    const newEnvContent = lines.join('\n');
    fs.writeFileSync(envPath, newEnvContent);
    
    console.log('\n✅ Apple Music developer token saved successfully!');
    console.log(`📁 Token saved to: ${envPath}`);
    console.log('\n🔄 Please restart SyncMyPlays for the changes to take effect.');
    console.log('\n💡 If you\'re using a distribution build, you can also:');
    console.log('   - Use the app UI to set the token');
    console.log('   - Call POST /auth/apple/set-developer-token API endpoint');
    
    rl.close();
  });
});

rl.on('close', () => {
  console.log('\n👋 Setup complete. Thank you!');
  process.exit(0);
});
