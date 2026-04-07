/**
 * บันทึก Post Log ลง Database (รูปแบบ Log File)
 * วันที่-เวลา | ผู้โพสต์ | เจ้าของงาน | ชื่องาน | หน่วยงาน | ชื่อกลุ่ม | จำนวนสมาชิก | ลิงก์โพสต์ | สถานะ | จำนวน Comment | เบอร์โทรลูกค้า
 */
const API_URL = process.env.RUN_LOG_API_URL || 'http://localhost:3000';

export interface PostLogData {
  poster_name: string;
  owner: string;
  job_title: string;
  company: string;
  group_name: string;
  member_count: string;
  post_link: string;
  post_status: string;
  comment_count?: number;
  customer_phone?: string;
  assignment_id?: string;
  user_id?: string;
  job_id?: string;
  group_id?: string;
}

const POST_LOG_FETCH_MS = Math.min(60000, Math.max(3000, Number(process.env.POST_LOG_FETCH_MS) || 12000));

export async function postLog(data: PostLogData): Promise<void> {
  const runId = process.env.RUN_ID;
  if (!runId) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), POST_LOG_FETCH_MS);
    try {
      await fetch(`${API_URL}/api/post-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, run_id: runId }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Silent fail — อย่าค้างบอทถ้า API ไม่ตอบ
  }
}
