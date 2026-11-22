# Assistant IA — Pilotage des ventes Provisit (GRAAL)

**Date de l'étude : 22 novembre 2026**  
**Statut : étude technique et architecture recommandée — aucune modification applicative ni aucun déploiement effectués.**

## Objectif

Intégrer dans **Pilotage des ventes** un agent conversationnel accessible à l'administrateur dans le tableau de bord Provisit. L'agent doit pouvoir consulter les données commerciales autorisées, faire des analyses, expliquer les écarts, comparer les périodes, produire des synthèses et, plus tard, aider à préparer les imports. Le démarrage doit éviter toute API payante séparée.

## Décision technique préliminaire

- **Cloudflare Workers AI** comme moteur IA.
- **Modèle principal :** `@cf/zai-org/glm-4.7-flash`.
- **Modèle de secours à benchmarker :** `@cf/ibm-granite/granite-4.0-h-micro`.
- **Modèle multimodal candidat :** `@cf/google/gemma-4-26b-a4b-it`, seulement si une tâche vision/document le justifie.
- **Agent et chat persistant :** Cloudflare Agents SDK, `AIChatAgent`, Durable Objects SQLite.
- **Frontend :** React, hook `useAgentChat`; chat intégré au module Pilotage des ventes.
- **Backend IA :** Worker séparé pour isoler l'IA du Worker statique actuel `graal`.
- **Données métier :** Supabase Provisit, requêtes limitées et validées, avec JWT utilisateur et RLS; pas de clé service-role dans l'agent.
- **Première version :** outils en lecture seule. Toute écriture/import reste dans le workflow existant et demande une validation humaine.

## Vérifications effectuées

### Cloudflare

- La connexion Cloudflare est active.
- Le Worker `graal` existe et sert actuellement le front statique (configuration Wrangler avec `assets`, sans entrée Worker métier ni binding AI).
- Aucun AI Gateway n'est actuellement configuré dans le compte vérifié.
- Le catalogue Workers AI contient `@cf/zai-org/glm-4.7-flash`.
- La fiche du modèle indique un contexte de 131 072 tokens, Function Calling et Reasoning pris en charge.
- Aucun appel d'inférence n'a été effectué : les tests live consommeraient le quota AI du compte.

### Provisit

- Le module Pilotage des ventes existe dans `src/routes/management/PilotageVentes.tsx`.
- Le bouton Assistant IA actuel ouvre `AssistantIAVentes.tsx`, qui est un assistant local d'import/validation, pas un chat IA distant.
- Le flux existant accepte CSV et PDF, réalise extraction/matching local, utilise une file de revue et une RPC de validation; le fichier original est placé dans le stockage privé.
- L'agent conversationnel doit être ajouté sans casser ni remplacer le flux d'import actuel.
- Les tables commerciales ont des politiques RLS; l'interface Assistant/import est réservée à l'administrateur. Le nouvel agent sera administrateur uniquement au lancement.
- Le dépôt est `editadigoun-cmd/Graal`, branche `main`.

### Données commerciales observées en lecture seule

- Laboratoires : 5
- Grossistes : 4
- Produits pilotage : 58
- Objectifs mensuels : 57
- Ventes hebdomadaires : 185 lignes
- Stocks hebdomadaires : 186 lignes
- Mappings produits/grossistes : 112
- Imports IA : 0
- Lignes d'import : 0
- Ventes disponibles : 14 septembre–2 novembre 2026
- Objectifs disponibles : août–septembre 2026

L'agent devra toujours afficher la période et la fraîcheur des données. Il ne doit pas présenter une analyse comme actuelle si les données n'ont pas été mises à jour.

### Migration à noter (hors périmètre de cette étude)

Le dépôt contient une migration sales-only du 18 novembre 2026 qui n'est pas présente dans l'historique des migrations appliquées au projet Supabase vérifié. Le comportement actuel de la RPC d'import en base peut donc différer de la version du dépôt. Cette migration ne sera pas appliquée dans le cadre de l'agent IA sans décision séparée.

## Comparaison des modèles

| Modèle | Usage | Atouts | Réserve |
|---|---|---|---|
| GLM-4.7-Flash | Chat/raisonnement + outils | Français, 131k contexte, tool calling, reasoning; candidat principal | Fonction calling Workers AI est en Beta; benchmark réel requis |
| Granite 4.0 H Micro | Tâches simples, mapping, classification, fallback | Coût neuronique plus faible | Qualité de raisonnement à benchmarker |
| Gemma 4 26B A4B IT | Vision, documents/images, analyse plus complexe | Multimodal; grand contexte | Plus gourmand; à utiliser seulement si nécessaire |
| Clairic | Extraction de champs typés, PDF/image | Valeurs typées, confidence, p_null, ZDR; aucun token de sortie | Preview; pas un chat ni un agent tool-calling; limites documents/images |

### Quota Workers AI

Le Free plan donne une allocation de **10 000 Neurons/jour**, réinitialisée à 00:00 UTC. Les modèles sont facturés en Neurons selon les tokens d'entrée/sortie. Les modèles GLM-4.7-Flash et Granite sont des candidats compatibles avec le niveau gratuit.

Pour GLM-4.7-Flash, les tarifs documentés sont approximativement :
- 5 500 Neurons / million de tokens d'entrée
- 36 400 Neurons / million de tokens de sortie

Ce quota équivaut à environ 1,82 M tokens d'entrée seuls ou 275 k tokens de sortie seuls; les requêtes réelles consomment les deux. Un plafond applicatif journalier inférieur au quota (proposé : 7 500 Neurons estimés) et une limite de tokens/étapes sont nécessaires.

**Attention :** sur Workers Free, le dépassement des limites gratuites bloque les opérations. Sur Workers Paid, des dépassements peuvent être facturés. Le statut de plan/billing n'a pas pu être vérifié avec la connexion Cloudflare actuelle (scope Billing Read absent). Aucune inférence live ni déploiement ne sera effectué avant de confirmer le plan ou de définir un garde-fou coût adapté.

### Quotas Workers/Agents (Free)

- Workers Free : 100 000 requêtes/jour, CPU 10 ms par requête.
- Durable Objects SQLite Free : 100 000 requêtes/jour, 13 000 GB-s/jour, 5 millions de lectures SQL/jour, 100 000 écritures/jour, 5 GB de stockage.
- Durable Objects existent sur Free et Paid; en Free, les dépassements de limites font échouer les opérations.
- Chat à faible volume, avec hibernation WebSocket et limite de messages, devrait rester dans ces quotas.

## Architecture proposée

```text
Provisit (React/Vite)
  Pilotage des ventes
    ├─ Assistant IA / Chat
    └─ Import ventes (workflow existant)
          │
          │ Supabase access token + token de connexion court
          ▼
Worker séparé : graal-sales-ai
  ├─ Authentification / CORS / contrôle admin
  ├─ Cloudflare Agents SDK (AIChatAgent)
  ├─ Workers AI binding (AI)
  ├─ Tool calling limité (aucun SQL libre)
  ├─ Limites d'usage et de contexte
  └─ Durable Object SQLite (historique chat)
          │
          │ Supabase JWT utilisateur
          ▼
Supabase Provisit
  ├─ ventes_hebdomadaires
  ├─ objectifs_mensuels_produits
  ├─ produits_pilotage
  ├─ grossistes
  ├─ laboratoires
  └─ mappings_produits_grossistes
```

### Authentification et isolation

1. Le frontend utilise la session Supabase existante.
2. Un endpoint Worker valide le JWT Supabase et vérifie le rôle `admin`.
3. Le Worker émet un jeton de connexion court et signé pour le WebSocket; il ne place pas le JWT Supabase dans l'URL du WebSocket.
4. Chaque message de chat transmet le JWT utilisateur dans le body temporaire; il est validé à nouveau.
5. Les outils utilisent un client Supabase avec le JWT utilisateur et les politiques RLS; aucun service-role key.
6. L'instance Agent est isolée par utilisateur/conversation.
7. Aucun tool d'écriture ni SQL arbitraire n'est exposé au modèle.

## Outils métier prévus (lecture seule)

- `get_sales_summary(period)`
- `get_sales_by_product(period, filters)`
- `get_sales_by_lab(period)`
- `get_sales_by_wholesaler(period)`
- `get_sales_by_vm_or_team(period)` (si le modèle de données fournit ce lien)
- `get_targets(period)`
- `compare_periods(period_a, period_b)`
- `get_top_and_bottom_products(period)`
- `get_data_freshness()`
- `get_import_status()`
- `get_mapping_issues()`

Les outils valident les dates, filtres, IDs et limites. Les calculs (quantités, CA, objectifs, taux) sont faits côté code/SQL, pas par le LLM. Le modèle explique les résultats et cite la période/source. Les objectifs absents sont signalés, jamais assimilés à zéro.

## Sécurité et confidentialité

- Aucun accès SQL arbitraire.
- Agent réservé à l'administrateur au lancement.
- RLS vérifiée pour chaque outil; le Worker n'utilise pas service-role.
- Outils en lecture seule; écritures et imports soumis au workflow de validation existant.
- Les fichiers et résultats de requêtes sont considérés comme données non fiables (prompt injection).
- Limite de 5–6 étapes de tool calling par tour, taille de réponse et fenêtre de contexte contrôlées.
- Conversations persistées dans SQLite du Durable Object; bouton de suppression/reset et politique de rétention à définir.
- Ne pas journaliser prompts, réponses ni tokens Supabase. Logs techniques sans contenu.
- AI Gateway est facultatif en V1. Si utilisé, désactiver la collecte de payload (metadata seulement) ou la collecte complète; ne pas activer de cache pour les données commerciales sans analyse de confidentialité.

## Fichiers

Cloudflare Markdown Conversion accepte notamment PDF, CSV, XLSX/XLS, DOCX, ODS/ODT, HTML, XML et images. La conversion est gratuite pour la plupart des formats; la conversion d'images peut appeler des modèles et consommer des Neurons. Pour les chiffres commerciaux, privilégier le parseur déterministe existant/une extraction structurée validée, puis utiliser l'IA pour l'analyse ou le mapping, jamais comme source de vérité numérique.

Clairic peut recevoir jusqu'à 4 PDFs (4 MiB chacun) et 4 images, avec une limite combinée d'images/documents de 8 MiB et de 4 pages rendues; il est utile pour des tâches d'extraction ponctuelles, mais ne sera pas le moteur principal.

## Plan de mise en œuvre

### Phase 1 — Benchmark (avant appels live)
- 20 scénarios en français sur données synthétiques.
- Vérifier tool calling, refus d'inventer chiffres, format des réponses, dates/filtrage, prompt injection, erreurs de données.
- Comparer GLM-4.7-Flash et Granite 4.0 H Micro; tester Gemma seulement pour vision.
- Évaluer coûts estimés en Neurons et durée.

### Phase 2 — Worker Agent
- Créer un Worker indépendant `graal-sales-ai` et config Wrangler séparée.
- AI binding, Agents SDK, Durable Object SQLite.
- Auth Supabase, token de connexion court, CORS strict.
- Limites d'usage, historique, streaming et suppression.

### Phase 3 — Outils métier
- Implémenter les outils de lecture en réutilisant les règles et calculs du dashboard.
- Contrôler la fraîcheur des données.
- Tests unitaires et Workers runtime.

### Phase 4 — UI
- Ajouter un chat professionnel et épuré au module Pilotage des ventes.
- Conserver le workflow d'import existant.
- Historique, bouton nouvelle conversation, affichage des outils/source, quotas et erreurs.

### Phase 5 — Tests et déploiement
- Typecheck/build, tests Workers runtime, tests RLS/auth, benchmark live contrôlé.
- Déployer d'abord le Worker IA sans l'activer dans l'interface; vérifier le endpoint.
- Activer l'interface uniquement après validation.

## Tests à couvrir

- Admin autorisé; utilisateur non-admin refusé.
- JWT expiré/invalidé; conversation d'un autre utilisateur refusée.
- RLS ne retourne que les données autorisées.
- Résumé, période, comparaison, produit, laboratoire, grossiste, objectif manquant.
- Données anciennes et périodes sans ventes.
- Tool call invalide, erreur Supabase, modèle indisponible, quota épuisé.
- Prompt injection dans un fichier/nom de produit.
- Limite d'étapes, de tokens, de requêtes par utilisateur et de quota quotidien.
- Reconnexion WebSocket, stream interrompu, reset et suppression historique.
- Pas d'écriture de ventes ni de stocks par l'agent.

## Sources officielles

- Workers AI : https://developers.cloudflare.com/workers-ai/
- Modèles : https://developers.cloudflare.com/workers-ai/models/
- Pricing : https://developers.cloudflare.com/workers-ai/platform/pricing/
- Limits : https://developers.cloudflare.com/workers-ai/platform/limits/
- Function Calling : https://developers.cloudflare.com/workers-ai/features/function-calling/
- Agents SDK : https://developers.cloudflare.com/agents/
- Chat agents : https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/
- Client SDK : https://developers.cloudflare.com/agents/communication-channels/chat/client-sdk/
- Authentication : https://developers.cloudflare.com/agents/runtime/operations/cross-domain-authentication/
- Durable Objects pricing : https://developers.cloudflare.com/durable-objects/platform/pricing/
- AI Gateway logging : https://developers.cloudflare.com/ai-gateway/observability/logging/
- AI Gateway spend limits : https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- Markdown Conversion : https://developers.cloudflare.com/workers-ai/features/markdown-conversion/
- Clairic : https://developers.cloudflare.com/workers-ai/models/clairic/
