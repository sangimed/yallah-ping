# Yallah Ping

Extension navigateur WebExtensions en TypeScript pour supervision visuelle locale d'applications web internes sans notifications.

Le MVP cible des utilisateurs en astreinte non techniques :

- installation simple en mode developpeur
- selection visuelle des zones a surveiller
- vocabulaire non technique
- alarme sonore forte et continue jusqu'a acquittement
- detail clair du changement avant / apres
- plusieurs surveillances en parallele
- fonctionnement 100 % local, sans backend

## Ce que fait le MVP

1. l'utilisateur ouvre sa page interne habituelle ;
2. il clique sur l'extension puis sur `Choisir sur la page` ;
3. il survole une zone visuelle, clique dessus, lui donne un nom et l'enregistre ;
4. l'extension surveille ensuite cette zone :
   - reaction immediate via `MutationObserver`
   - verification reguliere via polling configurable
5. au premier changement detecte, une fenetre d'alerte s'ouvre, le son boucle en continu et s'arrete seulement apres acquittement explicite.

## Architecture

### 1. Background service worker

Fichier principal : [src/background/index.ts](/home/sangimed/Repositories/yallah-ping/src/background/index.ts)

Responsabilites :

- centraliser les modifications d'etat
- stocker les surveillances et alertes dans `storage.local`
- mettre a jour le badge de l'extension
- ouvrir ou re-ouvrir la fenetre d'alerte
- synchroniser les surveillances vers les onglets concernes

### 2. Content script

Fichier principal : [src/content/index.ts](/home/sangimed/Repositories/yallah-ping/src/content/index.ts)

Responsabilites :

- proposer la selection visuelle sur la page
- fabriquer un selecteur CSS stable avec indices de secours
- comparer l'etat courant d'une zone avec son etat de reference
- signaler les changements au background
- continuer a verifier la zone via mutation + polling

### 3. Popup

Fichier principal : [src/popup/index.ts](/home/sangimed/Repositories/yallah-ping/src/popup/index.ts)

Responsabilites :

- demarrer une nouvelle surveillance depuis l'onglet actif
- voir rapidement les surveillances en cours
- mettre en pause / relancer
- ouvrir la page d'alerte ou les reglages

### 4. Page de reglages

Fichier principal : [src/options/index.ts](/home/sangimed/Repositories/yallah-ping/src/options/index.ts)

Responsabilites :

- gerer plusieurs surveillances
- regler les frequences par defaut
- importer un son personnalise en MP3
- ajuster le volume

### 5. Page d'alerte

Fichier principal : [src/alert/index.ts](/home/sangimed/Repositories/yallah-ping/src/alert/index.ts)

Responsabilites :

- jouer le son en boucle
- afficher la liste des changements detectes
- montrer l'etat avant / apres
- permettre l'acquittement global ou ciblé

## Stockage local

Le MVP enregistre dans `chrome.storage.local` / `browser.storage.local` :

- la liste des surveillances
- leur dernier etat de reference
- l'historique recent des alertes
- les reglages par defaut
- le MP3 personnalise, encode en Data URL

Permission importante :

- `unlimitedStorage` pour eviter d'etre trop serre si un MP3 personnalise est stocke localement

## Choix UX

- termes simples : `surveillance`, `zone`, `alarme`, `verification reguliere`
- pas de jargon DOM ou CSS dans l'interface
- selection par survol + clic
- detail lisible des changements
- acquittement explicite obligatoire pour couper le son

## Limites volontaires du MVP

- la page a surveiller doit rester ouverte dans un onglet pour une surveillance continue
- la robustesse du selecteur est bonne pour un MVP, mais pas garantie si l'application change completement de structure
- pas de synchronisation cloud ni partage entre postes

## Prerequis de build

- Node.js 20+ recommande
- npm 10+ recommande

## Installation des dependances

```bash
npm install
```

## Build

```bash
npm run build
```

Le build genere le dossier `dist/`.

## Packaging

```bash
npm run package
```

Cette commande genere des artefacts dans `artifacts/` :

- paquets `.zip` pour upload Chrome Web Store / Edge Add-ons / signature Firefox
- paquets `unpacked` a partager en interne pour Chrome et Edge
- `checksums.txt`

Le detail des canaux de distribution recommandes est documente dans [docs/distribution.md](/home/sangimed/Repositories/yallah-ping/docs/distribution.md:1).

## Chargement dans Chrome / Edge

1. lancer `npm run build`
2. ouvrir `chrome://extensions` ou `edge://extensions`
3. activer `Mode developpeur`
4. cliquer sur `Charger l'extension non empaquetee`
5. selectionner le dossier `dist`

## Chargement dans Firefox

1. lancer `npm run build`
2. ouvrir `about:debugging#/runtime/this-firefox`
3. cliquer sur `Charger un module complementaire temporaire`
4. selectionner le fichier `dist/manifest.json`

## Utilisation

1. ouvrir l'application web interne a surveiller
2. cliquer sur l'extension
3. cliquer sur `Choisir sur la page`
4. survoler la zone voulue puis cliquer
5. donner un nom simple, par exemple `Liste des tickets`
6. laisser l'onglet ouvert
7. en cas de changement, la fenetre d'alerte s'ouvre et le son boucle jusqu'a acquittement

## Reglages importants

- `Verification reguliere (secondes)` :
  utile si l'application ne declenche pas de mutations DOM detectables
- `Temps de stabilisation (ms)` :
  evite les faux positifs sur des interfaces qui rerender beaucoup
- `Reaction immediate aux changements visibles` :
  active `MutationObserver`
- `Verification reguliere en continu` :
  active le polling

## Fichiers principaux

- [static/manifest.json](/home/sangimed/Repositories/yallah-ping/static/manifest.json)
- [src/background/index.ts](/home/sangimed/Repositories/yallah-ping/src/background/index.ts)
- [src/content/index.ts](/home/sangimed/Repositories/yallah-ping/src/content/index.ts)
- [src/popup/index.ts](/home/sangimed/Repositories/yallah-ping/src/popup/index.ts)
- [src/options/index.ts](/home/sangimed/Repositories/yallah-ping/src/options/index.ts)
- [src/alert/index.ts](/home/sangimed/Repositories/yallah-ping/src/alert/index.ts)
- [src/shared/storage.ts](/home/sangimed/Repositories/yallah-ping/src/shared/storage.ts)
- [src/shared/selectors.ts](/home/sangimed/Repositories/yallah-ping/src/shared/selectors.ts)
- [src/shared/snapshot.ts](/home/sangimed/Repositories/yallah-ping/src/shared/snapshot.ts)

## Verification conseillee

1. creer une surveillance sur une liste de tickets
2. modifier cette liste manuellement dans l'application
3. verifier :
   - que le badge de l'extension passe au rouge
   - que la fenetre d'alerte s'ouvre
   - que le son tourne en boucle
   - que le bouton d'acquittement coupe le son
