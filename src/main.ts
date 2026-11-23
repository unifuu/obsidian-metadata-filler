import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, MetadataFillerSettings, MetadataFillerSettingTab } from "./settings";
import { IGDBClient, IGDBGameResult, ResolvedGameFields } from "./igdb";
import { GameChoiceModal } from "./game-modal";
import { BookChoiceModal } from "./book-modal";
import { searchBooks, resolveBookFields, WikidataCandidate, ResolvedBookFields } from "./wikidata";
import { findOpenLibraryMetadata } from "./openlibrary";
import { GoogleBooksCandidate, searchGoogleBooks } from "./googlebooks";

const GAME_TYPE = "[[🎮]]";
const BOOK_TYPE = "[[📚]]";

function firstFrontmatterValue(value: unknown): string | undefined {
	if (Array.isArray(value)) return value[0] ?? undefined;
	if (typeof value === "string") return value;
	return undefined;
}

function isEmptyValue(v: unknown): boolean {
	if (v === undefined || v === null) return true;
	if (typeof v === "string") return v.trim().length === 0;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

export default class MetadataFillerPlugin extends Plugin {
	settings!: MetadataFillerSettings;
	igdb!: IGDBClient;

	async onload() {
		await this.loadSettings();
		this.igdb = new IGDBClient(this);
		this.addSettingTab(new MetadataFillerSettingTab(this.app, this));

		this.addCommand({
			id: "fill-metadata",
			name: "Fill metadata based on note type",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) {
					void this.fillActiveFile(file);
				}
				return true;
			},
		});

	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async fillActiveFile(file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file);
		const type = firstFrontmatterValue(cache?.frontmatter?.type);
		if (type !== GAME_TYPE && type !== BOOK_TYPE) {
			new Notice(`Unsupported note type. Use ${GAME_TYPE} for games or ${BOOK_TYPE} for books.`);
			return;
		}
		const title = cache?.frontmatter?.title as string | undefined;

		if (!title || title.trim().length === 0) {
			new Notice("This note has no title yet, so metadata search cannot run.");
			return;
		}
		if (type === GAME_TYPE) {
			await this.fillGame(file, title);
			return;
		}
		if (type === BOOK_TYPE) {
			await this.fillBook(file, title);
		}
	}

	private async fillBook(file: TFile, title: string) {
		const notice = new Notice(`Searching Google Books for "${title}"...`, 0);
		let googleResults: GoogleBooksCandidate[] = [];
		try {
			googleResults = await searchGoogleBooks(title);
		} catch (error) {
			console.warn("Google Books search failed; trying Wikidata:", error);
			notice.setMessage(`Google Books unavailable, trying Wikidata for "${title}"...`);
		}
		if (googleResults.length > 0) {
			notice.hide();
			if (googleResults.length === 1 || !this.settings.alwaysAskWhenMultiple) {
				await this.applyGoogleBookToFile(file, googleResults[0]);
				return;
			}
			new BookChoiceModal(this.app, googleResults, async (candidate) => {
				await this.applyGoogleBookToFile(file, candidate);
			}).open();
			return;
		}

		notice.setMessage(`Searching Wikidata for "${title}"...`);
		let results: WikidataCandidate[];
		try {
			results = await searchBooks(title);
		} catch (error) {
			notice.hide();
			console.error("Wikidata book search failed:", error);
			new Notice(`Wikidata search failed: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}
		notice.hide();

		if (results.length === 0) {
			const fallbackNotice = new Notice(`No Wikidata match. Trying Open Library for "${title}"...`, 0);
			let metadata: ResolvedBookFields;
			try {
				metadata = await findOpenLibraryMetadata(title);
			} catch (error) {
				fallbackNotice.hide();
				console.error("Open Library book search failed:", error);
				new Notice(`Open Library search failed: ${error instanceof Error ? error.message : String(error)}`);
				return;
			}
			fallbackNotice.hide();
			if (metadata.author || metadata.released !== undefined || metadata.cover || metadata.chapters !== undefined) {
				await this.applyBookFields(file, title, metadata);
				return;
			}
			new Notice(`No matching book/work found on Wikidata or Open Library for "${title}".`);
			return;
		}
		if (results.length === 1 || !this.settings.alwaysAskWhenMultiple) {
			await this.applyBookToFile(file, title, results[0]);
			return;
		}
		new BookChoiceModal(this.app, results, async (candidate) => {
			await this.applyBookToFile(file, title, candidate);
		}).open();
	}

	private async applyGoogleBookToFile(file: TFile, candidate: GoogleBooksCandidate) {
		const fields: ResolvedBookFields = { ...candidate.fields };
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const author = fields.author?.map((value) => value.replace(/^\[\[|\]\]$/g, "")).join(", ");
		try {
			const openLibrary = await findOpenLibraryMetadata(candidate.label, author, isEmptyValue(frontmatter?.chapters));
			fields.author ??= openLibrary.author;
			fields.released ??= openLibrary.released;
			fields.cover = openLibrary.cover ?? fields.cover;
			fields.chapters ??= openLibrary.chapters;
		} catch (error) {
			console.warn("Open Library book lookup failed; using available Google Books metadata:", error);
			new Notice(`Open Library lookup failed; using available Google Books metadata: ${error instanceof Error ? error.message : String(error)}`);
		}
		await this.applyBookFields(file, candidate.label, fields);
	}

	private async applyBookToFile(file: TFile, title: string, candidate: WikidataCandidate) {
		const notice = new Notice("Fetching book details from Wikidata...", 0);
		let fields: ResolvedBookFields;
		try {
			fields = await resolveBookFields(candidate.id);
		} catch (error) {
			notice.hide();
			console.error("Book metadata lookup failed:", error);
			new Notice(`Could not fetch book metadata: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const author = fields.author?.map((value) => value.replace(/^\[\[|\]\]$/g, "")).join(", ");
		notice.setMessage("Checking Open Library for a book cover...");
		try {
			const openLibrary = await findOpenLibraryMetadata(title, author, isEmptyValue(frontmatter?.chapters));
			fields.author ??= openLibrary.author;
			fields.released ??= openLibrary.released;
			fields.cover = openLibrary.cover ?? fields.cover;
			fields.chapters ??= openLibrary.chapters;
		} catch (error) {
			console.warn("Open Library book lookup failed; using available Wikidata metadata:", error);
			new Notice(`Open Library lookup failed; using available Wikidata metadata: ${error instanceof Error ? error.message : String(error)}`);
		}
		notice.hide();

		await this.applyBookFields(file, candidate.label, fields);
	}

	private async applyBookFields(file: TFile, displayName: string, fields: ResolvedBookFields) {
		const filled: string[] = [];
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const trySet = (key: keyof ResolvedBookFields) => {
					const value = fields[key];
					if (value === undefined || !isEmptyValue(fm[key])) return;
					fm[key] = value;
					filled.push(key);
				};

				trySet("author");
				trySet("origin");
				trySet("series");
				trySet("released");
				trySet("chapters");
				trySet("cover");
				trySet("aliases");
			});
		} catch (error) {
			console.error("Writing book metadata failed:", error);
			new Notice(`Could not save book metadata: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		new Notice(filled.length === 0
			? `Matched "${displayName}", but no blank book fields needed filling.`
			: `Filled book metadata from "${displayName}": ${filled.join(", ")}`);
	}

	private async fillGame(file: TFile, title: string) {
		let results: IGDBGameResult[] = [];
		const notice = new Notice(`Searching IGDB for: ${title}...`, 0);
		try {
			results = await this.igdb.searchGames(title);
		} catch (e) {
			notice.hide();
			console.error(e);
			new Notice(`IGDB query failed: ${(e as Error).message}`);
			return;
		}
		notice.hide();
		if (results.length === 0) {
			new Notice(`No game matching "${title}" was found on IGDB.`);
			return;
		}
		if (results.length === 1 || !this.settings.alwaysAskWhenMultiple) {
			await this.applyGameToFile(file, results[0]);
			return;
		}
		new GameChoiceModal(this.app, results, async (chosen) => {
			await this.applyGameToFile(file, chosen);
		}).open();
	}

	private async applyGameToFile(file: TFile, game: IGDBGameResult) {
		const cache = this.app.metadataCache.getFileCache(file);
		const title = cache?.frontmatter?.title as string | undefined;
		if (!title || title.trim().length === 0) return;
				const fields: ResolvedGameFields = await this.igdb.resolveFields(game, title);
		const filled: string[] = [];
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const trySet = (key: keyof ResolvedGameFields, targetKey: string) => {
								const value = fields[key] ?? (key === "aliases" ? [title] : undefined);
				if (value === undefined || !isEmptyValue(fm[targetKey])) return;
				fm[targetKey] = value;
				filled.push(targetKey);
			};
			trySet("studio", "studio");
			trySet("origin", "origin");
			trySet("platform", "platform");
			trySet("series", "series");
			trySet("released", "released");
			trySet("cover", "cover");
			trySet("aliases", "aliases");
		});
		new Notice(filled.length === 0 ? `Matched "${game.name}", but there are no empty fields to fill.` : `Filled fields from "${game.name}": ${filled.join(", ")}`);
	}
}
