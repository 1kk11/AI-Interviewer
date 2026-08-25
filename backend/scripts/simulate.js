import { evaluateAnswer } from '../agents/live_runtime_agents/evaluator_agent.js';
import { generateResponse } from '../agents/live_runtime_agents/interviewer_agent.js';
import { generateFeedback } from '../pipeline/feedback.js';
import { getActiveQuestion } from '../pipeline/retrieval.js';
import { createSession } from '../session/sessionStore.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function runSimulation() {
  console.log("=== STARTING INTERVIEW SIMULATION ===");

  const createdSession = createSession('en');
  Object.assign(createdSession, {
    status: "in-progress",
    currentQuestionIndex: 1,
    followUpCount: 0,
    history: [],
    dynamicQuestions: [
      {
        id: "q01",
        category: "technical",
        difficulty: "medium",
        question: "Explain what a Closure is in JavaScript and how it is used.",
        idealAnswer: "A closure is the combination of a function bundled together with references to its surrounding state.",
        rubricKeyphrases: ["function scope", "lexical environment"]
      },
      {
        id: "q02",
        category: "technical",
        difficulty: "medium",
        question: "Describe how Promises work in JavaScript.",
        idealAnswer: "Promises represent eventual completion.",
        rubricKeyphrases: ["asynchronous operation", "pending", "fulfilled", "rejected"]
      },
      {
        id: "q03",
        category: "technical",
        difficulty: "medium",
        question: "What is React state?",
        idealAnswer: "State is local data storage for a component.",
        rubricKeyphrases: ["local storage", "component"]
      }
    ]
  });

  const session = {
    ...createdSession,
    followUpCount: 0,
    history: [],
    currentQuestionIndex: 1,
    dynamicQuestions: createdSession.dynamicQuestions
  };

  // Add initial system message to history
  session.history.push({ role: 'interviewer', content: "Hello! Let's start the interview." });

  const testSteps = [
    { step: 1, transcript: "Closure is a function with lexical environment and function scope." },
    { step: 2, transcript: "Promises are for asynchronous operation and can be pending, fulfilled, or rejected." },
    { step: 3, transcript: "State is local storage for a component." },
    { step: 4, transcript: "I'll do data cleaning, model selection, evaluation, problem framing, feature engineering, and honest reflection on what didn't work and lessons learned." },
    { step: 5, transcript: "A p-value is the probability under the null hypothesis, and a misinterpretation is that it's the probability the null is true. It measures statistical significance, not practical significance. Usually p < 0.05 is the threshold." }
  ];

  for (const t of testSteps) {
    console.log(`\n\n--- STEP ${t.step} ---`);
    console.log(`CANDIDATE: "${t.transcript}"`);

    const qId = `q0${session.currentQuestionIndex}`;
    const activeQuestion = await getActiveQuestion(qId, 'en', session, true);
    
    if (!activeQuestion) {
      console.log(`No active question found for ${qId}. Ending interview.`);
      break;
    }

    // 1. Evaluate
    console.log(`\n[Evaluating...]`);
    const evaluation = await evaluateAnswer(t.transcript, activeQuestion, session.language);
    console.log(`Coverage: ${evaluation.coveragePercent}%`);
    console.log(`Keyphrases: ${evaluation.keyphraseResults.map(k => `${k.keyphrase}(${k.status})`).join(', ')}`);

    // 2. Routing Decision
    let routingDecision = { action: 'advance', missedKeyphrases: [] };
    session.followUpCount = 0;
    console.log(`[Routing Decision]: ${routingDecision.action} (Follow-up count after this: ${session.followUpCount})`);

    // Add to history
    session.history.push({ role: 'candidate', content: t.transcript, evaluation, questionId: qId });

    // 3. Generate Interviewer Response
    console.log(`\n[Generating Interviewer Response...]`);
    const aiResponse = await generateResponse(t.transcript, session, routingDecision);
    console.log(`INTERVIEWER: "${aiResponse.text}"`);

    session.history.push({ role: 'interviewer', content: aiResponse.text });

    if (routingDecision.action === 'advance' && activeQuestion) {
      session.currentQuestionIndex++;
      console.log(`[Advancing to Question ${session.currentQuestionIndex}]`);
    }
  }

  // Generate Feedback Report
  console.log(`\n\n=== VERIFICATION RESULTS ===`);
  console.log(`Final dynamicQuestions length: ${session.dynamicQuestions.length} (Expected: 5)`);
  const feedback = await generateFeedback(session);
  console.log(`Final score_breakdown length: ${feedback.score_breakdown.length} (Expected: 5)`);
  console.log(`Score Breakdown:`);
  console.log(JSON.stringify(feedback.score_breakdown, null, 2));
}

runSimulation().catch(console.error);
