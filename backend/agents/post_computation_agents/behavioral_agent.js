import fs from 'fs';
import { callAzureOpenAI } from '../../utils/azureOpenAI.js';

/**
 * Agent 4: The Behavioral Analyzer
 * Analyzes the entire transcript at the end of the interview to assess the candidate's behavior.
 * 
 * @param {Array} history - The full session history array.
 * @param {string} language - Target language ('en', 'hi', 'de').
 * @param {string} sessionId - Active session ID.
 * @returns {Promise<object>} - A structured JSON object containing behavioral insights.
 */
export async function analyzeBehavior(history, language = 'en', sessionId) {
  if (!history || history.length === 0) {
    return {
      confidenceLevel: "Unknown",
      clarity: "Unknown",
      communicationStyle: "Insufficient data.",
      behavioralNotes: ["The interview was too short to determine behavioral characteristics."]
    };
  }

  // Format the transcript for the LLM
  const transcript = history
    .filter(m => m.role === 'ai' || m.role === 'candidate' || m.role === 'interviewer')
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n');

  const langName = language === 'de' ? 'German' : language === 'hi' ? 'Hindi' : 'English';

  let _promptTemplate = null;
  function getPromptTemplate() {
    if (!_promptTemplate) {
      try {
        const promptPath = new URL('../../prompts/behavioral_prompt.md', import.meta.url).pathname;
        const normalizedPath = process.platform === 'win32' ? promptPath.substring(1) : promptPath;
        _promptTemplate = fs.readFileSync(normalizedPath, 'utf-8');
      } catch (e) {
        console.error('[BehavioralAgent] Failed to load prompt:', e);
        _promptTemplate = '';
      }
    }
    return _promptTemplate;
  }

  const systemPrompt = getPromptTemplate()
    .replace('{{LANG_NAME}}', langName);

  try {
    const response = await callAzureOpenAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `INTERVIEW TRANSCRIPT:\n\n${transcript.slice(0, 8000)}` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      sessionId,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    // Reliably extract JSON object from the response string
    let jsonStr = '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);

    return {
      confidenceLevel: parsed.confidenceLevel || 'Unknown',
      clarity: parsed.clarity || 'Unknown',
      communicationStyle: parsed.communicationStyle || 'Analysis unavailable.',
      behavioralNotes: parsed.behavioralNotes || [],
    };
  } catch (err) {
    console.warn('[BehavioralAgent] Failed to analyze behavior with Azure OpenAI:', err.message);
    return {
      confidenceLevel: "Error",
      clarity: "Error",
      communicationStyle: "Failed to generate behavioral analysis.",
      behavioralNotes: []
    };
  }
}
