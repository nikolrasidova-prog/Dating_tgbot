import express from "express";
import fetch from "node-fetch";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = process.env.KOYEB_URL || `http://localhost:${PORT}`;

// === TELEGRAM BOT ===
if (!process.env.BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is not set in .env");
  process.exit(1);
}
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// === LOAD PROFILES ===
const profiles = JSON.parse(fs.readFileSync("profiles.json", "utf-8"));

// === SUBSCRIBERS LIST ===
let subscribers = new Set();
try {
  if (fs.existsSync("subscribers.json")) {
    subscribers = new Set(JSON.parse(fs.readFileSync("subscribers.json", "utf-8")));
  }
} catch (err) {
  console.error("⚠️ Could not load subscribers.json:", err);
}

// === SAVE SUBSCRIBERS ===
function saveSubscribers() {
  fs.writeFileSync("subscribers.json", JSON.stringify([...subscribers], null, 2));
}

// === EXPRESS SERVER ===
app.get("/", (req, res) => res.send("Bot is running!"));
app.get("/ping", (req, res) => res.send("pong"));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// === AUTO-PING TO PREVENT SLEEP ===
setInterval(() => {
  fetch(`${SELF_URL}/ping`).catch((err) =>
    console.error("Self-ping failed:", err.message)
  );
}, 5 * 60 * 1000);

// === START HANDLER ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  subscribers.add(chatId);
  saveSubscribers();
  sendProfile(chatId, 0);
});

// === SEND PROFILE ===
function sendProfile(chatId, index) {
  const profile = profiles[index];
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "◀️", callback_data: `prev_${index}` },
          { text: "Начать общение", url: "https://tone.affomelody.com/click?pid=109970&offer_id=25&sub1=Lovetg" },
          { text: "▶️", callback_data: `next_${index}` }
        ]
      ]
    }
  };
  bot.sendPhoto(chatId, profile.photo, { caption: profile.text, ...opts });
}

// === CALLBACK HANDLER ===
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const [action, index] = query.data.split("_");
  let i = parseInt(index);

  if (action === "next") i = (i + 1) % profiles.length;
  if (action === "prev") i = (i - 1 + profiles.length) % profiles.length;

  sendProfile(chatId, i);
});

// === BROADCAST WITH PREVIEW ===
let previewCache = {};

bot.onText(/\/preview (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== process.env.ADMIN_ID) return;

  previewCache[chatId] = match[1];
  await bot.sendMessage(chatId, `📋 Предпросмотр:\n\n${match[1]}`);
  await bot.sendMessage(chatId, "Если всё верно, отправь команду /broadcast_confirm");
});

bot.onText(/\/broadcast_confirm/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== process.env.ADMIN_ID) return;

  const message = previewCache[chatId];
  if (!message) return bot.sendMessage(chatId, "Нет сообщения для рассылки.");

  for (const id of subscribers) {
    await bot.sendMessage(id, message).catch(() => {});
  }

  delete previewCache[chatId];
  bot.sendMessage(chatId, "✅ Рассылка завершена!");
});
