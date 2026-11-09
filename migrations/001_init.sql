-- KeyResult schema. Tenant isolation is enforced by Postgres row-level security:
-- every request runs in a transaction that sets app.user_id / app.org_id, and the
-- application role (which does not own these tables) can only see rows for that org.

create extension if not exists citext;

create function app_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app_org_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

-- ---------- identity (global, not tenant-scoped) ----------

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique check (length(email) <= 254),
  name          text not null check (length(name) between 1 and 100),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table sessions (
  id         text primary key, -- SHA-256 of the session token; the token itself is never stored
  user_id    uuid not null references users on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on sessions (user_id);

create table rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null
);

-- ---------- tenants ----------

create table organizations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 1 and 80),
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  plan               text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text unique,
  created_at         timestamptz not null default now()
);

create table memberships (
  org_id     uuid not null references organizations on delete cascade,
  user_id    uuid not null references users on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_id_idx on memberships (user_id);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  email       citext not null check (length(email) <= 254),
  role        text not null check (role in ('admin', 'member')),
  token_hash  text not null unique,
  invited_by  uuid references users on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index invitations_org_id_idx on invitations (org_id);

create table objectives (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  owner_id    uuid references users on delete set null,
  quarter     text not null check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  status      text not null default 'on_track' check (status in ('on_track', 'at_risk', 'off_track', 'done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index objectives_org_quarter_idx on objectives (org_id, quarter);

create table key_results (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  objective_id  uuid not null,
  title         text not null check (length(title) between 1 and 200),
  start_value   numeric not null,
  target_value  numeric not null,
  current_value numeric not null,
  unit          text not null default '' check (length(unit) <= 20),
  created_at    timestamptz not null default now(),
  check (target_value <> start_value),
  unique (id, org_id),
  -- Composite key: a key result can never point at another tenant's objective.
  foreign key (objective_id, org_id) references objectives (id, org_id) on delete cascade
);
create index key_results_objective_idx on key_results (objective_id);

create table check_ins (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  key_result_id uuid not null,
  user_id       uuid references users on delete set null,
  value         numeric not null,
  note          text not null default '' check (length(note) <= 1000),
  created_at    timestamptz not null default now(),
  foreign key (key_result_id, org_id) references key_results (id, org_id) on delete cascade
);
create index check_ins_kr_idx on check_ins (key_result_id, created_at desc);

create table audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references organizations on delete cascade,
  actor_id   uuid references users on delete set null,
  action     text not null,
  target     text not null default '',
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on audit_log (org_id, created_at desc);

-- ---------- row-level security ----------

alter table organizations enable row level security;
alter table organizations force row level security;
create policy org_select on organizations for select
  using (id = app_org_id() or exists (
    select 1 from memberships m where m.org_id = organizations.id and m.user_id = app_user_id()
  ));
create policy org_insert on organizations for insert with check (id = app_org_id());
create policy org_update on organizations for update using (id = app_org_id()) with check (id = app_org_id());
create policy org_delete on organizations for delete using (id = app_org_id());

alter table memberships enable row level security;
alter table memberships force row level security;
-- A user can list their own memberships (to pick an org); everything else is scoped to the current org.
create policy membership_select on memberships for select
  using (org_id = app_org_id() or user_id = app_user_id());
create policy membership_write on memberships for all
  using (org_id = app_org_id()) with check (org_id = app_org_id());

do $$
declare t text;
begin
  foreach t in array array['invitations', 'objectives', 'key_results', 'check_ins', 'audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I for all using (org_id = app_org_id()) with check (org_id = app_org_id())', t);
  end loop;
end $$;

-- Accepting an invite happens before the user belongs to the org, so the lookup by
-- (secret) token hash runs with the owner's rights. It returns only that one invitation.
create function invitation_by_token_hash(p_token_hash text)
  returns table (id uuid, org_id uuid, email citext, role text, expires_at timestamptz, accepted_at timestamptz, org_name text)
  language sql stable security definer
  set search_path = public
  as $$
    select i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at, o.name
    from invitations i join organizations o on o.id = i.org_id
    where i.token_hash = p_token_hash
  $$;
revoke all on function invitation_by_token_hash(text) from public;
