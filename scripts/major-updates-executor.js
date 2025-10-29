#!/usr/bin/env node

/**
 * Major Updates Executor for SyncMyPlays
 * Professional upgrade script for keeping dependencies up to date
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MajorUpdatesExecutor {
  constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json');
    this.backupPath = path.join(process.cwd(), 'package.json.backup');
  }

  /**
   * Create backup before major updates
   */
  createBackup() {
    console.log('💾 Creating backup...');
    fs.copyFileSync(this.packageJsonPath, this.backupPath);
    console.log('✅ Backup created: package.json.backup');
  }

  /**
   * Restore from backup if needed
   */
  restoreBackup() {
    if (fs.existsSync(this.backupPath)) {
      console.log('🔄 Restoring from backup...');
      fs.copyFileSync(this.backupPath, this.packageJsonPath);
      console.log('✅ Restored from backup');
    }
  }

  /**
   * Phase 1: Critical Updates
   */
  async executePhase1() {
    console.log('🚀 PHASE 1: Critical Updates');
    console.log('============================');

    // 1. Electron Update
    console.log('\n📦 Updating Electron to latest...');
    try {
      execSync('npm install electron@latest --save-dev', { stdio: 'inherit' });
      console.log('✅ Electron updated to latest');
    } catch (error) {
      console.error('❌ Electron update failed:', error.message);
      return false;
    }

    // 2. React Update
    console.log('\n⚛️ Updating React to latest...');
    try {
      execSync('npm install react@latest react-dom@latest', { stdio: 'inherit' });
      execSync('npm install @types/react@latest @types/react-dom@latest --save-dev', { stdio: 'inherit' });
      console.log('✅ React updated to latest');
    } catch (error) {
      console.error('❌ React update failed:', error.message);
      return false;
    }

    // 3. Express Update
    console.log('\n🌐 Updating Express to latest...');
    try {
      execSync('npm install express@latest', { stdio: 'inherit' });
      console.log('✅ Express updated to latest');
    } catch (error) {
      console.error('❌ Express update failed:', error.message);
      return false;
    }

    // 4. Test the updates
    console.log('\n🧪 Testing Phase 1 updates...');
    return await this.testUpdates('Phase 1');
  }

  /**
   * Phase 2: High Priority Updates
   */
  async executePhase2() {
    console.log('\n🎨 PHASE 2: High Priority Updates');
    console.log('==================================');

    // 1. Webpack Update
    console.log('\n📦 Updating Webpack to latest...');
    try {
      execSync('npm install webpack@latest webpack-cli@latest --save-dev', { stdio: 'inherit' });
      console.log('✅ Webpack updated to latest');
    } catch (error) {
      console.error('❌ Webpack update failed:', error.message);
      return false;
    }

    // 2. Jest Update
    console.log('\n🧪 Updating Jest to latest...');
    try {
      execSync('npm install jest@latest @types/jest@latest --save-dev', { stdio: 'inherit' });
      console.log('✅ Jest updated to latest');
    } catch (error) {
      console.error('❌ Jest update failed:', error.message);
      return false;
    }

    // 3. TypeScript Update
    console.log('\n📝 Updating TypeScript to latest...');
    try {
      execSync('npm install typescript@latest --save-dev', { stdio: 'inherit' });
      console.log('✅ TypeScript updated to latest');
    } catch (error) {
      console.error('❌ TypeScript update failed:', error.message);
      return false;
    }

    // 4. Test the updates
    console.log('\n🧪 Testing Phase 2 updates...');
    return await this.testUpdates('Phase 2');
  }

  /**
   * Phase 3: Medium Priority Updates
   */
  async executePhase3() {
    console.log('\n⚙️ PHASE 3: Medium Priority Updates');
    console.log('====================================');

    // 1. Puppeteer Update
    console.log('\n🤖 Updating Puppeteer to latest...');
    try {
      execSync('npm install puppeteer@latest puppeteer-core@latest --save-dev', { stdio: 'inherit' });
      console.log('✅ Puppeteer updated to latest');
    } catch (error) {
      console.error('❌ Puppeteer update failed:', error.message);
      return false;
    }

    // 2. Framer Motion Update
    console.log('\n🎭 Updating Framer Motion to latest...');
    try {
      execSync('npm install framer-motion@latest', { stdio: 'inherit' });
      console.log('✅ Framer Motion updated to latest');
    } catch (error) {
      console.error('❌ Framer Motion update failed:', error.message);
      return false;
    }

    // 3. Test the updates
    console.log('\n🧪 Testing Phase 3 updates...');
    return await this.testUpdates('Phase 3');
  }

  /**
   * Test updates after each phase
   */
  async testUpdates(phase) {
    console.log(`\n🧪 Testing ${phase} updates...`);
    
    const tests = [
      { name: 'Build', command: 'npm run build' },
      { name: 'Tests', command: 'npm test' }
    ];

    for (const test of tests) {
      try {
        console.log(`  Running ${test.name}...`);
        execSync(test.command, { stdio: 'pipe' });
        console.log(`  ✅ ${test.name} passed`);
      } catch (error) {
        console.log(`  ❌ ${test.name} failed`);
        console.log(`  Error: ${error.message}`);
        return false;
      }
    }

    console.log(`✅ All ${phase} tests passed!`);
    return true;
  }

  /**
   * Execute all phases
   */
  async executeAll() {
    console.log('🚀 SYNC MY PLAYS MAJOR UPDATES EXECUTOR');
    console.log('========================================');
    console.log('This will update your app to the latest versions');
    console.log('Estimated time: 6-8 hours');
    console.log('');

    // Create backup
    this.createBackup();

    try {
      // Phase 1: Critical
      const phase1Success = await this.executePhase1();
      if (!phase1Success) {
        console.log('❌ Phase 1 failed, stopping...');
        this.restoreBackup();
        return;
      }

      // Phase 2: High Priority
      const phase2Success = await this.executePhase2();
      if (!phase2Success) {
        console.log('❌ Phase 2 failed, stopping...');
        this.restoreBackup();
        return;
      }

      // Phase 3: Medium Priority
      const phase3Success = await this.executePhase3();
      if (!phase3Success) {
        console.log('❌ Phase 3 failed, stopping...');
        this.restoreBackup();
        return;
      }

      console.log('\n🎉 ALL PHASES COMPLETED SUCCESSFULLY!');
      console.log('Your SyncMyPlays app is now running the latest versions!');

    } catch (error) {
      console.error('❌ Major updates failed:', error.message);
      this.restoreBackup();
    }
  }

  /**
   * Execute specific phase
   */
  async executePhase(phase) {
    console.log(`🚀 Executing ${phase}...`);
    
    this.createBackup();

    try {
      let success = false;
      
      switch (phase.toLowerCase()) {
        case 'phase1':
        case '1':
          success = await this.executePhase1();
          break;
        case 'phase2':
        case '2':
          success = await this.executePhase2();
          break;
        case 'phase3':
        case '3':
          success = await this.executePhase3();
          break;
        default:
          console.log('❌ Invalid phase. Use: phase1, phase2, or phase3');
          return;
      }

      if (!success) {
        console.log(`❌ ${phase} failed, restoring backup...`);
        this.restoreBackup();
      } else {
        console.log(`✅ ${phase} completed successfully!`);
      }

    } catch (error) {
      console.error(`❌ ${phase} failed:`, error.message);
      this.restoreBackup();
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const executor = new MajorUpdatesExecutor();

  switch (args[0]) {
    case 'all':
      executor.executeAll();
      break;
    case 'phase1':
    case '1':
      executor.executePhase('phase1');
      break;
    case 'phase2':
    case '2':
      executor.executePhase('phase2');
      break;
    case 'phase3':
    case '3':
      executor.executePhase('phase3');
      break;
    default:
      console.log(`
🚀 SyncMyPlays Major Updates Executor

Usage:
  node scripts/major-updates-executor.js [command]

Commands:
  all      - Execute all phases (6-8 hours)
  phase1   - Execute Phase 1: Critical updates (2-3 hours)
  phase2   - Execute Phase 2: High priority updates (2-3 hours)
  phase3   - Execute Phase 3: Medium priority updates (2-3 hours)

Examples:
  node scripts/major-updates-executor.js all
  node scripts/major-updates-executor.js phase1
  node scripts/major-updates-executor.js 1

⚠️  WARNING: This will update major versions!
💾 Backup will be created automatically
🔄 Use 'git checkout package.json' to restore if needed
      `);
  }
}

module.exports = MajorUpdatesExecutor;
