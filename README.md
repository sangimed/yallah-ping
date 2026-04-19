# Yallah Ping

Extension navigateur WebExtensions en TypeScript pour supervision visuelle locale d'applications web internes sans notifications.

Le MVP cible des utilisateurs en astreinte non techniques :

- installation simple en mode développeur
- sélection visuelle des zones à surveiller
- vocabulaire non technique
- alarme sonore forte et continue jusqu'à acquittement
- détail clair du changement avant / après
- plusieurs surveillances en parallèle
- fonctionnement 100 % local, sans backend

## Ce que fait le MVP

1. l'utilisateur ouvre sa page interne habituelle ;
2. il clique sur l'extension puis sur `Choisir sur la page` ;
3. il survole une zone visuelle, clique dessus, lui donne un nom et l'enregistre ;
4. l'extension surveille ensuite cette zone :
   - réaction immédiate via `MutationObserver`
   - vérification régulière via polling configurable
5. au premier changement détecté, une fenêtre d'alerte s'ouvre, le son boucle en continu et s'arrête seulement après acquittement explicite.

## Architecture

### 1. Background service worker

Fichier principal : [src/background/index.ts](src/background/index.ts)

Responsabilités :

- centraliser les modifications d'état
- stocker les surveillances et alertes dans `storage.local`
- mettre à jour le badge de l'extension
- ouvrir ou rouvrir la fenêtre d'alerte
- synchroniser les surveillances vers les onglets concernés

### 2. Content script

Fichier principal : [src/content/index.ts](src/content/index.ts)

Responsabilités :

- proposer la sélection visuelle sur la page
- fabriquer un sélecteur CSS stable avec indices de secours
- comparer l'état courant d'une zone avec son état de référence
- signaler les changements au background
- continuer à vérifier la zone via mutation + polling

### 3. Popup

Fichier principal : [src/popup/index.ts](src/popup/index.ts)

Responsabilités :

- démarrer une nouvelle surveillance depuis l'onglet actif
- voir rapidement les surveillances en cours
- mettre en pause / relancer
- ouvrir la page d'alerte ou les réglages

### 4. Page de réglages

Fichier principal : [src/options/index.ts](src/options/index.ts)

Responsabilités :

- gérer plusieurs surveillances
- régler les fréquences par défaut
- importer un son personnalisé en MP3
- ajuster le volume

### 5. Page d'alerte

Fichier principal : [src/alert/index.ts](src/alert/index.ts)

Responsabilités :

- jouer le son en boucle
- afficher la liste des changements détectés
- montrer l'état avant / après
- permettre l'acquittement global ou ciblé

## Stockage local

Le MVP enregistre dans `chrome.storage.local` / `browser.storage.local` :

- la liste des surveillances
- leur dernier état de référence
- l'historique récent des alertes
- les réglages par défaut
- le MP3 personnalisé, encodé en Data URL

Permission importante :

- `unlimitedStorage` pour éviter d'être trop limité si un MP3 personnalisé est stocké localement

## Choix UX

- termes simples : `surveillance`, `zone`, `alarme`, `vérification régulière`
- pas de jargon DOM ou CSS dans l'interface
- sélection par survol + clic
- détail lisible des changements
- acquittement explicite obligatoire pour couper le son

## Limites volontaires du MVP

- la page à surveiller doit rester ouverte dans un onglet pour une surveillance continue
- la robustesse du sélecteur est bonne pour un MVP, mais pas garantie si l'application change complètement de structure
- pas de synchronisation cloud ni partage entre postes

## Prérequis de build

- Node.js 20+ recommandé
- npm 10+ recommandé

## Installation des dépendances

```bash
npm install
```

## Build

```bash
npm run build
```

Le build génère le dossier `dist/`.

## Packaging

```bash
npm run package
```

Cette commande génère des artefacts dans `artifacts/` :

- paquets `.zip` pour upload Chrome Web Store / Edge Add-ons / signature Firefox
- paquets `unpacked` à partager en interne pour Chrome et Edge
- `checksums.txt`

Le détail des canaux de distribution recommandés est documenté dans [docs/distribution.md](docs/distribution.md).

## Chargement dans Chrome / Edge

1. lancer `npm run build`
2. ouvrir `chrome://extensions` ou `edge://extensions`
3. activer `Mode développeur`
4. cliquer sur `Charger l'extension non empaquetée`
5. sélectionner le dossier `dist`

## Chargement dans Firefox

1. lancer `npm run build`
2. ouvrir `about:debugging#/runtime/this-firefox`
3. cliquer sur `Charger un module complémentaire temporaire`
4. sélectionner le fichier `dist/manifest.json`

## Utilisation

1. ouvrir l'application web interne à surveiller
2. cliquer sur l'extension
3. cliquer sur `Choisir sur la page`
4. survoler la zone voulue puis cliquer
5. donner un nom simple, par exemple `Liste des tickets`
6. laisser l'onglet ouvert
7. en cas de changement, la fenêtre d'alerte s'ouvre et le son boucle jusqu'à acquittement

## Réglages importants

- `Vérification régulière (secondes)` :
  utile si l'application ne déclenche pas de mutations DOM détectables
- `Temps de stabilisation (ms)` :
  évite les faux positifs sur des interfaces qui rerender beaucoup
- `Réaction immédiate aux changements visibles` :
  active `MutationObserver`
- `Vérification régulière en continu` :
  active le polling

## Fichiers principaux

- [static/manifest.json](static/manifest.json)
- [src/background/index.ts](src/background/index.ts)
- [src/content/index.ts](src/content/index.ts)
- [src/popup/index.ts](src/popup/index.ts)
- [src/options/index.ts](src/options/index.ts)
- [src/alert/index.ts](src/alert/index.ts)
- [src/shared/storage.ts](src/shared/storage.ts)
- [src/shared/selectors.ts](src/shared/selectors.ts)
- [src/shared/snapshot.ts](src/shared/snapshot.ts)

## Vérification conseillée

1. créer une surveillance sur une liste de tickets
2. modifier cette liste manuellement dans l'application
3. vérifier :
   - que le badge de l'extension passe au rouge
   - que la fenêtre d'alerte s'ouvre
   - que le son tourne en boucle
   - que le bouton d'acquittement coupe le son
