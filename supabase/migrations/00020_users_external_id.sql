-- Add external_user_id to users table for tasukaru user mapping
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_external_user_id
  ON users (external_user_id) WHERE external_user_id IS NOT NULL;
