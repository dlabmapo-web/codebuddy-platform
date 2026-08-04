begin;

alter table public.ai_feedbacks
  alter column submission_id drop not null;

alter table public.ai_feedbacks
  add column if not exists error_category text,
  add column if not exists code_hash text;

create unique index if not exists ai_feedbacks_syntax_cache_idx
  on public.ai_feedbacks(student_id, problem_id, error_category, code_hash)
  where error_category is not null and code_hash is not null;

create index if not exists ai_feedbacks_syntax_daily_quota_idx
  on public.ai_feedbacks(student_id, created_at)
  where error_category is not null;

commit;
