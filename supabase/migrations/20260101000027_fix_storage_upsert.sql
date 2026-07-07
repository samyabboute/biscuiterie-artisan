-- ============================================================================
-- Correctif : l'upload d'une preuve avec { upsert: true } déclenche une mise
-- à jour (UPDATE) sur storage.objects quand le fichier existe déjà (cas d'un
-- renvoi après échec d'une étape suivante). Seule une policy INSERT existait :
-- on ajoute l'UPDATE équivalente pour les deux buckets afin que les
-- renvois idempotents fonctionnent.
-- ============================================================================

create policy preuves_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'preuves'
    and public.fn_has_role(array['livreur']::public.role_enum[])
    and (storage.foldername(name))[1] = public.fn_current_matricule()
  )
  with check (
    bucket_id = 'preuves'
    and public.fn_has_role(array['livreur']::public.role_enum[])
    and (storage.foldername(name))[1] = public.fn_current_matricule()
  );

create policy etiquettes_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'etiquettes'
    and public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','superviseur_zone']::public.role_enum[])
    and (storage.foldername(name))[1] = public.fn_current_matricule()
  )
  with check (
    bucket_id = 'etiquettes'
    and public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','superviseur_zone']::public.role_enum[])
    and (storage.foldername(name))[1] = public.fn_current_matricule()
  );
