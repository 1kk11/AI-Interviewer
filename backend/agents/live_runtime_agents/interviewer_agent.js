import fs from 'fs';
import { getActiveQuestion, findGroundingMatches } from '../../pipeline/retrieval.js';
import { updateSession } from '../../session/sessionStore.js';
import { callAzureOpenAI } from '../../utils/azureOpenAI.js';

/**
 * Clean internal thinking/reasoning tags (e.g. <think>...</think>) from model responses.
 */
function cleanModelOutput(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. If text has spoken output outside <think>...</think>, extract it
  const outerSpoken = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (outerSpoken) {
    cleaned = outerSpoken;
  } else {
    // 2. If response was wrapped inside <think>, extract Draft: "..." or clean tags
    const draftMatch = cleaned.match(/Draft:\s*["']?([^"'\n\r]+)["']?/i) || cleaned.match(/["']([^"'\n\r]{10,})["']/i);
    if (draftMatch && draftMatch[1]) {
      cleaned = draftMatch[1].trim();
    } else {
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '').trim();
    }
  }

  // 3. Remove markdown code fences
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  return cleaned;
}

/**
 * Generate the AI's response to the user's transcript.
 * Retrieves grounding context, builds prompt, and calls Azure OpenAI (gpt-4o-mini).
 *
 * @param {string} userTranscript - The STT output of the candidate's answer
 * @param {object} session - The current session object from the store
 * @param {object} [routingDecision=null] - Orchestrator's routing instruction
 * @returns {Promise<object>} The generated AI response object
 */
export async function generateResponse(userTranscript, session, routingDecision = null) {
  const { id: sessionId, language, history } = session;

  const langName = language === 'de' ? 'German' : language === 'hi' ? 'Hindi' : 'English';

  // ── 0. Handle Time Up / Conclusion Phase Intercept ──────────────
  if (session.isTimeUp) {
    if (session.conclusionPhase === 'none') {
      updateSession(sessionId, { conclusionPhase: 'wrap_up_asked' });
      const wrapUpText =
        language === 'de'
          ? 'Vielen Dank für Ihre Zeit heute. Damit ist der technische Teil unseres Interviews abgeschlossen. Haben Sie noch abschließende Fragen an mich zu Ihrer Leistung oder der Rolle, bevor wir fertig sind?'
          : language === 'hi'
          ? 'आज अपना समय देने के लिए धन्यवाद। इसके साथ हमारे इंटरव्यू का तकनीकी हिस्सा समाप्त होता है। समाप्त करने से पहले, क्या आपके पास मेरे लिए अपनी परफॉर्मेंस या इस रोल के बारे में कोई अंतिम प्रश्न हैं?'
          : 'Thank you for your time today. That concludes the technical portion of our interview. Do you have any final questions for me about your performance or the role before we finish?';

      history.push({ role: 'interviewer', content: wrapUpText });
      updateSession(sessionId, { history });
      return { text: wrapUpText, advanced: false, isComplete: false };
    }

    if (session.conclusionPhase === 'wrap_up_asked') {
      updateSession(sessionId, { conclusionPhase: 'answering', status: 'completed' });

      // Construct a tailored prompt to answer diplomatically and say goodbye
      const historyText = (history || [])
        .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n\n');

      const systemInstruction = `You are a formal, polite ${langName}-speaking HR Hiring Manager wrapping up a technical screening call.
The candidate was asked if they have any final questions about their performance or the role.

Candidate's response: "${userTranscript}"

CONVERSATION HISTORY (for context):
${historyText.slice(-6000)}

YOUR MANDATES:
1. Speak strictly in ${langName}.
2. Keep your spoken response concise (2-4 sentences maximum).
3. Do NOT output any thinking, reasoning tags, or metadata. Output ONLY your direct spoken words.
4. If the candidate says "no", has no questions, remains silent, or gives unclear/short phrases (e.g. noise, "thanks", "ok"), politely thank them for their time today, express appreciation for speaking with them, wish them a wonderful day, say goodbye, and stop. Do NOT say "it seems there was a misunderstanding".
5. If the candidate asks an actual substantive question (such as about their performance/feedback, the company, or next steps):
   - Answer their question politely, constructively, and diplomatically.
   - If they ask about their performance, look at the conversation history. Summarize it diplomatically, focusing on encouraging them, highlighting what they did well (e.g. key technical concepts covered), and mention that the final evaluation will be processed.
   - Crucially, in the SAME response after answering their question, conclude the interview by saying thank you and goodbye. Do not invite further questions.`;

      try {
        const response = await callAzureOpenAI({
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userTranscript || 'Thank you.' }
          ],
          temperature: 0.5,
          sessionId,
        });

        const rawContent = response.choices[0]?.message?.content || '';
        const cleaned = cleanModelOutput(rawContent);

        history.push({ role: 'interviewer', content: cleaned });
        updateSession(sessionId, { history });

        return { text: cleaned, advanced: false, isComplete: true };
      } catch (err) {
        console.error('[InterviewerAgent] Failed to generate wrap-up response:', err);
        const goodbye =
          language === 'de'
            ? 'Vielen Dank für Ihre Zeit. Einen schönen Tag noch und auf Wiedersehen.'
            : language === 'hi'
            ? 'अपना समय देने के लिए धन्यवाद। आपका दिन शुभ हो, अलविदा!'
            : 'Thank you for your time. Have a pleasant day, and goodbye.';
        history.push({ role: 'interviewer', content: goodbye });
        updateSession(sessionId, { history });
        return { text: goodbye, advanced: false, isComplete: true };
      }
    }

    // Fallback if called again
    const finalGoodbye =
      language === 'de'
        ? 'Das Interview ist abgeschlossen. Auf Wiedersehen.'
        : language === 'hi'
        ? 'इंटरव्यू समाप्त हो गया है। अलविदा!'
        : 'The interview is complete. Goodbye.';
    return { text: finalGoodbye, advanced: false, isComplete: true };
  }

  const questionIndex = session.currentQuestionIndex + 1;
  const questionId = `q${questionIndex.toString().padStart(2, '0')}`;

  console.log(`[LLM] Fetching context for ${questionId} (${language})...`);

  // 1. Fetch deterministic or dynamic context for the current question
  const activeQuestion = await getActiveQuestion(questionId, language, session);

  if (!activeQuestion) {
    updateSession(sessionId, { status: 'completed' });
    const text =
      language === 'de'
        ? 'Das Interview ist abgeschlossen. Vielen Dank für Ihre Zeit!'
        : language === 'hi'
        ? 'इंटरव्यू पूरा हो गया है। अपना समय देने के लिए धन्यवाद!'
        : 'The interview is complete. Thank you for your time!';
    return { text, advanced: false, isComplete: true };
  }

  const nextQuestionId = `q${(questionIndex + 1).toString().padStart(2, '0')}`;
  const nextQuestion = await getActiveQuestion(nextQuestionId, language, session);

  // Optional background context — strictly subordinated to the main question flow
  let backgroundContext = '';
  if (questionIndex === 1 && session.candidateContextSummary) {
    backgroundContext = `\n\nBACKGROUND CANDIDATE CONTEXT (Optional reference only — DO NOT override the primary question topic): ${session.candidateContextSummary}`;
  } else if (session.jobTitle || session.companyName) {
    backgroundContext = `\n\nBACKGROUND ROLE (Optional reference): Target Position is ${session.jobTitle || 'N/A'}${session.companyName ? ` at ${session.companyName}` : ''}`;
  }

  let conversationRules = '';
  
  if (routingDecision?.action === 'follow_up') {
    conversationRules = `- Speak strictly in ${langName}.
- The orchestrator has decided to ASK A FOLLOW-UP QUESTION.
- The candidate missed these key concepts: ${routingDecision.missedKeyphrases.join(', ')}.
- Your ONLY job right now is to ask ONE natural follow-up question digging into these missing concepts.
- NEVER read back rubrics or internal instructions. Act like a human interviewer on a video call.`;
  } else if (routingDecision?.action === 'advance') {
    conversationRules = `- Speak strictly in ${langName}.
- The orchestrator has decided to ADVANCE to the next topic.
- Acknowledge the candidate's previous answer briefly and naturally, then ASK THE NEXT TOPIC: ${nextQuestion ? `"${nextQuestion.question}"` : 'None, wrap up the interview.'}
- NEVER read back rubrics or internal instructions. Act like a human interviewer on a video call.`;
  } else {
    conversationRules = `- Speak strictly in ${langName}.
- Ask the current target question naturally.
- NEVER read back rubrics or internal instructions. Act like a human interviewer on a video call.`;
  }

  let _promptTemplate = null;
  function getPromptTemplate() {
    if (!_promptTemplate) {
      try {
        const promptPath = new URL('../../prompts/interviewer_prompt.md', import.meta.url).pathname;
        // Fix for windows paths from URL
        const normalizedPath = process.platform === 'win32' ? promptPath.substring(1) : promptPath;
        _promptTemplate = fs.readFileSync(normalizedPath, 'utf-8');
      } catch (e) {
        console.error('[InterviewerAgent] Failed to load prompt:', e);
        _promptTemplate = '';
      }
    }
    return _promptTemplate;
  }

  const systemInstruction = getPromptTemplate()
    .replace(/\{\{LANG_NAME\}\}/g, langName)
    .replace(/\{\{TARGET_QUESTION\}\}/g, activeQuestion.question || '')
    .replace('{{IDEAL_ANSWER}}', activeQuestion.idealAnswer || '')
    .replace('{{RUBRIC_KEYPHRASES}}', activeQuestion.rubricKeyphrases || '')
    .replace('{{NEXT_TOPIC}}', nextQuestion ? `"${nextQuestion.question}"` : 'None, end of interview.')
    .replace('{{BACKGROUND_CONTEXT}}', backgroundContext)
    .replace('{{CONVERSATION_RULES}}', conversationRules);

  const messages = [{ role: 'system', content: systemInstruction }];

  // Keep only the 4 most recent turns to prevent token bloat
  const recentHistory = (history || []).slice(-4);
  for (const turn of recentHistory) {
    const role = turn.role === 'interviewer' ? 'assistant' : 'user';
    messages.push({ role, content: turn.content });
  }

  // Add the new user message only if it wasn't already added from history
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== userTranscript) {
    messages.push({ role: 'user', content: userTranscript });
  }

  console.log(`[LLM Interviewer] Calling Azure OpenAI (gpt-4o-mini)...`);

  let response;
  try {
    response = await callAzureOpenAI({
      messages,
      temperature: 0.6,
      max_tokens: 300,
      sessionId,
    });
  } catch (err) {
    console.error(`[Interviewer] Azure OpenAI Error: ${err.message}`);
    response = { choices: [{ message: { content: 'I understand. Let us proceed to the next topic.' } }] };
  }

  const rawAiText = response.choices[0]?.message?.content || '';
  let aiText = cleanModelOutput(rawAiText);
  let isComplete = false;

  console.log(`[LLM Clean Spoken Output]: "${aiText}"`);

  if (routingDecision?.action === 'advance' && !nextQuestion) {
    isComplete = true;
    updateSession(sessionId, { status: 'completed' });
    const closing =
      language === 'de'
        ? ' Das Interview ist abgeschlossen. Vielen Dank für Ihre Zeit!'
        : language === 'hi'
        ? ' इंटरव्यू पूरा हो गया है। अपना समय देने के लिए धन्यवाद!'
        : ' The interview is complete. Thank you for your time!';
    // Only append closing if the model didn't already say it
    if (!aiText.toLowerCase().includes('complete') && !aiText.toLowerCase().includes('abgeschlossen') && !aiText.toLowerCase().includes('पूरा')) {
       aiText += closing;
    }
  } else if (session.conclusionPhase === 'answering') {
    isComplete = true;
    updateSession(sessionId, { status: 'completed' });
  }

  // Update session history with clean spoken text (candidate history is now appended in orchestrator)
  // Only push candidate if routingDecision is null (i.e. init phase) just in case
  if (!routingDecision) {
     history.push({ role: 'candidate', content: userTranscript });
  }
  history.push({ role: 'interviewer', content: aiText });
  updateSession(sessionId, { history });

  return { text: aiText, isComplete };
}
