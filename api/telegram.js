// api/telegram.js
const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  let update;
  try {
    update = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
  } catch {
    res.status(400).send('Bad request');
    return;
  }

  try {
    if (update.message) {
      await handleTelegramMessage(update, res);
    } else {
      res.status(200).send('OK');
    }
  } catch (err) {
    console.error('Handler error', err);
    res.status(200).send('OK');
  }
}

async function handleTelegramMessage(update, res) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const apiUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

  const msg = update.message;
  const chatId = msg.chat.id;

  // 1️⃣ /start command
  if (msg.text && msg.text.startsWith('/start')) {
    const welcome =
      '👋 Welcome to A/L AI Gemini Bot!\n\n' +
      '📸 Send a clear photo or text of an A/L question.\n' +
      'Subjects: Physics | Chemistry | Biology | Maths\n\n' +
      'I will analyze and explain step by step.';
    await sendMessage(apiUrl, chatId, welcome);
    res.status(200).send('OK');
    return;
  }

  // 2️⃣ Text message
  if (msg.text) {
    await sendMessage(apiUrl, chatId, '🤔 Processing your question...');
    const question = msg.text;

    try {
      const answer = await callGeminiText(GEMINI_KEY, question);
      await sendLongMessage(apiUrl, chatId, answer);
    } catch (e) {
      console.error(e);
      await sendMessage(apiUrl, chatId, '❌ Gemini text error.');
    }

    res.status(200).send('OK');
    return;
  }

  // 3️⃣ Photo message
  if (msg.photo) {
    const largest = msg.photo.reduce((a, b) =>
      (b.file_size || 0) > (a.file_size || 0) ? b : a
    );

    await sendMessage(apiUrl, chatId, '🧠 Analyzing the image...');

    try {
      // 1. get file path
      const getFile = await fetch(
        `${apiUrl}/getFile?file_id=${largest.file_id}`
      ).then((r) => r.json());

      const filePath = getFile.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;

      // 2. fetch image
      const imgRes = await fetch(fileUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const mimeType =
        imgRes.headers.get('content-type') || 'image/jpeg';
      const base64Image = bufferToBase64(arrayBuffer);

      // 3. call Gemini
      const answer = await callGeminiVision(GEMINI_KEY, base64Image, mimeType);
      await sendLongMessage(apiUrl, chatId, answer);
    } catch (err) {
      console.error(err);
      await sendMessage(apiUrl, chatId, '❌ Gemini failed to analyze the image.');
    }

    res.status(200).send('OK');
    return;
  }

  // 4️⃣ fallback
  await sendMessage(apiUrl, chatId, 'Please send text or photo of a question.');
  res.status(200).send('OK');
}

/* === Helper functions === */

async function sendMessage(apiUrl, chatId, text) {
  await fetch(`${apiUrl}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function sendLongMessage(apiUrl, chatId, text) {
  const limit = 4096;
  for (let i = 0; i < text.length; i += limit) {
    const part = text.slice(i, i + limit);
    await sendMessage(apiUrl, chatId, part);
  }
}

function bufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, 'binary').toString('base64');
}

/* === Gemini API Calls === */

async function callGeminiText(apiKey, text) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildTextPrompt(text) }] }]
  };
  const res = await fetch(
    `${GEMINI_BASE}/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini text error');
  return parseGeminiText(data);
}

async function callGeminiVision(apiKey, base64, mimeType) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildVisionPrompt() },
          { inlineData: { data: base64, mimeType } }
        ]
      }
    ]
  };
  const res = await fetch(
    `${GEMINI_BASE}/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini vision error');
  return parseGeminiText(data);
}

function parseGeminiText(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

/* === Prompts === */
function buildTextPrompt(userQ) {
  return `
You are an A/L science teacher (Physics, Chemistry, Biology, Combined Maths).
Explain step-by-step like to a student:
"${userQ}"
Show reasoning, formulas, and final answer. If MCQ, say correct option.
`;
}

function buildVisionPrompt() {
  return `
You are an A/L science teacher.
Analyze the question in this image.
Explain step-by-step with reasoning, formulas, and final answer.
If text unclear, state what is unclear.
`;
}
