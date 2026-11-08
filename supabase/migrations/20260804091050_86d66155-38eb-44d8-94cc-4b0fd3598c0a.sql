create or replace function public.can_self_join_workspace(_workspace_id uuid, _user_id uuid, _role workspace_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = _workspace_id and m.user_id = _user_id
    )
    and (
      exists (
        select 1 from public.workspaces w
        where w.id = _workspace_id
          and w.owner_id = _user_id
          and _role = 'owner'::workspace_role
      )
      or exists (
        select 1
        from public.workspace_invitations i
        join auth.users u on u.id = _user_id
        where i.workspace_id = _workspace_id
          and lower(i.email) = lower(u.email)
          and i.status = 'pending'
          and (i.expires_at is null or i.expires_at > now())
          and i.role = _role
      )
    )
$function$;

create or replace function public.tg_consume_workspace_invitation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _email text;
begin
  if new.user_id is distinct from auth.uid() then
    return new;
  end if;

  select lower(u.email) into _email from auth.users u where u.id = new.user_id;
  if _email is null then
    return new;
  end if;

  update public.workspace_invitations i
     set status = 'accepted',
         accepted_at = now()
   where i.workspace_id = new.workspace_id
     and lower(i.email) = _email
     and i.status = 'pending'
     and i.role = new.role;

  return new;
end;
$function$;

drop trigger if exists trg_consume_workspace_invitation on public.workspace_members;
create trigger trg_consume_workspace_invitation
after insert on public.workspace_members
for each row execute function public.tg_consume_workspace_invitation();