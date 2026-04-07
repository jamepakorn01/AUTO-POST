-- AUTO-POST Database Schema
-- Schema: so_autopost_jobs (ตั้ง DB_SCHEMA ใน .env ถ้าต้องการเปลี่ยน)

CREATE SCHEMA IF NOT EXISTS so_autopost_jobs;
SET search_path TO so_autopost_jobs;

-- Users (บัญชี Facebook สำหรับโพสต์) - group_ids = กลุ่ม FB ที่ User นี้ผูกไว้
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  env_key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255),
  poster_name VARCHAR(255),
  sheet_url TEXT,
  email VARCHAR(255),
  password TEXT,
  group_ids JSONB DEFAULT '[]',
  blacklist_groups JSONB DEFAULT '[]',
  post_settings JSONB DEFAULT '{}',
  fb_access_token TEXT,
  contact_phone VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups (กลุ่ม Facebook)
CREATE TABLE IF NOT EXISTS groups (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255),
  fb_group_id VARCHAR(100) NOT NULL UNIQUE,
  province VARCHAR(100),
  province_note VARCHAR(255),
  sheet_url TEXT,
  blacklist_groups JSONB DEFAULT '[]',
  job_type VARCHAR(100),
  job_positions JSONB DEFAULT '[]',
  added_by VARCHAR(255),
  department VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- รายชื่อผู้เพิ่ม Group (สำหรับ dropdown)
CREATE TABLE IF NOT EXISTS group_adders (
  name VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs (งานที่สั่งโพสต์)
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  job_position VARCHAR(255),
  owner VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  province VARCHAR(255),
  province_note VARCHAR(255),
  caption TEXT NOT NULL,
  apply_link TEXT,
  comment_reply TEXT,
  job_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job Owners (รายการเจ้าของงานสำหรับ dropdown)
CREATE TABLE IF NOT EXISTS job_owners (
  name VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates (เทมเพลตงาน)
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  job_position VARCHAR(255),
  owner VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  caption TEXT NOT NULL,
  apply_link TEXT,
  comment_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(50) PRIMARY KEY,
  job_ids JSONB NOT NULL DEFAULT '[]',
  group_ids JSONB NOT NULL DEFAULT '[]',
  doer_name VARCHAR(255),
  department VARCHAR(255),
  user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ฐานเก่าที่ยังมีคอลัมน์ job_id แบบ NOT NULL: เซิร์ฟเวอร์จะพยายาม ALTER DROP NOT NULL ตอนสตาร์ท
-- ถ้า role ไม่มีสิทธิ์ ให้รันมือใน SQL editor (เปลี่ยน schema ให้ตรง DB):
-- ALTER TABLE so_autopost_jobs.assignments ALTER COLUMN job_id DROP NOT NULL;

-- Job positions (รายการตำแหน่งงานสำหรับ dropdown)
CREATE TABLE IF NOT EXISTS job_positions (
  name VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- รายชื่อผู้ทำ Assignment (สำหรับ dropdown)
CREATE TABLE IF NOT EXISTS assignment_doers (
  name VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Run Logs (บันทึกการทำงาน)
CREATE TABLE IF NOT EXISTS run_logs (
  id VARCHAR(50) PRIMARY KEY,
  run_id VARCHAR(50) NOT NULL,
  assignment_id VARCHAR(50),
  user_id VARCHAR(50),
  job_id VARCHAR(50),
  group_id VARCHAR(50),
  level VARCHAR(20) NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_logs_run ON run_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_created ON run_logs(created_at DESC);

-- Post Logs (รูปแบบตาม Log File: วันที่, ผู้โพสต์, เจ้าของงาน, ชื่องาน, หน่วยงาน, ชื่อกลุ่ม, จำนวนสมาชิก, ลิงก์โพสต์, สถานะ, จำนวน Comment, เบอร์โทรลูกค้า)
CREATE TABLE IF NOT EXISTS post_logs (
  id VARCHAR(50) PRIMARY KEY,
  run_id VARCHAR(50),
  assignment_id VARCHAR(50),
  user_id VARCHAR(50),
  job_id VARCHAR(50),
  group_id VARCHAR(50),
  poster_name VARCHAR(255),
  owner VARCHAR(255),
  job_title VARCHAR(500),
  company VARCHAR(255),
  group_name TEXT,
  member_count VARCHAR(50) DEFAULT '0',
  post_link TEXT,
  post_status VARCHAR(50),
  comment_count INT DEFAULT 0,
  customer_phone VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_logs_run ON post_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_post_logs_created ON post_logs(created_at DESC);

-- Post Schedules (ตั้งเวลาโพสต์ล่วงหน้า)
CREATE TABLE IF NOT EXISTS post_schedules (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  assignment_ids JSONB NOT NULL DEFAULT '[]',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | cancelled
  last_run_id VARCHAR(50),
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_post_schedules_status_time ON post_schedules(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_fb_id ON groups(fb_group_id);
