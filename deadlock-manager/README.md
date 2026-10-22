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
2. I VPK vengono copiati in `game/citadel/addons` rinominati `pakNN_dir.vpk`, con l'indice
   successivo al più alto già usato (la mod nuova finisce in fondo all'ordine di caricamento).
   Sono supportati sia i VPK divisi (`*_dir.vpk` più le parti `*_000.vpk`, ...) sia quelli a
   file unico (`*.vpk`).
3. Se manca, viene aggiunta la riga `Game citadel/addons` a `game/citadel/gameinfo.gi`
   (l'originale viene salvato in `gameinfo.gi.bak`).
4. I file installati sono registrati in `installed.json` nella cartella dati dell'app.
   Le mod disattivate vengono spostate in `disabled/<id>` nella stessa cartella.

## Ordine di caricamento

Se due mod contengono gli stessi file, il gioco usa quelli della mod con l'indice `pakNN` più
basso. Dalla pagina **Installate** → **Ordine di caricamento** si riordinano le mod attive
(trascinandole o con le frecce): al salvataggio gli indici vengono riassegnati nell'ordine
scelto, `pak01` alla mod in cima. I file in `addons` non installati dall'app non vengono
toccati. Le mod disattivate non compaiono e, quando vengono riattivate, finiscono in fondo.

## Elenco delle mod

Il catalogo (codice in `src/mission/gamebanana`) viene sincronizzato da GameBanana con gli
stessi endpoint, limiti e strategia dell'app ufficiale
([deadlock-mod-manager](https://github.com/deadlock-mod-manager/deadlock-mod-manager)) e salvato
in `gamebanana-catalog.json`.

| Endpoint                               | A cosa serve                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `apiv11/{Mod,Sound}/Index`             | elenco delle mod di Deadlock, 50 per pagina                                            |
| `api.gamebanana.com/Core/Item/Data`    | "idratazione" di 40 mod per richiesta: download, categorie, descrizione, data dei file |
| `apiv11/{Mod,Sound}/{id}/DownloadPage` | file da scaricare per l'installazione                                                  |
| `apiv11/{Mod,Sound}/{id}/Updates`      | changelog nel dettaglio della mod                                                      |

- **primo avvio**: la prima pagina di mod e di audio è mostrata subito; poi parte la
  sincronizzazione completa, che legge l'indice dalla mod più vecchia (`Generic_Oldest`, così le
  pagine non scorrono durante la lettura) e idrata ogni pagina;
- **ogni 20 minuti**: sincronizzazione incrementale dalla mod modificata più di recente
  (`Generic_LatestModified`) fino a quelle già viste; si idratano solo le mod nuove o cambiate;
- **ogni 7 giorni**: di nuovo la sincronizzazione completa; le mod non più viste vengono tolte
  solo se `Core/Item/Data` conferma che non esistono più;
- l'interfaccia viene aggiornata solo quando una sincronizzazione è finita;
- limiti: al massimo 4 richieste contemporanee e 10 al secondo, timeout di 30 s, 3 nuovi
  tentativi su errori di rete, 429 e 5xx rispettando `Retry-After`.

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
