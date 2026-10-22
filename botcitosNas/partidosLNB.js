const { chromium } = require("playwright");
const { Telegraf } = require("telegraf");
const fs = require("fs/promises");
const path = require("path");

const BASE_URL = "https://www.laliganacional.com.ar";
const BOT_TOKEN = "5385213499:AAGZ4A80hExNR6bbUqh8mTARbYqdnAYuC2c";
const CHAT_ID = "5760438151";
const STATE_FILE = path.join(__dirname, ".partidosLNB-state.json");
const RETRY_DELAY_MS = 3 * 60 * 60 * 1000;
const COMPETITIONS = [
  { name: "Liga Nacional", path: "laliga", emoji: "🟠" },
  { name: "Liga Argentina", path: "laligaargentina", emoji: "🟢" },
];
const bot = new Telegraf(BOT_TOKEN);

function getArgentinaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toDisplayDate(dateKey) {
  return dateKey.split("-").reverse().join("/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

async function fetchMatches(page, competition, dateKey) {
  const url = new URL(`/${competition.path}/fixture`, BASE_URL);
  url.searchParams.set("handler", "ProximosPartidos");
  url.searchParams.set("fechaInicio", dateKey);
  url.searchParams.set("fechaFin", dateKey);

  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

  const matches = await page.$$eval("tr.fila-tabla-calendarios", (rows) =>
    rows.map((row) => {
      const teams = Array.from(row.querySelectorAll(".nombre-equipo"), (element) => element.textContent.trim());
      const dateCell = row.querySelector(".fecha-campo");

      return {
        home: teams[0] || "Equipo local",
        away: teams[1] || "Equipo visitante",
        dateAndTime: dateCell?.querySelector("strong")?.textContent.trim() || "",
        venue: dateCell?.querySelector("small")?.textContent.trim() || "",
      };
    })
  );

  const displayDate = toDisplayDate(dateKey);
  return matches
    .filter((match) => match.dateAndTime.startsWith(displayDate))
    .map((match) => ({ ...match, competition: competition.name, emoji: competition.emoji }));
}

function printMatches(dateKey, matches) {
  console.log(`Partidos de basquet para el ${toDisplayDate(dateKey)} (Argentina)`);

  if (matches.length === 0) {
    console.log("No hay partidos programados.");
    return;
  }

  for (const match of matches) {
    const time = match.dateAndTime.split(" ")[1] || "Horario a confirmar";
    console.log(`\n[${match.competition}] ${match.home} vs ${match.away}`);
    console.log(`Hora: ${time}`);
    console.log(`Estadio: ${match.venue || "A confirmar"}`);
  }
}

function buildTelegramMessage(dateKey, matches) {
  const message = [
    "🏀 <b>PARTIDOS DE BÁSQUET</b>",
    `📅 ${escapeHtml(formatLongDate(dateKey))}`,
  ];

  if (matches.length === 0) {
    return [...message, "", "No hay partidos programados para hoy."].join("\n");
  }

  for (const competition of COMPETITIONS) {
    const competitionMatches = matches.filter((match) => match.competition === competition.name);
    if (competitionMatches.length === 0) continue;

    message.push("", `${competition.emoji} <b>${competition.name.toUpperCase()}</b>`);
    for (const match of competitionMatches) {
      const time = match.dateAndTime.split(" ")[1] || "Horario a confirmar";
      message.push(`🕘 <b>${escapeHtml(time)}</b> · ${escapeHtml(match.home)} vs ${escapeHtml(match.away)}`);
      message.push(`   🏟️ ${escapeHtml(match.venue || "Estadio a confirmar")}`);
    }
  }

  return message.join("\n");
}

async function getMatches(dateKey, competitions) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const results = [];
    for (const competition of competitions) {
      results.push(...await fetchMatches(page, competition, dateKey));
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function sendDailyNotice() {
  const dateKey = getArgentinaDateKey();
  const matches = await getMatches(dateKey, COMPETITIONS);
  printMatches(dateKey, matches);
  await bot.telegram.sendMessage(CHAT_ID, buildTelegramMessage(dateKey, matches), { parse_mode: "HTML" });
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeState(state) {
  await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function attemptScheduledNotice(isRetry = false) {
  const dateKey = getArgentinaDateKey();
  const state = await readState();

  if (state.sentDate === dateKey) {
    console.log(`El aviso de ${dateKey} ya fue enviado.`);
    return;
  }

  if (isRetry) {
    if (state.retryAttemptedDate === dateKey) return;
    state.retryAttemptedDate = dateKey;
    await writeState(state);
  }

  try {
    await sendDailyNotice();
    await writeState({ sentDate: dateKey });
    console.log(`Aviso de ${dateKey} enviado correctamente.`);
  } catch (error) {
    console.error(`${isRetry ? "Reintento" : "Aviso"} diario LNB fallido:`, error.message);

    if (!isRetry) {
      const retryAt = Date.now() + RETRY_DELAY_MS;
      await writeState({ failedDate: dateKey, retryAt, retryAttemptedDate: null });
      scheduleRetry(retryAt);
    }
  }
}

function scheduleRetry(retryAt) {
  const delay = Math.max(0, retryAt - Date.now());
  console.log(`Reintento unico programado en ${Math.round(delay / 60000)} minutos.`);
  setTimeout(() => {
    attemptScheduledNotice(true).catch((error) => console.error("No se pudo preparar el reintento LNB:", error.message));
  }, delay);
}

async function restorePendingRetry() {
  const state = await readState();
  const dateKey = getArgentinaDateKey();

  if (state.failedDate === dateKey && state.retryAt && state.retryAttemptedDate !== dateKey) {
    scheduleRetry(state.retryAt);
  }
}

function getNextNineAmArgentinaDelay() {
  const now = new Date();
  const [year, month, day] = getArgentinaDateKey(now).split("-").map(Number);
  let nextRunUtc = Date.UTC(year, month - 1, day, 12, 0, 0);

  if (now.getTime() >= nextRunUtc) {
    nextRunUtc = Date.UTC(year, month - 1, day + 1, 12, 0, 0);
  }

  return nextRunUtc - now.getTime();
}

function scheduleDailyNotice() {
  const delay = getNextNineAmArgentinaDelay();
  console.log(`Proximo aviso a las 09:00 Argentina, en ${Math.round(delay / 60000)} minutos.`);

  setTimeout(async () => {
    await attemptScheduledNotice();
    scheduleDailyNotice();
  }, delay);
}

async function main() {
  const dateArgIndex = process.argv.indexOf("--date");
  const dateKey = dateArgIndex === -1 ? getArgentinaDateKey() : process.argv[dateArgIndex + 1];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) {
    throw new Error("Usa una fecha valida: --date AAAA-MM-DD");
  }

  const requestedCompetition = process.argv.includes("--liga-argentina")
    ? "Liga Argentina"
    : process.argv.includes("--liga-nacional")
      ? "Liga Nacional"
      : null;
  const competitions = requestedCompetition
    ? COMPETITIONS.filter((competition) => competition.name === requestedCompetition)
    : COMPETITIONS;

  if (process.argv.includes("--once")) {
    if (requestedCompetition || dateArgIndex !== -1) {
      const matches = await getMatches(dateKey, competitions);
      printMatches(dateKey, matches);
      await bot.telegram.sendMessage(CHAT_ID, buildTelegramMessage(dateKey, matches), { parse_mode: "HTML" });
      return;
    }

    await sendDailyNotice();
    return;
  }

  const me = await bot.telegram.getMe();
  console.log(`Bot de partidos LNB listo: ${me.username || me.first_name}`);
  await restorePendingRetry();
  scheduleDailyNotice();
}

main().catch((error) => {
  console.error("No se pudieron obtener los partidos LNB:", error.message);
  process.exitCode = 1;
});
