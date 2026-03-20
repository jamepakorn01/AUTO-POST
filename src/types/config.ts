/** โครงสร้าง config สำหรับ Master Bot (User 1-8) */
export interface MasterConfig {
  account: {
    email: string;
    password: string;
    poster_name?: string;
    sheet_url?: string;
    blacklist_groups?: string[];
  };
  browser_config?: { profile_name?: string };
  post_settings?: {
    delay_between_posts_min?: number;
    delay_between_posts_max?: number;
    batch_size?: number;
    break_time_min?: number;
    break_time_max?: number;
  };
  content: {
    posts: PostItem[];
  };
}

export interface PostItem {
  title: string;
  owner: string;
  company: string;
  apply_link?: string;
  caption: string;
  comment_reply?: string;
  groupID: string[];
}

/** โครงสร้าง config สำหรับ Worker Bot (User4Worker) */
export interface WorkerConfig {
  account: { email: string; password: string; poster_name?: string; sheet_url?: string };
  post_settings: {
    delay_between_posts_min: number;
    delay_between_posts_max: number;
  };
  tasks: WorkerTask[];
}

export interface WorkerTask {
  province: string;
  groupID: string[];
  post_content: {
    title: string;
    owner: string;
    company: string;
    jobType?: string;
    caption: string;
    comment_reply: string;
  };
}

/** โครงสร้างสำหรับ Dynamic Config (Web Admin) */
export interface DynamicUser {
  id: string;
  env_key?: string; // สำหรับ .env: USER_{env_key}_EMAIL, USER_{env_key}_PASSWORD
  name?: string;
  poster_name?: string;
  sheet_url?: string;
  group_ids?: string[]; // กลุ่ม FB ที่ User นี้ผูกไว้
  blacklist_groups?: string[];
}

export interface DynamicGroup {
  id: string;
  name?: string;
  fb_group_id: string;
  province?: string;
}

export interface DynamicJob {
  id: string;
  title: string;
  owner: string;
  company: string;
  caption: string;
  apply_link?: string;
  comment_reply?: string;
  status?: string;
}

export interface DynamicAssignment {
  id: string;
  job_ids: string[];
  user_id: string;
  /** @deprecated ใช้ job_ids แทน */
  job_id?: string;
}

export interface DynamicConfig {
  users: (DynamicUser & { email?: string; password?: string })[];
  groups: DynamicGroup[];
  jobs: DynamicJob[];
  assignments: DynamicAssignment[];
}
