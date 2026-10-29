# Deadlock Mod Manager

Desktop app (Electron + React + TypeScript) to browse, install and manage mods for
[Deadlock](https://store.steampowered.com/app/1422450/Deadlock/), using the
[GameBanana](https://gamebanana.com/games/20948) API directly.

## Download

Installers for Windows (`.exe`), macOS (`.dmg`) and Linux (`.AppImage`, `.deb`, `.rpm`, `.pacman`,
`.snap`, `.flatpak`) are attached to each
[release](https://github.com/NightHvnter/DeadlockModManager/releases).

The builds are not code-signed yet: Windows SmartScreen may show "Windows protected your PC"
(choose **More info** → **Run anyway**), and macOS may say the app "cannot be opened" (right-click
the app → **Open**).

## Features

- Mod list with search, filters by category, hero and type (visual, audio, maps) and sorting
- Mod details: image gallery, description, audio preview, update history and choice of the file to download
- Installation from `.zip`, `.rar` or `.vpk` files, with MD5 verification and download progress
- **Installed** page: enable/disable, update and uninstall mods, and change their load order
- **Profiles**: sets of enabled mods with their load order, to switch between them in one click
- **Play** button that makes sure mods are still active after a game update and launches Deadlock through Steam
- Automatic detection of the Deadlock folder in the Steam libraries (Windows, Linux, macOS)
- **Colors** page to change the colors of Deadlock's own interface (text, enemies, allies, health
  bar, souls, ...) without installing other mods, with ready-made presets such as colorblind
- Detection of mods added to `addons` by hand or by other managers, also the ones they disabled
- Import and export of mods to and from other managers (such as the official Deadlock Mod Manager)
  with the open Deadlock Mod Interchange format, from the settings
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

## Profiles

A profile is a set of enabled mods with their load order, for example "Ranked" with only HUD and
sounds and "Fun" with every skin. Profiles are managed from the **Profiles** page and switched from
the **Installed** page. Using a profile enables its mods, disables all the others and restores its
load order; no mod is installed or uninstalled.

- A profile can be created from the mods enabled now (it becomes the one in use right away) or
  empty (using it disables every mod)
- The profile in use follows every change: installing, enabling, disabling or reordering mods
  updates it by itself
- Mods of a profile that are no longer installed stay in it and are shown as missing, so they can
  be installed again
- Deleting a profile leaves the mods as they are

Profiles are saved in `profiles.json` in the app's data folder.

## Mods from other managers

When the installed mods are listed, `addons` is scanned (code in `src/mission/deadlock/external.ts`):

- `pakNN_dir.vpk` groups the app does not know become **external** mods, named from their
  contents; the official Deadlock Mod Manager's `addons/.dmm.json` links them to their GameBanana
  mod when it is in the catalog.
- Mods **disabled** by other managers are listed as disabled and stay where they are until you
  enable them here: the official manager's `<id>_<file>.vpk` files in `addons` (`<id>` is the
  GameBanana id, `snd-<id>` for sounds, `local-<uuid>` for local mods), which also link them to
  GameBanana, and Grimoire's `addons/.disabled` folder.

**Settings → Import and export mods** uses the official manager's
[Deadlock Mod Interchange](https://github.com/deadlock-mod-manager/deadlock-mod-manager) format
(code in `src/mission/deadlock/interchange.ts`):

- **Export** creates `deadlock-mods-export-<date>` with `mod-interchange.json` and a copy of every
  installed mod's VPKs in `files/`: enabled mods first in load order, then the disabled ones.
- **Import** reads the `mod-interchange.json` of such a folder: enabled mods go to the bottom of the
  load order, disabled ones to the app's disabled folder. Mods already installed, with missing
  files or with a SHA-256 that does not match are skipped. Profiles and crosshairs are ignored.

## Interface colors

Deadlock's interface is drawn with Panorama, whose styles are compiled `.vcss_c` files in the
game's `pak01_dir.vpk` that still contain the CSS as plain text. The **Colors** page builds its own
VPK in `addons` (code in `src/mission/deadlock/interfaceColors.ts` and `vpk.ts`, no Valve tools
needed):

1. Each color is defined in `src/mission/types/InterfaceColors.ts` by the `@define` variables, hex
   values and rules it changes in the styles.
2. Every style is read from the version the game would load: a lower-priority mod that contains it,
   otherwise the game's own. Styles that a higher-priority mod overrides are skipped and reported.
3. The CSS is rewritten with exactly the same length (characters added by a rule are paid for by
   removing spaces after colons), so the size and offsets of the compiled resource never change.
4. The styles are packed in a single-file `pakNN_dir.vpk`, whose name is kept in
   `interface-colors.json`; it is removed when all colors are back to the originals.

The VPK is rebuilt every time you press **Play**, so the colors survive game updates.

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

All commands are run from the `deadlock-manager` folder.

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

## Releases

Releases are built by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml))
on Windows, macOS and Linux and uploaded to a **draft** GitHub release.