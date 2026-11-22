-- Nome e foto de quem divide um time com você. O perfil do Silus (public.profiles) vence; senão, o do login Google.
-- security definer porque public.profiles só deixa cada conta ler a própria linha. Só leitura; não toca em public.

create function prism.member_profiles() returns table (email text, name text, photo text)
language sql stable security definer set search_path = '' as $$
  select m.email,
    coalesce(nullif(p.display_name, ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    coalesce(nullif(p.photo_url, ''), u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
  from (
    select distinct email from prism.team_members
    where team_id in (select team_id from prism.team_members where email = lower(auth.jwt() ->> 'email'))
  ) m
  left join auth.users u on lower(u.email) = m.email
  left join public.profiles p on p.id = u.id
$$;

revoke execute on function prism.member_profiles() from public, anon;
grant execute on function prism.member_profiles() to authenticated;
