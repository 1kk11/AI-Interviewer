/**
 * WebSocket Orchestrator (Phase 4)
 * Manages the flow of audio from the client -> STT -> LLM -> TTS -> client.
 */

import { getSession, updateSession } from '../session/sessionStore.js';
import { transcribeAudio } from './stt.js';
import { generateResponse } from '../agents/live_runtime_agents/interviewer_agent.js';
import { synthesizeAndStream } from './tts.js';
import { evaluateAnswer } from '../agents/live_runtime_agents/evaluator_agent.js';
import { getActiveQuestion } from './retrieval.js';

/**
 * Handle a new WebSocket connection.
 * @param {import('ws').WebSocket} ws
 */
export function handleConnection(ws) {
  let session = null;

  console.log('[WS] Client connected');

  ws.on('message', async (data, isBinary) => {
    try {
      if (!isBinary) {
        // Control message (JSON)
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'init') {
          session = getSession(msg.sessionId);
          if (!session) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid session ID' }));
            ws.close();
            return;
          }
          console.log(`[WS] Initialized pipeline for session ${session.id}`);
          ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
          ws.send(JSON.stringify({ type: 'question_update', questionNumber: session.currentQuestionIndex + 1 }));
          
          // Kick off the interview with the first question immediately
          if (session.history.length === 0) {
            ws.send(JSON.stringify({ type: 'status', status: 'thinking' }));
            const aiResponse = await generateResponse('Hello, I am ready to start.', session);
            ws.send(JSON.stringify({ type: 'transcript', text: aiResponse.text, role: 'ai' }));
            ws.send(JSON.stringify({ type: 'status', status: 'speaking' }));
            await synthesizeAndStream(aiResponse.text, ws, session.language);
            ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
          }
        }
        else if (msg.type === 'next_question') {
          if (session) {
            session.currentQuestionIndex++;
            ws.send(JSON.stringify({ type: 'question_update', questionNumber: session.currentQuestionIndex + 1 }));
            ws.send(JSON.stringify({ type: 'status', status: 'thinking' }));
            const aiResponse = await generateResponse('I am ready for the next question.', session);
            ws.send(JSON.stringify({ type: 'transcript', text: aiResponse.text, role: 'ai' }));
            ws.send(JSON.stringify({ type: 'status', status: 'speaking' }));
            await synthesizeAndStream(aiResponse.text, ws, session.language);
            
            if (session.status === 'completed' || aiResponse.isComplete) {
              ws.send(JSON.stringify({ type: 'completed' }));
            } else {
              ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
            }
          }
        }
        else if (msg.type === 'time_up') {
          if (session) {
            console.log(`[Orchestrator] Time is up for session ${session.id}. Initiating soft stop.`);
            session.isTimeUp = true;
          }
        }
      } else {
        // Binary message (User's audio chunk)
        if (!session) {
          console.warn('[WS] Received audio before init');
          return;
        }

        console.log(`[WS] Received audio blob (${data.length} bytes)`);
        
        // 1. STT
        ws.send(JSON.stringify({ type: 'status', status: 'transcribing' }));
        
        const questionIndex = session.currentQuestionIndex + 1;
        const questionId = `q${questionIndex.toString().padStart(2, '0')}`;
        const activeQuestion = await getActiveQuestion(questionId, session.language, session, true);

        const sttContext = {
          companyName: session.companyName,
          jobTitle: session.jobTitle,
          projectName: session.candidateImpressiveProject?.name,
          rubricKeyphrases: activeQuestion?.rubricKeyphrases || activeQuestion?.rubric_keyphrases || []
        };

        const transcript = await transcribeAudio(data, session.language, session.id, sttContext);
        
        console.log(`[WS] STT transcript value: ${JSON.stringify(transcript)}`);

        // Guard: discard empty or near-empty transcripts (< 3 words).
        // stt.js already filters Whisper filler tokens; this is belt-and-suspenders.
        const wordCount = transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
        if (!transcript || wordCount < 3) {
          console.log(`[WS] Transcript too short (${wordCount} word(s)) — treating as silence.`);
          ws.send(JSON.stringify({ type: 'transcript', text: "(No speech detected, please try again)", role: 'system' }));
          ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
          return;
        }
        
        ws.send(JSON.stringify({ type: 'transcript', text: transcript, role: 'user' }));

        // 2. Evaluate Answer (only during active technical interview, not during time-up wrap-up phase)
        ws.send(JSON.stringify({ type: 'status', status: 'thinking' }));
        
        let evaluation = null;
        let routingDecision = { action: 'advance', missedKeyphrases: [] };
        
        if (!session.isTimeUp && activeQuestion) {
          evaluation = await evaluateAnswer(transcript, activeQuestion, session.language, session.id);
          console.log(`[Orchestrator] Evaluation coverage: ${evaluation.coveragePercent}%`);
          
          if (evaluation.coveragePercent >= 60) {
            // Good answer -> advance
            routingDecision.action = 'advance';
            session.followUpCount = 0;
          } else if (evaluation.coveragePercent < 30) {
            // ROUTER LOGIC: Candidate bombed the initial question -> advance (skip follow-up)
            routingDecision.action = 'advance';
            session.followUpCount = 0;
            console.log(`[Router] Score < 30%. Skipping follow-up and moving to next question.`);
          } else if (session.followUpCount < 1) {
            // Partial answer (30-59%) -> ask follow-up
            routingDecision.action = 'follow_up';
            routingDecision.missedKeyphrases = evaluation.keyphraseResults.filter(k => k.status !== 'hit').map(k => k.keyphrase);
            session.followUpCount++;
          } else {
            // Already asked a follow-up -> advance
            routingDecision.action = 'advance';
            session.followUpCount = 0;
          }
          
          // Store evaluation on session
          session.history.push({ role: 'candidate', content: transcript, evaluation, questionId });
        } else {
          session.history.push({ role: 'candidate', content: transcript });
        }

        // 3. LLM Interviewer Response
        const aiResponse = await generateResponse(transcript, session, routingDecision);
        ws.send(JSON.stringify({ type: 'transcript', text: aiResponse.text, role: 'ai' }));

        // 4. TTS
        ws.send(JSON.stringify({ type: 'status', status: 'speaking' }));
        await synthesizeAndStream(aiResponse.text, ws, session.language);
        
        if (routingDecision.action === 'advance' && activeQuestion) {
          session.currentQuestionIndex++;
          ws.send(JSON.stringify({ type: 'question_update', questionNumber: session.currentQuestionIndex + 1 }));
        }

        if (session.status === 'completed' || aiResponse.isComplete) {
          ws.send(JSON.stringify({ type: 'completed' }));
        } else {
          ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
        }
      }
    } catch (err) {
      console.error('[WS] Error in pipeline:', err);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    session = null;
  });
}
