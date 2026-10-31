# Obsidian Metadata Filler

Fills blank metadata based on the note's `type` property:

- `type: "[[🎮]]"` uses IGDB for game metadata.
- `type: "[[📺]]"` uses AniList first, then Jikan/MyAnimeList, then Bangumi if an earlier service is unavailable or has no results. Bangumi also supplies cover and Traditional Chinese title enrichment.
- `type: "[[📚]]"` searches Wikidata for book metadata, with Open Library as a cover fallback.

Run **Fill metadata based on note type** from the command palette. Configure the IGDB Client ID and Client Secret in the plugin settings. Existing property values are never overwritten.

Game matching returns up to 50 results, ranks exact and base-title matches ahead of DLC entries, and shows developer and platform details in the chooser. Game platforms use the canonical notes `Android`, `iOS`, `Nintendo Switch`, `PlayStation`, and `Windows`. Game aliases use titles in the developer's origin language when available; Chinese aliases are converted to Traditional Chinese, and other origins fall back to IGDB's canonical title.

Anime aliases use the title in the provider's origin language when available; Chinese titles are converted to Traditional Chinese, while Japanese and Korean titles retain their native script. Enable **Use Traditional Chinese for aliases** in plugin settings to use Chinese titles for games and anime from any origin.

Anime covers are sourced from Bangumi when available.

Book metadata is looked up using the existing `title` property. Blank `author`,
`origin`, `series`, `released`, `chapters`, `cover`, and `aliases` properties are
filled from Wikidata and Open Library. If Wikidata has no matching item, an
exact-title Open Library result can still fill `author`, `released`, and `cover`.
Open Library also supplies a cover when Wikidata has no cover. Chapter totals are
written as `YYYY-MM-DD`; year-only publication dates use January 1. Chapter
totals are filled only when an exact-title Open Library edition
has a table of contents with explicitly numbered chapter entries. Chapter
counts are not consistently cataloged, so the property remains blank when no
reliable count is available. Existing property values are never overwritten.
When multiple results are found, the existing **Ask me when multiple results
are found** setting controls whether a chooser is shown.

## Source modules

- `src/main.ts`: type routing and frontmatter updates
- `src/igdb.ts`: IGDB game search and field resolution
- `src/wikidata.ts`: Wikidata book search and field resolution
- `src/openlibrary.ts`: book metadata fallback and available table-of-contents chapter counts
- `src/book-modal.ts`: book result chooser
- `src/anilist.ts`: AniList anime search and field resolution
- `src/jikan.ts`: Jikan/MyAnimeList fallback search and field resolution
- `src/bangumi.ts`: Bangumi fallback search and detail resolution
- `src/settings.ts`: shared settings tab

## Development and deployment

Install dependencies once with `npm install`. To deploy, store your local vault
path in `.vault-path` (one line; this file is git-ignored):

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
