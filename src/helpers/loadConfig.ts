import * as fs from 'fs';
import * as path from 'path';
import type {
  MasterConfig,
  WorkerConfig,
  DynamicConfig,
  DynamicUser,
  DynamicGroup,
  DynamicJob,
  DynamicAssignment,
} from '../types/config';

const DEFAULT_SHEET_URL =
  process.env.DEFAULT_SHEET_URL ||
  'https://script.google.com/macros/s/AKfycbzqB97xnjUC7QZwTq2QnXUI372lxsO9acZTVxXJ3HF9G-T71h-HqccaNyMR6E612MYQ/exec';

/**
 * โหลด config โดยลอง lowercase ก่อน (แนะนำสำหรับ cross-platform)
 * แล้ว fallback เป็น PascalCase ถ้าไม่เจอ
 */
function findConfigPath(baseName: string): string {
  const cwd = process.cwd();
  const lower = path.join(cwd, `${baseName.toLowerCase()}.json`);
  const pascal = path.join(cwd, `${baseName}.json`);

  if (fs.existsSync(lower)) return lower;
  if (fs.existsSync(pascal)) return pascal;
  return lower; // คืนค่า default เพื่อให้ error message ชัดเจน
}

function loadUserFileContent(userId: number): { path: string; data: unknown } | null {
  const baseName = `user${userId}`;
  const names = [`user${userId}.json`, `User${userId}.json`];
  for (const name of names) {
    const p = path.join(process.cwd(), name);
    if (fs.existsSync(p)) {
      return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf-8')) };
    }
  }
  if (userId === 4) {
    for (const name of ['user4worker.json', 'User4Worker.json']) {
      const p = path.join(process.cwd(), name);
      if (fs.existsSync(p)) {
        return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf-8')) };
      }
    }
  }
  return null;
}

/**
 * โหลด Master Config จาก PostgreSQL (เมื่อมี DATABASE_URL)
 */
async function loadMasterConfigFromDb(userId: number): Promise<MasterConfig> {
  const db = require('../../server/db');
  const users = await db.getUsers();
  const user = users.find((u: { env_key: string }) => String(u.env_key) === String(userId));
  if (!user) {
    throw new Error(`❌ ไม่พบ User ${userId} ในฐานข้อมูล (env_key=${userId})`);
  }

  const assignments = await db.getAssignmentsByUserId(user.id);
  const groups = await db.getGroups();
  const groupMap = new Map(groups.map((g: { id: string; fb_group_id: string }) => [g.id, g.fb_group_id]));

  const posts: Array<{
    title: string;
    owner: string;
    company: string;
    caption: string;
    apply_link?: string;
    comment_reply?: string;
    groupID: string[];
  }> = [];

  const jobIdsFromAssignment = (a: { job_ids?: string[]; job_id?: string }) =>
    Array.isArray(a.job_ids) && a.job_ids.length > 0 ? a.job_ids : (a.job_id ? [a.job_id] : []);
  const assignmentGroupIds = (a: { group_ids?: string[] }) => (Array.isArray(a.group_ids) ? a.group_ids : []);

  for (const a of assignments) {
    const fbGroupIds = (assignmentGroupIds(a).length > 0 ? assignmentGroupIds(a) : (user.group_ids || []))
      .map((gid: string) => groupMap.get(gid))
      .filter((id): id is string => !!id);
    for (const jid of jobIdsFromAssignment(a)) {
      const job = await db.getJobById(jid);
      if (!job) continue;
      if (fbGroupIds.length === 0) continue;
      posts.push({
        title: job.title,
        owner: job.owner,
        company: job.company,
        caption: job.caption,
        apply_link: job.apply_link || undefined,
        comment_reply: job.comment_reply || undefined,
        groupID: fbGroupIds,
      });
    }
  }

  const base = `USER_${String(user.env_key || user.id)}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const email = (user as { email?: string }).email || process.env[`${base}_EMAIL`] || '';
  const password = (user as { password?: string }).password || process.env[`${base}_PASSWORD`] || '';

  return {
    account: {
      email,
      password,
      poster_name: user.poster_name || user.name || `User ${userId}`,
      sheet_url: DEFAULT_SHEET_URL || user.sheet_url || undefined,
      blacklist_groups: user.blacklist_groups || [],
    },
    post_settings: user.post_settings || {},
    content: { posts },
  };
}

/**
 * โหลด Master Config (User 1-8)
 * - เมื่อมี DATABASE_URL: อ่านจาก PostgreSQL
 * - ไม่มี: อ่านจาก user{n}.json / User{n}.json
 * User 4: รองรับ User4.json หรือ User4Worker.json (แปลงเป็น structure เดียวกัน)
 */
export async function loadMasterConfig(userId: number): Promise<MasterConfig> {
  if (process.env.DATABASE_URL) {
    return loadMasterConfigFromDb(userId);
  }
  const loaded = loadUserFileContent(userId);
  if (!loaded) {
    throw new Error(
      `❌ หาไฟล์ config ไม่เจอ: user${userId}.json หรือ User${userId}.json\n` +
        `กรุณาสร้างไฟล์ที่: ${path.join(process.cwd(), `user${userId}.json`)} หรือตั้งค่า DATABASE_URL`
    );
  }
  const data = loaded.data as Record<string, unknown>;
  if (data.tasks && !data.content) {
    return workerToMaster(data as WorkerConfig);
  }
  return data as MasterConfig;
}

function workerToMaster(worker: WorkerConfig): MasterConfig {
  const posts = (worker.tasks || []).map((task) => ({
    ...task.post_content,
    groupID: task.groupID || [],
    apply_link: task.post_content?.apply_link || '',
  }));
  return {
    account: {
      ...worker.account,
      poster_name: worker.account?.poster_name || 'User 4',
      sheet_url: worker.account?.sheet_url || DEFAULT_SHEET_URL || '',
      blacklist_groups: worker.account?.blacklist_groups || [],
    },
    post_settings: worker.post_settings,
    content: { posts },
  };
}

/**
 * โหลด Worker Config จาก PostgreSQL (เมื่อมี DATABASE_URL)
 */
async function loadWorkerConfigFromDb(): Promise<WorkerConfig> {
  const db = require('../../server/db');
  const users = await db.getUsers();
  const user = users.find((u: { env_key: string }) => String(u.env_key) === '4');
  if (!user) {
    throw new Error('❌ ไม่พบ User 4 ในฐานข้อมูล (env_key=4)');
  }

  const assignments = await db.getAssignmentsByUserId(user.id);
  const groups = await db.getGroups();
  const groupMap = new Map(groups.map((g: { id: string; fb_group_id: string }) => [g.id, g.fb_group_id]));

  const jobIdsFromAssignment = (a: { job_ids?: string[]; job_id?: string }) =>
    Array.isArray(a.job_ids) && a.job_ids.length > 0 ? a.job_ids : (a.job_id ? [a.job_id] : []);
  const assignmentGroupIds = (a: { group_ids?: string[] }) => (Array.isArray(a.group_ids) ? a.group_ids : []);

  const tasks: WorkerConfig['tasks'] = [];
  for (const a of assignments) {
    const fbGroupIds = (assignmentGroupIds(a).length > 0 ? assignmentGroupIds(a) : (user.group_ids || []))
      .map((gid: string) => groupMap.get(gid))
      .filter((id): id is string => !!id);
    for (const jid of jobIdsFromAssignment(a)) {
      const job = await db.getJobById(jid);
      if (!job) continue;
      if (fbGroupIds.length === 0) continue;
      tasks.push({
        province: job.job_type || '',
        groupID: fbGroupIds,
        post_content: {
          title: job.title,
          owner: job.owner,
          company: job.company,
          jobType: job.job_type || undefined,
          caption: job.caption,
          comment_reply: job.comment_reply || '',
        },
      });
    }
  }

  const base = `USER_${String(user.env_key || user.id)}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const email = (user as { email?: string }).email || process.env[`${base}_EMAIL`] || '';
  const password = (user as { password?: string }).password || process.env[`${base}_PASSWORD`] || '';

  return {
    account: {
      email,
      password,
      poster_name: user.poster_name || user.name || 'User 4',
      sheet_url: DEFAULT_SHEET_URL || user.sheet_url || undefined,
    },
    post_settings: (user.post_settings as WorkerConfig['post_settings']) || {
      delay_between_posts_min: 10,
      delay_between_posts_max: 20,
    },
    tasks,
  };
}

/**
 * โหลด Worker Config (User 4)
 * - เมื่อมี DATABASE_URL: อ่านจาก PostgreSQL
 * - ไม่มี: อ่านจาก User4.json, User4Worker.json
 */
export async function loadWorkerConfig(): Promise<WorkerConfig> {
  if (process.env.DATABASE_URL) {
    return loadWorkerConfigFromDb();
  }
  const loaded = loadUserFileContent(4);
  if (!loaded) {
    throw new Error(
      `❌ หาไฟล์ config ไม่เจอ: user4.json หรือ User4Worker.json\n` +
        `กรุณาสร้างไฟล์ที่: ${path.join(process.cwd(), 'user4.json')} หรือตั้งค่า DATABASE_URL`
    );
  }
  const data = loaded.data as Record<string, unknown>;
  if (data.tasks && !data.content) {
    return data as WorkerConfig;
  }
  return masterToWorker(data as MasterConfig);
}

function masterToWorker(master: MasterConfig): WorkerConfig {
  const tasks = (master.content?.posts || []).map((post) => ({
    province: '',
    groupID: post.groupID || [],
    post_content: {
      title: post.title,
      owner: post.owner,
      company: post.company,
      jobType: (post as { jobType?: string }).jobType,
      caption: post.caption,
      comment_reply: post.comment_reply || '',
    },
  }));
  return {
    account: master.account,
    post_settings: (master.post_settings as WorkerConfig['post_settings']) || {
      delay_between_posts_min: 10,
      delay_between_posts_max: 20,
    },
    tasks,
  };
}

function mergeCredentials<T extends { env_key?: string; id: string; email?: string; password?: string }>(
  users: T[]
): (T & { email: string; password: string })[] {
  return users.map((u) => {
    const email = u.email || (() => {
      const base = `USER_${String(u.env_key || u.id)}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      return process.env[`${base}_EMAIL`] || '';
    })();
    const password = u.password || (() => {
      const base = `USER_${String(u.env_key || u.id)}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      return process.env[`${base}_PASSWORD`] || '';
    })();
    return { ...u, email, password };
  });
}

/**
 * โหลด Dynamic Config จาก PostgreSQL (เมื่อมี DATABASE_URL) หรือ data/*.json
 * .env: USER_{env_key}_EMAIL, USER_{env_key}_PASSWORD
 */
export async function loadDynamicConfig(): Promise<DynamicConfig> {
  if (process.env.DATABASE_URL) {
    const db = require('../../server/db');
    const { users, groups, jobs, assignments } = await db.getDynamicConfig();
    return {
      users: mergeCredentials(users),
      groups,
      jobs,
      assignments,
    };
  }

  const dataDir = path.join(process.cwd(), 'data');
  function readEntity<T>(entity: string): T[] {
    const filePath = path.join(dataDir, `${entity}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T[];
    } catch {
      return [];
    }
  }

  const usersRaw = readEntity<DynamicUser>('users');
  const groups = readEntity<DynamicGroup>('groups');
  const jobs = readEntity<DynamicJob>('jobs');
  const assignments = readEntity<DynamicAssignment>('assignments');

  return {
    users: mergeCredentials(usersRaw),
    groups,
    jobs,
    assignments,
  };
}
