import { supabase } from './supabaseClient.js';

const DOMAINE_TECHNIQUE = 'interne.biscuiterie-artisan.dz';

// Regex des matricules valides : ART-DEPT-NNNN
const RE_MATRICULE = /^ART-(DIR|COM|LOG|ADV|FIN|DEP|LIV)-\d{4}$/i;

export function matriculeVersEmail(matricule) {
  const propre = matricule.trim().toUpperCase();
  return `${propre.replace(/-/g, '').toLowerCase()}@${DOMAINE_TECHNIQUE}`;
}

export function matriculeValide(matricule) {
  return RE_MATRICULE.test(matricule.trim());
}

// Connexion par matricule + mot de passe. Lève une erreur en français si ça échoue.
export async function connecter(matricule, motDePasse) {
  if (!matriculeValide(matricule)) {
    throw new Error("Format de matricule invalide. Exemple attendu : ART-LOG-0027.");
  }

  const email = matriculeVersEmail(matricule);
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  if (error) {
    throw new Error('Matricule ou mot de passe incorrect.');
  }

  const profil = await recupererProfil();
  if (!profil || profil.statut !== 'actif') {
    await supabase.auth.signOut();
    throw new Error("Ce compte est suspendu ou n'est plus actif. Contactez un administrateur.");
  }
  if (profil.role === 'livreur') {
    await supabase.auth.signOut();
    throw new Error("Ce matricule est un compte livreur : utilisez l'application mobile (/app), pas le CRM.");
  }

  return profil;
}

// Lit la fiche employé (matricule, rôle, statut, zones) de l'utilisateur connecté
// via la fonction fn_whoami (contourne la RLS pour lire sa propre fiche même suspendu).
export async function recupererProfil() {
  const { data, error } = await supabase.rpc('fn_whoami');
  if (error || !data || data.length === 0) return null;
  return data[0];
}

export async function deconnecter() {
  await supabase.auth.signOut();
}

// Garde d'accès pour les pages protégées du CRM. Redirige vers login.html si
// la session est absente, invalide, ou si le compte n'est plus actif — auquel
// cas la session locale est purgée immédiatement (effet immédiat de suspension).
export async function exigerSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirigerVersConnexion();
    return null;
  }

  const profil = await recupererProfil();
  if (!profil || profil.statut !== 'actif' || profil.role === 'livreur') {
    await supabase.auth.signOut();
    redirigerVersConnexion();
    return null;
  }

  return profil;
}

function redirigerVersConnexion() {
  window.location.href = `${import.meta.env.BASE_URL}management/login.html`;
}
