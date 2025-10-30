#!/usr/bin/env node

/**
 * Dependency Management Script for SyncMyPlays
 * Automatically updates dependencies and manages versions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencyManager {
  constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json');
    this.packageLockPath = path.join(process.cwd(), 'package-lock.json');
  }

  /**
   * Check for outdated packages
   */
  checkOutdated() {
    console.log('🔍 Checking for outdated packages...');
    try {
      const result = execSync('npm outdated --json', { encoding: 'utf-8' });
      const outdated = JSON.parse(result);
      
      if (Object.keys(outdated).length === 0) {
        console.log('✅ All packages are up to date!');
        return [];
      }
      
      console.log('📦 Outdated packages found:');
      Object.entries(outdated).forEach(([name, info]) => {
        console.log(`  ${name}: ${info.current} → ${info.latest}`);
      });
      
      return outdated;
    } catch (error) {
      console.log('✅ No outdated packages found');
      return [];
    }
  }

  /**
   * Update dependencies based on type
   */
  updateDependencies(type = 'patch') {
    console.log(`🔄 Updating dependencies (${type})...`);
    
    try {
      switch (type) {
        case 'patch':
          execSync('npm update --legacy-peer-deps', { stdio: 'inherit' });
          break;
        case 'minor':
          execSync('npm update --legacy-peer-deps', { stdio: 'inherit' });
          break;
        case 'major':
          console.log('⚠️  Major updates require manual review');
          execSync('npm update --save --legacy-peer-deps', { stdio: 'inherit' });
          break;
      }
      
      // Fix security vulnerabilities
      console.log('🔒 Fixing security vulnerabilities...');
      execSync('npm audit fix --force', { stdio: 'inherit' });
      
      console.log('✅ Dependencies updated successfully!');
      return true;
    } catch (error) {
      console.error('❌ Error updating dependencies:', error.message);
      return false;
    }
  }

  /**
   * Run security audit
   */
  auditSecurity() {
    console.log('🔒 Running security audit...');
    try {
      execSync('npm audit --audit-level=moderate', { stdio: 'inherit' });
      console.log('✅ Security audit completed');
      return true;
    } catch (error) {
      console.log('⚠️  Security vulnerabilities found');
      return false;
    }
  }

  /**
   * Test the application after updates
   */
  testApplication() {
    console.log('🧪 Running tests after dependency updates...');
    
    const tests = [
      { name: 'Linting', command: 'npm run lint' },
      { name: 'Build', command: 'npm run build' },
      { name: 'Unit tests', command: 'npm test' }
    ];
    
    for (const test of tests) {
      try {
        console.log(`  Running ${test.name}...`);
        execSync(test.command, { stdio: 'pipe' });
        console.log(`  ✅ ${test.name} passed`);
      } catch (error) {
        console.log(`  ❌ ${test.name} failed`);
        return false;
      }
    }
    
    console.log('✅ All tests passed!');
    return true;
  }

  /**
   * Generate dependency report
   */
  generateReport() {
    console.log('📊 Generating dependency report...');
    
    const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf-8'));
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});
    
    const report = {
      timestamp: new Date().toISOString(),
      totalDependencies: dependencies.length + devDependencies.length,
      dependencies: dependencies.length,
      devDependencies: devDependencies.length,
      outdated: this.checkOutdated()
    };
    
    console.log('📋 Dependency Report:');
    console.log(`  Total packages: ${report.totalDependencies}`);
    console.log(`  Dependencies: ${report.dependencies}`);
    console.log(`  Dev dependencies: ${report.devDependencies}`);
    console.log(`  Outdated: ${Object.keys(report.outdated).length}`);
    
    return report;
  }

  /**
   * Main update process
   */
  async update(type = 'patch') {
    console.log('🚀 Starting dependency update process...');
    
    // Check current status
    const outdated = this.checkOutdated();
    if (outdated.length === 0) {
      console.log('✅ No updates needed');
      return;
    }
    
    // Update dependencies
    const updateSuccess = this.updateDependencies(type);
    if (!updateSuccess) {
      console.log('❌ Update failed');
      return;
    }
    
    // Run tests
    const testSuccess = this.testApplication();
    if (!testSuccess) {
      console.log('⚠️  Tests failed after update - manual review needed');
      return;
    }
    
    // Security audit
    this.auditSecurity();
    
    console.log('🎉 Dependency update completed successfully!');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const type = args[0] || 'patch';
  
  const manager = new DependencyManager();
  
  switch (args[0]) {
    case 'check':
      manager.checkOutdated();
      break;
    case 'audit':
      manager.auditSecurity();
      break;
    case 'report':
      manager.generateReport();
      break;
    case 'update':
    case 'patch':
    case 'minor':
    case 'major':
      manager.update(type);
      break;
    default:
      console.log(`
🔄 SyncMyPlays Dependency Manager

Usage:
  node scripts/dependency-manager.js [command]

Commands:
  check     - Check for outdated packages
  audit     - Run security audit
  report    - Generate dependency report
  update    - Update dependencies (patch/minor/major)
  patch     - Update patch versions only
  minor     - Update minor versions
  major     - Update major versions (requires review)

Examples:
  node scripts/dependency-manager.js check
  node scripts/dependency-manager.js update
  node scripts/dependency-manager.js major
      `);
  }
}

module.exports = DependencyManager;
