/** Types for Master Bot config (User 1-8) */
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

/** Types for Worker Bot config (User4Worker) */
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

/** Types for dynamic config (Web Admin) */
export interface DynamicUser {
  id: string;
  env_key?: string; // maps to USER_{env_key}_EMAIL / PASSWORD
  name?: string;
  poster_name?: string;
  sheet_url?: string;
  contact_phone?: string;
  group_ids?: string[]; // FB groups mapped to this user
  blacklist_groups?: string[];
}

export interface DynamicGroup {
  id: string;
  name?: string;
  fb_group_id: string;
  province?: string;
  province_note?: string;
  sheet_url?: string;
  blacklist_groups?: string[];
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
  group_ids?: string[];
  doer_name?: string;
  user_id: string;
  /** @deprecated Use job_ids instead */
  job_id?: string;
}

export interface DynamicConfig {
  users: (DynamicUser & { email?: string; password?: string })[];
  groups: DynamicGroup[];
  jobs: DynamicJob[];
  assignments: DynamicAssignment[];
}
