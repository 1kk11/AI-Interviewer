/**
 * STT Integration (Phase 5) — Groq Whisper
 */

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import Groq from 'groq-sdk';
import { incrementSttCallCount } from '../session/sessionStore.js';

/** @type {Groq|null} */
let _groq = null;

function getGroq() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required for STT');
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

/**
 * Minimum number of words a transcript must have to be considered real speech.
 * Whisper commonly halluminates short filler tokens ("you", ".", "Thanks.", etc.)
 * on silent or near-silent audio. Anything below this threshold is discarded.
 */
const MIN_WORD_COUNT = 3;

/**
 * Whisper hallucination patterns that should be treated as silence.
 * These are common stray outputs returned when audio contains only noise.
 */
const FILLER_PATTERNS = [
  /^[\s.,!?;:'"-]+$/, // punctuation / whitespace only
  /^(you|yeah|uh|um|hmm|ok|okay|yes|no|hi|hey|bye|thanks|thank you|thank you\.)\s*\.?$/i,
  /^\[.*?\]$/, // [BLANK_AUDIO], [Music], [Applause], etc.
];

/**
 * Check whether a raw Whisper transcript is substantive (real speech) or
 * should be treated as empty (silence / hallucination).
 * @param {string} text
 * @returns {boolean}
 */
function isSubstantiveTranscript(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (FILLER_PATTERNS.some((re) => re.test(trimmed))) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount >= MIN_WORD_COUNT;
}

/**
 * Transcribe binary WebM audio buffer to text.
 * The Groq SDK requires a file stream, so this temporarily saves the buffer to disk.
 *
 * @param {Buffer} audioBuffer - WebM/Opus audio buffer from the client
 * @param {string} [language='en'] - Hint for the transcriber ('en', 'hi', 'de')
 * @param {string} [sessionId] - Optional session ID to track API usage
 * @returns {Promise<string>} The transcribed text, or '' when Whisper returns filler/silence
 */
export async function transcribeAudio(audioBuffer, language = 'en', sessionId = null) {
  if (!audioBuffer || audioBuffer.length === 0) {
    return '';
  }

  const client = getGroq();
  const tempFilePath = path.join(os.tmpdir(), `ai-intern-${randomUUID()}.webm`);

  try {
    // 1. Write the buffer to a temporary file
    await fs.writeFile(tempFilePath, audioBuffer);

    // 2. Call Groq API
    if (sessionId) incrementSttCallCount(sessionId);
    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(tempFilePath),
      model: 'whisper-large-v3-turbo', // Faster + better for short conversational clips
      language: language,
      response_format: 'json',
      temperature: 0.0,
      // Prompt hint: dramatically improves accuracy by telling Whisper the domain context.
      // Whisper uses this to bias its decoder toward technical vocabulary.
      prompt: 'This is a technical software engineering interview. Topics include machine learning, neural networks, Python, TensorFlow, PyTorch, debugging, data pipelines, APIs, and AI ethics.',
    });

    const rawText = transcription.text.trim();
    console.log(`[STT] Raw Whisper transcript: ${JSON.stringify(rawText)}`);

    if (!isSubstantiveTranscript(rawText)) {
      console.log(
        `[STT] Transcript discarded as filler/silence (${rawText.split(/\s+/).filter(Boolean).length} word(s)): ${JSON.stringify(rawText)}`,
      );
      return '';
    }

    console.log(`[STT] Accepted transcript (${rawText.split(/\s+/).filter(Boolean).length} words): ${JSON.stringify(rawText)}`);
    return rawText;
  } catch (err) {
    console.error('[STT] Transcription failed:', err.message);
    throw err;
  } finally {
    // 3. Clean up the temporary file immediately
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupErr) {
      console.warn(`[STT] Failed to delete temp file ${tempFilePath}:`, cleanupErr.message);
    }
  }
}
