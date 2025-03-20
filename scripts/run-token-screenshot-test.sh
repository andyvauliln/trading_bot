#!/bin/bash

# Script to run the token screenshot tests

# Set up colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== TOKEN SCREENSHOT TEST RUNNER ===${NC}"
echo "Running token screenshot tests..."

# Check if TypeScript is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: npx not found. Make sure Node.js and npm are installed.${NC}"
    exit 1
fi

# Compile the TypeScript file first (if needed)
echo -e "\n${YELLOW}Compiling TypeScript...${NC}"
npx tsc gmgn_api/test-token-screenshot.ts --esModuleInterop --resolveJsonModule --target ES2020 --module CommonJS

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: TypeScript compilation failed.${NC}"
    exit 1
fi

# Run the test
echo -e "\n${YELLOW}Running tests...${NC}"
node gmgn_api/test-token-screenshot.js

# Check if the test succeeded
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}Tests completed successfully!${NC}"
    exit 0
else
    echo -e "\n${RED}Tests failed.${NC}"
    exit 1
fi 