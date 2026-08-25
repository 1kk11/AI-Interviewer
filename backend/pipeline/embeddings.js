/**
 * Shared embedding utility — wraps the Gemini embedding model.
 *
 * Uses `gemini-embedding-001` with 768-dimensional output (Matryoshka MRL).
 * Shared by scripts/ingest.js and server/pipeline/retrieval.js.
 */

import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

/** @type {GoogleGenAI|null} */
let _client = null;

/**
 * Get or create the GoogleGenAI client (lazy singleton).
 * @returns {GoogleGenAI}
 */
function getClient() {
  if (!_client) {
    const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_STUDIO_API_KEY is required for embeddings');
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/**
 * Embed a single text string.
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 768-dimensional embedding vector
 */
export async function embedText(text) {
  const client = getClient();
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  return result.embeddings[0].values;
}

/**
 * Embed multiple texts in a single batch call.
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of 768-dimensional embedding vectors
 */
export async function embedTexts(texts) {
  const client = getClient();
  // embedContent supports array of contents for batch embedding
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  return result.embeddings.map((e) => e.values);
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
