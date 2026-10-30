# Gourdes²

Application installable (PWA) pour suivre dépenses et économies en gourdes, avec analyses, alertes et assistant IA.

> **Nom du dépôt GitHub recommandé : `Gourdes2`** (avec le chiffre 2, pour une URL propre).

## Mise en ligne sur GitHub Pages
1. Créez un dépôt GitHub et envoyez **tout le contenu de ce dossier** à la racine (index.html, app.js, style.css, sw.js, manifest.webmanifest, dossier icons).
2. Settings → Pages → Source : branche `main`, dossier `/ (root)`.
3. Ouvrez `https://VOTRE-NOM.github.io/NOM-DU-DEPOT/` sur le téléphone, puis installez l'app.
   - Android (Chrome) : bouton « Installer l'application » dans l'onglet Plus, ou menu ⋮.
   - iPhone (Safari) : Partager → « Sur l'écran d'accueil ».

## Assistant IA
Onglet Plus → collez votre clé API Google Gemini (aistudio.google.com → « Get API key »). Elle reste dans le navigateur de l'appareil.
Ne la mettez jamais dans le code ni dans le dépôt. Le niveau gratuit de Gemini suffit pour un usage personnel.

## Synchronisation entre appareils
Onglet Plus → « Synchronisation » → collez un jeton GitHub classique avec **uniquement** le droit `gist`
(lien de création fourni dans l'app). Sur chaque appareil, collez le **même jeton**.
- Les données sont stockées dans un gist secret « Mes Gourdes sync » de votre compte.
- Fusion sans perte : les lignes ajoutées sur deux appareils sont toutes conservées, une suppression se propage.
- Un gist secret n'est pas listé mais reste lisible par quiconque en connaît l'adresse.
- Le jeton et la clé IA ne sont jamais écrits dans le gist ni dans les sauvegardes.

## Bilan trimestriel
Onglet Analyse → « Bilan trimestriel » : dépenses et économies des 3 mois, comparaison avec le trimestre précédent, catégories, points à changer et points positifs. Une alerte apparaît à la fin de chaque trimestre. Le bouton « Bilan détaillé par l'IA » demande une analyse écrite avec un objectif chiffré.

## Bilan annuel
Onglet Analyse → « Bilan annuel » : graphique mensuel, taux d'épargne, comparaison avec l'année précédente, catégories, priorités à changer. Une alerte apparaît en début d'année suivante. Minimum 20 opérations requises.

## Mise à jour
Quand vous modifiez les fichiers, changez `CACHE = 'gourdes-v5'` dans sw.js (v4, v5…) pour forcer la mise à jour chez les utilisateurs.
