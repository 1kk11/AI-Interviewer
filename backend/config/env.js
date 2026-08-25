/**
 * Central configuration — reads env vars once, validates what's needed
 * for the current phase, and exports a typed config object.
 *
 * Keys that aren't needed yet (e.g. GROQ_API_KEY before Phase 5) are
 * exported but not validated, so the server can boot without them.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌  Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

export const config = {
  // Server
  port: parseInt(optionalEnv('PORT', '4000'), 10),
  defaultLanguage: optionalEnv('DEFAULT_LANGUAGE', 'en'),

  // STT — Groq Whisper (required from Phase 5)
  groqApiKey: optionalEnv('GROQ_API_KEY'),

  // LLM — Gemini 2.5 Flash (required from Phase 6)
  googleAiStudioApiKey: optionalEnv('GOOGLE_AI_STUDIO_API_KEY'),

  // TTS — ElevenLabs (required from Phase 7)
  elevenLabsApiKey: optionalEnv('ELEVENLABS_API_KEY'),

  // Vector DB — Pinecone (required from Phase 2)
  pineconeApiKey: optionalEnv('PINECONE_API_KEY'),
  pineconeIndex: optionalEnv('PINECONE_INDEX', 'ai-intern-qa'),
};
