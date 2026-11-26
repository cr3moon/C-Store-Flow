-- C-Store-Flow initial schema. NOT WIRED YET: the API uses MemoryStore until Phase 2.
-- Money: integer cents (bigint). Fuel volume: integer thousandths of a gallon.

create table organization (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table store (
  id               text primary key,               -- e.g. 'van-buren'
  organization_id  uuid not null references organization(id),
  name             text not null,
  time_zone        text not null default 'America/Chicago',
  created_at       timestamptz not null default now()
);

create table agent (
  id              text primary key,
  store_id        text not null references store(id),
  key_hash        text not null,                   -- sha256 of the agent key
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

-- Layer 1: raw. Never updated, never deleted.
create table capture (
  store_id        text not null references store(id),
  sha256          text not null,
  agent_id        text not null references agent(id),
  kind            text not null check (kind in ('periodList','reportPeriodList','transSet','rubyReport','plus')),
  endpoint        text not null,
  cmd             text not null,
  params          jsonb not null,
  period_key      text,
  content_type    text not null,
  bytes           integer not null,
  redactions      text[] not null default '{}',
  body_gzip       bytea not null,
  agent_version   text not null,
  captured_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  primary key (store_id, sha256)
);
create index capture_period_idx on capture (store_id, period_key);

create table heartbeat (
  store_id        text not null references store(id),
  agent_id        text not null references agent(id),
  received_at     timestamptz not null default now(),
  payload         jsonb not null
);
create index heartbeat_latest_idx on heartbeat (store_id, received_at desc);

-- Layer 2: clean. Rebuilt from capture at any time.
create table period (
  store_id        text not null references store(id),
  kind            text not null check (kind in ('SHIFT','DAILY')),
  filename        text not null,                   -- '2026-07-17.312'
  business_date   date not null,
  seq             integer not null,
  opened_at       timestamptz,
  closed_at       timestamptz,
  source_sha256   text not null,
  primary key (store_id, kind, filename),
  foreign key (store_id, source_sha256) references capture(store_id, sha256)
);

create table period_tax (
  store_id        text not null,
  kind            text not null,
  filename        text not null,
  bucket          text not null,                   -- 'HIGH TAX', 'LOW TAX'
  taxable_cents   bigint not null,
  tax_cents       bigint not null,
  primary key (store_id, kind, filename, bucket),
  foreign key (store_id, kind, filename) references period(store_id, kind, filename)
);
