import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callAzureOpenAI } from '../../utils/azureOpenAI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.join(__dirname, '../../prompts/strategy_prompt.md');

let _promptTemplate = null;
function getPromptTemplate() {
  if (!_promptTemplate) {
    try {
      _promptTemplate = fs.readFileSync(PROMPT_PATH, 'utf-8');
    } catch (e) {
      console.error('[StrategyAgent] Failed to load prompt:', e);
      _promptTemplate = '';
    }
  }
  return _promptTemplate;
}

export async function generateStrategyQuestions(analysisContext, language = 'en', jobTitle, companyName, sessionId) {
  if (!analysisContext || !analysisContext.candidate || !analysisContext.job) return null;

  const langName = language === 'de' ? 'German' : language === 'hi' ? 'Hindi' : 'English';
  const { candidate, job } = analysisContext;

  let systemPrompt = getPromptTemplate();
  systemPrompt = systemPrompt
    .replace('{{JOB_TITLE}}', jobTitle || 'Technical Candidate')
    .replace('{{COMPANY_NAME}}', companyName ? ` at ${companyName}` : '')
    .replace('{{CANDIDATE_STRENGTHS}}', candidate.strengths ? candidate.strengths.join(', ') : 'N/A')
    .replace('{{CANDIDATE_WEAKNESS}}', candidate.weakness || 'N/A')
    .replace('{{CANDIDATE_PROJECT_NAME}}', candidate.impressiveProject?.name || 'N/A')
    .replace('{{CANDIDATE_PROJECT_SUMMARY}}', candidate.impressiveProject?.summary || 'N/A')
    .replace('{{JOB_CORE_SKILLS}}', job.coreSkills ? job.coreSkills.join(', ') : 'N/A')
    .replace('{{JOB_PRIMARY_RESPONSIBILITY}}', job.primaryResponsibility || 'N/A')
    .replace(/\{\{LANG_NAME\}\}/g, langName);

  try {
    const response = await callAzureOpenAI({
      messages: [
        { role: 'system', content: 'You are an expert Hiring Manager generating a structured interview question plan in valid JSON format.' },
        { role: 'user', content: systemPrompt },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
      sessionId,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    // Reliably extract JSON object/array from the response string
    let jsonStr = '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    return parsed.questions || parsed.data || null;
  } catch (err) {
    console.warn('[StrategyAgent] Failed to generate strategy questions with Azure OpenAI:', err.message);
    return null;
  }
}
