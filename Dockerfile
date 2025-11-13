# Use official Node image (Debian based)
FROM node:20

# Install Chrome dependencies required by Puppeteer
RUN apt-get update && apt-get install -y \
    wget gnupg unzip fontconfig locales \
    libx11-dev libx11-6 \
    libgtk-3-0 libgbm-dev libasound2 libnss3 libatk1.0-0 \
    libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the rest of the project
COPY . .

# Expose port for Railway
EXPOSE 3000

# Start the API
CMD ["npm", "start"]
