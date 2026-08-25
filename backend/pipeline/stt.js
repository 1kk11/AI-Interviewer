/**
 * STT Integration (Phase 5) — High-Speed Whisper STT Engine
 */

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import Groq from 'groq-sdk';
import { incrementSttCallCount } from '../session/sessionStore.js';

/** @type {any} */
let _whisperClient = null;

function getWhisperClient() {
  if (!_whisperClient) {
    const apiKey = process.env.GROQ_API_KEY || process.env.WHISPER_API_KEY;
    if (!apiKey) {
      throw new Error('STT API key is required (GROQ_API_KEY)');
    }
    _whisperClient = new Groq({ apiKey });
  }
  return _whisperClient;
}

/**
 * Minimum number of words a transcript must have to be considered real speech.
 */
const MIN_WORD_COUNT = 3;

/**
 * Whisper hallucination patterns that should be treated as silence.
 */
const FILLER_PATTERNS = [
  /^[\s.,!?;:'"-]+$/, // punctuation / whitespace only
  /^(you|yeah|uh|um|hmm|ok|okay|yes|no|hi|hey|bye|thanks|thank you|thank you\.)\s*\.?$/i,
  /^\[.*?\]$/, // [BLANK_AUDIO], [Music], [Applause], etc.
  /^Roles?,?\s*(?:Kadesh|K\s*Rolean|C|S|Pem)[\s.,a-z0-9_-]*$/i, // Common whisper hallucination on mic cutoff
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
 * Build a rich, natural domain prompt to bias Whisper's decoder towards
 * correct software engineering vocabulary without causing prompt echoing.
 * @param {string} language
 * @param {object} context
 * @returns {string}
 */
export function buildWhisperPrompt(language = 'en', context = {}) {
  const terms = [
    'Software engineering screening interview.',
    'Discussion includes OAuth, OAuth2, JWT, JSON Web Token, REST APIs, FastAPI, GraphQL, gRPC, TLS, SSL, HTTPS, CORS.',
    'Frontend technologies include SPA, React, Next.js, Redux, Zustand, TypeScript, JavaScript, CSS Grid, Flexbox, ARIA accessibility, DOM, state management.',
    'Backend and DevOps include Docker, Kubernetes, CI/CD, microservices, SQL, PostgreSQL, MongoDB, Redis, testing, debugging, Agile sprints.'
  ];

  if (context.companyName) {
    terms.push(`Target company is ${context.companyName}.`);
  }
  if (context.jobTitle) {
    terms.push(`Role is ${context.jobTitle}.`);
  }
  if (context.projectName) {
    terms.push(`Project is ${context.projectName}.`);
  }
  if (context.rubricKeyphrases && Array.isArray(context.rubricKeyphrases) && context.rubricKeyphrases.length > 0) {
    terms.push(`Key topics: ${context.rubricKeyphrases.join(', ')}.`);
  }

  return terms.join(' ');
}

/**
 * Normalize technical terms, remove prompt echoes, and clean Whisper degeneration loops.
 * @param {string} rawText
 * @param {object} [context={}]
 * @returns {string}
 */
export function normalizeTechnicalTerms(rawText, context = {}) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText;

  // 1. Remove Whisper prompt echoes (e.g., "Key terms.", "Key,", "Key concepts:")
  text = text.replace(/^(?:Key terms|Key concepts|Question concepts|Key)[\s.,:;-]+/gi, '');
  text = text.replace(/\bKey terms[\s.,:;-]*/gi, '');
  text = text.replace(/\bKey,\s*(?:also,\s*)?(?:Kee,\s*)?/gi, '');

  // 2. Remove Whisper repetitive degeneration tail loops (e.g. repeated token gibberish clusters)
  text = text.replace(/,\s*(?:[A-Za-z0-9._-]+\s*[,.]\s*){4,}.*?(?=(?:So,\s*this\s*way|\.$|$))/gi, '. ');
  // Clean trailing stray hallucinated mic artifacts
  text = text.replace(/(?:Roles?,?\s*K[a-zA-Z0-9\s._-]+)$/gi, '');

  // 3. Authentication & Security terms
  text = text.replace(/\b(jumon|j-unit|jwt)\s+(auth(?:entication)?|api|token|session|signature|payload)\b/gi, 'JWT $2');
  text = text.replace(/\bjumon\b/gi, 'JWT');
  text = text.replace(/\b(act 1|act one|all auth|oh auth|o auth)\b/gi, 'OAuth');
  text = text.replace(/\b(dls)\s+(encryption|handshake|certificate|security|protocol|layer|connection)\b/gi, 'TLS $2');
  text = text.replace(/\bdls\b(?=\s+(?:and|or|with|over|via|security))/gi, 'TLS');

  // 4. APIs & Frameworks
  text = text.replace(/\bfast API or of the answer\b/gi, 'FastAPI');
  text = text.replace(/\bfast api\b/gi, 'FastAPI');
  text = text.replace(/\b(workflow|virtual)\s+apis?\b/gi, (m) => m.toLowerCase().includes('apis') ? 'RESTful APIs' : 'RESTful API');

  // 5. Frontend & Architecture
  text = text.replace(/\bstat management\b/gi, 'state management');
  text = text.replace(/\bhostelic\b/gi, 'holistic');
  text = text.replace(/\btechnicologist\b/gi, 'technologist');
  text = text.replace(/\b(sps|sp s)\s+(front[\s-]?ends?|applications?|apps?|architecture|lifecycle)\b/gi, 'SPA $2');
  text = text.replace(/\bbetter\s+sps\b/gi, 'better SPA');
  text = text.replace(/\bdesigned\s+sps\b/gi, 'designed SPAs');
  text = text.replace(/\bbuilding\s+sps\b/gi, 'building SPAs');

  // 6. Company Name / Specific context
  if (context.companyName && /deloitte/i.test(context.companyName)) {
    text = text.replace(/\bdelight(\s+lifecycle|\s+company|\s+role|\s+team|\s+interview|\s+job)?\b/gi, (match, p1) => {
      return 'Deloitte' + (p1 || '');
    });
  }

  // Clean up any extra spacing or trailing commas left by removals
  text = text.replace(/\s*,\s*,\s*/g, ', ');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Transcribe binary WebM audio buffer to text.
 *
 * @param {Buffer} audioBuffer - WebM/Opus audio buffer from the client
 * @param {string} [language='en'] - Hint for the transcriber ('en', 'hi', 'de')
 * @param {string} [sessionId] - Optional session ID to track API usage
 * @param {object} [context={}] - Context metadata (company, role, rubric keyphrases)
 * @returns {Promise<string>} The transcribed text, or '' when Whisper returns filler/silence
 */
export async function transcribeAudio(audioBuffer, language = 'en', sessionId = null, context = {}) {
  if (!audioBuffer || audioBuffer.length === 0) {
    return '';
  }

  const client = getWhisperClient();
  const tempFilePath = path.join(os.tmpdir(), `ai-intern-${randomUUID()}.webm`);

  try {
    // 1. Write the buffer to a temporary file
    await fs.writeFile(tempFilePath, audioBuffer);

    // 2. Call Whisper Transcriptions API with rich domain prompt
    if (sessionId) incrementSttCallCount(sessionId);
    const whisperPrompt = buildWhisperPrompt(language, context);

    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(tempFilePath),
      model: 'whisper-large-v3-turbo',
      language: language,
      response_format: 'json',
      temperature: 0.0,
      prompt: whisperPrompt,
    });

    const rawText = transcription.text.trim();
    console.log(`[STT] Raw Whisper transcript: ${JSON.stringify(rawText)}`);

    if (!isSubstantiveTranscript(rawText)) {
      console.log(
        `[STT] Transcript discarded as filler/silence (${rawText.split(/\s+/).filter(Boolean).length} word(s)): ${JSON.stringify(rawText)}`,
      );
      return '';
    }

    // 3. Apply technical term phonetic normalization & hallucination cleanup
    const normalizedText = normalizeTechnicalTerms(rawText, context);
    console.log(`[STT] Accepted transcript (${normalizedText.split(/\s+/).filter(Boolean).length} words): ${JSON.stringify(normalizedText)}`);
    return normalizedText;
  } catch (err) {
    console.error('[STT] Transcription failed:', err.message);
    throw err;
  } finally {
    // 4. Clean up the temporary file immediately
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupErr) {
      console.warn(`[STT] Failed to delete temp file ${tempFilePath}:`, cleanupErr.message);
    }
  }
}
