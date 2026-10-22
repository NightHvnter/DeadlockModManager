# Deadlock Mod Manager

Desktop app (Electron + React + TypeScript) to browse, install and manage mods for
[Deadlock](https://store.steampowered.com/app/1422450/Deadlock/), using the
[GameBanana](https://gamebanana.com/games/20948) API directly.

## Features

- Mod list with search, filters by category, hero and type (visual, audio, maps) and sorting
- Mod details: image gallery, description, audio preview, update history and choice of the file to download
- Installation from `.zip`, `.rar` or `.vpk` files, with MD5 verification and download progress
- **Installed** page: enable/disable, update and uninstall mods, and change their load order
- **Play** button that makes sure mods are still active after a game update and launches Deadlock through Steam
- Automatic detection of the Deadlock folder in the Steam libraries (Windows, Linux, macOS)
- Light, dark, system, ocean and forest themes
- Interface in Italian, English, Spanish, French and German (the system language by default)

## Translations

The texts live in `src/mission/i18n/locales` and are shared by the interface and the main
process. `it.ts` is the reference dictionary: the other languages are typed on its keys, so
`npm run typecheck` reports any missing translation. To add a language, create its file and
register it in `LANGUAGES` and `MESSAGES` in `src/mission/i18n/index.ts`.

## How installation works

1. The mod's files are read from its GameBanana download page
   (`apiv11/{Mod|Sound}/<id>/DownloadPage`); the chosen file is downloaded and verified with MD5.
2. The VPKs are copied to `game/citadel/addons` and renamed `pakNN_dir.vpk`, using the index after
   the highest one already in use (so a new mod goes to the bottom of the load order). Both split
   VPKs (`*_dir.vpk` plus the `*_000.vpk`, ... parts) and single-file VPKs (`*.vpk`) are supported.
3. If it is missing, the line `Game citadel/addons` is added to `game/citadel/gameinfo.gi`
   (the original file is saved as `gameinfo.gi.bak`).
4. The installed files are recorded in `installed.json` in the app's data folder.
   Disabled mods are moved to `disabled/<id>` in the same folder.

## Game updates and `gameinfo.gi`

Deadlock updates (and Steam's file verification) restore `gameinfo.gi` to the original, removing
the `Game citadel/addons` line: the mods stay installed but the game no longer loads them. The app
checks the file **only when it opens and when you press "Play"** (never in the background) and, if
there are enabled mods and the line is missing, puts it back after refreshing the
`gameinfo.gi.bak` backup. Automatic repair can be turned off in the settings: in that case a
warning with a "Repair" button appears instead. "Play" then launches Deadlock through Steam
(`steam://rungameid/1422450`).

## Load order

If two mods contain the same files, the game uses the ones from the mod with the lowest `pakNN`
index. From the **Installed** page → **Load order** you can reorder the enabled mods (by dragging
them or with the arrows): when you save, the indices are reassigned in the chosen order, `pak01`
to the mod at the top. Files in `addons` that were not installed by the app are left untouched.
Disabled mods are not listed and go to the bottom when they are enabled again.

## Mod catalog

The catalog (code in `src/mission/gamebanana`) is synced from GameBanana using the same endpoints,
limits and strategy as the official app
([deadlock-mod-manager](https://github.com/deadlock-mod-manager/deadlock-mod-manager)) and saved in
`gamebanana-catalog.json`.

| Endpoint                               | Used for                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `apiv11/{Mod,Sound}/Index`             | list of Deadlock mods, 50 per page                                                 |
| `api.gamebanana.com/Core/Item/Data`    | "hydration" of 40 mods per request: downloads, categories, description, file dates |
| `apiv11/{Mod,Sound}/{id}/DownloadPage` | files to download for installation                                                 |
| `apiv11/{Mod,Sound}/{id}/Updates`      | update history in the mod details                                                  |

- **first launch**: the first page of mods and sounds is shown right away; then the full sync
  starts, reading the index from the oldest mod (`Generic_Oldest`, so pages don't shift while they
  are being read) and hydrating each page; the interface is updated every 100 new mods, so the
  list fills up while the sync runs;
- **every 20 minutes**: incremental sync from the most recently modified mod (`Generic_LatestModified`)
  down to the ones already seen; only new or changed mods are hydrated;
- **every 7 days**: a full sync again; mods that are no longer seen are removed only if
  `Core/Item/Data` confirms they no longer exist;
- after the first launch, the interface is updated only when a sync has finished;
- limits: at most 4 concurrent requests and 10 per second, 30 s timeout, 3 retries on network
  errors, 429 and 5xx, honoring `Retry-After`.

During development, the `[gamebanana]` logs in the `npm run dev` terminal show the time and the
number of requests of each sync; the progress is also visible in the settings.

The settings are stored in `settings.json` in the app's data folder
(`%APPDATA%/deadlock-manager` on Windows).

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run typecheck
```

The app icon is drawn in `resources/icon.svg`; after changing it, regenerate `build/icon.png`,
`build/icon.ico`, `build/icon.icns` and `resources/icon.png` with:

```bash
npm run icons
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
