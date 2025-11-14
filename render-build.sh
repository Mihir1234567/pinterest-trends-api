#!/usr/bin/env bash
set -x

apt-get update
apt-get install -y wget gnupg unzip fontconfig locales \
  libx11-dev libx11-6 \
  libgtk-3-0 libgbm-dev libasound2 libnss3 libatk1.0-0 \
  libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxrandr2 libxss1 libxtst6

echo "📦 Installing Chrome for Puppeteer..."
export PUPPETEER_CACHE_DIR="/opt/render/.cache/puppeteer"

npx puppeteer browsers install chrome

echo "🔍 Chrome install location:"
find /opt/render/.cache/puppeteer -maxdepth 6 -type f -name "chrome" -print || true

echo "✅ Chrome installation complete."
