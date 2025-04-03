#!/bin/bash

# Start script that compiles TypeScript and starts PM2 services with database initialization

# Exit on error
set -e

echo "Compiling TypeScript..."
npm run build

echo "Starting PM2 services..."
pm2 delete all
pm2 start ecosystem.config.js --only init,tracker --daemon

echo "All services started. Check logs with 'pm2 logs'" 