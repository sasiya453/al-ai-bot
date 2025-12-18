// api/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildVisionPrompt } from '../lib/prompt.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const MODEL_NAME = 'gemini-1.5-flash';

/**
 * Call Gemini Vision with base64 image + prompt
 */
export async function askGeminiVision({ imageBase64, mimeType, language }) {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = buildVisionPrompt(language);

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || 'image/jpeg'
            }
          }
        ]
      }
    ]
  });

  const response = await result.response;
  const text = response.text();
  return text;
}

/**
 * Extract subject from AI response (based on "SUBJECT: ...")
 */
export function extractSubjectFromAnswer(answerText) {
  const match = answerText.match(/SUBJECT:\s*([^\n\r]+)/i);
  if (!match) return null;

  const raw = match[1].trim().toLowerCase();
  if (raw.includes('phys')) return 'Physics';
  if (raw.includes('chem')) return 'Chemistry';
  if (raw.includes('bio')) return 'Biology';
  if (raw.includes('math')) return 'Maths';

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
