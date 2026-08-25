import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callAzureOpenAI } from '../../utils/azureOpenAI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.join(__dirname, '../../prompts/analyzer_prompt.md');

let _promptTemplate = null;
function getPromptTemplate() {
  if (!_promptTemplate) {
    try {
      _promptTemplate = fs.readFileSync(PROMPT_PATH, 'utf-8');
    } catch (e) {
      console.error('[AnalyzerAgent] Failed to load prompt:', e);
      _promptTemplate = '';
    }
  }
  return _promptTemplate;
}

export async function analyzeContext(resumeText, jdText, jobTitle, sessionId) {
  if (!resumeText && !jdText) return null;

  let systemPrompt = getPromptTemplate();
  systemPrompt = systemPrompt
    .replace('{{JOB_TITLE}}', jobTitle || 'Technical Role')
    .replace('{{RESUME_TEXT}}', resumeText ? resumeText.slice(0, 1000) : 'None provided.')
    .replace('{{JD_TEXT}}', jdText ? jdText.slice(0, 1000) : 'None provided.');

  try {
    const response = await callAzureOpenAI({
      messages: [
        { role: 'system', content: 'You are an expert Technical Recruiter generating JSON output.' },
        { role: 'user', content: systemPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      sessionId,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn('[AnalyzerAgent] Failed to analyze context with Azure OpenAI:', err.message);
    return null;
  }
}
