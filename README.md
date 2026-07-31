# GRAAL Medical Solutions

Plateforme numérique de gestion des visites médicales, des délégués et de la performance terrain — PWA React + Supabase.

## Stack

- **Frontend** : React 18 + TypeScript + Vite, Tailwind CSS, PWA (installable Android/iPhone, hors-ligne)
- **Backend** : Supabase (Postgres + Auth + Storage + Edge Functions), toutes les règles métier critiques sont appliquées côté base de données (RLS + fonctions + triggers), jamais uniquement côté client
- **Hébergement** : Cloudflare Pages (déploiement automatique depuis GitHub)

## Développement local

```bash
npm install
cp .env.example .env   # renseigner les valeurs Supabase si différentes
npm run dev
```

## Variables d'environnement requises

À définir dans `.env` en local **et** dans les paramètres du projet Cloudflare Pages (Settings → Environment variables) pour que le déploiement fonctionne :

| Variable | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | `https://bjwcsfdvucrwtlheivuu.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | voir `.env.example` |
| `VITE_APP_TIMEZONE` | `Africa/Porto-Novo` (heure du Bénin, UTC+1, sans changement d'heure) |

## Projet Supabase

Projet : **GRAAL Medical Solutions** (`bjwcsfdvucrwtlheivuu`, région eu-west-1), créé sous l'organisation existante. Le compte étant limité à 2 projets gratuits actifs, le projet `Zehami` a été mis en pause pour libérer un slot — à réactiver depuis le dashboard Supabase si besoin.

## Build & déploiement Cloudflare Pages

- Build command : `npm run build`
- Output directory : `dist`
- `public/_redirects` gère le routing SPA (React Router)

## Structure

```
src/
  assets/        logo et éléments de marque
  components/ui/ design system (boutons, cartes, badges, navigation…)
  features/      auth, planning, visites, portefeuille, management, messagerie
  lib/           client Supabase, règles métier partagées, utilitaires date/fuseau
  routes/        pages et layouts
  types/         types TypeScript générés depuis le schéma Supabase
supabase/
  migrations/    schéma SQL + RLS + fonctions de règles métier
  functions/     Edge Functions (génération PDF, etc.)
```

## Règles métier appliquées côté serveur (non contournables)

Voir `supabase/migrations/` — verrouillage sectoriel, hiérarchisation des visites par potentiel/jour, verrou de soumission du programme (jeudi 21h heure du Bénin), clôture de journée (19h, clôture forcée à 20h), calcul des scores et quotas. Ces règles sont appliquées par Row Level Security et des fonctions Postgres : elles ne dépendent pas de l'interface et ne peuvent pas être contournées par un appel API direct.
