import { GoogleGenAI } from '@google/genai';

export function extractJson(raw: string): any {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (err) {
    const jsonMatch = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw err;
  }
}

export async function callWithFallback(prompt: string): Promise<{
  text: string;
  provider: string;
  model: string;
  fallbackTriggered: boolean;
}> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      if (response.text) {
        return {
          text: response.text,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          fallbackTriggered: false,
        };
      }
    } catch (e: any) {
      console.warn('[LLM Gateway] Gemini call failed, trying Groq fallback...', e.message);
    }
  }

  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return {
            text,
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            fallbackTriggered: true,
          };
        }
      }
    } catch (e: any) {
      console.warn('[LLM Gateway] Groq fallback failed:', e.message);
    }
  }

  throw new Error('All AI providers failed or no API keys provided.');
}
