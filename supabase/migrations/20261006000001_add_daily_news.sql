create table if not exists public.news_articles (
  id text primary key,
  publish_date date not null unique,
  level text not null check (level in ('N5', 'N4', 'N3', 'N2', 'N1')),
  category text not null,
  title text not null,
  summary text not null,
  symbol text not null,
  minutes integer not null check (minutes between 1 and 10),
  source_name text not null,
  source_url text not null unique,
  paragraphs jsonb not null check (jsonb_typeof(paragraphs) = 'array'),
  words jsonb not null check (jsonb_typeof(words) = 'array'),
  quiz jsonb not null check (jsonb_typeof(quiz) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists news_articles_publish_date_idx
  on public.news_articles (publish_date desc);

alter table public.news_articles enable row level security;

drop policy if exists "News articles are publicly readable" on public.news_articles;
create policy "News articles are publicly readable" on public.news_articles
  for select to anon, authenticated using (true);

revoke all on public.news_articles from anon, authenticated;
grant select on public.news_articles to anon, authenticated;

comment on table public.news_articles is
  'One generated Japanese-learning news article per Korea/Japan calendar day. Rows are retained as the news archive.';
