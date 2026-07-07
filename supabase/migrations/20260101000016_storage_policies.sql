-- ============================================================================
-- Buckets Storage + policies
-- - preuves    : photos de livraison, signatures, bons numérisés
--                chemin attendu : {matricule_livreur}/{uuid}.{ext}
-- - etiquettes : planches PDF de QR codes clients générées par le CRM
--                chemin attendu : {matricule_auteur}/{uuid}.pdf
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('preuves', 'preuves', false, 5242880),
  ('etiquettes', 'etiquettes', false, 5242880)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- preuves — upload par le livreur propriétaire du chemin, lecture élargie
-- au personnel habilité (mêmes rôles que la table livraisons)
-- ----------------------------------------------------------------------------
create policy preuves_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'preuves'
    and public.fn_has_role(array['livreur']::public.role_enum[])
    and (storage.foldername(name))[1] = public.fn_current_matricule()
  );

create policy preuves_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'preuves'
    and (
      public.fn_has_role(array['super_admin','resp_logistique','comptable']::public.role_enum[])
      or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
            select 1 from public.employes e where e.matricule = (storage.foldername(name))[1]
            and e.zones_assignees && public.fn_current_zones()))
      or (storage.foldername(name))[1] = public.fn_current_matricule()
    )
  );

-- ----------------------------------------------------------------------------
-- etiquettes — génération et lecture réservées au personnel commercial/ADV
-- ----------------------------------------------------------------------------
create policy etiquettes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'etiquettes'
    and public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','superviseur_zone']::public.role_enum[])
    and (storage.foldername(name))[1] = public.fn_current_matricule()
  );

create policy etiquettes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'etiquettes'
    and public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','superviseur_zone']::public.role_enum[])
  );
