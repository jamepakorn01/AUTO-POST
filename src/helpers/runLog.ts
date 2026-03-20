/**
 * บันทึก Log การทำงานลง Database ผ่าน API
 */
const API_URL = process.env.RUN_LOG_API_URL || 'http://localhost:3000';

export interface RunLogData {
  run_id: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  message: string;
  assignment_id?: string;
  user_id?: string;
  job_id?: string;
  group_id?: string;
  meta?: Record<string, unknown>;
}

export async function runLog(data: Omit<RunLogData, 'run_id'>): Promise<void> {
  const runId = process.env.RUN_ID;
  if (!runId) return;
  try {
    await fetch(`${API_URL}/api/run-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, run_id: runId }),
    });
  } catch {
    // Silent fail - don't break the bot if logging fails
  }
}
