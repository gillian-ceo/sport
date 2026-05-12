# ProgressFit Web

Version web de ProgressFit, prête pour Vercel, avec stockage Supabase et mode local de secours.

## Lancer en local

Depuis ce dossier :

```sh
npm run dev
```

Puis ouvre :

```text
http://127.0.0.1:3000
```

## Déployer sur Vercel

Avant de déployer, ouvre `config.js` et renseigne tes valeurs Supabase :

```js
window.PROGRESSFIT_SUPABASE = {
  url: "https://ton-projet.supabase.co",
  anonKey: "ta-cle-anon-publique"
};
```

Cette clé est la clé `anon public`, prévue pour être utilisée dans le navigateur. Les données restent protégées par les policies RLS du fichier `supabase/schema.sql`.

### Option recommandée : GitHub + Vercel

1. Mets ce dossier dans un repo GitHub.
2. Dans Vercel, clique `Add New...` puis `Project`.
3. Importe le repo.
4. Si Vercel demande un framework, choisis `Other`.
5. Laisse les commandes vides :
   - Build Command : vide
   - Output Directory : vide ou `.`
6. Déploie.

### Option CLI

Installe la CLI Vercel si besoin :

```sh
npm i -g vercel
```

Déploiement preview :

```sh
npm run deploy
```

Production :

```sh
npm run deploy:prod
```

## Configurer Supabase

1. Crée un projet Supabase.
2. Ouvre `supabase/schema.sql`, copie le contenu, puis exécute-le dans le SQL Editor Supabase.
3. Dans Supabase Auth, ajoute l’URL Vercel dans les URLs autorisées.
4. Dans l’app, colle :
   - Project URL
   - anon public key
5. Connecte-toi avec ton email via lien magique.

La clé anon est publique côté navigateur. Les données restent séparées par utilisateur grâce aux policies RLS du schéma SQL.

### URLs Auth à ajouter dans Supabase

Dans `Authentication > URL Configuration` :

- Site URL : ton URL de production Vercel, par exemple `https://progressfit.vercel.app`
- Redirect URLs :
  - `http://127.0.0.1:3000`
  - `https://*.vercel.app`
  - ton domaine personnalisé si tu en ajoutes un

Important : si tu utilises une URL preview Vercel différente de l’URL de production, ajoute aussi cette URL preview dans les Redirect URLs Supabase. Le lien magique doit revenir sur la même origine que l’app.

## Fonctionnalités

- Séances de musculation et cardio.
- Exercices préremplis et exercices personnalisés.
- Séries avec poids/répétitions.
- Cardio avec durée et distance optionnelle.
- Historique des séances.
- Progression par exercice avec graphiques.
- Objectifs de performance et régularité hebdomadaire.
- Suivi simple du poids corporel.

## Mode local

Le bouton `Mode local` permet de tester sans Supabase. Les données sont stockées dans `localStorage` du navigateur et ne sont pas synchronisées.
