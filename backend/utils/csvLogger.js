import fs from 'fs';
import path from 'path';

/**
 * Logs API usage for a session into a CSV file in the root folder.
 */
export function logApiUsageToCsv(session) {
  try {
    const rootPath = path.resolve(process.cwd()); // Backend root
    const csvFilePath = path.join(rootPath, 'api_usage_log.csv');

    const fileExists = fs.existsSync(csvFilePath);
    
    // Create header if file doesn't exist
    if (!fileExists) {
      fs.writeFileSync(csvFilePath, 'Timestamp,Session ID,Job Role,Company Name,ChatGPT (LLM) Calls,STT Calls,Total API Calls\n', 'utf8');
    }

    const timestamp = session.createdAt || new Date().toISOString();
    const role = session.jobTitle ? session.jobTitle.replace(/,/g, '') : 'N/A';
    const company = session.companyName ? session.companyName.replace(/,/g, '') : 'N/A';
    const llmCalls = session.llmCallCount || session.apiCallCount || 0;
    const sttCalls = session.sttCallCount || 0;
    const totalCalls = llmCalls + sttCalls;

    const row = `${timestamp},${session.id},${role},${company},${llmCalls},${sttCalls},${totalCalls}\n`;
    
    fs.appendFileSync(csvFilePath, row, 'utf8');
    console.log(`[API Tracker] Logged usage for session ${session.id} (LLM: ${llmCalls}, STT: ${sttCalls}, Total: ${totalCalls}) to ${csvFilePath}`);
  } catch (err) {
    console.error('[API Tracker] Failed to log API usage to CSV:', err.message);
  }
}
