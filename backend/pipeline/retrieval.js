/**
 * Retrieval pipeline stage — dynamic LLM question generation & dataset retrieval.
 *
 * Question resolution hierarchy:
 * 1. Dynamic LLM Generation (generateTailoredQuestions) — tailored to candidate's Resume & Job Description
 * 2. Vector DB Fetch (Pinecone) — if PINECONE_API_KEY is configured
 * 3. Static Dataset Fallback (qa-dataset.json) — fallback if resume/JD context is absent
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';
import { Pinecone } from '@pinecone-database/pinecone';
import { embedText } from './embeddings.js';

const INDEX_NAME = process.env.PINECONE_INDEX || 'ai-intern-qa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QA_DATASET_PATH = path.join(__dirname, '../data/qa-dataset.json');

let _qaDataset = null;
function getLocalDataset() {
  if (!_qaDataset) {
    try {
      const data = fs.readFileSync(QA_DATASET_PATH, 'utf-8');
      _qaDataset = JSON.parse(data);
    } catch (e) {
      console.warn('[Retrieval] Failed to load local qa-dataset.json fallback:', e.message);
      _qaDataset = [];
    }
  }
  return _qaDataset;
}

/** @type {import('@pinecone-database/pinecone').Index|null} */
let _index = null;

function getIndex() {
  if (!_index) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY is required for Pinecone retrieval');
    }
    const pc = new Pinecone({ apiKey });
    _index = pc.index(INDEX_NAME);
  }
  return _index;
}

import { analyzeContext } from '../agents/pre_computation_agents/analyzer_agent.js';
import { generateStrategyQuestions } from '../agents/pre_computation_agents/strategy_agent.js';

/**
 * Generate a set of 5 tailored interview questions using the Multi-Agent Architecture
 *
 * @param {object} session - Session object containing resumeText, jdText, jobTitle, companyName
 * @returns {Promise<Array<object>|null>} List of generated question objects, or null on failure/empty context
 */
export async function generateTailoredQuestions(session) {
  const { resumeText, jdText, jobTitle, companyName, language = 'en' } = session || {};

  // If no candidate context is provided, return null to use static dataset fallback
  if (!resumeText && !jdText && !jobTitle) {
    return null;
  }

  console.log(`\n================ [GENERATING RESUME/JD TAILORED QUESTIONS START (MULTI-AGENT)] ================`);
  console.log(`[Target Position]: ${jobTitle || 'N/A'}${companyName ? ` at ${companyName}` : ''}`);
  
  try {
    console.log(`[Agent 1] Analyzing Resume and Job Description together...`);
    const analysisContext = await analyzeContext(resumeText, jdText, jobTitle, session?.id);

    if (!analysisContext || (!analysisContext.candidate && !analysisContext.job)) {
      console.warn('[Multi-Agent] Context analysis failed. Falling back.');
      return null;
    }

    console.log(`[Agent 1 Output] Strengths:`, analysisContext.candidate?.strengths);
    console.log(`[Agent 1 Output] Core Skills:`, analysisContext.job?.coreSkills);
    // DEBUG:
    console.log(`[Agent 1 Full Context]:`, JSON.stringify(analysisContext, null, 2).slice(0, 500));

    // Agent 2: Generate the final questions using the insights
    console.log(`[Agent 2] Generating strategy questions...`);
    const questions = await generateStrategyQuestions(analysisContext, language, jobTitle, companyName, session?.id);

    if (Array.isArray(questions) && questions.length > 0) {
      console.log(`[Successfully Generated ${questions.length} Tailored Questions]:`);
      questions.forEach((q, idx) => {
        console.log(`  Q${idx + 1} (${q.id || `q0${idx + 1}`}): "${q.question}"`);
      });
      console.log(`================ [GENERATING RESUME/JD TAILORED QUESTIONS END] ================\n`);
      return questions;
    }
  } catch (err) {
    console.warn('[QuestionGenerator] Dynamic multi-agent generation failed, using static fallback:', err.message);
  }
  return null;
}

/**
 * Deterministic fetch — pull active reference question by ID.
 * Priority:
 * 1. Session Dynamic Questions (generated from Resume/JD via Groq)
 * 2. Pinecone Vector DB (if PINECONE_API_KEY is present)
 * 3. Static qa-dataset.json fallback
 *
 * @param {string} questionId - Stable question ID (e.g. 'q01')
 * @param {string} language - Language key ('en', 'hi', 'de')
 * @param {object} [session=null] - Active session object
 * @returns {Promise<object|null>} Structured question data, or null if not found
 */
export async function getActiveQuestion(questionId, language = 'en', session = null, saveToSession = false) {
  // 1. DYNAMIC RESUME/JD PATH
  if (session) {
    // Generate tailored questions if not yet created for this session
    if (!session.dynamicQuestions && (session.resumeText || session.jdText || session.jobTitle)) {
      const generated = await generateTailoredQuestions(session);
      session.dynamicQuestions = generated || []; // cache result or mark attempted
    }

    if (Array.isArray(session.dynamicQuestions) && session.dynamicQuestions.length > 0) {
      const qIndex = parseInt(questionId.replace('q', ''), 10) - 1;
      const match = session.dynamicQuestions.find((q) => q.id === questionId) || session.dynamicQuestions[qIndex];
      if (match) {
        return {
          questionId,
          language,
          category: match.category || 'technical',
          difficulty: match.difficulty || 'medium',
          question: match.question,
          idealAnswer: match.idealAnswer || '',
          rubricKeyphrases: Array.isArray(match.rubricKeyphrases)
            ? match.rubricKeyphrases.join(', ')
            : match.rubricKeyphrases || '',
          followUpHint: match.followUpHint || '',
        };
      }
    }
  }

  // 2. PINECONE VECTOR DB PATH
  if (process.env.PINECONE_API_KEY) {
    try {
      const index = getIndex();
      const ids = [
        `${questionId}-${language}-question`,
        `${questionId}-${language}-ideal_answer`,
        `${questionId}-${language}-rubric`,
      ];

      const result = await index.fetch(ids);
      const records = result.records || {};

      const questionRec = records[`${questionId}-${language}-question`];
      const idealRec = records[`${questionId}-${language}-ideal_answer`];
      const rubricRec = records[`${questionId}-${language}-rubric`];

      if (questionRec) {
        const result = {
          questionId,
          language,
          category: questionRec.metadata.category,
          difficulty: questionRec.metadata.difficulty,
          question: questionRec.metadata.text,
          idealAnswer: idealRec?.metadata?.text || '',
          rubricKeyphrases: rubricRec?.metadata?.rubricText || '',
          followUpHint: rubricRec?.metadata?.followUpHint || '',
        };
        
        if (session && saveToSession) {
          if (!session.dynamicQuestions) session.dynamicQuestions = [];
          if (!session.dynamicQuestions.find(dq => dq.id === questionId)) {
            session.dynamicQuestions.push({
              id: questionId,
              category: result.category,
              difficulty: result.difficulty,
              question: result.question,
              idealAnswer: result.idealAnswer,
              rubricKeyphrases: result.rubricKeyphrases.split(',').map(s => s.trim()).filter(Boolean),
              followUpHint: result.followUpHint
            });
          }
        }
        return result;
      }
    } catch (err) {
      console.warn(`[Retrieval] Pinecone fetch failed for ${questionId}, using local dataset fallback:`, err.message);
    }
  }

  // 3. STATIC DATASET FALLBACK (data/qa-dataset.json)
  const dataset = getLocalDataset();
  const entry = dataset.find((q) => q.id === questionId);
  if (!entry) return null;

  const result = {
    questionId,
    language,
    category: entry.category,
    difficulty: entry.difficulty,
    question: entry.question[language] || entry.question['en'] || '',
    idealAnswer: entry.ideal_answer[language] || entry.ideal_answer['en'] || '',
    rubricKeyphrases: Array.isArray(entry.rubric_keyphrases) ? entry.rubric_keyphrases.join(', ') : '',
    followUpHint: entry.follow_up_hint || '',
  };

  if (session && saveToSession) {
    if (!session.dynamicQuestions) session.dynamicQuestions = [];
    if (!session.dynamicQuestions.find(dq => dq.id === questionId)) {
      session.dynamicQuestions.push({
        id: questionId,
        category: result.category,
        difficulty: result.difficulty,
        question: result.question,
        idealAnswer: result.idealAnswer,
        rubricKeyphrases: Array.isArray(entry.rubric_keyphrases) ? entry.rubric_keyphrases : result.rubricKeyphrases.split(',').map(s => s.trim()).filter(Boolean),
        followUpHint: result.followUpHint
      });
    }
  }
  return result;
}

/**
 * Semantic fetch — embed candidate's answer and query for nearest matching chunks.
 */
export async function findGroundingMatches(candidateAnswerText, language = 'en', topK = 3) {
  if (process.env.PINECONE_API_KEY) {
    try {
      const index = getIndex();
      const queryVector = await embedText(candidateAnswerText);

      const result = await index.query({
        vector: queryVector,
        topK,
        includeMetadata: true,
        filter: {
          language: { $eq: language },
          chunkType: { $in: ['ideal_answer', 'rubric'] },
        },
      });

      return (result.matches || []).map((match) => ({
        questionId: match.metadata.questionId,
        chunkType: match.metadata.chunkType,
        category: match.metadata.category,
        difficulty: match.metadata.difficulty,
        text: match.metadata.text,
        rubricText: match.metadata.rubricText || null,
        followUpHint: match.metadata.followUpHint || null,
        score: match.score,
      }));
    } catch (err) {
      console.warn('[Retrieval] Pinecone query failed, skipping grounding matches:', err.message);
    }
  }

  return [];
}
