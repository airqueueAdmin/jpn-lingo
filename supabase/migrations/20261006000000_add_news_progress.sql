create table if not exists public.user_news_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"readArticleIds":[],"bookmarks":{},"savedWords":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_news_progress enable row level security;
create policy "Users can read their own news progress" on public.user_news_progress
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own news progress" on public.user_news_progress
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own news progress" on public.user_news_progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger user_news_progress_set_updated_at before update on public.user_news_progress
  for each row execute function public.set_updated_at();
revoke all on public.user_news_progress from anon;
grant select, insert, update on public.user_news_progress to authenticated;
