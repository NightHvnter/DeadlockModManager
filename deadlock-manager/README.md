# Deadlock Mod Manager

App desktop (Electron + React + TypeScript) per cercare, installare e gestire le mod di
[Deadlock](https://store.steampowered.com/app/1422450/Deadlock/) usando direttamente l'API di
[GameBanana](https://gamebanana.com/games/20948).

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

1. I file della mod vengono letti dalla sua pagina su GameBanana (`apiv11/{Mod|Sound}/<id>/ProfilePage`);
   il file scelto viene scaricato e verificato con l'MD5.
2. I file `*_dir.vpk` (e le parti `*_000.vpk`, ...) vengono copiati in `game/citadel/addons`
   rinominati `pakNN_dir.vpk` con il primo indice libero.
3. Se manca, viene aggiunta la riga `Game citadel/addons` a `game/citadel/gameinfo.gi`
   (l'originale viene salvato in `gameinfo.gi.bak`).
4. I file installati sono registrati in `installed.json` nella cartella dati dell'app.
   Le mod disattivate vengono spostate in `disabled/<id>` nella stessa cartella.

## Elenco delle mod

Il catalogo (codice in `src/mission/gamebanana`) viene sincronizzato da GameBanana e salvato in
`gamebanana-catalog.json`:

- **primo avvio**: la prima pagina di mod e di audio (100 elementi) arriva in circa 0,3 s ed è
  mostrata subito; il resto dell'indice (circa 190 pagine da 50) e i contatori di download e
  "mi piace" (chiamata multipla `Core/Item/Data`, 50 mod per richiesta) si scaricano in
  background, al massimo 4 richieste alla volta: circa 50 s e 380 richieste in tutto;
- **avvii successivi**: parte dal catalogo salvato e ogni ora scarica solo le pagine con mod
  modificate dopo l'ultima sincronizzazione (di solito 2 richieste);
- l'interfaccia viene aggiornata solo quando una sincronizzazione è finita.

Durante lo sviluppo i log `[gamebanana]` nel terminale di `npm run dev` mostrano tempi e
richieste di ogni sincronizzazione; l'avanzamento è visibile anche nelle impostazioni.

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
