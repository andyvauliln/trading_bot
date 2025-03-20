const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting minimal browser test...');
  
  try {
    // Get executable path and print
    const exePath = puppeteer.executablePath();
    console.log(`Using executable path: ${exePath}`);
    
    // Simplest possible launch options
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    console.log('Browser launched successfully!');
    
    const page = await browser.newPage();
    console.log('Page created successfully!');
    
    await browser.close();
    console.log('Browser closed successfully!');
    console.log('✅ Basic browser test passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
})(); 