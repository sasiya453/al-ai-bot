// api/handle-image.js
import { downloadTelegramImageAsBase64 } from '../utils/image.js';
import {
  checkAndIncrementLimit,
  getUserLanguage
} from '../utils/limiter.js';

// CHANGED: use OCR + Groq instead of Gemini
import { ocrImageBase64 } from '../utils/ocr.js';
import { askGroqLLM, extractSubjectFromAnswer } from './groq.js';

import { supabaseAdmin } from '../lib/supabase.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Send a message to Telegram
 */
export async function sendTelegramMessage(chatId, text, extra = {}) {
  const payload = {
    chat_id: chatId,
    text,
    ...extra
  };

  await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/**
 * Telegram message text chunking (4096 char limit)
 */
export async function sendLongMessage(chatId, text, extra = {}) {
  const limit = 4096;
  let start = 0;
  while (start < text.length) {
    const part = text.slice(start, start + limit);
    await sendTelegramMessage(chatId, part, extra);
    start += limit;
  }
}

/**
 * Pick the largest photo size Telegram sent
 */
function getLargestPhoto(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return photos.reduce((a, b) => {
    const sizeA = a.file_size || 0;
    const sizeB = b.file_size || 0;
    return sizeB > sizeA ? b : a;
  });
}

/**
 * Main handler for image messages
 */
export async function handleImageMessage(update) {
  const message = update.message;
  const chatId = message.chat.id;
  const from = message.from || {};
  const telegramId = String(from.id);
  const username = from.username || from.first_name || '';

  const photos = message.photo;
  const photoObj = getLargestPhoto(photos);

  if (!photoObj || !photoObj.file_id) {
    await sendTelegramMessage(
      chatId,
      'Could not find a valid photo in your message. Please try again with a clear image.'
    );
    return;
  }

  // 1. Rate limit
  let limitInfo;
  try {
    limitInfo = await checkAndIncrementLimit(telegramId, username);
  } catch (err) {
    console.error('Rate limit check error', err);
    await sendTelegramMessage(
      chatId,
      'Internal error while checking your usage. Please try again later.'
    );
    return;
  }

  if (!limitInfo.allowed) {
    await sendTelegramMessage(
      chatId,
      'You have reached your daily free limit of questions. Please try again tomorrow.'
    );
    return;
  }

  // 2. Language preference
  let language = 'en';
  try {
    language = await getUserLanguage(telegramId);
  } catch (err) {
    console.error('Get language error', err);
  }

  // 3. Inform user that we are processing
  await sendTelegramMessage(chatId, '📚 Analyzing your question. Please wait a few seconds...');

  // 4. Download image
  let imageData;
  try {
    imageData = await downloadTelegramImageAsBase64(photoObj.file_id);
  } catch (err) {
    console.error('Download image error', err);
    await sendTelegramMessage(
      chatId,
      'Failed to download your image from Telegram. Please try again with a clearer photo.'
    );
    return;
  }

  // 5. OCR: image -> text
  let extractedText;
  try {
    extractedText = await ocrImageBase64(imageData.base64);
    if (!extractedText || !extractedText.trim()) {
      await sendTelegramMessage(
        chatId,
        'I could not read any text from your image. Please send a clearer, higher-resolution photo.'
      );
      return;
    }
  } catch (err) {
    console.error('OCR error', err);
    await sendTelegramMessage(
      chatId,
      'Failed to read text from your image (OCR error). Please try again with a clearer photo.'
    );
    return;
  }

  // 6. LLM: solve the question text using Groq
  let answerText;
  try {
    answerText = await askGroqLLM({
      questionText: extractedText,
      language
    });
  } catch (err) {
    console.error('Groq LLM error', err);
    await sendTelegramMessage(
      chatId,
      'AI service failed while analyzing your question. Please try again in a moment.'
    );
    return;
  }

  // 7. Extract subject and log
  let subject = extractSubjectFromAnswer(answerText) || null;
  try {
    await supabaseAdmin.from('requests').insert({
      telegram_id: telegramId,
      subject
    });
  } catch (err) {
    console.error('Failed to insert request log', err);
  }

  // 8. Send answer back to user (chunked)
  await sendLongMessage(chatId, answerText);
}
