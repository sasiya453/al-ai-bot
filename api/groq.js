// api/groq.js
import { buildQuestionPrompt } from '../lib/prompt.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is not set');
}

/**
 * Ask Groq LLaMA 3.1 to solve the question text and return explanation.
 */
export async function askGroqLLM({ questionText, language }) {
  const prompt = buildQuestionPrompt(questionText, language);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile', // or 'llama-3.1-8b-instant'
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2
    })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Groq error data:', data);
    throw new Error(data.error?.message || 'Groq API error');
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned empty response');
  }

  return content;
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
