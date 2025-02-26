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

# Start all bots using PM2 ecosystem file
pm2 start ecosystem.config.js

# Display status of all bots
pm2 status

# Save the PM2 process list
pm2 save

echo "All bots have been started. Use 'pm2 status' to check their status."
echo "Use 'pm2 logs' to view all logs or 'pm2 logs <bot-name>' for specific bot logs."
echo "Use 'pm2 stop all' to stop all bots." 