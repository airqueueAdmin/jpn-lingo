alter table public.user_progress
  add column if not exists bonus_xp integer not null default 0;
