/**
 * This script checks the Puppeteer configuration without launching a browser
 * It helps diagnose issues with Puppeteer setup
 */

console.log('🔍 Checking Puppeteer configuration...');

// Print Node.js and OS information
console.log('📊 System Information:');
console.log(`  - Node.js version: ${process.version}`);
console.log(`  - Platform: ${process.platform}`);
console.log(`  - Architecture: ${process.arch}`);

// Check environment variables
console.log('\n📝 Environment Variables:');
console.log(`  - CHROME_EXECUTABLE_PATH: ${process.env.CHROME_EXECUTABLE_PATH || 'Not set'}`);
console.log(`  - PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'Not set'}`);
console.log(`  - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: ${process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || 'Not set'}`);
console.log(`  - PUPPETEER_CACHE_DIR: ${process.env.PUPPETEER_CACHE_DIR || 'Not set'}`);
console.log(`  - PUPPETEER_DEBUG: ${process.env.PUPPETEER_DEBUG || 'Not set'}`);

// Check if puppeteer is installed
try {
  console.log('\n📦 Package Versions:');
  const puppeteerVersion = require('puppeteer/package.json').version;
  console.log(`  - puppeteer: ${puppeteerVersion}`);
  
  try {
    const puppeteerExtraVersion = require('puppeteer-extra/package.json').version;
    console.log(`  - puppeteer-extra: ${puppeteerExtraVersion}`);
    
    try {
      const stealthVersion = require('puppeteer-extra-plugin-stealth/package.json').version;
      console.log(`  - puppeteer-extra-plugin-stealth: ${stealthVersion}`);
    } catch (e) {
      console.log('  - puppeteer-extra-plugin-stealth: Not installed');
    }
  } catch (e) {
    console.log('  - puppeteer-extra: Not installed');
  }
} catch (e) {
  console.log('  - puppeteer: Not installed');
}

// Check for Chrome installations
console.log('\n🔎 Checking for Chrome/Chromium installations:');
const { execSync } = require('child_process');
const fs = require('fs');

// Common Chrome paths to check
const chromePaths = {
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

// Check which paths exist
const paths = chromePaths[process.platform] || [];
paths.forEach(path => {
  try {
    if (fs.existsSync(path)) {
      console.log(`  - ✅ Found: ${path}`);
      
      // Try to get version
      try {
        const cmd = process.platform === 'win32' 
          ? `"${path}" --version` 
          : `"${path}" --version`;
        const version = execSync(cmd, { shell: true }).toString().trim();
        console.log(`    Version: ${version}`);
      } catch (e) {
        console.log('    Could not determine version');
      }
    } else {
      console.log(`  - ❌ Not found: ${path}`);
    }
  } catch (e) {
    console.log(`  - ❌ Error checking ${path}: ${e.message}`);
  }
});

// Check for bundled Chromium
try {
  console.log('\n🧩 Checking for bundled Chromium:');
  const puppeteer = require('puppeteer');
  const executablePath = puppeteer.executablePath();
  
  if (fs.existsSync(executablePath)) {
    console.log(`  - ✅ Bundled Chromium found at: ${executablePath}`);
  } else {
    console.log(`  - ❌ Bundled Chromium not found at: ${executablePath}`);
  }
} catch (e) {
  console.log(`  - ❌ Error checking bundled Chromium: ${e.message}`);
}

// Check for missing Linux dependencies
if (process.platform === 'linux') {
  console.log('\n🔧 Checking for common Linux dependencies:');
  
  const dependencies = [
    'ldd',
    'libX11',
    'libXcomposite',
    'libXcursor',
    'libXdamage',
    'libXext',
    'libXi',
    'libXrandr',
    'libXtst',
    'libgobject',
    'libglib',
    'libatk',
    'libatspi',
    'libcups',
    'libdrm',
    'libxkbcommon',
    'libxshmfence',
    'libgbm',
  ];
  
  dependencies.forEach(lib => {
    try {
      execSync(`ldconfig -p | grep ${lib}`, { stdio: 'pipe' });
      console.log(`  - ✅ ${lib}: Found`);
    } catch (e) {
      console.log(`  - ❌ ${lib}: Not found`);
    }
  });
}

console.log('\n🧪 Testing file permissions:');
try {
  // Check if we can write to temporary directory
  const tempDir = require('os').tmpdir();
  console.log(`  - Temp directory: ${tempDir}`);
  
  const testFile = `${tempDir}/puppeteer-test-${Date.now()}.txt`;
  fs.writeFileSync(testFile, 'Test file');
  console.log('  - ✅ Can write to temp directory');
  
  // Check permissions
  try {
    const stats = fs.statSync(testFile);
    console.log(`  - File permissions: ${stats.mode.toString(8)}`);
  } catch (e) {
    console.log(`  - Could not check file permissions: ${e.message}`);
  }
  
  // Cleanup
  fs.unlinkSync(testFile);
} catch (e) {
  console.log(`  - ❌ Could not write to temp directory: ${e.message}`);
}

console.log('\n✨ Configuration check complete!');
console.log('If you\'re having issues with Puppeteer, review the information above and:');
console.log(' 1. Install missing dependencies (see docs/PUPPETEER_TROUBLESHOOTING.md)');
console.log(' 2. Set CHROME_EXECUTABLE_PATH to a valid Chrome/Chromium installation');
console.log(' 3. Make sure you have sufficient permissions to execute Chrome');
console.log(' 4. If using bundled Chromium, try reinstalling Puppeteer: npm install puppeteer@latest'); 