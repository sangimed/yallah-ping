# Distribution de l'extension

Date de reference pour ces recommandations : 16 avril 2026.

## Reponse courte

Si tu veux une installation vraiment simple pour des collegues non techniques :

- Chrome : publie l'extension sur le Chrome Web Store en mode prive pour ton organisation, ou via un lien Chrome Web Store si ton contexte le permet.
- Edge : publie l'extension sur Microsoft Edge Add-ons en visibilite `Hidden`, puis partage simplement l'URL de la fiche.
- Firefox : fais signer l'extension par Mozilla, puis partage le `.xpi` signe ou une URL de telechargement.

Si tu ne veux passer par aucun store :

- Chrome / Edge : ce ne sera pas vraiment "simple" pour des non techniques ; le fallback reste `Charger l'extension non empaquetee` ou un deploiement entreprise.
- Firefox : c'est jouable si l'extension est signee, car Firefox peut installer un `.xpi` signe depuis un fichier ou une URL web.

## Pourquoi

### Chrome

D'apres la documentation Chrome, il n'existe que deux mecanismes officiellement supportes pour distribuer une extension :

- Chrome Web Store
- self-hosting en environnement gere par politiques entreprise

Chrome precise aussi que les extensions non empaquetees doivent servir au developpement, et que sous Windows/macOS les extensions self-hosted ne s'installent que via politiques entreprise.

En pratique :

- pour des collegues lambda sous Windows/macOS : Chrome Web Store est la seule voie vraiment simple
- pour un parc gere : politique entreprise possible

## Edge

Microsoft indique que :

- les extensions publiees sur Edge Add-ons sont televersees en `.zip`, puis converties en `.crx`
- hors store, les scenarios supportes sont surtout les politiques entreprise ou le chargement non empaquete en mode developpeur
- une extension peut etre publiee avec la visibilite `Hidden`, ce qui la retire de la recherche tout en restant installable via l'URL de fiche

En pratique :

- pour des collegues : `Hidden` sur Edge Add-ons est tres bien
- pour un parc gere : politique entreprise

## Firefox

La doc Mozilla indique que pour distribuer soi-meme une extension, les utilisateurs peuvent l'installer :

- depuis un telechargement web
- depuis un fichier `.xpi`

Mais ce fichier doit etre signe par Mozilla pour une installation normale.

En pratique :

- la meilleure option est une publication `unlisted` / signature Mozilla, puis envoi du `.xpi` signe ou d'une URL privee

## Artefacts generes par le projet

La commande suivante construit l'extension puis fabrique les paquets utiles :

```bash
npm run package
```

Elle genere dans `artifacts/` :

- `yallah-ping-chrome-webstore-vX.Y.Z.zip`
- `yallah-ping-edge-addons-vX.Y.Z.zip`
- `yallah-ping-firefox-upload-vX.Y.Z.zip`
- `yallah-ping-chrome-unpacked-vX.Y.Z.zip`
- `yallah-ping-edge-unpacked-vX.Y.Z.zip`
- `checksums.txt`

## Recommandation concrete

Pour ton cas "je veux pouvoir l'envoyer a un collegue" :

1. Chrome : vise une publication Chrome Web Store privee a l'organisation si tes collegues sont sur Google Workspace.
2. Edge : vise Edge Add-ons en `Hidden`.
3. Firefox : vise un paquet signe Mozilla puis partage du `.xpi`.
4. En secours immediat : envoie le zip `unpacked` pour Chrome/Edge avec une mini procedure d'installation.

## Sources officielles

- Chrome distribution : https://developer.chrome.com/docs/extensions/how-to/distribute
- Chrome enterprise publishing : https://developer.chrome.com/docs/webstore/cws-enterprise/
- Edge hosting : https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/hosting-and-updating
- Edge publish / hidden visibility : https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Firefox self-distribution : https://extensionworkshop.com/documentation/publish/self-distribution/
