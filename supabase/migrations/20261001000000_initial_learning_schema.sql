create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '학습자',
  experience text not null default 'new' check (experience in ('new', 'kana', 'basic', 'n5-n4', 'n3', 'n2')),
  goal text not null default 'N2' check (goal = 'N2'),
  exam_date date not null default (current_date + 180),
  daily_minutes integer not null default 30 check (daily_minutes in (15, 30, 45, 60, 90)),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_lesson_id text not null default 'hiragana-basic',
  completed_lessons text[] not null default '{}',
  answered_question_ids text[] not null default '{}',
  correct_question_ids text[] not null default '{}',
  review_item_ids text[] not null default '{}',
  wrong_answers jsonb not null default '[]'::jsonb,
  completed_today boolean not null default false,
  total_minutes integer not null default 0,
  streak integer not null default 0,
  last_study_date date,
  phase_progress jsonb not null default '{"intro": 12, "basic": 0, "n5": 0, "n4": 0, "n3": 0, "n2": 0, "mock": 0}'::jsonb,
  category_accuracy jsonb not null default '{"문자": 0, "어휘": 0, "문법": 0, "한자": 0, "독해": 0, "청해": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists user_progress_set_updated_at on public.user_progress;
create trigger user_progress_set_updated_at before update on public.user_progress for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read their own progress" on public.user_progress;
create policy "Users can read their own progress" on public.user_progress for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their own progress" on public.user_progress;
create policy "Users can insert their own progress" on public.user_progress for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own progress" on public.user_progress;
create policy "Users can update their own progress" on public.user_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.profiles from anon;
revoke all on public.user_progress from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_progress to authenticated;
