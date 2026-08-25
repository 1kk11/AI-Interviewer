import { incrementLlmCallCount } from '../session/sessionStore.js';

/**
 * Executes a chat completion request against Azure OpenAI (gpt-4o-mini).
 * 
 * @param {object} options
 * @param {Array<object>} options.messages - Array of message objects [{role, content}]
 * @param {number} [options.temperature=0.3] - Sampling temperature
 * @param {number} [options.max_tokens=800] - Max output tokens
 * @param {object} [options.response_format] - Optional response format (e.g. {type: 'json_object'})
 * @param {string} [options.sessionId] - Session ID for API usage logging
 * @returns {Promise<object>} The chat completion response matching standard OpenAI format
 */
export async function callAzureOpenAI({
  messages,
  temperature = 0.3,
  max_tokens = 800,
  response_format = null,
  sessionId = null,
}) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;

  if (!endpoint || !apiKey) {
    throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY are required');
  }

  const payload = {
    messages,
    temperature,
    max_tokens,
  };

  if (response_format && response_format.type === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  if (sessionId) {
    incrementLlmCallCount(sessionId);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure OpenAI Error (${response.status}): ${errorText}`);
  }

  return await response.json();
}
