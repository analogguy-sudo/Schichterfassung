-- Freiwillige, gerichtete Freigaben. Keine Freigabe bestehender Kalenderdaten durch Installation.
begin;
create schema if not exists schichtplan_private;
revoke all on schema schichtplan_private from public, anon;
grant usage on schema schichtplan_private to authenticated;
create table if not exists schichtplan_private.friend_invites (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 owner_name text not null check (length(owner_name) between 1 and 60),
 token_hash text not null unique,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days'
);
create index if not exists friend_invites_owner_idx on schichtplan_private.friend_invites(owner_id);
create table if not exists schichtplan_private.plan_shares (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 viewer_id uuid not null references auth.users(id) on delete cascade,
 owner_name text not null check (length(owner_name) between 1 and 60),
 viewer_name text not null check (length(viewer_name) between 1 and 60),
 created_at timestamptz not null default now(),
 unique(owner_id,viewer_id), check(owner_id<>viewer_id)
);
create index if not exists plan_shares_viewer_idx on schichtplan_private.plan_shares(viewer_id);
alter table schichtplan_private.friend_invites enable row level security;
alter table schichtplan_private.plan_shares enable row level security;
revoke all on all tables in schema schichtplan_private from public, anon, authenticated;
create index if not exists entries_owner_dates_idx on public.entries(user_id,start_date,end_date);

create or replace function schichtplan_private.friend_invite_create(p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); code text;
begin
 if uid is null then raise exception 'Bitte anmelden.'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 60 then raise exception 'Bitte einen Namen mit höchstens 60 Zeichen angeben.'; end if;
 delete from schichtplan_private.friend_invites where owner_id=uid and expires_at<now();
 if (select count(*) from schichtplan_private.friend_invites where owner_id=uid)>=10 then raise exception 'Bitte zuerst eine offene Einladung widerrufen.'; end if;
 code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into schichtplan_private.friend_invites(owner_id,owner_name,token_hash) values(uid,trim(p_name),encode(sha256(convert_to(code,'UTF8')),'hex'));
 return jsonb_build_object('code',code,'expires_at',now()+interval '7 days');
end $$;
create or replace function schichtplan_private.friend_invite_accept(p_code text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invitation schichtplan_private.friend_invites%rowtype;
begin
 if uid is null then raise exception 'Bitte anmelden.'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 60 then raise exception 'Bitte einen Namen mit höchstens 60 Zeichen angeben.'; end if;
 if p_code is null or p_code !~ '^[a-f0-9]{64}$' then raise exception 'Einladung ungültig oder abgelaufen.'; end if;
 select * into invitation from schichtplan_private.friend_invites where token_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') and expires_at>now() for update;
 if not found then raise exception 'Einladung ungültig oder abgelaufen.'; end if;
 if invitation.owner_id=uid then raise exception 'Diese Einladung ist für einen Freund, nicht für dich selbst.'; end if;
 insert into schichtplan_private.plan_shares(owner_id,viewer_id,owner_name,viewer_name) values(invitation.owner_id,uid,invitation.owner_name,trim(p_name)) on conflict(owner_id,viewer_id) do update set owner_name=excluded.owner_name,viewer_name=excluded.viewer_name;
 delete from schichtplan_private.friend_invites where id=invitation.id;
end $$;
create or replace function schichtplan_private.friend_list() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Bitte anmelden.'; end if;
 return jsonb_build_object('shares',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'owner_id',s.owner_id,'outgoing',s.owner_id=uid,'name',case when s.owner_id=uid then s.viewer_name else s.owner_name end)) from schichtplan_private.plan_shares s where s.owner_id=uid or s.viewer_id=uid),'[]'::jsonb),'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at)) from schichtplan_private.friend_invites i where i.owner_id=uid and i.expires_at>now()),'[]'::jsonb));
end $$;
create or replace function schichtplan_private.friend_revoke(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Bitte anmelden.'; end if;
 delete from schichtplan_private.plan_shares where id=p_id and (owner_id=uid or viewer_id=uid);
 delete from schichtplan_private.friend_invites where id=p_id and owner_id=uid;
end $$;
create or replace function schichtplan_private.friend_availability(p_owner uuid,p_from date,p_to date)
returns table(start_date date,end_date date,start_time time,end_time time,state text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Bitte anmelden.'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Bitte höchstens 31 Tage auswählen.'; end if;
 if p_owner<>uid and not exists(select 1 from schichtplan_private.plan_shares s where s.owner_id=p_owner and s.viewer_id=uid) then raise exception 'Dieser Plan ist nicht für dich freigegeben.'; end if;
 -- Ausschließlich Zeiträume: keine Titel, Schichtnummern, Diagnosen, Pausen oder Arbeitszeitsalden.
 return query select e.start_date,e.end_date,case when e.kind in ('shift','office') then coalesce(e.actual_start,e.start_time) else null end,case when e.kind in ('shift','office') then coalesce(e.actual_end,e.end_time) else null end,case when e.kind in ('shift','office') then 'busy' when e.kind='rest' then 'free' else 'unknown' end from public.entries e where e.user_id=p_owner and e.start_date<=p_to and e.end_date>=p_from-1;
end $$;

-- Exponierte Wrapper haben keine erhöhten Rechte; Zugriff wird in jeder privaten Funktion geprüft.
create or replace function public.friend_invite_create(p_name text) returns jsonb language sql security invoker set search_path='' as $$select schichtplan_private.friend_invite_create(p_name)$$;
create or replace function public.friend_invite_accept(p_code text,p_name text) returns void language sql security invoker set search_path='' as $$select schichtplan_private.friend_invite_accept(p_code,p_name)$$;
create or replace function public.friend_list() returns jsonb language sql security invoker set search_path='' as $$select schichtplan_private.friend_list()$$;
create or replace function public.friend_revoke(p_id uuid) returns void language sql security invoker set search_path='' as $$select schichtplan_private.friend_revoke(p_id)$$;
create or replace function public.friend_availability(p_owner uuid,p_from date,p_to date) returns table(start_date date,end_date date,start_time time,end_time time,state text) language sql security invoker set search_path='' as $$select * from schichtplan_private.friend_availability(p_owner,p_from,p_to)$$;
revoke all on all functions in schema schichtplan_private from public,anon;
grant execute on all functions in schema schichtplan_private to authenticated;
revoke all on function public.friend_invite_create(text),public.friend_invite_accept(text,text),public.friend_list(),public.friend_revoke(uuid),public.friend_availability(uuid,date,date) from public,anon;
grant execute on function public.friend_invite_create(text),public.friend_invite_accept(text,text),public.friend_list(),public.friend_revoke(uuid),public.friend_availability(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
