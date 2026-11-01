# Gourdes²

Application installable (PWA) pour suivre dépenses et économies en gourdes, avec analyses, alertes, assistant IA et citations sur l'épargne et l'effet cumulé.

## Mise en ligne sur GitHub Pages
1. Créez un dépôt GitHub et envoyez **tout le contenu de ce dossier** à la racine (index.html, app.js, style.css, sw.js, manifest.webmanifest, dossier icons).
2. Settings → Pages → Source : branche `main`, dossier `/ (root)`.
3. Ouvrez `https://VOTRE-NOM.github.io/NOM-DU-DEPOT/` sur le téléphone, puis installez l'app.
   - Android (Chrome) : bouton « Installer l'application » dans l'onglet Réglages, ou menu ⋮.
   - iPhone (Safari) : Partager → « Sur l'écran d'accueil ».

## Assistant IA
Onglet Réglages → collez votre clé API Google Gemini (aistudio.google.com → « Get API key »). Elle reste dans le navigateur de l'appareil.
Ne la mettez jamais dans le code ni dans le dépôt. Le niveau gratuit de Gemini suffit pour un usage personnel.

## Synchronisation entre appareils
Onglet Réglages → « Synchronisation » → collez un jeton GitHub classique avec **uniquement** le droit `gist`
(lien de création fourni dans l'app). Sur chaque appareil, collez le **même jeton**.
- Les données sont stockées dans un gist secret « Mes Gourdes sync » de votre compte.
- Fusion sans perte : les lignes ajoutées sur deux appareils sont toutes conservées, une suppression se propage.
- Les données sont chiffrées (AES-256-GCM) avant l'envoi avec une phrase secrète d'au moins 8 caractères, à saisir à l'identique sur chaque appareil. Elle n'est jamais envoyée et ne peut pas être récupérée.
- Le jeton et la clé IA ne sont jamais écrits dans le gist ni dans les sauvegardes.

## Bilan trimestriel
Onglet Analyse → « Bilan trimestriel » : dépenses et économies des 3 mois, comparaison avec le trimestre précédent, catégories, points à changer et points positifs. Une alerte apparaît à la fin de chaque trimestre. Le bouton « Bilan détaillé par l'IA » demande une analyse écrite avec un objectif chiffré.

## Bilan annuel
Onglet Analyse → « Bilan annuel » : graphique mensuel, taux d'épargne, comparaison avec l'année précédente, catégories, priorités à changer. Une alerte apparaît en début d'année suivante. Minimum 20 opérations requises.

## Mise à jour
Quand vous modifiez les fichiers, changez `CACHE = 'gourdes-v13'` dans sw.js (v6, v7…) pour forcer la mise à jour chez les utilisateurs.

## Confidentialité
Onglet Réglages → « Confidentialité » : code PIN de 4 à 8 chiffres (verrouillage après une minute en arrière-plan, empreinte PBKDF2 uniquement) et bouton pour masquer les montants (aussi sur l'Accueil). Le code PIN verrouille l'écran, il ne chiffre pas les données locales.

## Saisie rapide
La dernière catégorie utilisée est reprise, les montants les plus fréquents de la catégorie sont proposés, les notes récentes sont suggérées, et une opération se modifie depuis l'Historique (bouton Modifier). Les modifications se propagent entre appareils : la version la plus récente l'emporte.

## Semaine et objectif daté
L'Accueil affiche la semaine en cours (lundi à aujourd'hui) comparée à la semaine précédente à la même date. Si vous indiquez une date visée pour l'objectif (Réglages), l'application calcule le montant à mettre de côté chaque semaine pour y arriver.

## Projection (effet cumulé)
Onglet Analyse → Projection : épargne estimée à 1, 5 et 10 ans selon le montant mensuel, le capital de départ et un taux annuel facultatif (0 par défaut). Indicatif : l'inflation n'est pas prise en compte.

## Suppression et premier lancement
Une opération supprimée peut être rétablie pendant 6 secondes (bouton Annuler). Au premier lancement, trois questions facultatives (objectif, plafond mensuel, montant déjà épargné) préparent l'application.
