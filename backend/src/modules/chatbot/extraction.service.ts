import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

/**
 * Uses a short, focused Claude call to extract a specific data field from a free-text message.
 * This is separate from the main chatbot prompt to keep extraction reliable and cheap.
 */
export async function extractField(
  fieldPrompt: string,
  userMessage: string,
): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: fieldPrompt + '\n\nReturn ONLY the extracted value. If you cannot extract it, return exactly: __NONE__',
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
    if (!text || text === '__NONE__' || text.length === 0) return null;
    return text;
  } catch (error: any) {
    console.error('[EXTRACTION] Claude API error:', error.message);
    return null;
  }
}
