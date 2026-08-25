/**
 * TTS Integration (Phase 7) — Google TTS
 * Merges all audio chunks into a single MP3 blob before sending,
 * which eliminates the pauses between fragments that made it sound slow.
 */

import * as googleTTS from 'google-tts-api';

/**
 * Synthesize text to speech and send the resulting MP3 audio
 * to a WebSocket connection as a single blob.
 *
 * @param {string} text - The AI's response text to synthesize
 * @param {import('ws').WebSocket} ws - The connected WebSocket client
 * @param {string} lang - The language code ('en', 'hi', 'de')
 * @returns {Promise<void>} Resolves when sending is done
 */
export async function synthesizeAndStream(text, ws, lang = 'en') {
  if (!text || text.trim() === '') return;

  try {
    console.log(`[TTS] Synthesizing audio for text in ${lang}...`);

    // getAllAudioBase64 splits long text into chunks and returns base64 MP3 for each.
    // We merge them into one continuous buffer to avoid choppy playback.
    const audioData = await googleTTS.getAllAudioBase64(text, {
      lang: lang,
      slow: false,
      host: 'https://translate.google.com',
      splitPunct: ',.!?;:',
    });

    // Merge all chunks into a single buffer
    const buffers = audioData.map(chunk => Buffer.from(chunk.base64, 'base64'));
    const merged = Buffer.concat(buffers);

    if (ws.readyState === ws.OPEN) {
      ws.send(merged, { binary: true });
    }
  } catch (err) {
    console.error('[TTS] Synthesis failed:', err.message);
    throw err;
  }
}
