-- Add file_url column to approval_requests for external file links (Dropbox, Google Drive, etc.)
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS file_url TEXT;
