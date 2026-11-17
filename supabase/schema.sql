-- Mission Failed tables. Safe to run in the same Supabase project as Vice Radio (all prefixed mf_).
create table if not exists mf_runs (
  id uuid primary key,
  seed bigint not null,
  wallet text,
  name text not null,
  character text,
  car int default 0,
  ip text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  round bigint,
  cleared int default 0,
  clear_ticks int default 0,
  total_ticks int default 0,
  status text default 'started',
  reason text,
  verified boolean default false
);
create index if not exists mf_runs_round on mf_runs (round) where verified;
create index if not exists mf_runs_best on mf_runs (cleared desc, clear_ticks asc) where verified;

create table if not exists mf_rounds (
  id bigint primary key,
  collected_lamports bigint default 0,
  pool_lamports bigint default 0,
  paid_lamports bigint default 0,
  recipients int default 0,
  players int default 0,
  total_points int default 0,
  collect_sig text,
  note text,
  dry_run boolean default false,
  created_at timestamptz default now()
);

create table if not exists mf_payouts (
  id bigserial primary key,
  round bigint not null,
  wallet text not null,
  name text,
  points int,
  lamports bigint,
  sig text,
  dry_run boolean default false,
  created_at timestamptz default now()
);

create table if not exists mf_settings (key text primary key, value jsonb);

alter table mf_runs enable row level security;
alter table mf_rounds enable row level security;
alter table mf_payouts enable row level security;
alter table mf_settings enable row level security;
