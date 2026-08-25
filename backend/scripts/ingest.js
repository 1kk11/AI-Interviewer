/**
 * Ingest script — validates the Q&A dataset, embeds it via Gemini, and upserts into Pinecone.
 *
 * Usage:  node scripts/ingest.js
 *
 * Modes:
 * - Without API keys: validates qa-dataset.json only (schema check)
 * - With GOOGLE_AI_STUDIO_API_KEY + PINECONE_API_KEY: full embed + upsert
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Pinecone } from '@pinecone-database/pinecone';
import { embedText, EMBEDDING_DIMENSIONS } from '../pipeline/embeddings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '..', 'data', 'qa-dataset.json');

// Schema validation constants
const REQUIRED_FIELDS = ['id', 'category', 'difficulty', 'question', 'ideal_answer', 'rubric_keyphrases', 'follow_up_hint'];
const VALID_CATEGORIES = ['ml-fundamentals', 'tooling', 'debugging', 'ethics', 'behavioral'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const REQUIRED_LANGUAGES = ['en', 'hi', 'de'];

const INDEX_NAME = process.env.PINECONE_INDEX || 'ai-intern-qa';

// ---------------------------------------------------------------------------
// Validation (kept from Phase 1)
// ---------------------------------------------------------------------------
function validate(dataset) {
  const errors = [];

  if (!Array.isArray(dataset)) {
    errors.push('Dataset must be a JSON array');
    return errors;
  }

  const ids = new Set();

  dataset.forEach((entry, index) => {
    const prefix = `Entry ${index} (${entry.id || 'no id'})`;

    for (const field of REQUIRED_FIELDS) {
      if (!(field in entry)) {
        errors.push(`${prefix}: missing field "${field}"`);
      }
    }

    if (ids.has(entry.id)) {
      errors.push(`${prefix}: duplicate id "${entry.id}"`);
    }
    ids.add(entry.id);

    if (entry.category && !VALID_CATEGORIES.includes(entry.category)) {
      errors.push(`${prefix}: invalid category "${entry.category}"`);
    }

    if (entry.difficulty && !VALID_DIFFICULTIES.includes(entry.difficulty)) {
      errors.push(`${prefix}: invalid difficulty "${entry.difficulty}"`);
    }

    for (const field of ['question', 'ideal_answer']) {
      if (entry[field] && typeof entry[field] === 'object') {
        for (const lang of REQUIRED_LANGUAGES) {
          if (!entry[field][lang]) {
            errors.push(`${prefix}: missing ${field}.${lang}`);
          }
        }
      }
    }

    if (entry.rubric_keyphrases && (!Array.isArray(entry.rubric_keyphrases) || entry.rubric_keyphrases.length === 0)) {
      errors.push(`${prefix}: rubric_keyphrases must be a non-empty array`);
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Pinecone index setup
// ---------------------------------------------------------------------------
async function ensureIndex(pc) {
  const { indexes } = await pc.listIndexes();
  const exists = indexes.some((idx) => idx.name === INDEX_NAME);

  if (exists) {
    console.log(`   Index "${INDEX_NAME}" already exists — skipping creation`);
    return;
  }

  console.log(`   Creating index "${INDEX_NAME}" (${EMBEDDING_DIMENSIONS}-dim, cosine, serverless/us-east-1)...`);
  await pc.createIndex({
    name: INDEX_NAME,
    dimension: EMBEDDING_DIMENSIONS,
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1',
      },
    },
  });

  // Wait for index to be ready
  console.log('   Waiting for index to initialize...');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const desc = await pc.describeIndex(INDEX_NAME);
    if (desc.status?.ready) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) {
    throw new Error('Index did not become ready within 2 minutes');
  }
  console.log('   ✅ Index ready');
}

// ---------------------------------------------------------------------------
// Embedding + upsert
// ---------------------------------------------------------------------------
async function embedAndUpsert(dataset, pc) {
  const index = pc.index(INDEX_NAME);
  const vectors = [];
  let embedCount = 0;

  for (const entry of dataset) {
    for (const lang of REQUIRED_LANGUAGES) {
      const baseMetadata = {
        questionId: entry.id,
        category: entry.category,
        difficulty: entry.difficulty,
        language: lang,
      };

      // 1. Question chunk
      const questionText = entry.question[lang];
      console.log(`   Embedding ${entry.id}/${lang}/question...`);
      const questionVec = await embedText(questionText);
      vectors.push({
        id: `${entry.id}-${lang}-question`,
        values: questionVec,
        metadata: {
          ...baseMetadata,
          chunkType: 'question',
          text: questionText,
        },
      });
      embedCount++;

      // 2. Ideal answer chunk
      const idealText = entry.ideal_answer[lang];
      console.log(`   Embedding ${entry.id}/${lang}/ideal_answer...`);
      const idealVec = await embedText(idealText);
      vectors.push({
        id: `${entry.id}-${lang}-ideal_answer`,
        values: idealVec,
        metadata: {
          ...baseMetadata,
          chunkType: 'ideal_answer',
          text: idealText,
        },
      });
      embedCount++;

      // 3. Rubric keyphrases chunk
      const rubricText = entry.rubric_keyphrases.join(', ');
      console.log(`   Embedding ${entry.id}/${lang}/rubric...`);
      const rubricVec = await embedText(rubricText);
      vectors.push({
        id: `${entry.id}-${lang}-rubric`,
        values: rubricVec,
        metadata: {
          ...baseMetadata,
          chunkType: 'rubric',
          text: rubricText,
          rubricText: rubricText,
          followUpHint: entry.follow_up_hint,
        },
      });
      embedCount++;

      // Brief pause to stay within rate limits
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Batch upsert — Pinecone supports up to 100 vectors per call; 90 fits in one batch
  console.log(`\n   Upserting ${vectors.length} vectors to Pinecone...`);
  await index.upsert(vectors);

  return embedCount;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
async function verify(pc) {
  const index = pc.index(INDEX_NAME);

  // Fetch a known vector to confirm ingestion
  const result = await index.fetch(['q01-en-question']);
  const rec = result.records?.['q01-en-question'];

  if (rec) {
    console.log('   ✅ Verification: q01-en-question found');
    console.log(`      Metadata: questionId=${rec.metadata.questionId}, lang=${rec.metadata.language}, type=${rec.metadata.chunkType}`);
    console.log(`      Text preview: "${rec.metadata.text?.substring(0, 60)}..."`);
  } else {
    console.warn('   ⚠️  Verification: q01-en-question not found — index may still be processing');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('📦 AI Interview Agent — Dataset Ingest\n');
  console.log(`Reading: ${DATA_PATH}\n`);

  // 1. Read & validate
  let dataset;
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8');
    dataset = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read/parse dataset: ${err.message}`);
    process.exit(1);
  }

  const errors = validate(dataset);
  if (errors.length > 0) {
    console.error('❌ Validation failed:\n');
    errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }

  // Summary
  const categories = {};
  const difficulties = {};
  dataset.forEach((entry) => {
    categories[entry.category] = (categories[entry.category] || 0) + 1;
    difficulties[entry.difficulty] = (difficulties[entry.difficulty] || 0) + 1;
  });

  console.log(`✅ Validated ${dataset.length} questions — all have en/hi/de fields\n`);
  console.log('   Categories:');
  Object.entries(categories).forEach(([cat, count]) => console.log(`     • ${cat}: ${count}`));
  console.log('\n   Difficulties:');
  Object.entries(difficulties).forEach(([diff, count]) => console.log(`     • ${diff}: ${count}`));

  // 2. Check for API keys — if missing, stop after validation
  const hasGeminiKey = !!process.env.GOOGLE_AI_STUDIO_API_KEY;
  const hasPineconeKey = !!process.env.PINECONE_API_KEY;

  if (!hasGeminiKey || !hasPineconeKey) {
    console.log('\n📌 Validation-only mode (API keys not set)');
    if (!hasGeminiKey) console.log('   Missing: GOOGLE_AI_STUDIO_API_KEY');
    if (!hasPineconeKey) console.log('   Missing: PINECONE_API_KEY');
    console.log('   Set both keys in .env and re-run for full embed + upsert.\n');
    return;
  }

  // 3. Initialize Pinecone & ensure index
  console.log('\n🔧 Setting up Pinecone...');
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  await ensureIndex(pc);

  // 4. Embed & upsert
  console.log('\n🧠 Embedding & upserting...');
  const count = await embedAndUpsert(dataset, pc);
  console.log(`\n✅ Embedded and upserted ${count} vectors (${dataset.length} questions × ${REQUIRED_LANGUAGES.length} languages × 3 chunks)`);

  // 5. Verify
  console.log('\n🔍 Verifying ingestion...');
  // Small delay for index to process
  await new Promise((r) => setTimeout(r, 2000));
  await verify(pc);

  console.log('\n🎉 Ingestion complete!\n');
}

main().catch((err) => {
  console.error(`\n❌ Ingest failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
