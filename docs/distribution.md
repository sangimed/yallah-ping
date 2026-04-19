# Distribution de l'extension

Date de référence pour ces recommandations : 16 avril 2026.

## Réponse courte

Si tu veux une installation vraiment simple pour des collègues non techniques :

- Chrome : publie l'extension sur le Chrome Web Store en mode privé pour ton organisation, ou via un lien Chrome Web Store si ton contexte le permet.
- Edge : publie l'extension sur Microsoft Edge Add-ons en visibilité `Hidden`, puis partage simplement l'URL de la fiche.
- Firefox : fais signer l'extension par Mozilla, puis partage le `.xpi` signé ou une URL de téléchargement.

Si tu ne veux passer par aucun store :

- Chrome / Edge : ce ne sera pas vraiment "simple" pour des non techniques ; le fallback reste `Charger l'extension non empaquetée` ou un déploiement entreprise.
- Firefox : c'est jouable si l'extension est signée, car Firefox peut installer un `.xpi` signé depuis un fichier ou une URL web.

## Pourquoi

### Chrome

D'après la documentation Chrome, il n'existe que deux mécanismes officiellement supportés pour distribuer une extension :

- Chrome Web Store
- self-hosting en environnement géré par politiques entreprise

Chrome précise aussi que les extensions non empaquetées doivent servir au développement, et que sous Windows/macOS les extensions self-hosted ne s'installent que via politiques entreprise.

En pratique :

- pour des collègues lambda sous Windows/macOS : Chrome Web Store est la seule voie vraiment simple
- pour un parc géré : politique entreprise possible

## Edge

Microsoft indique que :

- les extensions publiées sur Edge Add-ons sont téléversées en `.zip`, puis converties en `.crx`
- hors store, les scénarios supportés sont surtout les politiques entreprise ou le chargement non empaqueté en mode développeur
- une extension peut être publiée avec la visibilité `Hidden`, ce qui la retire de la recherche tout en restant installable via l'URL de fiche

En pratique :

- pour des collègues : `Hidden` sur Edge Add-ons est très bien
- pour un parc géré : politique entreprise

## Firefox

La doc Mozilla indique que pour distribuer soi-même une extension, les utilisateurs peuvent l'installer :

- depuis un téléchargement web
- depuis un fichier `.xpi`

Mais ce fichier doit être signé par Mozilla pour une installation normale.

En pratique :

- la meilleure option est une publication `unlisted` / signature Mozilla, puis envoi du `.xpi` signé ou d'une URL privée

## Artefacts générés par le projet

La commande suivante construit l'extension puis fabrique les paquets utiles :

```bash
npm run package
```

Elle génère dans `artifacts/` :

- `yallah-ping-chrome-webstore-vX.Y.Z.zip`
- `yallah-ping-edge-addons-vX.Y.Z.zip`
- `yallah-ping-firefox-upload-vX.Y.Z.zip`
- `yallah-ping-chrome-unpacked-vX.Y.Z.zip`
- `yallah-ping-edge-unpacked-vX.Y.Z.zip`
- `checksums.txt`

## Recommandation concrète

Pour ton cas "je veux pouvoir l'envoyer à un collègue" :

1. Chrome : vise une publication Chrome Web Store privée à l'organisation si tes collègues sont sur Google Workspace.
2. Edge : vise Edge Add-ons en `Hidden`.
3. Firefox : vise un paquet signé Mozilla puis partage du `.xpi`.
4. En secours immédiat : envoie le zip `unpacked` pour Chrome/Edge avec une mini procédure d'installation.

## Sources officielles

- Chrome distribution : https://developer.chrome.com/docs/extensions/how-to/distribute
- Chrome enterprise publishing : https://developer.chrome.com/docs/webstore/cws-enterprise/
- Edge hosting : https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/hosting-and-updating
- Edge publish / hidden visibility : https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Firefox self-distribution : https://extensionworkshop.com/documentation/publish/self-distribution/
