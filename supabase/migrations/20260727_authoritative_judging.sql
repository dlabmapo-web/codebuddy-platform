begin;

-- PostgreSQL cannot alter a column type while a view depends on that column.
-- Recreate the two reporting views in the same transaction so callers never
-- observe them missing.
drop view if exists public.v_student_problem_status;
drop view if exists public.v_problem_stats;

alter table public.submissions
  drop constraint if exists submissions_status_check;

alter table public.submissions
  alter column status type varchar(20);

alter table public.submissions
  add constraint submissions_status_check
  check (status in ('judging', 'pass', 'partial', 'fail', 'judge_error'));

create view public.v_problem_stats as
select
  p.id as problem_id,
  p.problem_no,
  p.title,
  p.difficulty,
  count(distinct s.user_id) as student_count,
  coalesce(round(avg(s.score), 1), 0::numeric) as avg_score,
  count(*) filter (where s.status::text = 'pass'::text) as pass_count,
  count(s.id) as submission_count
from public.problems p
left join public.submissions s on s.problem_id = p.id
group by p.id, p.problem_no, p.title, p.difficulty;

create view public.v_student_problem_status as
select
  s.user_id,
  u.name as student_name,
  s.problem_id,
  p.title as problem_title,
  max(s.score) as best_score,
  count(*) as attempt_count,
  bool_or(s.status::text = 'pass'::text) as is_solved,
  min(s.elapsed_sec) filter (where s.status::text = 'pass'::text) as best_elapsed_sec,
  max(s.submitted_at) as last_submitted_at
from public.submissions s
join public.users u on u.id = s.user_id
join public.problems p on p.id = s.problem_id
group by s.user_id, u.name, s.problem_id, p.title;

grant all on table public.v_problem_stats to anon, authenticated, service_role;
grant all on table public.v_student_problem_status to anon, authenticated, service_role;

update public.test_cases
set is_hidden = not is_sample
where is_hidden = is_sample;

alter table public.test_cases
  drop constraint if exists test_cases_visibility_check;

alter table public.test_cases
  add constraint test_cases_visibility_check
  check (
    (is_sample = true and is_hidden = false)
    or (is_sample = false and is_hidden = true)
  );

create table if not exists public.submission_test_results (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  test_case_id uuid references public.test_cases(id) on delete set null,
  case_no integer not null check (case_no > 0),
  is_sample_snapshot boolean not null,
  outcome text check (
    outcome is null
    or outcome in (
      'accepted',
      'wrong_answer',
      'time_limit_exceeded',
      'compilation_error',
      'runtime_error',
      'judge_error'
    )
  ),
  judge_token text,
  callback_token_hash text not null,
  runtime_ms integer check (runtime_ms is null or runtime_ms >= 0),
  memory_kb integer check (memory_kb is null or memory_kb >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (submission_id, case_no)
);

create index if not exists submission_test_results_submission_id_idx
  on public.submission_test_results(submission_id);

create unique index if not exists submission_test_results_judge_token_idx
  on public.submission_test_results(judge_token)
  where judge_token is not null;

create unique index if not exists submission_test_results_callback_hash_idx
  on public.submission_test_results(callback_token_hash);

create index if not exists submissions_judging_submitted_at_idx
  on public.submissions(submitted_at)
  where status = 'judging';

create unique index if not exists submissions_one_active_judging_idx
  on public.submissions(user_id, problem_id)
  where status = 'judging';

alter table public.submission_test_results enable row level security;
grant all on table public.submission_test_results to service_role;

create table if not exists public.submission_rate_limit_buckets (
  user_id uuid primary key references public.users(id) on delete cascade,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.submission_rate_limit_buckets enable row level security;
grant all on table public.submission_rate_limit_buckets to service_role;

create or replace function public.consume_submission_rate_limit(
  p_user_id uuid,
  p_limit integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_limit < 1 then
    return false;
  end if;

  insert into public.submission_rate_limit_buckets (
    user_id,
    window_started_at,
    submission_count,
    updated_at
  )
  values (p_user_id, v_window, 1, now())
  on conflict (user_id) do update
  set
    window_started_at = case
      when submission_rate_limit_buckets.window_started_at < v_window then v_window
      else submission_rate_limit_buckets.window_started_at
    end,
    submission_count = case
      when submission_rate_limit_buckets.window_started_at < v_window then 1
      else submission_rate_limit_buckets.submission_count + 1
    end,
    updated_at = now()
  returning submission_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_submission_rate_limit(uuid, integer) from public;
revoke all on function public.consume_submission_rate_limit(uuid, integer) from anon;
revoke all on function public.consume_submission_rate_limit(uuid, integer) from authenticated;
grant execute on function public.consume_submission_rate_limit(uuid, integer) to service_role;

commit;
