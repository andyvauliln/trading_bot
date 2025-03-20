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
CHROME_DIR="$HOME/chrome-headless"
CHROME_EXECUTABLE="$CHROME_DIR/chromium"

# Check if Chrome or Chromium is installed system-wide
if command -v google-chrome &> /dev/null || command -v chromium-browser &> /dev/null; then
    echo "System Chrome/Chromium is installed."
    exit 0
fi

# Check if local Chromium binary exists and is executable
if [ -f "$CHROME_EXECUTABLE" ] && [ -x "$CHROME_EXECUTABLE" ]; then
    echo "Local Chromium is already installed at $CHROME_EXECUTABLE"
    
    # Verify that environment variables are set
    if grep -q "CHROME_EXECUTABLE_PATH" ~/.bashrc && grep -q "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" ~/.bashrc; then
        echo "Environment variables are properly set."
    else
        echo "Setting environment variables..."
        # Only add if not already present
        grep -q "export CHROME_EXECUTABLE_PATH" ~/.bashrc || echo "export CHROME_EXECUTABLE_PATH=\"$CHROME_EXECUTABLE\"" >> ~/.bashrc
        grep -q "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" ~/.bashrc || echo "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true" >> ~/.bashrc
        echo "Environment variables have been set. Please run: source ~/.bashrc"
    fi
    
    echo "Chrome setup is complete."
    exit 0
fi

# If we get here, we need to install Chromium
echo "Chrome/Chromium not found. Installing headless Chromium..."

# Create directory if it doesn't exist
mkdir -p $CHROME_DIR

echo "Downloading Chromium (this might take a while)..."
# Download a smaller headless Chrome binary for x86_64 architecture
curl -L https://github.com/Sparticuz/chromium/releases/download/v122.0.0/chromium-v122.0.0-linux-x64.tar.gz -o $CHROME_DIR/chromium.tar.gz

# Extract it
echo "Extracting Chromium..."
tar -xzf $CHROME_DIR/chromium.tar.gz -C $CHROME_DIR
rm $CHROME_DIR/chromium.tar.gz

# Make it executable
chmod +x $CHROME_EXECUTABLE

# Set environment variables if not already set
if ! grep -q "export CHROME_EXECUTABLE_PATH" ~/.bashrc; then
    echo "export CHROME_EXECUTABLE_PATH=\"$CHROME_EXECUTABLE\"" >> ~/.bashrc
fi

if ! grep -q "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" ~/.bashrc; then
    echo "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true" >> ~/.bashrc
fi

echo "Chrome setup complete. Path: $CHROME_EXECUTABLE"
echo "Please run: source ~/.bashrc" 