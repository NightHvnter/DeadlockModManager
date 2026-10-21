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

## Come funziona l'installazione

1. Il file della mod viene scaricato (`/api/v2/mods/<remoteId>/downloads`) e verificato con l'MD5.
2. I file `*_dir.vpk` (e le parti `*_000.vpk`, ...) vengono copiati in `game/citadel/addons`
   rinominati `pakNN_dir.vpk` con il primo indice libero.
3. Se manca, viene aggiunta la riga `Game citadel/addons` a `game/citadel/gameinfo.gi`
   (l'originale viene salvato in `gameinfo.gi.bak`).
4. I file installati sono registrati in `installed.json` nella cartella dati dell'app.
   Le mod disattivate vengono spostate in `disabled/<id>` nella stessa cartella.

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
