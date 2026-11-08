drop policy if exists "branding_read" on storage.objects;
create policy "branding_read" on storage.objects
for select to authenticated
using (bucket_id = 'branding');

drop policy if exists "branding_insert" on storage.objects;
create policy "branding_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'branding'
  and (
    (split_part(name, '/', 1) = 'platform' and public.is_super_admin(auth.uid()))
    or (
      split_part(name, '/', 1) = 'org'
      and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid, auth.uid())
    )
  )
);

drop policy if exists "branding_update" on storage.objects;
create policy "branding_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'branding'
  and (
    (split_part(name, '/', 1) = 'platform' and public.is_super_admin(auth.uid()))
    or (split_part(name, '/', 1) = 'org' and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid, auth.uid()))
  )
)
with check (
  bucket_id = 'branding'
  and (
    (split_part(name, '/', 1) = 'platform' and public.is_super_admin(auth.uid()))
    or (split_part(name, '/', 1) = 'org' and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid, auth.uid()))
  )
);

drop policy if exists "branding_delete" on storage.objects;
create policy "branding_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'branding'
  and (
    (split_part(name, '/', 1) = 'platform' and public.is_super_admin(auth.uid()))
    or (split_part(name, '/', 1) = 'org' and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid, auth.uid()))
  )
);