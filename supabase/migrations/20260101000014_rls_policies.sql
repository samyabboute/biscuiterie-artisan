-- ============================================================================
-- Row Level Security — cloisonnement appliqué en base pour toutes les tables
-- métier. Un livreur ne lit/écrit que ses tournées et ses clients de zone ;
-- un superviseur ne voit que ses zones. Aucun accès pour le rôle anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- wilayas — lecture seule pour tout utilisateur authentifié
-- ----------------------------------------------------------------------------
alter table public.wilayas enable row level security;

create policy wilayas_select on public.wilayas
  for select to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- employes
-- ----------------------------------------------------------------------------
alter table public.employes enable row level security;

create policy employes_select on public.employes
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['resp_logistique']::public.role_enum[]) and departement = 'LIV')
    or auth_user_id = auth.uid()
  );

create policy employes_insert on public.employes
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['resp_logistique']::public.role_enum[]) and departement = 'LIV')
  );

-- NB : pas de policy d'auto-modification. Un employé ne doit jamais pouvoir
-- changer sa propre ligne (rôle, statut, zones) via une écriture directe sur
-- la table — cela ouvrirait une élévation de privilèges (ex. un livreur
-- suspendu qui repasserait son propre statut à 'actif'). La mise à jour du
-- profil (téléphone, etc.) passera par une fonction RPC dédiée et bornée en
-- Phase 1/2 si besoin.
create policy employes_update on public.employes
  for update to authenticated
  using (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['resp_logistique']::public.role_enum[]) and departement = 'LIV')
  )
  with check (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['resp_logistique']::public.role_enum[]) and departement = 'LIV')
  );

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','directeur_commercial','resp_logistique','agent_adv','comptable']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and public.fn_zone_in_scope(zone, public.fn_current_zones()))
    or (public.fn_has_role(array['livreur']::public.role_enum[])
        and (public.fn_zone_in_scope(zone, public.fn_current_zones()) or livreur_attitre = public.fn_current_matricule()))
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin','directeur_commercial','agent_adv']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and public.fn_zone_in_scope(zone, public.fn_current_zones()))
    or (public.fn_has_role(array['livreur']::public.role_enum[])
        and public.fn_zone_in_scope(zone, public.fn_current_zones())
        and statut = 'en_attente_validation')
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    public.fn_has_role(array['super_admin','directeur_commercial','agent_adv']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and public.fn_zone_in_scope(zone, public.fn_current_zones()))
  )
  with check (
    public.fn_has_role(array['super_admin','directeur_commercial','agent_adv']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and public.fn_zone_in_scope(zone, public.fn_current_zones()))
  );

-- ----------------------------------------------------------------------------
-- produits
-- ----------------------------------------------------------------------------
alter table public.produits enable row level security;

create policy produits_select on public.produits
  for select to authenticated
  using (true);

create policy produits_insert on public.produits
  for insert to authenticated
  with check (public.fn_has_role(array['super_admin','directeur_commercial']::public.role_enum[]));

create policy produits_update on public.produits
  for update to authenticated
  using (public.fn_has_role(array['super_admin','directeur_commercial']::public.role_enum[]))
  with check (public.fn_has_role(array['super_admin','directeur_commercial']::public.role_enum[]));

-- ----------------------------------------------------------------------------
-- commandes
-- ----------------------------------------------------------------------------
alter table public.commandes enable row level security;

create policy commandes_select on public.commandes
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','directeur_commercial','resp_logistique','agent_adv','comptable']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.clients c where c.id_client = commandes.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and (
          cree_par = public.fn_current_matricule()
          or exists (
            select 1 from public.tournee_arrets ta
            join public.tournees t on t.id_tournee = ta.tournee_id
            where ta.commande_id = commandes.id_commande and t.livreur = public.fn_current_matricule()
          )))
  );

create policy commandes_insert on public.commandes
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin','directeur_commercial','agent_adv']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.clients c where c.id_client = commandes.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and cree_par = public.fn_current_matricule() and origine = 'livreur')
  );

create policy commandes_update on public.commandes
  for update to authenticated
  using (
    public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','resp_logistique']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.clients c where c.id_client = commandes.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
  )
  with check (
    public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','resp_logistique']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.clients c where c.id_client = commandes.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
  );

-- ----------------------------------------------------------------------------
-- commande_lignes — visibilité alignée sur la commande parente
-- ----------------------------------------------------------------------------
alter table public.commande_lignes enable row level security;

create policy commande_lignes_select on public.commande_lignes
  for select to authenticated
  using (exists (select 1 from public.commandes cmd where cmd.id_commande = commande_lignes.commande_id));

create policy commande_lignes_insert on public.commande_lignes
  for insert to authenticated
  with check (exists (
    select 1 from public.commandes cmd where cmd.id_commande = commande_lignes.commande_id
    and (
      public.fn_has_role(array['super_admin','directeur_commercial','agent_adv','resp_logistique']::public.role_enum[])
      or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
            select 1 from public.clients c where c.id_client = cmd.client_id
            and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
      or (public.fn_has_role(array['livreur']::public.role_enum[]) and cmd.cree_par = public.fn_current_matricule())
    )
  ));

-- ----------------------------------------------------------------------------
-- tournees
-- ----------------------------------------------------------------------------
alter table public.tournees enable row level security;

create policy tournees_select on public.tournees
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','resp_logistique','magasinier']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.employes e where e.matricule = tournees.livreur
          and e.zones_assignees && public.fn_current_zones()))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

create policy tournees_insert on public.tournees
  for insert to authenticated
  with check (public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[]));

create policy tournees_update on public.tournees
  for update to authenticated
  using (
    public.fn_has_role(array['super_admin','resp_logistique','magasinier']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  )
  with check (
    public.fn_has_role(array['super_admin','resp_logistique','magasinier']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

-- ----------------------------------------------------------------------------
-- tournee_arrets
-- ----------------------------------------------------------------------------
alter table public.tournee_arrets enable row level security;

create policy tournee_arrets_select on public.tournee_arrets
  for select to authenticated
  using (exists (
    select 1 from public.tournees t where t.id_tournee = tournee_arrets.tournee_id
    and (
      public.fn_has_role(array['super_admin','resp_logistique','magasinier']::public.role_enum[])
      or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
            select 1 from public.employes e where e.matricule = t.livreur
            and e.zones_assignees && public.fn_current_zones()))
      or (public.fn_has_role(array['livreur']::public.role_enum[]) and t.livreur = public.fn_current_matricule())
    )
  ));

create policy tournee_arrets_insert on public.tournee_arrets
  for insert to authenticated
  with check (public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[]));

create policy tournee_arrets_update on public.tournee_arrets
  for update to authenticated
  using (exists (
    select 1 from public.tournees t where t.id_tournee = tournee_arrets.tournee_id
    and (
      public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[])
      or (public.fn_has_role(array['livreur']::public.role_enum[]) and t.livreur = public.fn_current_matricule())
    )
  ));

-- ----------------------------------------------------------------------------
-- livraisons
-- ----------------------------------------------------------------------------
alter table public.livraisons enable row level security;

create policy livraisons_select on public.livraisons
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','resp_logistique','comptable']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.commandes cmd join public.clients c on c.id_client = cmd.client_id
          where cmd.id_commande = livraisons.commande_id and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

create policy livraisons_insert on public.livraisons
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

create policy livraisons_update on public.livraisons
  for update to authenticated
  using (public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[]))
  with check (public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[]));

-- ----------------------------------------------------------------------------
-- encaissements
-- ----------------------------------------------------------------------------
alter table public.encaissements enable row level security;

create policy encaissements_select on public.encaissements
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','comptable','resp_logistique']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.clients c where c.id_client = encaissements.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

create policy encaissements_insert on public.encaissements
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin','comptable']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

-- ----------------------------------------------------------------------------
-- incidents
-- ----------------------------------------------------------------------------
alter table public.incidents enable row level security;

create policy incidents_select on public.incidents
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and client_id is not null and exists (
          select 1 from public.clients c where c.id_client = incidents.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

create policy incidents_insert on public.incidents
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

-- ----------------------------------------------------------------------------
-- journal_audit — consultable uniquement par le Super Admin
-- ----------------------------------------------------------------------------
alter table public.journal_audit enable row level security;

create policy journal_audit_select on public.journal_audit
  for select to authenticated
  using (public.fn_has_role(array['super_admin']::public.role_enum[]));

-- aucune policy insert/update/delete : seules les fonctions SECURITY DEFINER
-- (fn_audit_generic, exécutée en tant que propriétaire de table) peuvent écrire.

-- ----------------------------------------------------------------------------
-- sync_log
-- ----------------------------------------------------------------------------
alter table public.sync_log enable row level security;

create policy sync_log_select on public.sync_log
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin','resp_logistique']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.employes e where e.matricule = sync_log.matricule_livreur
          and e.zones_assignees && public.fn_current_zones()))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and matricule_livreur = public.fn_current_matricule())
  );

create policy sync_log_insert on public.sync_log
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and matricule_livreur = public.fn_current_matricule())
  );
