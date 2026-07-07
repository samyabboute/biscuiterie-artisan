// ============================================================================
// Moteur de synchronisation — montée (opérations locales en attente) puis
// descente (référentiel + tournée). Idempotent : chaque écriture terrain porte
// un UUID unique en base (contrainte uuid_creation) ; un renvoi après coupure
// retombe sur une violation de contrainte unique, traitée comme un succès
// silencieux (déjà synchronisé), donc zéro doublon même après plusieurs
// tentatives. Conflits : le terrain fait foi pour les faits (livraisons,
// encaissements, incidents, retours, commandes) — écrits tels quels ; le
// siège fait foi pour le référentiel (clients, produits, tournée) — toujours
// remplacé par la version serveur au téléchargement.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import {
  lireMeta, ecrireMeta, operationsEnAttente, majOperation,
  remplacerClients, remplacerProduits, remplacerWilayas, enregistrerTournee, ajouterHistoriqueSync,
} from './db.js';

const CODE_VIOLATION_UNIQUE = '23505';

export async function synchroniser(matricule, cleChiffrement) {
  const resume = { montee: 0, descente: 0, erreurs: 0 };

  if (!navigator.onLine) {
    await consignerSync(matricule, 0, 'echec');
    throw new Error('Aucune connexion réseau détectée.');
  }

  // ---------------------------------------------------------------- montée
  const enAttente = await operationsEnAttente();
  for (const operation of enAttente) {
    try {
      await envoyerOperation(operation, matricule);
      await majOperation(operation.uuid, { statut: 'envoye', erreur: null });
      resume.montee++;
    } catch (erreur) {
      await majOperation(operation.uuid, { statut: 'echec', erreur: erreur.message, tentatives: (operation.tentatives || 0) + 1 });
      resume.erreurs++;
    }
  }

  // --------------------------------------------------------------- descente
  try {
    resume.descente += await telechargerReferentiel(matricule, cleChiffrement);
    resume.descente += await telechargerTournees(matricule);
  } catch (erreur) {
    resume.erreurs++;
    resume.erreurDescente = erreur.message;
  }

  await ecrireMeta('dernier_sync', new Date().toISOString());

  const statut = resume.erreurs === 0 ? 'succes' : (resume.montee + resume.descente > 0 ? 'partiel' : 'echec');
  await consignerSync(matricule, resume.montee + resume.descente, statut);

  return resume;
}

async function consignerSync(matricule, nbEnregistrements, statut) {
  const horodatage = new Date().toISOString();
  await ajouterHistoriqueSync({ matricule, date: horodatage, nb_enregistrements: nbEnregistrements, statut });
  try {
    await supabase.from('sync_log').insert({
      matricule_livreur: matricule,
      date_sync: horodatage.slice(0, 10),
      heure_sync: horodatage,
      nb_enregistrements: nbEnregistrements,
      statut,
    });
  } catch {
    // si l'insertion du journal serveur échoue (ex. coupure au dernier
    // instant), l'historique local suffit à ne pas bloquer l'utilisateur.
  }
}

// ----------------------------------------------------------------------------
// Montée d'une opération : insertion idempotente + upload des preuves.
// ----------------------------------------------------------------------------
async function envoyerOperation(operation, matricule) {
  const { type, payload } = operation;

  switch (type) {
    case 'client': {
      const { error } = await supabase.from('clients').insert(sansBlobs(payload));
      if (error && error.code !== CODE_VIOLATION_UNIQUE) throw new Error(error.message);
      return;
    }
    case 'commande': {
      const { lignes, ...entete } = payload;
      const { data, error } = await supabase.from('commandes').insert(entete).select().single();
      if (error) {
        if (error.code === CODE_VIOLATION_UNIQUE) return; // déjà synchronisée (lignes incluses)
        throw new Error(error.message);
      }
      if (lignes?.length) {
        const { error: erreurLignes } = await supabase.from('commande_lignes')
          .insert(lignes.map((l) => ({ ...l, commande_id: data.id_commande })));
        if (erreurLignes) throw new Error(erreurLignes.message);
      }
      return;
    }
    case 'incident': {
      const photoUrl = payload.photo_blob ? await televerserPreuve(matricule, payload.uuid_creation, 'incident', payload.photo_blob) : null;
      const { error } = await supabase.from('incidents').insert({ ...sansBlobs(payload), photo_url: photoUrl });
      if (error && error.code !== CODE_VIOLATION_UNIQUE) throw new Error(error.message);
      return;
    }
    case 'retour': {
      const { error } = await supabase.from('retours_clients').insert(sansBlobs(payload));
      if (error && error.code !== CODE_VIOLATION_UNIQUE) throw new Error(error.message);
      return;
    }
    case 'encaissement': {
      const { error } = await supabase.from('encaissements').insert(sansBlobs(payload));
      if (error && error.code !== CODE_VIOLATION_UNIQUE) throw new Error(error.message);
      return;
    }
    case 'maj_arret': {
      // Mise à jour d'état (ordre, statut) : simple UPDATE, rejouable sans
      // risque de doublon (pas une création, donc pas de contrainte uuid_creation).
      const { tournee_arret_id, ...champs } = payload;
      const { error } = await supabase.from('tournee_arrets').update(champs).eq('id', tournee_arret_id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'livraison': {
      const photoUrl = payload.photo_blob ? await televerserPreuve(matricule, payload.uuid_creation, 'photo', payload.photo_blob) : null;
      const signatureUrl = payload.signature_blob ? await televerserPreuve(matricule, payload.uuid_creation, 'signature', payload.signature_blob) : null;
      const { error } = await supabase.from('livraisons').insert({
        ...sansBlobs(payload), photo_url: photoUrl, signature_url: signatureUrl,
      });
      if (error && error.code !== CODE_VIOLATION_UNIQUE) throw new Error(error.message);
      return;
    }
    default:
      throw new Error(`Type d'opération inconnu : ${type}`);
  }
}

function sansBlobs(payload) {
  const { photo_blob, signature_blob, ...reste } = payload;
  return reste;
}

async function televerserPreuve(matricule, uuid, nature, blob) {
  const chemin = `${matricule}/${uuid}-${nature}.${nature === 'signature' ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage.from('preuves').upload(chemin, blob, { upsert: true });
  if (error) throw new Error(`Échec de l'envoi de la preuve (${nature}) : ${error.message}`);
  return chemin;
}

// ----------------------------------------------------------------------------
// Descente : référentiel (delta) + tournées du livreur.
// ----------------------------------------------------------------------------
async function telechargerReferentiel(matricule, cleChiffrement) {
  const dernierSync = await lireMeta('dernier_sync');
  let nb = 0;

  let requeteClients = supabase.from('clients').select('*');
  if (dernierSync) requeteClients = requeteClients.gt('updated_at', dernierSync);
  const { data: clients, error: erreurClients } = await requeteClients;
  if (erreurClients) throw new Error(erreurClients.message);
  if (clients?.length) { await remplacerClients(clients, cleChiffrement); nb += clients.length; }

  let requeteProduits = supabase.from('produits').select('*').eq('statut', 'actif');
  if (dernierSync) requeteProduits = requeteProduits.gt('updated_at', dernierSync);
  const { data: produits, error: erreurProduits } = await requeteProduits;
  if (erreurProduits) throw new Error(erreurProduits.message);
  if (produits?.length) { await remplacerProduits(produits); nb += produits.length; }

  const { data: wilayas, error: erreurWilayas } = await supabase.from('wilayas').select('*');
  if (erreurWilayas) throw new Error(erreurWilayas.message);
  if (wilayas?.length) await remplacerWilayas(wilayas);

  return nb;
}

async function telechargerTournees(matricule) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const { data: tournees, error } = await supabase
    .from('tournees')
    .select(`*, tournee_arrets(*, commandes(*, commande_lignes(*, produits(designation)), clients(*)))`)
    .eq('livreur', matricule)
    .gte('date_tournee', aujourdHui)
    .order('date_tournee');

  if (error) throw new Error(error.message);
  for (const t of tournees || []) {
    t.tournee_arrets.sort((a, b) => a.ordre - b.ordre);
    await enregistrerTournee(t);
  }
  return tournees?.length || 0;
}
