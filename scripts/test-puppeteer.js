const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * Tests if Puppeteer and Chrome are working correctly
 */
async function testPuppeteer() {
  console.log('🔍 Testing Puppeteer installation...');
  
  // Check if explicit Chrome path is set
  const execPath = process.env.CHROME_EXECUTABLE_PATH;
  if (execPath) {
    console.log(`🌟 Using Chrome executable from: ${execPath}`);
  } else {
    console.log('ℹ️ No explicit Chrome path set, using default');
  }
  
  try {
    console.log('🚀 Launching browser...');
    
    const launchOptions = {
      headless: 'new',
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--disable-features=site-per-process",
        "--disable-web-security"
      ],
      timeout: 60000
    };
    
    // Add executable path if set
    if (execPath) {
      launchOptions.executablePath = execPath;
    }
    
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
    const screenshotPath = './test-screenshot.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved to: ${screenshotPath}`);
    
    // Get the page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    await browser.close();
    console.log('✅ Browser closed successfully!');
    console.log('🎉 Puppeteer is working correctly!');
    
    return true;
  } catch (error) {
    console.error('❌ Error testing Puppeteer:', error);
    
    // Provide helpful suggestions based on error
    if (error.message.includes('executable path')) {
      console.error('👉 Suggestion: Chrome executable not found. Try installing Chrome or setting CHROME_EXECUTABLE_PATH');
    } else if (error.message.includes('dependencies')) {
      console.error('👉 Suggestion: Missing dependencies. Run the install-chrome-deps.sh script');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('👉 Suggestion: Connection refused. Check if another process is using the debugging port');
    }
    
    return false;
  }
}

// Run the test
testPuppeteer().then(success => {
  if (!success) {
    console.log('\n📚 For more help, see docs/PUPPETEER_TROUBLESHOOTING.md');
    process.exit(1);
  }
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 