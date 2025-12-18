// utils/ocr.js

const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY;

if (!OCR_SPACE_API_KEY) {
  console.warn('OCR_SPACE_API_KEY is not set – OCR will fail.');
}

/**
 * Use OCR.Space to extract text from a base64 image.
 * NOTE: This is mainly tuned for English text.
 */
export async function ocrImageBase64(imageBase64) {
  if (!OCR_SPACE_API_KEY) {
    throw new Error('OCR_SPACE_API_KEY is not configured');
  }

  const form = new URLSearchParams();
  form.append('apikey', OCR_SPACE_API_KEY);
  form.append('base64Image', `data:image/jpeg;base64,${imageBase64}`);
  form.append('scale', 'true');
  form.append('isTable', 'false');
  form.append('OCREngine', '2');
  // change language here if needed (see OCR.Space docs)
  form.append('language', 'eng');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });

  if (!res.ok) {
    throw new Error(`OCR.Space HTTP error: ${res.status}`);
  }

  const data = await res.json();

  if (data.IsErroredOnProcessing) {
    throw new Error(
      `OCR.Space error: ${data.ErrorMessage || data.ErrorDetails || 'Unknown error'}`
    );
  }

  const parsed = data.ParsedResults?.[0]?.ParsedText || '';
  return parsed.trim();
}
