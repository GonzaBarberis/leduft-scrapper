const { Telegraf } = require("telegraf");
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");
const fs = require("fs");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const id = process.env.CHAT_ID;

const DATA_FILE = "perfumes_data.json";

async function loadPerfumeData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading perfume data:", error);
  }
  return { count: 0, names: [] };
}

async function savePerfumeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving perfume data:", error);
  }
}

async function scrapeoPerfumes() {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.goto("https://leduft.com/categoria-producto/perfumes-extracto/extracto-masculinos/", {
      waitUntil: "domcontentloaded",
    });

    // Esperar que el elemento esté disponible
    await page.waitForSelector(".woocommerce-result-count");

    // Obtener el texto del número de resultados
    const resultados = await page.$eval(".woocommerce-result-count", (el) => el.textContent.trim());

    const cantidad = parseInt(resultados.split(" ")[2]);

    // Obtener los nombres de los perfumes
    const nombres = await page.$$eval(".woocommerce-loop-product__title", (elements) => elements.map((el) => el.textContent.trim()));

    console.log(`Cantidad de perfumes encontrados: ${cantidad}`);

    // Cargar datos previos
    const previousData = await loadPerfumeData();

    if (cantidad > previousData.count) {
      const nuevosPerfumes = nombres.filter((nombre) => !previousData.names.includes(nombre));

      const msg =
        `📢❗ <b>¡Actualización de LeDuft!</b>\n\n` +
        `<b>Total disponibles:</b> ${cantidad}\n\n` +
        `<b>Nuevos perfumes añadidos:</b>\n<ul>` +
        nuevosPerfumes.map((nombre) => `<li>${nombre}</li>`).join("") +
        `</ul>`;

      await bot.telegram.sendMessage(id, msg, { parse_mode: "HTML" });

      // Guardar los datos actualizados
      await savePerfumeData({ count: cantidad, names: nombres });
    } else {
      console.log("No hay nuevos perfumes añadidos.");
    }

    await browser.close();
  } catch (error) {
    console.error("Error durante el scrapeo:", error);
    await browser.close();
  }
}

console.log("Iniciando scrapeo...");
scrapeoPerfumes();

// Configurar el intervalo de 12 horas
setInterval(scrapeoPerfumes, 1000 * 60 * 60 * 12);
