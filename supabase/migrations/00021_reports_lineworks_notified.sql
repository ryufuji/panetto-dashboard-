-- Track when a report was notified to LINE Works to prevent duplicate sends
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS lineworks_notified_at TIMESTAMPTZ;
