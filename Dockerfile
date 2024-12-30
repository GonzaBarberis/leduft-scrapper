# Usa Node.js slim como base
FROM node:16-slim

# Instalar las dependencias necesarias para Puppeteer y Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxrandr2 \
    libxss1 \
    libnss3 \
    libxdamage1 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libxshmfence1 \
    libgbm-dev \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos necesarios
COPY package*.json ./

# Instalar dependencias del proyecto
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto (si fuera necesario)
EXPOSE 3000

# Comando para iniciar el bot
CMD ["npm", "start"]
