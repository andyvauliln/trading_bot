#!/bin/bash
# Script to install Chrome and its dependencies for Puppeteer on a Linux server

# Output colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Installing Chrome and its dependencies for Puppeteer...${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Detect the Linux distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
else
    echo -e "${RED}Cannot detect Linux distribution${NC}"
    exit 1
fi

echo -e "${YELLOW}Detected OS: $OS${NC}"

# Install dependencies based on the distribution
if [[ $OS == *"Ubuntu"* ]] || [[ $OS == *"Debian"* ]]; then
    echo -e "${YELLOW}Installing dependencies for Ubuntu/Debian...${NC}"
    apt-get update
    apt-get install -y \
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
elif [[ $OS == *"CentOS"* ]] || [[ $OS == *"Red Hat"* ]]; then
    echo -e "${YELLOW}Installing dependencies for CentOS/RHEL...${NC}"
    yum install -y \
        alsa-lib.x86_64 \
        atk.x86_64 \
        cups-libs.x86_64 \
        gtk3.x86_64 \
        ipa-gothic-fonts \
        libXcomposite.x86_64 \
        libXcursor.x86_64 \
        libXdamage.x86_64 \
        libXext.x86_64 \
        libXi.x86_64 \
        libXrandr.x86_64 \
        libXScrnSaver.x86_64 \
        libXtst.x86_64 \
        pango.x86_64 \
        xorg-x11-fonts-100dpi \
        xorg-x11-fonts-75dpi \
        xorg-x11-fonts-cyrillic \
        xorg-x11-fonts-misc \
        xorg-x11-fonts-Type1 \
        xorg-x11-utils \
        libdrm \
        libgbm
else
    echo -e "${RED}Unsupported distribution: $OS${NC}"
    echo -e "${YELLOW}Please install Chrome dependencies manually.${NC}"
    exit 1
fi

# Install Chrome browser if not already installed
if command -v google-chrome &>/dev/null; then
    echo -e "${GREEN}Google Chrome is already installed.${NC}"
    google-chrome --version
else
    echo -e "${YELLOW}Installing Google Chrome...${NC}"
    if [[ $OS == *"Ubuntu"* ]] || [[ $OS == *"Debian"* ]]; then
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
        sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
        apt-get update
        apt-get install -y google-chrome-stable
    elif [[ $OS == *"CentOS"* ]] || [[ $OS == *"Red Hat"* ]]; then
        cat << EOF > /etc/yum.repos.d/google-chrome.repo
[google-chrome]
name=google-chrome
baseurl=http://dl.google.com/linux/chrome/rpm/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://dl.google.com/linux/linux_signing_key.pub
EOF
        yum install -y google-chrome-stable
    fi
    
    if command -v google-chrome &>/dev/null; then
        echo -e "${GREEN}Google Chrome installed successfully.${NC}"
        google-chrome --version
    else
        echo -e "${RED}Failed to install Google Chrome.${NC}"
    fi
fi

# Set the Chrome path in environment variables
CHROME_PATH=$(which google-chrome)
if [ -n "$CHROME_PATH" ]; then
    echo -e "${GREEN}Chrome executable found at: $CHROME_PATH${NC}"
    echo -e "${YELLOW}Adding CHROME_EXECUTABLE_PATH to environment...${NC}"
    
    # Check if we need to add to .bashrc or .bash_profile
    if [ -f ~/.bashrc ]; then
        grep -q "CHROME_EXECUTABLE_PATH" ~/.bashrc || echo "export CHROME_EXECUTABLE_PATH=$CHROME_PATH" >> ~/.bashrc
        echo -e "${GREEN}Added to ~/.bashrc${NC}"
    fi
    
    if [ -f ~/.bash_profile ]; then
        grep -q "CHROME_EXECUTABLE_PATH" ~/.bash_profile || echo "export CHROME_EXECUTABLE_PATH=$CHROME_PATH" >> ~/.bash_profile
        echo -e "${GREEN}Added to ~/.bash_profile${NC}"
    fi
    
    # Also add to current session
    export CHROME_EXECUTABLE_PATH=$CHROME_PATH
    echo -e "${GREEN}Environment variable set for current session.${NC}"
    
    # Make the script update the environment for the running process
    echo "export CHROME_EXECUTABLE_PATH=$CHROME_PATH" >> /etc/environment
    echo -e "${GREEN}Added to system-wide environment variables${NC}"
else
    echo -e "${RED}Chrome executable not found.${NC}"
fi

echo -e "${GREEN}Installation complete!${NC}"
echo -e "${YELLOW}You may need to restart your terminal or log out and back in for the environment changes to take effect.${NC}"
echo -e "${YELLOW}Try running your script with: CHROME_EXECUTABLE_PATH=$CHROME_PATH node your-script.js${NC}" 