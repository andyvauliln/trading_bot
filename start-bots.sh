#!/bin/bash

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Check if ts-node is installed
if ! command -v ts-node &> /dev/null; then
    echo "ts-node is not installed. Installing ts-node..."
    npm install -g ts-node
fi

# Function to check if dependencies are installed
check_dependencies() {
    if [ ! -d "node_modules" ]; then
        echo "Installing project dependencies..."
        npm install
    fi
}

# Stop all existing PM2 processes
pm2 delete all

# Check and install dependencies
check_dependencies

# Build the project
npm run build

# Start all bots using PM2 ecosystem file
pm2 start ecosystem.config.js

# Display status of all bots
pm2 status

# Save the PM2 process list
pm2 save

echo "All bots have been started. Use 'pm2 status' to check their status."
echo "Use 'pm2 logs' to view all logs or 'pm2 logs <bot-name>' for specific bot logs."
echo "Use 'pm2 stop all' to stop all bots." 


#!/bin/bash
# Setup minimal Chromium for Puppeteer

# Set up directory
CHROME_DIR="$HOME/chrome-headless"
mkdir -p $CHROME_DIR

echo "Downloading Chromium (this might take a while)..."
# Download a smaller headless Chrome binary for x86_64 architecture
curl -L https://github.com/Sparticuz/chromium/releases/download/v122.0.0/chromium-v122.0.0-linux-x64.tar.gz -o $CHROME_DIR/chromium.tar.gz

# Extract it
echo "Extracting Chromium..."
tar -xzf $CHROME_DIR/chromium.tar.gz -C $CHROME_DIR
rm $CHROME_DIR/chromium.tar.gz

# Set environment variable
echo "export CHROME_EXECUTABLE_PATH=\"$CHROME_DIR/chromium\"" >> ~/.bashrc
echo "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true" >> ~/.bashrc

echo "Chrome setup complete. Path: $CHROME_DIR/chromium"
echo "Please run: source ~/.bashrc" 