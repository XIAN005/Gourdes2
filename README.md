# Gourdes²

[![Démo en ligne](https://img.shields.io/badge/d%C3%A9mo-GitHub%20Pages-0A66C2?style=flat-square)](https://xian005.github.io/Gourdes2/)
[![PWA](https://img.shields.io/badge/PWA-installable-2f5a49?style=flat-square)](https://xian005.github.io/Gourdes2/)
[![Hors ligne](https://img.shields.io/badge/hors%20ligne-oui-77621f?style=flat-square)](https://xian005.github.io/Gourdes2/)
[![Cache](https://img.shields.io/badge/service%20worker-v14-lightgrey?style=flat-square)](sw.js)

**Suivi des dépenses et de l'épargne en gourdes haïtiennes — dans le navigateur, sans compte ni serveur.**

**[▶ Ouvrir l'application](https://xian005.github.io/Gourdes2/)**

Gourdes² est une application web progressive (PWA) qui fonctionne entièrement côté navigateur.
Vos opérations restent sur votre appareil par défaut ; si vous le souhaitez, elles peuvent être
synchronisées entre téléphone et ordinateur via un gist GitHub **chiftré de bout en bout**.
Aucun backend, aucune base de données, aucune dépendance : ouvrez le lien et c'est parti.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Essayer et installer l'application](#essayer-et-installer-lapplication)
- [Fonctionnement des onglets](#fonctionnement-des-onglets)
- [Confidentialité et sécurité](#confidentialité-et-sécurité)
- [Assistant IA](#assistant-ia)
- [Synchronisation entre appareils](#synchronisation-entre-appareils)
- [Développement et déploiement](#développement-et-déploiement)
- [Questions fréquentes](#questions-fréquentes)
- [Historique des versions](#historique-des-versions)

## Fonctionnalités

| | |
|---|---|
| 💰 **Saisie rapide** | Montants fréquents, dernière catégorie mémorisée, suggestions de notes, décomposition en billets/pièces (5 → 1000 G) |
| 📊 **Analyses** | Tendance sur 6 mois, chiffres clés, catégories comparées au mois précédent, top 5 des dépenses |
| 📅 **Bilans** | Trimestriel et annuel, comparaison avec la période précédente, points à changer / points positifs |
| 📈 **Projection** | Effet cumulé à 1, 5 et 10 ans, avec ou sans intérêt, capital de départ configurable |
| 🔔 **Alertes** | Budgets dépassés, plafond mensuel, dépenses inhabituelles, objectif atteint, rappel de saisie |
| 🤖 **Assistant IA** | Conseiller financier (Gemini) et saisie d'opérations en langage naturel/français créole |
| 🔐 **Confidentialité** | Code PIN, masquage des montants, chiffrement AES-256-GCM pour la synchronisation |
| 📴 **Hors ligne** | Service worker : l'application s'ouvre et fonctionne sans connexion |
| 📦 **Export / import** | Sauvegarde JSON et export CSV de la sélection affichée |

## Essayer et installer l'application

1. Ouvrez **[https://xian005.github.io/Gourdes2/](https://xian005.github.io/Gourdes2/)** sur votre téléphone ou ordinateur.
2. Au premier lancement, trois questions facultatives (objectif, plafond, montant déjà épargné) préparent l'application. Vous pouvez les passer.
3. Installez-la pour l'avoir sur l'écran d'accueil :

| Plateforme | Méthode |
|---|---|
| Android / Chrome | Menu ⋮ → « Installer l'application », ou bouton dans Réglages → Installation |
| iPhone / Safari | Partager → « Sur l'écran d'accueil » |
| Ordinateur | Icône d'installation dans la barre d'adresse (Chrome/Edge) |

Une fois installée, elle s'ouvre en plein écran et fonctionne hors ligne.

> **Hébergement personnel :** le dépôt peut être déployé tel quel sur n'importe quel hébergeur statique.
> Voir [Développement et déploiement](#développement-et-déploiement).

## Fonctionnement des onglets

- **Accueil** : solde, économies/dépenses du mois, suivi hebdomadaire, objectif avec échéance, plafond, citation, formulaire d'ajout, dépenses par catégorie.
- **Historique** : filtres (période, type, catégorie, montant, texte), modification et suppression avec « Annuler » pendant 6 secondes, export CSV.
- **Analyse** : quatre vues — Mois, Trimestre, Année et Projection. Le bilan trimestriel demande 10 opérations minimum, le bilan annuel 20.
- **Assistant** : saisie par phrase (« 250 au marché hier, 100 transport… ») et conversation avec le conseiller.
- **Réglages** : objectif, budgets, compteur de billets, clé Gemini, notifications, installation, synchronisation, PIN, sauvegardes.

Quelques détails utiles :

- La semaine affichée va du lundi à aujourd'hui et est comparée à la semaine précédente **au même jour**.
- Si une date visée est renseignée, l'application calcule le montant hebdomadaire nécessaire pour atteindre l'objectif.
- La projection est indicative : elle n'intègre ni inflation ni variation de change, et un taux d'intérêt n'est jamais garanti.
- Les modifications d'une opération se propagent entre appareils : la version la plus récente l'emporte.

## Confidentialité et sécurité

Aucune donnée n'est envoyée à un serveur appartenant au projet : il n'y en a pas.

| Information | Stockage | Transmission |
|---|---|---|
| Opérations, budgets, objectif, réglages | `localStorage` du navigateur | Uniquement si vous activez l'assistant IA ou la synchronisation |
| Empreinte du code PIN | `localStorage` (PBKDF2-SHA256, 200 000 itérations, sel aléatoire) | Jamais |
| Clé API Gemini | `localStorage` de l'appareil | À Google, uniquement lors d'une demande à l'assistant |
| Jeton GitHub + phrase secrète | `localStorage` de l'appareil | Jeton vers `api.github.com` ; **phrase secrète jamais transmise** |
| Données synchronisées | Gist secret GitHub | Chiffrées en AES-256-GCM avant envoi |

À savoir :

- Le **code PIN verrouille l'écran** (après une minute en arrière-plan) mais **ne chiffre pas** les données locales.
- Le bouton « Masquer les montants » remplace les valeurs par des puces, y compris dans les graphiques.
- Le mode « Limiter les données envoyées à l'assistant » réduit le contexte à 10 opérations sans les notes.
- La phrase secrète de synchronisation ne peut pas être récupérée si elle est oubliée : notez-la quelque part en sécurité.
- Le jeton GitHub et la clé API ne figurent **jamais** dans les sauvegardes ni dans le gist.

## Assistant IA

Onglet **Réglages → Assistant** : collez une clé API Google Gemini (gratuite sur [aistudio.google.com](https://aistudio.google.com/)) puis « Enregistrer et tester ».

- La clé reste dans le navigateur de l'appareil. **Ne la mettez jamais dans le code ni dans le dépôt.**
- Le modèle par défaut est `gemini-3.8-flash` ; le niveau gratuit suffit pour un usage personnel.
- Le conseiller reçoit un résumé de vos finances (totaux, 6 derniers mois, catégories et opérations récentes) pour répondre. Les conseils sont indicatifs et ne remplacent pas un professionnel.
- Si vous n'avez pas de clé, tout le reste de l'application fonctionne normalement.

## Synchronisation entre appareils

Onglet **Réglages → Synchronisation** :

1. Créez un jeton GitHub classique avec **uniquement** le droit `gist` (le lien est fourni dans l'application).
2. Collez le **même jeton** sur chaque appareil, ainsi que la **même phrase secrète** (8 caractères minimum).
3. Les données sont stockées dans un gist secret nommé « Mes Gourdes sync ».

La fusion est sans perte : les lignes ajoutées sur deux appareils sont toutes conservées, une suppression se propage et les réglages utilisent la version la plus récente. Le chiffrement (PBKDF2-SHA256 250 000 itérations + AES-256-GCM) se fait dans le navigateur : GitHub ne reçoit que des données illisibles sans votre phrase.

## Développement et déploiement

Aucune dépendance, aucun outil de build. Le dépôt contient :

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des cinq onglets et dialogues |
| `app.js` | Logique, calculs, rendu, chiffrement, appels API |
| `style.css` | Styles clair/sombre et mise en page responsive |
| `sw.js` | Service worker (cache et fonctionnement hors ligne) |
| `manifest.webmanifest` | Métadonnées d'installation PWA |
| `icons/` | Icônes SVG/PNG (dont une icône maskable) |

**Déployer sur GitHub Pages :** `Settings → Pages → Source : branche main, dossier / (root)`. L'URL publique est `https://xian005.github.io/Gourdes2/`.

**Après une modification des fichiers statiques, incrémentez `CACHE` dans `sw.js`** (ex. `gourdes-v14` → `gourdes-v15`) pour forcer la mise à jour chez les utilisateurs. Version actuelle : `gourdes-v14`.

## Questions fréquentes

**Où sont mes données ?** Dans le stockage local du navigateur de chaque appareil. Elles ne quittent l'appareil que si vous activez la synchronisation ou interrogez l'assistant IA.

**Puis-je l'utiliser sans internet ?** Oui. Le service worker met l'application en cache ; seules l'IA et la synchronisation nécessitent une connexion.

**Comment faire une sauvegarde ?** Réglages → Mes données → « Exporter une sauvegarde ». Le fichier JSON peut être réimporté sur un autre appareil.

**J'ai oublié ma phrase secrète de synchronisation.** Elle ne peut pas être récupérée. Désactivez la synchronisation, puis réactivez-la avec une nouvelle phrase ; le gist existant restera illisible mais vos données locales restent intactes.

**L'application ne se met pas à jour ?** Rechargez la page une deuxième fois, ou fermez et rouvrez l'application. Vérifiez que `CACHE` a bien été incrémenté dans `sw.js`.

**Puis-je utiliser l'app sans clé Gemini ?** Oui, toutes les fonctions locales (saisie, analyses, bilans, alertes, projection, export) restent disponibles.

## Historique des versions

- **v14** — Correction de la validation des dates, du suivi des bilans lus et du toast « Annuler » ; persistance du verrouillage PIN ; rendu paresseux par onglet et index des opérations ; recherche débouncée ; option de confidentialité pour l'IA ; service worker en cache-first pour les assets.
- **v13 et antérieures** — Ajouts progressifs de la synchronisation chiffrée, des bilans trimestriels/annuels, de la projection, de l'assistant IA et de la PWA.

---

Fait avec soin pour suivre chaque gourde. 💚
