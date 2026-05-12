create extension if not exists pgcrypto;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('strength', 'cardio')),
  muscle_group text,
  is_custom boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text not null default ''
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  sort_order integer not null default 1
);

create table if not exists public.strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  sort_order integer not null default 1,
  weight_kg numeric(8, 2) not null check (weight_kg >= 0),
  reps integer not null check (reps > 0),
  notes text not null default ''
);

create table if not exists public.cardio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_exercise_id uuid not null unique references public.workout_exercises(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes > 0),
  distance_km numeric(8, 2) check (distance_km is null or distance_km >= 0),
  notes text not null default ''
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('exercise_target', 'weekly_sessions')),
  exercise_id uuid references public.exercises(id) on delete set null,
  target_weight_kg numeric(8, 2),
  target_reps integer,
  target_sessions_per_week integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric(8, 2) not null check (weight_kg > 0),
  note text not null default ''
);

create index if not exists exercises_user_id_idx on public.exercises(user_id);
create index if not exists workout_sessions_user_id_started_at_idx on public.workout_sessions(user_id, started_at desc);
create index if not exists workout_exercises_session_id_idx on public.workout_exercises(session_id);
create index if not exists strength_sets_workout_exercise_id_idx on public.strength_sets(workout_exercise_id);
create index if not exists goals_user_id_created_at_idx on public.goals(user_id, created_at desc);
create index if not exists body_weight_entries_user_id_measured_at_idx on public.body_weight_entries(user_id, measured_at desc);

alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.strength_sets enable row level security;
alter table public.cardio_entries enable row level security;
alter table public.goals enable row level security;
alter table public.body_weight_entries enable row level security;

drop policy if exists "Users manage own exercises" on public.exercises;
create policy "Users manage own exercises"
on public.exercises
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own workout sessions" on public.workout_sessions;
create policy "Users manage own workout sessions"
on public.workout_sessions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own workout exercises" on public.workout_exercises;
create policy "Users manage own workout exercises"
on public.workout_exercises
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own strength sets" on public.strength_sets;
create policy "Users manage own strength sets"
on public.strength_sets
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own cardio entries" on public.cardio_entries;
create policy "Users manage own cardio entries"
on public.cardio_entries
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own goals" on public.goals;
create policy "Users manage own goals"
on public.goals
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own body weight entries" on public.body_weight_entries;
create policy "Users manage own body weight entries"
on public.body_weight_entries
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
