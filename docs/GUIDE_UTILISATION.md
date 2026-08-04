# Guide d'utilisation — GRAAL Medical Solutions

Ce guide couvre l'utilisation de la plateforme pour les trois profils : **Visiteur médical (VM)**, **Superviseur** et **Administrateur**. Il ne remplace pas une session de formation avec l'équipe, mais permet de démarrer et de servir de référence au quotidien.

---

## 1. Accès à la plateforme

- **Application terrain (VM)** : `https://graal.editadigoun.workers.dev/` — à ouvrir depuis le navigateur du téléphone (Chrome sur Android, Safari sur iPhone).
- **Tableau de bord de pilotage (Superviseur/Admin)** : même adresse — l'interface s'adapte automatiquement selon votre rôle après connexion.

### Installer l'application sur le téléphone (recommandé pour les VM)

L'application est une **PWA** (Progressive Web App) : elle s'installe comme une vraie application, sans passer par le Play Store ou l'App Store.

**Sur Android (Chrome) :**
1. Ouvrez le lien dans Chrome.
2. Appuyez sur le menu (⋮) en haut à droite.
3. Choisissez **« Ajouter à l'écran d'accueil »** (ou **« Installer l'application »**).
4. Confirmez. Une icône GRAAL apparaît sur l'écran d'accueil, comme une application classique.

**Sur iPhone (Safari) :**
1. Ouvrez le lien dans Safari (obligatoirement Safari, pas Chrome, sur iPhone).
2. Appuyez sur l'icône de partage (carré avec une flèche vers le haut).
3. Choisissez **« Sur l'écran d'accueil »**.
4. Confirmez. L'icône GRAAL apparaît sur l'écran d'accueil.

Une fois installée, l'application se met à jour automatiquement — aucune réinstallation manuelle n'est nécessaire lors des mises à jour de la plateforme.

### Première connexion

Un administrateur crée votre compte et vous envoie un email d'invitation. Cliquez sur le lien reçu : vous arrivez sur un écran **« Définir mon mot de passe »**. Choisissez un mot de passe, puis vous êtes connecté automatiquement.

Si le lien a expiré, demandez à l'administrateur de vous renvoyer une invitation (écran Équipes & VM, bouton « Renvoyer l'invitation »).

---

## 2. Guide Visiteur Médical (VM)

### 2.1 Tableau de bord

À l'ouverture de l'application : visites prévues/réalisées du jour, taux de réalisation, score de couverture du portefeuille, et votre **score mensuel de performance** (mis à jour en temps réel), avec le détail par critère (couverture, ponctualité, exécution du planning, discipline des clôtures).

### 2.2 Planning hebdomadaire

- Chaque semaine, vous devez soumettre votre programme de visites **au plus tard le jeudi à 21h00** (heure du Bénin). Passé ce délai, la soumission est bloquée par le serveur, quelle que soit l'heure de votre téléphone.
- Ajoutez vos clients jour par jour (Lundi à Vendredi), en respectant la hiérarchisation imposée :
  - **Lundi et Mardi** : clients GROS potentiel uniquement.
  - **Mercredi** : GROS et MOYEN.
  - **Jeudi** : MOYEN et FAIBLE (avec une part limitée de FAIBLE).
  - **Vendredi** : FAIBLE potentiel exclusivement.
- Minimum **15 visites médicales et 3 visites pharmacie par jour** (18 au total), sans limite maximale.
- Un même client ne peut être programmé qu'une seule fois par semaine (sauf dérogation exceptionnelle accordée par l'administrateur).
- Ces règles sont vérifiées par le serveur : si une ligne ne respecte pas la hiérarchisation ou le verrouillage sectoriel, elle sera refusée automatiquement, même en cas de tentative de contournement.

### 2.3 Saisie des visites du jour

Chaque jour, l'écran **Visites** liste vos clients programmés. Ouvrez une ligne pour saisir :

**Visite médicale :**
- Cachet prospect / cachet centre (cases à cocher)
- Produits présentés (sélection parmi la liste du catalogue)
- Promesses obtenues (liste + précision libre)
- Nombre de prescriptions constatées (compteur)

**Visite pharmacie :**
- Niveau de stock (rupture / faible / correct / bon)
- Commande obtenue (quantité ou montant)
- Veille concurrentielle (note libre courte)

Appuyez sur **« Enregistrer et passer au suivant »** après chaque visite.

**Visite hors programme** : si vous visitez un client non prévu ce jour-là, utilisez le bloc « Visite hors programme » en bas de la liste. Un motif est obligatoire ; cette visite est signalée à votre superviseur et n'est pas comptée dans le calcul de conformité normal.

**Position GPS obligatoire** : chaque visite est horodatée et géolocalisée automatiquement. Si le GPS est désactivé ou refusé, la saisie est bloquée tant que la position n'est pas disponible.

### 2.4 Clôture de journée

Avant **19h00**, clôturez votre journée depuis l'écran Clôture :
1. Le récapitulatif du jour s'affiche en premier (X visites faites / Y manquantes).
2. Pour chaque visite manquante, indiquez un motif (liste + précision optionnelle).
3. Prenez en photo la fiche papier — **uniquement via l'appareil photo** (pas d'import depuis la galerie), pour garantir l'authenticité de la preuve terrain.
4. Validez la clôture.

Des rappels automatiques arrivent à 18h30 et 18h55. Si la clôture n'est pas faite à 20h00, elle est **forcée automatiquement** : les visites non saisies passent en « Non fait / non justifiée » et pénalisent votre score.

Une fois une journée clôturée, il n'est plus possible d'y revenir pour ajouter ou modifier une visite.

### 2.5 Portefeuille clients

Consultez la liste de vos clients assignés, leur potentiel, secteur, historique de visites, date de dernière visite et prochaine visite due. Si la fréquence de visite attendue n'est pas respectée sur le mois en cours, un encart apparaît sur la fiche du client pour **justifier** la situation — à remplir dès que possible, votre superviseur en est informé automatiquement.

### 2.6 Reporting hebdomadaire

Chaque semaine, complétez le reporting : analyse générale, points forts, veille concurrentielle, suggestions, appréciation personnelle. La synthèse chiffrée (visites prévues/réalisées/taux) est calculée automatiquement. Votre superviseur y ajoute son visa et ses recommandations. Le reporting est exportable en PDF depuis l'écran.

### 2.7 Mode hors ligne

En zone sans réseau, vous pouvez continuer à saisir vos visites (y compris hors-programme) et à clôturer votre journée : les données sont conservées sur votre téléphone et envoyées automatiquement dès que le réseau revient. Un bandeau en haut de l'écran indique le nombre d'éléments en attente de synchronisation. Ne fermez pas l'application avant que la synchronisation soit terminée (bandeau qui disparaît).

### 2.8 Notifications

Les rappels et alertes apparaissent dans l'écran Notifications. Vous pouvez aussi activer les **notifications push** depuis votre profil (« Mon profil » → Notifications push) pour être alerté même quand l'application est fermée.

---

## 3. Guide Superviseur

### 3.1 Tableau de bord

Vue d'ensemble en temps réel : avancement du jour par VM, alertes récentes, clients sous-visités de vos équipes, clôtures du jour avec la photo de la fiche papier en regard des données saisies. Un filtre équipe permet de restreindre l'affichage.

### 3.2 Validation des programmes

Les programmes soumis par vos VM apparaissent avec un code couleur (conforme / sous-couvert / sur-couvert par rapport aux quotas cibles). Validez ou rejetez chaque programme ; un rejet renvoie le programme en brouillon avec un motif visible par le VM.

### 3.3 Équipes & VM

Consultez et gérez les VM de vos équipes (statut, secteur). L'assignation superviseur ↔ équipe est faite par l'administrateur.

### 3.4 Plan d'activités mensuel

Chaque équipe doit avoir un plan d'activités soumis **au plus tard le 25 du mois précédent**. Sans ce plan, vos VM ne pourront pas programmer leurs visites du mois suivant — la plateforme bloque automatiquement.

### 3.5 Duo terrain

Après un accompagnement terrain avec un VM, enregistrez un rapport de duo : connaissance produits, maîtrise du portefeuille, relationnel (notes de 1 à 5), avec un commentaire libre.

### 3.6 Animation d'équipe

Journalisez vos actions d'animation : point quotidien, réunions du lundi/mercredi, challenges, formation continue, coaching terrain et travail sur les argumentaires avec un VM en particulier. Ces éléments alimentent l'indicateur d'animation d'équipe visible par l'administrateur.

### 3.7 Reporting

Consultez et visez les reportings hebdomadaires de vos VM, avec appréciation et recommandations.

### 3.8 Fusion stratégique de secteurs / mode pharmacie uniquement

Deux options exceptionnelles, réservées aux superviseurs et administrateurs (jamais accessibles aux VM) :
- **Fusion de secteurs** : le temps d'une semaine, fusionne les secteurs A et B pour un potentiel donné (ex. opération conjointe sur les GROS).
- **Semaine pharmacie uniquement** : bascule un programme en mode où seules les pharmacies sont programmables, avec la même hiérarchisation.

---

## 4. Guide Administrateur

L'administrateur a accès à tout ce que voit un superviseur, plus les écrans suivants.

### 4.1 Équipes & VM

Vue complète de tous les utilisateurs (VM, superviseurs, admins) : création de compte, désactivation, réactivation, **suppression définitive**, renvoi d'invitation, assignation d'un superviseur à une ou plusieurs équipes.

### 4.2 Clients

Ajout, modification, désactivation d'un client, et affectation à un visiteur médical (verrouillée au secteur du client). Changer le secteur d'un client réinitialise automatiquement son affectation VM si elle ne correspond plus.

### 4.3 Produits

Catalogue des produits présentables lors des visites : ajout, renommage, activation/désactivation. Un produit désactivé disparaît immédiatement des écrans de saisie des VM.

### 4.4 Import du portefeuille

Import initial ou mise à jour du portefeuille clients depuis un fichier CSV (exporté depuis Excel : *Fichier → Enregistrer sous → CSV*). L'écran affiche un aperçu du mappage des colonnes détectées, modifiable avant validation, puis une prévisualisation ligne par ligne avec les erreurs éventuelles avant l'import définitif.

### 4.5 Paramètres

Tous les seuils et réglages de la plateforme sont modifiables sans intervention technique : heure de clôture, heure limite de soumission, quotas hebdomadaires par spécialité, seuil de conformité journalière, seuil du score mensuel minimal, motifs de non-visite, etc.

### 4.6 Activité

Journal d'audit : historique de toutes les actions significatives (création de compte, désactivation, modification de paramètre, changement de statut de programme, clôture, visa de reporting).

### 4.7 Export des évaluations

Export CSV (compatible Excel) des scores mensuels de tous les VM pour un mois donné — à utiliser pour la paie ou le suivi RH.

---

## 5. Questions fréquentes

**Je ne peux pas me connecter / le lien d'invitation ne fonctionne plus.**
Demandez à votre administrateur de vous renvoyer une invitation depuis l'écran Équipes & VM.

**Le bouton de soumission du programme est grisé.**
Le délai (jeudi 21h00, heure du Bénin) est probablement dépassé. Contactez votre superviseur ou l'administrateur.

**Je ne peux pas ajouter un client à mon programme.**
Vérifiez qu'il fait partie de votre portefeuille, qu'il est dans votre secteur (sauf fusion active), et que son potentiel correspond au jour choisi (hiérarchisation).

**La photo de clôture ne se prend pas.**
L'application n'accepte que l'appareil photo en direct (pas de galerie) — vérifiez que l'autorisation caméra est activée pour le navigateur dans les réglages du téléphone.

**Mes visites saisies hors connexion ont-elles bien été envoyées ?**
Un bandeau en haut de l'écran indique le nombre d'éléments en attente. Il disparaît une fois la synchronisation terminée, dès que le réseau revient.

---

*Pour toute question non couverte par ce guide, contactez l'administrateur de la plateforme. Une session de formation avec les équipes est recommandée avant la mise en production généralisée.*
