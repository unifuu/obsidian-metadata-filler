# Obsidian Metadata Filler

Fill empty frontmatter properties for Game and Book notes. Existing values are never overwritten.

## Supported note types

| Note type | Primary source | Fallback sources | Properties filled |
| --- | --- | --- | --- |
| `type: "[[🎮]]"` | IGDB | Bangumi title enrichment | `studio`, `origin`, `platform`, `series`, `released`, `cover`, `aliases` |
| `type: "[[📚]]"` | Google Books | Wikidata, Open Library | `author`, `origin`, `released`, `chapters`, `cover`, `aliases` |

## Usage

1. Add a `type` and a non-empty `title` to a note.
2. Run **Fill metadata based on note type** from the Command Palette.
3. Select a result when prompted, unless **Ask me when multiple results are found** is disabled in the plugin settings.

Configure an IGDB Client ID and Client Secret in the plugin settings before filling Game notes.

## Metadata behavior

### Games

The plugin searches up to 10 IGDB matches and ranks exact and base-title matches ahead of DLC entries. The result picker shows developer and platform details. Platforms are normalized to the canonical notes `Android`, `iOS`, `Nintendo Switch`, `PlayStation`, and `Windows`.

Aliases use the developer's origin language when available. Chinese aliases are converted to Traditional Chinese; other origins fall back to IGDB's canonical title. Enable **Use Traditional Chinese for aliases** to always prefer a Chinese game alias when available.

### Books

The plugin searches Google Books first, then Wikidata, and finally Open Library when no earlier source returns a match. A title ending in ` - Author` is searched as a title-and-author pair; for example, `Strait is the Gate - André Gide`.

Google Books and Wikidata results are enriched with Open Library metadata when available. Open Library covers take precedence. Publication dates are stored as `YYYY-MM-DD`; year-only dates use January 1. Chapter totals are filled only from exact-title editions with explicitly numbered chapter entries, so the property stays blank when a reliable count is unavailable.

## Development and deployment

Install dependencies once:

```bash
npm install
```

To deploy, store your local vault path in `.vault-path` (one line; this file is git-ignored):

```bash
printf '%s\n' '/path/to/My Vault' > .vault-path
./deploy.sh
```

For a one-off deployment to a different vault, set `OBSIDIAN_VAULT` instead:

```bash
OBSIDIAN_VAULT="/path/to/My Vault" ./deploy.sh
```

The deployment script builds the plugin and copies its runtime files to
`.obsidian/plugins/obsidian-metadata-filler/`. It does not copy `data.json`, so
your vault's saved plugin settings remain intact. `data.json` contains local
settings and credentials and is excluded from Git. After deployment, reload
Obsidian or toggle the Metadata Filler community plugin off and on.

## Source modules

- `src/main.ts`: type routing and frontmatter updates
- `src/igdb.ts`: IGDB game search and field resolution
- `src/bangumi.ts`: Bangumi game title enrichment
- `src/googlebooks.ts`: Google Books search and field resolution
- `src/wikidata.ts`: Wikidata book search and field resolution fallback
- `src/openlibrary.ts`: Open Library metadata and chapter-count lookup
- `src/game-modal.ts` and `src/book-modal.ts`: result choosers
- `src/settings.ts`: plugin settings
