-- SynergyAI initial schema
-- Apply with: supabase db push  (or paste into the SQL editor)
-- All user-owned tables have Row Level Security. Users can only access their
-- own rows. The service/secret key (server-only) bypasses RLS; the app still
-- validates ownership in every server-side query.

create extension if not exists "pgcrypto";

-- ─── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'pt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ─── job_descriptions ────────────────────────────────────────────────────────
create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_title text not null check (char_length(job_title) between 2 and 200),
  company_name text check (company_name is null or char_length(company_name) <= 200),
  raw_description text not null check (char_length(raw_description) between 1 and 20000),
  parsed jsonb,
  language text not null default 'en' check (language in ('en', 'pt')),
  created_at timestamptz not null default now()
);

create index if not exists job_descriptions_user_created_idx
  on public.job_descriptions (user_id, created_at desc);

alter table public.job_descriptions enable row level security;

drop policy if exists "job_descriptions_all_own" on public.job_descriptions;
create policy "job_descriptions_all_own" on public.job_descriptions
  for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- ─── interview_sessions ──────────────────────────────────────────────────────
create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_description_id uuid references public.job_descriptions (id) on delete set null,
  interview_type text not null
    check (interview_type in ('behavioral','technical','hr_screening','case_study','role_specific','mixed')),
  language text not null check (language in ('en', 'pt')),
  difficulty text not null check (difficulty in ('beginner','intermediate','advanced')),
  duration_minutes int not null check (duration_minutes between 5 and 60),
  persona text not null,
  status text not null default 'draft'
    check (status in ('draft','preparing','ready','connecting','in_progress','evaluating','completed','failed','cancelled')),
  avatar_provider text not null default 'demo',
  provider_session_ref text,
  plan jsonb,
  engine_memory jsonb,
  is_demo_analysis boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interview_sessions_user_created_idx
  on public.interview_sessions (user_id, created_at desc);
create index if not exists interview_sessions_status_idx
  on public.interview_sessions (status);

alter table public.interview_sessions enable row level security;

drop policy if exists "interview_sessions_all_own" on public.interview_sessions;
create policy "interview_sessions_all_own" on public.interview_sessions
  for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- ─── interview_questions ─────────────────────────────────────────────────────
create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  sequence_number int not null check (sequence_number >= 1),
  question_text text not null check (char_length(question_text) between 1 and 2000),
  category text not null default 'mixed',
  competency text not null default '',
  key_points jsonb not null default '[]'::jsonb,
  dimensions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, sequence_number)
);

create index if not exists interview_questions_session_idx
  on public.interview_questions (session_id, sequence_number);

alter table public.interview_questions enable row level security;

drop policy if exists "interview_questions_select_own" on public.interview_questions;
create policy "interview_questions_select_own" on public.interview_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_questions_write_own" on public.interview_questions;
create policy "interview_questions_write_own" on public.interview_questions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_questions_delete_own" on public.interview_questions;
create policy "interview_questions_delete_own" on public.interview_questions
  for delete to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- ─── interview_answers ───────────────────────────────────────────────────────
create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  question_id uuid references public.interview_questions (id) on delete set null,
  transcript text not null check (char_length(transcript) between 1 and 20000),
  duration_seconds int,
  source text not null default 'typed' check (source in ('avatar_stt','typed','demo_text')),
  created_at timestamptz not null default now()
);

create index if not exists interview_answers_session_idx
  on public.interview_answers (session_id, created_at);

alter table public.interview_answers enable row level security;

drop policy if exists "interview_answers_select_own" on public.interview_answers;
create policy "interview_answers_select_own" on public.interview_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_answers_insert_own" on public.interview_answers;
create policy "interview_answers_insert_own" on public.interview_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- ─── interview_transcript_segments ───────────────────────────────────────────
create table if not exists public.interview_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  role text not null check (role in ('interviewer','candidate')),
  text text not null check (char_length(text) between 1 and 4000),
  segment_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists interview_transcript_session_idx
  on public.interview_transcript_segments (session_id, segment_at);

alter table public.interview_transcript_segments enable row level security;

drop policy if exists "interview_transcript_select_own" on public.interview_transcript_segments;
create policy "interview_transcript_select_own" on public.interview_transcript_segments
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_transcript_insert_own" on public.interview_transcript_segments;
create policy "interview_transcript_insert_own" on public.interview_transcript_segments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- ─── interview_evaluations ───────────────────────────────────────────────────
create table if not exists public.interview_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  question_id uuid references public.interview_questions (id) on delete set null,
  overall_score numeric not null check (overall_score >= 0 and overall_score <= 100),
  dimension_scores jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  evidence_excerpts jsonb not null default '[]'::jsonb,
  example_answer text,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists interview_evaluations_session_idx
  on public.interview_evaluations (session_id);

alter table public.interview_evaluations enable row level security;

drop policy if exists "interview_evaluations_select_own" on public.interview_evaluations;
create policy "interview_evaluations_select_own" on public.interview_evaluations
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_evaluations_insert_own" on public.interview_evaluations;
create policy "interview_evaluations_insert_own" on public.interview_evaluations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- ─── interview_reports ───────────────────────────────────────────────────────
create table if not exists public.interview_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.interview_sessions (id) on delete cascade,
  summary text not null default '',
  overall_score numeric not null check (overall_score >= 0 and overall_score <= 100),
  competencies jsonb not null default '[]'::jsonb,
  learning_plan jsonb not null default '[]'::jsonb,
  disclaimer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interview_reports enable row level security;

drop policy if exists "interview_reports_select_own" on public.interview_reports;
create policy "interview_reports_select_own" on public.interview_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_reports_upsert_own" on public.interview_reports;
create policy "interview_reports_upsert_own" on public.interview_reports
  for insert to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "interview_reports_update_own" on public.interview_reports;
create policy "interview_reports_update_own" on public.interview_reports
  for update to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- ─── usage_events (cost accounting; no sensitive payloads) ───────────────────
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  quantity int not null default 1,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_idx
  on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own" on public.usage_events
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own" on public.usage_events
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- ─── retention ───────────────────────────────────────────────────────────────
-- Transcript/answer retention: rows are deleted with the session (cascade) when
-- the user deletes their data. A scheduled cleanup job (pg_cron or external)
-- can be added later; default posture is user-controlled deletion.

grant usage on schema public to anon, authenticated;
