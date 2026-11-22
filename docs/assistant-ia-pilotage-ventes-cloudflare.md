# Assistant IA — Pilotage des ventes Provisit (GRAAL)

**Date de l'étude : 22 novembre 2026**  
**Statut : API benchmarkée; migration appliquée; chat intégré au code; Worker IA déployé; CI build/tests/dry-run réussis. Déploiement du frontend Provisit reste à faire.**

## Objectif

Intégrer dans **Pilotage des ventes** un agent conversationnel accessible à l'administrateur dans le tableau de bord Provisit. L'agent doit pouvoir consulter les données commerciales autorisées, faire des analyses, expliquer les écarts, comparer les périodes, produire des synthèses et, plus tard, aider à préparer les imports. Le démarrage doit éviter toute API payante séparée.

## Décision technique préliminaire

- **Cloudflare Workers AI** comme moteur IA.
- **Modèle principal :** `@cf/zai-org/glm-4.7-flash`.
- **Modèle de secours à benchmarker :** `@cf/ibm-granite/granite-4.0-h-micro`.
- **Modèle multimodal candidat :** `@cf/google/gemma-4-26b-a4b-it`, seulement si une tâche vision/document le justifie.
- **Agent V1 :** orchestrateur tool-calling personnalisé avec `env.AI.run`, sans dépendance SDK supplémentaire.
- **Chat/historique :** tables Supabase avec RLS; réponse en streaming SSE.
- **Frontend :** React, `fetch` + lecture SSE; chat intégré au module Pilotage des ventes.
- **Backend IA :** Worker séparé pour isoler l'IA du Worker statique actuel `graal`.
- **Cloudflare Agents SDK / Durable Objects :** option V2 si l'on a besoin d'agents persistants, de tâches en arrière-plan ou de reprise de stream.
- **Données métier :** Supabase Provisit, requêtes limitées et validées, avec JWT utilisateur et RLS; pas de clé service-role dans l'agent.
- **Première version :** outils en lecture seule. Toute écriture/import reste dans le workflow existant et demande une validation humaine.

## Vérifications effectuées

### Cloudflare

- La connexion Cloudflare est active.
- Le Worker `graal` existe et sert actuellement le front statique (configuration Wrangler avec `assets`, sans entrée Worker métier ni binding AI).
- Aucun AI Gateway n'est actuellement configuré dans le compte vérifié.
- Le catalogue Workers AI contient `@cf/zai-org/glm-4.7-flash`.
- La fiche du modèle indique un contexte de 131 072 tokens, Function Calling et Reasoning pris en charge.
- Une série de tests live synthétiques a été exécutée via l'API REST Workers AI : réponse simple, tool call, réponse finale avec résultat d'outil, streaming.
- Aucun fichier ni donnée commerciale réelle n'a été envoyé au modèle.

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
- Un chat HTTP/SSE à faible volume devrait rester dans ces quotas; V1 n'utilise pas Durable Objects.

## Architecture V1 retenue après test API

```text
Provisit (React/Vite)
  Pilotage des ventes
    ├─ Chat Assistant IA
    └─ Import ventes (workflow local existant)
          │ HTTP + SSE / Supabase JWT
          ▼
Worker séparé : graal-sales-ai
  ├─ Authentification Supabase / contrôle admin / CORS
  ├─ Workers AI binding (AI)
  ├─ Orchestrateur tool-calling (max 4 tours)
  ├─ Calculs métier dans le code
  ├─ Limites de requêtes et de Neurons estimés
  └─ Streaming de la réponse finale
          │ Supabase JWT utilisateur (RLS)
          ▼
Supabase Provisit
  ├─ Historique conversation + usage
  ├─ ventes_hebdomadaires
  ├─ objectifs_mensuels_produits
  ├─ produits_pilotage
  ├─ grossistes
  ├─ laboratoires
  └─ mappings_produits_grossistes
```

V1 n'utilise ni Durable Objects ni le service Agents SDK : le chat et son historique sont déjà couverts par Supabase, et l'API Workers AI native a été testée. Cela évite une dépendance supplémentaire et facilite le contrôle de quota/authentification. Agents SDK reste une option ultérieure.

### Authentification et isolation

1. Le frontend utilise la session Supabase existante.
2. Le Worker vérifie le JWT avec Supabase Auth et le rôle `admin`.
3. Le JWT utilisateur est envoyé dans l'en-tête Authorization, jamais dans les logs ni dans l'historique.
4. Les outils utilisent le JWT utilisateur pour les requêtes PostgREST, donc RLS reste appliqué; aucun service-role key.
5. Les conversations et messages sont isolés par `owner_id` et RLS.
6. Aucun tool d'écriture ni SQL arbitraire n'est exposé au modèle.

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
- Limite de 4 tours de tool calling par demande, taille des résultats, tokens de sortie et historique contrôlés.
- Conversations et messages persistés dans Supabase, isolés par owner; reset et suppression.
- Ne pas journaliser prompts, réponses ni tokens Supabase. Logs techniques sans contenu.
- AI Gateway est facultatif en V1. Si utilisé, désactiver la collecte de payload (metadata seulement) et le cache pour les données commerciales.

## État de déploiement

- Worker IA : `https://graal-sales-ai.ccds22431.workers.dev` (script, binding AI et sous-domaine workers.dev confirmés par l'API Cloudflare; endpoint santé : `https://graal-sales-ai.ccds22431.workers.dev/health`).
- Le Worker principal `graal` est un déploiement assets-only actif (version 464 au moment de l'étude). Il n'a pas été remplacé pour éviter d'écraser le déploiement principal.
- Frontend : source intégrée à `main`, build CI réussi, mais le Worker statique `graal` n'a pas été redéployé.
- Mobile OTA : workflow Capgo désormais manuel seulement en attendant la résolution de l'exigence de plan.
- Aucun fichier de vente réelle n'a été transmis au modèle pendant les tests.

## Fichiers

Cloudflare Markdown Conversion accepte notamment PDF, CSV, XLSX/XLS, DOCX, ODS/ODT, HTML, XML et images. La conversion est gratuite pour la plupart des formats; la conversion d'images peut appeler des modèles et consommer des Neurons. Pour les chiffres commerciaux, privilégier le parseur déterministe existant/une extraction structurée validée, puis utiliser l'IA pour l'analyse ou le mapping, jamais comme source de vérité numérique.

Clairic peut recevoir jusqu'à 4 PDFs (4 MiB chacun) et 4 images, avec une limite combinée d'images/documents de 8 MiB et de 4 pages rendues; il est utile pour des tâches d'extraction ponctuelles, mais ne sera pas le moteur principal.

## Plan de mise en œuvre

### Phase 1 — Benchmark synthétique (partiellement réalisé)
- Tests live synthétiques GLM-4.7-Flash : réponse simple, tool call, réponse finale avec résultat d'outil, streaming.
- Comparer Granite 4.0 H Micro; tester Gemma seulement pour vision.
- 20 scénarios supplémentaires à automatiser.

### Phase 2 — Worker API (réalisé)
- Worker indépendant `graal-sales-ai` créé et déployé via API Cloudflare.
- Binding Workers AI `AI`, endpoint `/health`, endpoint `/api/chat`.
- Orchestrateur tool-calling, SSE, auth Supabase et contrôle admin.
- CORS, quota de 20 demandes compte/jour, 10/admin/jour, réservation 300 Neurons/demande (6 000/jour).
- Observabilité/logs désactivés côté Worker pour éviter la collecte de payloads.

### Phase 3 — Outils métier
- Implémenter les outils de lecture en réutilisant les règles et calculs du dashboard.
- Contrôler la fraîcheur des données.
- Tests unitaires et Workers runtime.

### Phase 4 — UI (réalisé dans le code)
- Chat intégré à Pilotage des ventes avec historique, nouvelles conversations, suppression et prompts rapides.
- Le workflow d'import existant est conservé dans un bouton séparé.
- Affichage des sources, statuts d'analyse, quotas et erreurs.

### Phase 5 — Tests et déploiement (partiellement réalisé)
- Build React réussi; tests unitaires Worker réussis; `wrangler deploy --dry-run` réussi dans CI.
- Migration Supabase appliquée; tables et RLS vérifiées.
- Worker IA déployé, workers.dev activé; la vérification HTTP externe de `/health` n'a pas pu être effectuée depuis l'environnement de recherche.
- Le frontend Provisit n'est pas encore déployé.
- Capgo OTA automatique suspendu : le compte a retourné une exigence d'upgrade de plan; aucun OTA n'a été publié.

## Résultats du benchmark live synthétique

Les tests ont été exécutés avec le modèle GLM-4.7-Flash sur l'API Cloudflare connectée, sans données Provisit réelles :

- Réponse simple avec `chat_template_kwargs.enable_thinking=false` : succès, 18 tokens total, 0,2226 Neurons.
- Function calling : tool call `get_sales_summary` avec dates valides; arguments JSON corrects; 286 tokens, 3,2725 Neurons.
- Réponse finale après résultat d'outil synthétique (100 ventes, objectif 120) : taux calculé correctement, 83,3 %; 183 tokens, 3,0459 Neurons.
- Streaming simple : SSE fonctionne avec `stream=true` et `stream_options.include_usage`; 33 tokens, 0,5214 Neurons.
- Tool calling en streaming : les deltas `tool_calls` ont été reçus; l'agent doit accumuler les arguments puis les valider. Test synthétique réussi.
- Avec le raisonnement activé par défaut et un plafond de 32 tokens, le modèle a produit du raisonnement sans réponse finale (finish reason `length`). Pour le chat métier V1, désactiver le thinking réduit les coûts et améliore le format de sortie.
- Total de ces tests : environ 8,30 Neurons. Les appels sont très en dessous de l'allocation gratuite de 10 000 Neurons/jour.

Le tool calling est documenté comme Beta côté Workers AI; les arguments et noms d'outils devront toujours être validés côté Worker.

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
