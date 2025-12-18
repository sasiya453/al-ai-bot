// utils/image.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_FILE_BASE = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Get Telegram file URL from file_id
 */
export async function getTelegramFileUrl(fileId) {
  const res = await fetch(
    `${TELEGRAM_API_BASE}/getFile?file_id=${encodeURIComponent(fileId)}`
  );

  if (!res.ok) {
    throw new Error(`Failed to get file info from Telegram: ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram getFile error: ${JSON.stringify(data)}`);
  }

  const filePath = data.result.file_path;
  return `${TELEGRAM_FILE_BASE}/${filePath}`;
}

/**
 * Download image and return { base64, mimeType }
 */
export async function downloadTelegramImageAsBase64(fileId) {
  const fileUrl = await getTelegramFileUrl(fileId);

  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`);
  }

  let mimeType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  return { base64, mimeType };
}
