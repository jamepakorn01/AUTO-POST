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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups (กลุ่ม Facebook)
CREATE TABLE IF NOT EXISTS groups (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255),
  fb_group_id VARCHAR(100) NOT NULL UNIQUE,
  province VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs (งานที่สั่งโพสต์)
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  owner VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  caption TEXT NOT NULL,
  apply_link TEXT,
  comment_reply TEXT,
  job_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates (เทมเพลตงาน)
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  owner VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  caption TEXT NOT NULL,
  apply_link TEXT,
  comment_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assignments (User + Jobs หลายตัว) - Groups มาจาก User ที่ผูกไว้
CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(50) PRIMARY KEY,
  job_ids JSONB NOT NULL DEFAULT '[]',
  user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  group_name VARCHAR(255),
  member_count VARCHAR(50) DEFAULT '0',
  post_link TEXT,
  post_status VARCHAR(50),
  comment_count INT DEFAULT 0,
  customer_phone VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_logs_run ON post_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_post_logs_created ON post_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_fb_id ON groups(fb_group_id);
