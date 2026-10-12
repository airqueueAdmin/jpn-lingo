alter table public.user_progress
  add column if not exists word_reviews jsonb not null default '[]'::jsonb,
  add column if not exists study_dates text[] not null default '{}',
  add column if not exists activity_by_date jsonb not null default '{}'::jsonb;
