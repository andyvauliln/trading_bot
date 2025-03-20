const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * Tests puppeteer with explicit path to bundled Chromium
 */
async function testPuppeteerWithPath() {
  console.log('🔍 Testing puppeteer-extra with explicit Chrome path...');
  
  try {
    // Get the path to the bundled Chromium
    const standardPuppeteer = require('puppeteer');
    const executablePath = standardPuppeteer.executablePath();
    console.log(`🔧 Using bundled Chrome at: ${executablePath}`);
    
    const launchOptions = {
      headless: 'new',
      executablePath: executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      timeout: 60000
    };
    
    console.log('Launch options:', JSON.stringify(launchOptions, null, 2));
    
    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch(launchOptions);
    console.log('✅ Browser launched successfully!');
    
    const page = await browser.newPage();
    console.log('✅ Page created successfully!');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log('✅ User agent set');
    
    console.log('🌐 Navigating to Google...');
    await page.goto('https://www.google.com', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    console.log('✅ Navigation successful!');
    
    // Get the page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    await browser.close();
    console.log('✅ Browser closed successfully!');
    console.log('🎉 Puppeteer test succeeded!');
    
    return true;
  } catch (error) {
    console.error('❌ Error testing puppeteer:', error);
    return false;
  }
}

// Run the test
testPuppeteerWithPath().then(success => {
  if (!success) {
    console.log('\n📚 For more help, see docs/PUPPETEER_TROUBLESHOOTING.md');
    process.exit(1);
  }
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 