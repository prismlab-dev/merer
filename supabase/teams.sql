-- Times: dados compartilhados entre contas. Rodar uma vez no SQL editor do Supabase (projeto silus).
-- Membros são identificados pelo e-mail do login, então um convite vale assim que a pessoa entra.

create table prism.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  data jsonb not null default '{}', -- { tasks, projects, automations }, mesmo formato do estado pessoal
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now()
);

create table prism.team_members (
  team_id uuid not null references prism.teams on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (team_id, email)
);

-- security definer: evita recursão de RLS ao consultar team_members dentro das próprias políticas.
create function prism.my_role(t uuid) returns text language sql stable security definer set search_path = '' as $$
  select role from prism.team_members where team_id = t and email = lower(auth.jwt() ->> 'email')
$$;

alter table prism.teams enable row level security;
alter table prism.team_members enable row level security;

create policy "membros leem" on prism.teams for select using (prism.my_role(id) is not null or created_by = auth.uid());
create policy "qualquer conta cria" on prism.teams for insert with check (created_by = auth.uid());
create policy "membros editam" on prism.teams for update using (prism.my_role(id) is not null);
create policy "dono exclui" on prism.teams for delete using (prism.my_role(id) = 'owner');

create policy "membros veem membros" on prism.team_members for select using (prism.my_role(team_id) is not null);
create policy "dono convida" on prism.team_members for insert with check (
  prism.my_role(team_id) = 'owner'
  -- quem criou o time entra como dono na primeira linha
  or (role = 'owner' and email = lower(auth.jwt() ->> 'email')
      and exists (select 1 from prism.teams where id = team_id and created_by = auth.uid()))
);
create policy "dono remove, membro sai" on prism.team_members for delete using (
  prism.my_role(team_id) = 'owner' or email = lower(auth.jwt() ->> 'email')
);

grant select, insert, update, delete on prism.teams, prism.team_members to authenticated;

-- Tempo real: tarefas delegadas chegam sem recarregar a página.
alter publication supabase_realtime add table prism.teams, prism.team_members;
