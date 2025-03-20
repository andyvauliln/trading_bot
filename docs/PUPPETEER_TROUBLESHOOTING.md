# Puppeteer/Chrome Troubleshooting Guide

This guide provides solutions for common issues related to Puppeteer and Chrome browser in the trading bot application.

## Common Issues

### Browser Launch Failures

The most common error is: "Failed to launch the browser process!" which can happen for several reasons:

1. **Missing Chrome/Chromium**: The browser executable isn't found
2. **Missing Dependencies**: Linux servers often need additional libraries
3. **Permission Issues**: The process doesn't have sufficient permissions
4. **Browser Crashes**: Some configurations can cause the browser to crash

## Solutions

### 1. Run the Automated Dependency Installation Script

We provide a script that will install Chrome and all necessary dependencies on Linux systems:

```bash
# Make sure the script is executable
chmod +x scripts/install-chrome-deps.sh

# Run as root/sudo
sudo ./scripts/install-chrome-deps.sh
```

The script will:
- Detect your Linux distribution
- Install the appropriate dependencies
- Install Chrome if not already available
- Configure environment variables

### 2. Set the Chrome Path Manually

If you know where your Chrome executable is located, set it explicitly:

```bash
# Add to your environment
export CHROME_EXECUTABLE_PATH=/path/to/google-chrome

# Or run the command with the path
CHROME_EXECUTABLE_PATH=/path/to/google-chrome node your-script.js
```

### 3. Install Missing Linux Dependencies Manually

If you prefer to install dependencies manually, here's what you need on Ubuntu/Debian:

```bash
apt-get update && apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    libgbm-dev
```

### 4. Check Puppeteer Configuration

Our application uses the following Puppeteer configuration:

```javascript
const launchOptions = {
    headless: 'new',  // Use the new headless mode
    args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", 
        "--disable-gpu",
        "--disable-features=site-per-process",
        "--disable-web-security"
    ],
    // ... other options
};
```

### 5. Testing Puppeteer Installation

You can run a simple test to verify Puppeteer is working correctly:

```javascript
// Save as test-puppeteer.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testPuppeteer() {
  console.log('Testing Puppeteer installation...');
  
  try {
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    console.log('Browser launched successfully!');
    const page = await browser.newPage();
    console.log('Page created successfully!');
    
    await page.goto('https://www.google.com');
    console.log('Navigation successful!');
    
    await browser.close();
    console.log('Browser closed successfully!');
    console.log('Puppeteer is working correctly!');
  } catch (error) {
    console.error('Error testing Puppeteer:', error);
  }
}

testPuppeteer();
```

Run it with:
```bash
node test-puppeteer.js
```

### 6. Debugging

To enable verbose logging, set the `PUPPETEER_DEBUG` environment variable:

```bash
export PUPPETEER_DEBUG=true
```

This will output detailed information about browser launch attempts and configuration.

## Getting Help

If you're still experiencing issues, please:

1. Check the error logs at `logs/pm2/solana-sniper-bot.error.log`
2. Try running the process with the debug flag: `PUPPETEER_DEBUG=true`
3. Ensure you have sufficient memory (at least 1GB free) as Chrome requires significant resources 