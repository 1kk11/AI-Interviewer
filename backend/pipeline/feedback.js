import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeBehavior } from '../agents/post_computation_agents/behavioral_agent.js';
import { logApiUsageToCsv } from '../utils/csvLogger.js';
import { callAzureOpenAI } from '../utils/azureOpenAI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const qaDatasetPath = path.join(__dirname, '../data/qa-dataset.json');

let qaDataset = [];
try {
  qaDataset = JSON.parse(fs.readFileSync(qaDatasetPath, 'utf8'));
} catch (err) {
  console.error('[Feedback] Failed to load qa-dataset.json:', err);
}

/**
 * Generate a structured feedback report from the session history.
 * @param {object} session
 * @returns {Promise<object>} The feedback report
 */
export async function generateFeedback(session) {
  const { history, language } = session;

  // ── Guard: require at least 2 genuine candidate answers ──────────────
  // Synthetic init messages may still have role 'candidate' in older sessions
  // that were created before the fix, so we also filter by content.
  const SYNTHETIC_TEXTS = ['hello, i am ready to start.', 'i am ready for the next question.'];
  const realResponses = (history || []).filter((m) => {
    if (m.role !== 'candidate') return false;
    const text = (m.content || '').trim().toLowerCase();
    if (!text) return false; // blank
    if (SYNTHETIC_TEXTS.includes(text)) return false; // synthetic prompt
    // Require at least 3 words — single/double word entries are Whisper filler
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      console.log(`[Feedback] Skipping low-word-count response (${wordCount} word(s)): ${JSON.stringify(text)}`);
      return false;
    }
    return true;
  });

  console.log(`[Feedback] Real candidate responses: ${realResponses.length}`);

  if (realResponses.length < 2) {
    console.log('[Feedback] Not enough real responses — returning score 0');
    return {
      overall_score: 0,
      strengths: ['No data — the candidate did not provide enough responses to evaluate.'],
      weaknesses: ['No data — the candidate did not provide enough responses to evaluate.'],
      detailed_summary:
        'The interview ended before the candidate answered enough questions to generate a meaningful evaluation. At least 2 substantive responses are required.',
    };
  }

  const targetDataset = session.dynamicQuestions && session.dynamicQuestions.length > 0
    ? session.dynamicQuestions
    : qaDataset;

  // 1. Build deterministic score_breakdown from session.history evaluations
  const breakdownMap = new Map();
  for (const m of history) {
    if (m.role === 'candidate' && m.questionId && m.evaluation) {
      // If there are multiple answers for the same question (e.g. follow-up), 
      // take the latest/highest evaluation. Let's just overwrite with the latest.
      // Or we can take the max score. Let's take the max score for fairness.
      const existing = breakdownMap.get(m.questionId);
      if (!existing || m.evaluation.coveragePercent > existing.score) {
        breakdownMap.set(m.questionId, {
          question_id: m.questionId,
          score: m.evaluation.coveragePercent,
          rubric_keyphrases_covered: m.evaluation.keyphraseResults.filter(k => k.status !== 'missed').map(k => k.keyphrase),
          rubric_keyphrases_missed: m.evaluation.keyphraseResults.filter(k => k.status === 'missed').map(k => k.keyphrase),
          justification: m.evaluation.keyphraseResults
             .filter(k => k.status !== 'missed')
             .map(k => `"${k.keyphrase}": ${k.evidenceQuote}`)
             .join(' | ') || 'No evidence quoted.'
        });
      }
    }
  }

  const completeBreakdown = targetDataset.map((q) => {
    const existing = breakdownMap.get(q.id);
    if (existing) return existing;
    
    // Missing question
    const questionText = typeof q.question === 'object' ? (q.question[language] || q.question['en']) : q.question;
    const rubricKeyphrases = Array.isArray(q.rubricKeyphrases)
        ? q.rubricKeyphrases
        : Array.isArray(q.rubric_keyphrases)
        ? q.rubric_keyphrases
        : [];
    return {
      question_id: q.id,
      score: 0,
      rubric_keyphrases_covered: [],
      rubric_keyphrases_missed: rubricKeyphrases,
      justification: `Candidate did not reach or answer this question ("${questionText}").`,
    };
  });

  const totalScore = completeBreakdown.reduce((sum, item) => sum + item.score, 0);
  const overall_score = Math.round(totalScore / targetDataset.length);

  // 2. Lightweight LLM call for summary text
  const breakdownJson = JSON.stringify(completeBreakdown, null, 2);
  const systemInstruction = `You are a Senior Engineering Manager summarizing an AI Intern candidate's interview.

Your task is to review the candidate's scores and generate ONLY the qualitative summary fields:
1. 'strengths' (2-3 bullet points of what they did well)
2. 'weaknesses' (2-3 bullet points of areas to improve)
3. 'detailed_summary' (A 2-paragraph summary of the performance in ${language === 'de' ? 'German' : language === 'hi' ? 'Hindi' : 'English'})

You MUST respond in pure JSON format matching this exact schema:
{
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "detailed_summary": "string"
}`;

  const userInstruction = `Here is the exact score breakdown (0-100 per question) and justifications based on strict rubric grading.

SCORE BREAKDOWN:
${breakdownJson}`;

  console.log(`[Feedback] Generating structured feedback using Azure OpenAI (gpt-4o-mini)...`);
  let response;
  try {
    response = await callAzureOpenAI({
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userInstruction }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      sessionId: session.id,
    });
  } catch (err) {
    console.error(`[Feedback] Azure OpenAI Error: ${err.message}`);
    response = { choices: [{ message: { content: '{}' } }] };
  }

  try {
    const rawContent = response.choices[0].message.content;
    const llmFeedback = JSON.parse(rawContent);
    
    // 3. Behavioral Analysis (runs concurrently if possible, but here sequentially since we need it for final report)
    console.log(`[Feedback] Generating behavioral analysis...`);
    const behavioral_analysis = await analyzeBehavior(history, language, session.id);

    logApiUsageToCsv(session);
    return {
      overall_score,
      score_breakdown: completeBreakdown,
      strengths: llmFeedback.strengths || [],
      weaknesses: llmFeedback.weaknesses || [],
      detailed_summary: llmFeedback.detailed_summary || '',
      behavioral_analysis
    };
  } catch (err) {
    console.error('[Feedback] Failed to parse JSON from LLM:', response?.choices?.[0]?.message?.content);
    return {
      overall_score,
      score_breakdown: completeBreakdown,
      strengths: ['Failed to generate strengths.'],
      weaknesses: ['Failed to generate weaknesses.'],
      detailed_summary: 'Failed to generate summary.',
      behavioral_analysis: {
        confidenceLevel: "Error",
        clarity: "Error",
        communicationStyle: "Failed to evaluate behavior.",
        behavioralNotes: []
      }
    };
  }
}
