import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, MetadataFillerSettings, MetadataFillerSettingTab } from "./settings";
import { IGDBClient, IGDBGameResult, ResolvedGameFields } from "./igdb";
import { countryAlpha2ToName } from "./countries";
import { GameChoiceModal } from "./game-modal";
import { searchAnime, fetchAnimeDetails, AniListCandidate } from "./anilist";
import { searchAnimeJikan, fetchAnimeDetailsJikan, JikanCandidate } from "./jikan";
import { resolveAnimeOriginAlias } from "./anime-aliases";
import {
	findBangumiSubject,
	searchAnimeBangumi,
	fetchAnimeDetailsBangumi,
	BangumiCandidate,
} from "./bangumi";
import { AnimeChoiceModal, PickerCandidate } from "./anime-modal";
import { BookChoiceModal } from "./book-modal";
import { searchBooks, resolveBookFields, WikidataCandidate, ResolvedBookFields } from "./wikidata";
import { findOpenLibraryMetadata } from "./openlibrary";

const GAME_TYPE = "[[🎮]]";
const ANIME_TYPE = "[[📺]]";
const BOOK_TYPE = "[[📚]]";

interface ResolvedAnimeFields {
	studio?: string[];
	origin?: string;
	released?: string;
	episodes?: number;
	cover?: string;
	aliases?: string[];
}

type AnimeSource = "anilist" | "jikan" | "bangumi";

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
		if (
			typeof data?.aliasesInTraditionalChinese !== "boolean" &&
			typeof data?.animeAliasesInTraditionalChinese === "boolean"
		) {
			this.settings.aliasesInTraditionalChinese = data.animeAliasesInTraditionalChinese;
			delete (this.settings as MetadataFillerSettings & { animeAliasesInTraditionalChinese?: boolean })
				.animeAliasesInTraditionalChinese;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async fillActiveFile(file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file);
		const type = firstFrontmatterValue(cache?.frontmatter?.type);
		if (type !== GAME_TYPE && type !== ANIME_TYPE && type !== BOOK_TYPE) {
			new Notice(`Unsupported note type. Use ${GAME_TYPE} for games, ${ANIME_TYPE} for anime, or ${BOOK_TYPE} for books.`);
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
		if (type === ANIME_TYPE) {
			await this.fillAnime(file, title);
			return;
		}
		if (type === BOOK_TYPE) {
			await this.fillBook(file, title);
		}
	}

	private async fillAnime(file: TFile, title: string) {
		let results: AniListCandidate[] = [];
		const notice = new Notice(`Searching AniList for "${title}"...`, 0);
		try {
			results = await searchAnime(title);
		} catch (e) {
			console.error("AniList search failed, falling back to Jikan:", e);
		}

		if (results.length > 0) {
			notice.hide();
			await this.handleAnimeResults(file, title, "anilist", results);
			return;
		}

		notice.setMessage(`AniList unavailable, trying Jikan (MyAnimeList) for "${title}"...`);
		let jikanResults: JikanCandidate[] = [];
		try {
			jikanResults = await searchAnimeJikan(title);
		} catch (e) {
			console.error("Jikan search failed, falling back to Bangumi:", e);
		}
		if (jikanResults.length === 0) {
			notice.setMessage(`Jikan found no results, trying Bangumi for "${title}"...`);
			await this.fillAnimeFromBangumi(file, title, notice);
			return;
		}
		notice.hide();
		await this.handleAnimeResults(file, title, "jikan", jikanResults);
	}

	private async fillAnimeFromBangumi(file: TFile, title: string, notice: Notice) {
		let results: BangumiCandidate[];
		try {
			results = await searchAnimeBangumi(title);
		} catch (e) {
			notice.hide();
			console.error(e);
			new Notice(`AniList, Jikan, and Bangumi searches failed: ${(e as Error).message}`);
			return;
		}
		notice.hide();
		if (results.length === 0) {
			new Notice(`No anime matching "${title}" was found on AniList, Jikan, or Bangumi.`);
			return;
		}
		await this.handleAnimeResults(file, title, "bangumi", results);
	}

	private async handleAnimeResults(
		file: TFile,
		searchTitle: string,
		source: AnimeSource,
		results: (AniListCandidate | JikanCandidate | BangumiCandidate)[]
	) {
		const candidates: PickerCandidate[] = results.map((result) => {
			if (source === "anilist") {
				const candidate = result as AniListCandidate;
				const displayName = candidate.english || candidate.romaji || candidate.native || String(candidate.id);
				const alternate = candidate.romaji && candidate.romaji !== displayName ? candidate.romaji : undefined;
				const year = candidate.seasonYear ? String(candidate.seasonYear) : undefined;
				return { id: candidate.id, displayName, subtitle: [alternate, year].filter(Boolean).join(" - ") || undefined };
			}

			if (source === "bangumi") {
				const candidate = result as BangumiCandidate;
				return {
					id: candidate.id,
					displayName: candidate.nameCn || candidate.name,
					subtitle: candidate.date?.slice(0, 4),
				};
			}

			const candidate = result as JikanCandidate;
			return {
				id: candidate.malId,
				displayName: candidate.titleEnglish || candidate.title,
				subtitle: candidate.year ? String(candidate.year) : undefined,
			};
		});

		if (candidates.length === 1 || !this.settings.alwaysAskWhenMultiple) {
			await this.applyAnimeToFile(file, searchTitle, source, candidates[0]);
			return;
		}
		new AnimeChoiceModal(this.app, candidates, async (chosen) => {
			await this.applyAnimeToFile(file, searchTitle, source, chosen);
		}).open();
	}

	private async applyAnimeToFile(
		file: TFile,
		title: string,
		source: AnimeSource,
		candidate: PickerCandidate
	) {
		const notice = new Notice("Loading anime details...", 0);
		let fields: ResolvedAnimeFields;
		try {
			if (source === "anilist") {
				const aniListCandidate = candidate as PickerCandidate;
				const details = await fetchAnimeDetails(aniListCandidate.id);
				const bangumi = await findBangumiSubject([title, candidate.displayName]);
				const alias = resolveAnimeOriginAlias(
					this.settings.aliasesInTraditionalChinese ? "CN" : details.countryOfOrigin,
					details.titleNative,
					details.titleEnglish,
					details.synonyms,
					bangumi?.nameCn,
					title
				);
				fields = {
					studio: details.studios.length > 0 ? Array.from(new Set(details.studios)).map((studio) => `[[${studio}]]`) : undefined,
					origin: details.countryOfOrigin ? countryAlpha2ToName(details.countryOfOrigin) : undefined,
					released: details.releasedDate,
					episodes: details.episodes,
					cover: bangumi?.cover,
					aliases: [alias ?? title],
				};
			} else if (source === "jikan") {
				const details = await fetchAnimeDetailsJikan(candidate.id);
				const bangumi = await findBangumiSubject([title, candidate.displayName]);
				const alias = resolveAnimeOriginAlias(
					this.settings.aliasesInTraditionalChinese ? "CN" : "JP",
					details.titleJapanese,
					details.titleEnglish,
					details.synonyms,
					bangumi?.nameCn,
					title
				);
				fields = {
					studio: details.studios.length > 0 ? Array.from(new Set(details.studios)).map((studio) => `[[${studio}]]`) : undefined,
					origin: "[[🇯🇵 Japan]]",
					released: details.releasedDate,
					episodes: details.episodes,
					cover: bangumi?.cover,
					aliases: [alias ?? title],
				};
			} else {
				const details = await fetchAnimeDetailsBangumi(candidate.id);
				fields = {
					studio: details.studios.length > 0 ? Array.from(new Set(details.studios)).map((studio) => `[[${studio}]]`) : undefined,
					origin: "[[🇯🇵 Japan]]",
					released: details.date,
					episodes: details.episodes,
					cover: details.cover,
					aliases: [
						resolveAnimeOriginAlias(
							this.settings.aliasesInTraditionalChinese ? "CN" : "JP",
							details.name,
							undefined,
							details.aliases,
							details.nameCn,
							title
						) ?? title,
					],
				};
			}
		} catch (e) {
			notice.hide();
			console.error(e);
			new Notice(`Loading anime details failed: ${(e as Error).message}`);
			return;
		}
		notice.hide();

		const filled: string[] = [];
		const displayName = candidate.displayName;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const trySet = (key: keyof ResolvedAnimeFields, targetKey: string) => {
				const value = fields[key];
				if (value === undefined || !isEmptyValue(fm[targetKey])) return;
				fm[targetKey] = value;
				filled.push(targetKey);
			};
			trySet("studio", "studio");
			trySet("origin", "origin");
			trySet("released", "released");
			trySet("episodes", "episodes");
			trySet("cover", "cover");
			trySet("aliases", "aliases");
		});
		const sourceLabel = source === "anilist" ? "AniList" : source === "jikan" ? "Jikan" : "Bangumi";
		new Notice(filled.length === 0
			? `Matched "${displayName}" via ${sourceLabel}, but no empty fields needed filling.`
			: `Filled from "${displayName}" (${sourceLabel}): ${filled.join(", ")}`);
	}

	private async fillBook(file: TFile, title: string) {
		const notice = new Notice(`Searching Wikidata for "${title}"...`, 0);
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

	private async applyBookToFile(file: TFile, title: string, candidate: WikidataCandidate) {
		const notice = new Notice("Fetching book details from Wikidata...", 0);
		let fields: ResolvedBookFields;
		try {
			fields = await resolveBookFields(candidate.id);
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fields.author || fields.released === undefined || !fields.cover || isEmptyValue(frontmatter?.chapters)) {
				const author = fields.author?.map((value) => value.replace(/^\[\[|\]\]$/g, "")).join(", ");
				const openLibrary = await findOpenLibraryMetadata(title, author);
				fields.author ??= openLibrary.author;
				fields.released ??= openLibrary.released;
				fields.cover ??= openLibrary.cover;
				fields.chapters ??= openLibrary.chapters;
			}
		} catch (error) {
			notice.hide();
			console.error("Book metadata lookup failed:", error);
			new Notice(`Could not fetch book metadata: ${error instanceof Error ? error.message : String(error)}`);
			return;
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
