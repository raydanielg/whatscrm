create or replace function public.can_self_join_workspace(_workspace_id uuid, _user_id uuid, _role public.workspace_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.workspaces w
      where w.id = _workspace_id and w.owner_id = _user_id
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
$$;

drop policy if exists "members insert self as owner" on public.workspace_members;

create policy "members insert by admin or invite"
on public.workspace_members
for insert
to authenticated
with check (
  has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role])
  or (user_id = auth.uid() and public.can_self_join_workspace(workspace_id, auth.uid(), role))
);