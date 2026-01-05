-- Run this SQL in Supabase SQL Editor (https://supabase.com/dashboard/project/zqpdbmqneebjsytgkodl/sql)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Booklets table
CREATE TABLE IF NOT EXISTS booklets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT,
  grade TEXT,
  topic TEXT,
  type TEXT,
  compiler TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  questions JSONB DEFAULT '[]'::JSONB
);

-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  booklet_id TEXT,
  booklet_title TEXT,
  topic TEXT,
  topics JSONB DEFAULT '[]'::JSONB,
  grade TEXT,
  start_num INTEGER,
  end_num INTEGER,
  is_published BOOLEAN DEFAULT FALSE,
  open_date TEXT,
  close_date TEXT,
  due_date TEXT,
  time_limit_seconds INTEGER,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT,
  student_id TEXT,
  student_name TEXT,
  answers JSONB DEFAULT '[]'::JSONB,
  total_score REAL,
  max_score REAL,
  status TEXT DEFAULT 'in-progress',
  started_at BIGINT,
  submitted_at BIGINT
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE booklets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (you can tighten this later)
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON booklets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON submissions FOR ALL USING (true) WITH CHECK (true);
