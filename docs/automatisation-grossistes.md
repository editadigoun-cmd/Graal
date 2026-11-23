# Automatisation de récupération des ventes grossistes — Provisit

## Objectif
Remplacer le téléchargement/import manuel des relevés des portails LABOREX, UBPHAR et UBIPHARM par une collecte automatisée dans un navigateur cloud, puis réutiliser le moteur de rapprochement et de validation des imports existant. Le rapport GAPOB envoyé en PDF reste un canal distinct (email/collecte de pièce jointe) et est traité par son parseur PDF actuel.

## Principe d'architecture
- Cloudflare Worker dédié (pas de Vercel, pas de Neon).
- Cloudflare Browser Run avec Playwright pour les portails dynamiques; Browser Run prend en charge les navigations, formulaires et extraction multi-étapes.
- Cron planifié, avec fréquence configurable par grossiste.
- Secrets de portail (login, password, éventuels codes de session) dans Cloudflare Worker Secrets uniquement; jamais dans Supabase, le code, le front ou les logs.
- Chaque exécution crée un audit dans `grossiste_sync_runs`; les valeurs cumulées extraites sont historisées dans `grossiste_sales_snapshots`.
- Les snapshots sont des cumuls mensuels. Les ventes incrémentales sont calculées à partir du snapshot précédent du même grossiste, du même produit et du même mois. Le changement de mois ne se soustrait jamais au mois précédent.
- Le rapprochement produit réutilise `mappings_produits_grossistes`; les inconnus restent en file de revue. Les nombres extraits ne sont jamais « corrigés » par l'IA.

## Fréquences envisagées (heure Bénin, UTC+1)
- LABOREX : quotidien (après disponibilité des données).
- UBIPHARM : quotidien.
- UBPHAR : samedi soir.
- GAPOB : vendredi soir, à partir du PDF reçu ou d'un canal d'envoi automatique.

Les horaires exacts doivent être ajustés après vérification de la disponibilité des rapports sur chaque portail.

## Adaptateurs à finaliser
Les URLs publiques des portails ne suffisent pas pour connaître les écrans post-authentification, sélecteurs, rapports disponibles, format de téléchargement et protections de connexion. Les adaptateurs de chaque fournisseur doivent être configurés et testés avec un accès client autorisé. Si CAPTCHA, MFA/OTP, blocage anti-bot ou restriction fournisseur survient, le flux passe à `needs_human` et ne contourne pas la protection.

## Mise en service — prérequis
1. Inspecter chaque espace client après connexion autorisée et documenter la séquence de navigation, le rapport exact, le format et les champs.
2. Configurer les secrets Cloudflare séparément pour chaque grossiste.
3. Tester en mode lecture seule, enregistrer le rapport extrait sans écriture des ventes.
4. Comparer le résultat au fichier manuel correspondant et valider les rapprochements.
5. Activer la collecte planifiée.
6. Après validation, intégrer les deltas dans le module ventes et conserver une trace d'audit, avec revue manuelle des anomalies.

## Contrôle de cumul GAPOB
Le champ `Mois (M)` du rapport est le cumul du mois du rapport. `M-1` représente le mois précédent et `M-2` celui d'avant. La période doit être déduite de la date/mois explicite du rapport. Un relevé de fin octobre et un relevé de novembre sont deux périodes distinctes.
