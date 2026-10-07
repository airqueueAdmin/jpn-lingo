create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Before this job can succeed, create these two Vault secrets in the dashboard:
--   project_url: https://<project-ref>.supabase.co
--   daily_news_cron_secret: the same value as the Edge Function secret
-- The job retries during the morning. The function is idempotent because
-- news_articles.publish_date is unique, so at most one row is created per day.
select cron.schedule(
  'create-daily-learning-news',
  '15 21,22,23,0 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/daily-news',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_news_cron_secret' limit 1)
      ),
      body := jsonb_build_object('trigger', 'cron'),
      timeout_milliseconds := 60000
    ) as request_id;
  $job$
);
