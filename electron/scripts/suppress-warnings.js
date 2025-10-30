const fs = require('fs-extra');
const path = require('path');

console.log('🔇 Setting up warning suppression for cleaner builds...');

try {
  // Create a .pkgignore file to exclude problematic files
  const pkgIgnoreContent = `# Exclude problematic files and directories that cause warnings
node_modules/electron/**
node_modules/puppeteer/**
node_modules/**/*.d.ts
node_modules/**/*.map
node_modules/**/*.ts
node_modules/**/*.jsx
node_modules/**/*.tsx
node_modules/**/test/**
node_modules/**/tests/**
node_modules/**/spec/**
node_modules/**/example/**
node_modules/**/examples/**
node_modules/**/docs/**
node_modules/**/README.md
node_modules/**/CHANGELOG.md
node_modules/**/LICENSE
node_modules/**/package.json

# Exclude problematic packages that cause bytecode warnings
node_modules/axios/lib/helpers/**
node_modules/axios/lib/platform/**
node_modules/axios/lib/adapters/**
node_modules/axios/lib/cancel/**
node_modules/axios/lib/core/**
node_modules/axios/lib/defaults/**
node_modules/axios/lib/env/**
node_modules/axios/lib/utils.js
node_modules/axios/index.js
node_modules/electron-store/**
node_modules/pm2-deploy/**
node_modules/typed-query-selector/**
node_modules/debounce-fn/**
node_modules/dot-prop/**
node_modules/env-paths/**
node_modules/json-schema-typed/**
node_modules/uint8array-extras/**
node_modules/atomically/**
node_modules/stubborn-fs/**
node_modules/when-exit/**
node_modules/mimic-function/**
node_modules/fuse.js/**
node_modules/better-sqlite3/**
node_modules/rate-limit-express/**
node_modules/ws/**
node_modules/cors/**
node_modules/express/**
node_modules/bcrypt/**
node_modules/jsonwebtoken/**
node_modules/pm2/**
node_modules/puppeteer-extra/**
node_modules/puppeteer-extra-plugin-stealth/**
`;

  const pkgIgnorePath = path.join(__dirname, '..', 'backend', '.pkgignore');
  fs.writeFileSync(pkgIgnorePath, pkgIgnoreContent);
  console.log('✅ Created .pkgignore file');

  // Create a .npmrc file to suppress npm warnings
  const npmrcContent = `# Suppress npm warnings during build
loglevel=error
silent=true
`;

  const npmrcPath = path.join(__dirname, '..', 'backend', '.npmrc');
  fs.writeFileSync(npmrcPath, npmrcContent);
  console.log('✅ Created .npmrc file');

  console.log('🔇 Warning suppression setup complete');
  console.log('💡 This will significantly reduce build noise');

} catch (error) {
  console.error('❌ Warning suppression setup failed:', error.message);
  process.exit(1);
}
