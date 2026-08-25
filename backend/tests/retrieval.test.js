/**
 * Integration tests for the retrieval layer.
 *
 * These tests run against the live Pinecone index and require:
 *   - GOOGLE_AI_STUDIO_API_KEY (for embedding in findGroundingMatches)
 *   - PINECONE_API_KEY (for Pinecone queries)
 *   - The index to have been populated by scripts/ingest.js
 *
 * Run: node --test tests/retrieval.test.js
 */

import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getActiveQuestion, findGroundingMatches } from '../server/pipeline/retrieval.js';

// Guard: skip if API keys are not set
const hasKeys = process.env.GOOGLE_AI_STUDIO_API_KEY && process.env.PINECONE_API_KEY;
if (!hasKeys) {
  console.log('⚠️  Skipping retrieval tests — API keys not set');
  console.log('   Set GOOGLE_AI_STUDIO_API_KEY and PINECONE_API_KEY in .env');
  process.exit(0);
}

describe('getActiveQuestion (deterministic fetch)', () => {
  it('should return correct question data for q01 in English', async () => {
    const result = await getActiveQuestion('q01', 'en');

    assert.ok(result, 'Expected a result, got null');
    assert.equal(result.questionId, 'q01');
    assert.equal(result.language, 'en');
    assert.equal(result.category, 'ml-fundamentals');
    assert.equal(result.difficulty, 'medium');
    assert.ok(result.question.includes('bias-variance'), `Question text should mention bias-variance, got: "${result.question}"`);
    assert.ok(result.idealAnswer.length > 0, 'Ideal answer should not be empty');
    assert.ok(result.rubricKeyphrases.length > 0, 'Rubric keyphrases should not be empty');
    assert.ok(result.followUpHint.length > 0, 'Follow-up hint should not be empty');
  });

  it('should return Hindi content for q01 in Hindi', async () => {
    const result = await getActiveQuestion('q01', 'hi');

    assert.ok(result, 'Expected a result, got null');
    assert.equal(result.language, 'hi');
    // Hindi question should contain Devanagari characters
    assert.ok(
      /[\u0900-\u097F]/.test(result.question),
      `Expected Hindi text with Devanagari characters, got: "${result.question}"`
    );
  });

  it('should return null for an invalid question ID', async () => {
    const result = await getActiveQuestion('q99', 'en');
    assert.equal(result, null, 'Expected null for non-existent question');
  });
});

describe('findGroundingMatches (semantic fetch)', () => {
  it('should find bias-variance related content for a relevant answer', async () => {
    const matches = await findGroundingMatches(
      'Bias is when your model is too simple and variance is when it is too sensitive to training data noise',
      'en',
      3
    );

    assert.ok(Array.isArray(matches), 'Expected an array of matches');
    assert.ok(matches.length > 0, 'Expected at least one match');

    // At least one match should be from q01 (bias-variance tradeoff)
    const q01Match = matches.find((m) => m.questionId === 'q01');
    assert.ok(q01Match, `Expected q01 in top matches, got: ${matches.map((m) => m.questionId).join(', ')}`);
    assert.ok(q01Match.score > 0.5, `Expected a high similarity score, got: ${q01Match.score}`);
  });

  it('should respect language filter', async () => {
    const matches = await findGroundingMatches(
      'bias and variance tradeoff in machine learning',
      'de',
      3
    );

    // All matches should be in German
    for (const match of matches) {
      assert.equal(
        match.chunkType === 'ideal_answer' || match.chunkType === 'rubric',
        true,
        `Expected ideal_answer or rubric chunk type, got: ${match.chunkType}`
      );
    }
  });

  it('should return metadata fields on matches', async () => {
    const matches = await findGroundingMatches(
      'overfitting regularization dropout early stopping',
      'en',
      3
    );

    assert.ok(matches.length > 0, 'Expected at least one match');

    for (const match of matches) {
      assert.ok(match.questionId, 'Match should have questionId');
      assert.ok(match.chunkType, 'Match should have chunkType');
      assert.ok(match.text, 'Match should have text');
      assert.ok(typeof match.score === 'number', 'Match should have numeric score');
    }
  });
});
