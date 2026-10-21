# Deadlock Mod Manager

App desktop (Electron + React + TypeScript) per cercare, installare e gestire le mod di
[Deadlock](https://store.steampowered.com/app/1422450/Deadlock/) usando l'API di
[deadlockmods.app](https://deadlockmods.app).

## Funzionalità

- Elenco delle mod con ricerca, filtri per categoria, eroe e tipo (grafiche, audio, mappe) e ordinamento
- Dettaglio della mod: galleria di immagini, descrizione, anteprima audio, dipendenze e scelta del file da scaricare
- Installazione da archivi `.zip`, `.rar` o da `.vpk`, con verifica MD5 e avanzamento del download
- Pagina **Installate**: attiva/disattiva, aggiorna e disinstalla le mod
- Rilevamento automatico della cartella di Deadlock nelle librerie di Steam (Windows, Linux, macOS)
- Temi chiaro, scuro, sistema, oceano e foresta
- Interfaccia in italiano, inglese, spagnolo, francese e tedesco (di default la lingua del sistema)

## Traduzioni

I testi sono in `src/mission/i18n/locales`, condivisi tra interfaccia e processo main.
`it.ts` è il dizionario di riferimento: le altre lingue sono tipizzate sulle sue chiavi, quindi
`npm run typecheck` segnala qualsiasi traduzione mancante. Per aggiungere una lingua basta creare
il suo file e registrarla in `LANGUAGES` e `MESSAGES` in `src/mission/i18n/index.ts`.

## Come funziona l'installazione

1. Il file della mod viene scaricato (`/api/v2/mods/<remoteId>/downloads`) e verificato con l'MD5.
2. I file `*_dir.vpk` (e le parti `*_000.vpk`, ...) vengono copiati in `game/citadel/addons`
   rinominati `pakNN_dir.vpk` con il primo indice libero.
3. Se manca, viene aggiunta la riga `Game citadel/addons` a `game/citadel/gameinfo.gi`
   (l'originale viene salvato in `gameinfo.gi.bak`).
4. I file installati sono registrati in `installed.json` nella cartella dati dell'app.
   Le mod disattivate vengono spostate in `disabled/<id>` nella stessa cartella.

## Elenco delle mod

L'API restituisce sempre l'elenco completo (circa 10.000 mod, oltre 10 MB) e non ha paginazione.
Per questo l'elenco viene salvato in `mods-cache.json` insieme al suo ETag:

- solo al primo avvio l'app aspetta il download completo;
- agli avvii successivi mostra subito l'elenco salvato e lo aggiorna in background ogni ora,
  con `If-None-Match` (se non è cambiato l'API risponde `304` senza riscaricarlo);
- l'interfaccia viene aggiornata solo quando il nuovo elenco è stato scaricato del tutto.

Le impostazioni sono in `settings.json` nella cartella dati dell'app
(`%APPDATA%/deadlock-manager` su Windows).

## Sviluppo

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run typecheck
```

## Build

```bash
npm run build:win
```

```bash
npm run build:linux
```

```bash
npm run build:mac
```
