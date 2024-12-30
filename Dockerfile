# Usa una imagen base de Node.js
FROM node:16-slim

# Instalar las dependencias necesarias para Puppeteer y Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libxrandr2 \
    libxss1 \
    xdg-utils \
    libglib2.0-0 \
    libu2f-udev \
    libgdk-pixbuf2.0-0 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos necesarios
COPY package*.json ./
COPY . .

# Instalar las dependencias del proyecto
RUN npm install

# Expone el puerto necesario si lo necesitas (no obligatorio para un bot)
EXPOSE 3000

# Comando para iniciar el bot
CMD ["npm", "start"]
