const puppeteer = require('puppeteer');

/**
 * Tests if Puppeteer's bundled Chromium is working correctly
 */
async function testPuppeteerBundled() {
  console.log('🔍 Testing Puppeteer with bundled Chromium...');
  
  try {
    console.log('🚀 Launching browser with bundled Chromium...');
    
    const launchOptions = {
      headless: 'new',
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080"
      ],
      timeout: 60000
    };
    
    console.log('Launch options:', JSON.stringify(launchOptions, null, 2));
    
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
    
    // Take a screenshot to verify rendering is working
    const screenshotPath = './test-screenshot-bundled.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved to: ${screenshotPath}`);
    
    // Get the page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    await browser.close();
    console.log('✅ Browser closed successfully!');
    console.log('🎉 Puppeteer is working correctly with bundled Chromium!');
    
    return true;
  } catch (error) {
    console.error('❌ Error testing Puppeteer:', error);
    
    if (error.message.includes('ENOENT')) {
      console.error('👉 Suggestion: Bundled Chromium not found. Try reinstalling puppeteer with: npm install puppeteer');
    } else if (error.message.includes('dependencies')) {
      console.error('👉 Suggestion: Missing dependencies. Run the install-chrome-deps.sh script');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('👉 Suggestion: Connection refused. Check if another process is using the debugging port');
    }
    
    return false;
  }
}

// Run the test
testPuppeteerBundled().then(success => {
  if (!success) {
    console.log('\n📚 For more help, see docs/PUPPETEER_TROUBLESHOOTING.md');
    process.exit(1);
  }
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 