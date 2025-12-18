// api/telegram-webhook.js
import { handleImageMessage, sendTelegramMessage } from './handle-image.js';
import { setUserLanguage } from '../utils/limiter.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Helper – answer callback query quickly
 */
async function answerCallbackQuery(callbackQueryId) {
  if (!callbackQueryId) return;

  try {
    await fetch(`${TELEGRAM_API_BASE}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
  } catch (err) {
    console.error('answerCallbackQuery error', err);
  }
}

/**
 * Read raw body if req.body is not already parsed
 */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  let data = '';
  for await (const chunk of req) {
    data += chunk;
  }
  if (!data) return {};
  return JSON.parse(data);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('OK');
    return;
  }

  let update;
  try {
    update = await readBody(req);
  } catch (err) {
    console.error('Failed to parse update', err);
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  // Handle callback_query for language selection
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data;
    const from = cq.from || {};
    const telegramId = String(from.id);
    const chatId = cq.message?.chat?.id;

    if (data === 'lang_en' || data === 'lang_si') {
      const lang = data === 'lang_si' ? 'si' : 'en';
      try {
        await setUserLanguage(telegramId, lang);
      } catch (err) {
        console.error('setUserLanguage error', err);
      }

      if (chatId) {
        await sendTelegramMessage(
          chatId,
          lang === 'si'
            ? '✅ ඔබගේ භාෂා தெரிவු කිරීම: සිංහල'
            : '✅ Language set to: English'
        );
      }
    }

    await answerCallbackQuery(cq.id);

    res.statusCode = 200;
    res.end('OK');
    return;
  }

  // Handle normal messages
  if (update.message) {
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;

    // /start
    if (text && text.startsWith('/start')) {
      const welcome =
        '👋 Welcome to A/L AI Question Solver Bot!\n\n' +
        '📸 Send a clear photo of your A/L question.\n' +
        '📚 Subjects: Physics | Chemistry | Biology | Maths\n' +
        '🌐 Language: English / Sinhala\n\n' +
        'Tap below to select your language:';

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: 'English', callback_data: 'lang_en' },
            { text: 'සිංහල', callback_data: 'lang_si' }
          ]
        ]
      };

      await sendTelegramMessage(chatId, welcome, { reply_markup: replyMarkup });
      res.statusCode = 200;
      res.end('OK');
      return;
    }

    // If message contains a photo
    if (message.photo && Array.isArray(message.photo)) {
      await handleImageMessage(update);
      res.statusCode = 200;
      res.end('OK');
      return;
    }

    // Fallback for other text messages
    await sendTelegramMessage(
      chatId,
      'Please send a clear photo of your A/L question (Physics / Chemistry / Biology / Maths).'
    );
    res.statusCode = 200;
    res.end('OK');
    return;
  }

  // Default: ignore and return OK
  res.statusCode = 200;
  res.end('OK');
}
