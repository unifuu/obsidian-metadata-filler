import { requestUrl } from "obsidian";
import type MetadataFillerPlugin from "./main";
import { countryCodeToName } from "./countries";
import { originCountryToAliasLanguage, resolveOriginAlias } from "./aliases";
import { toTraditional } from "./textUtils";
import { findBangumiGameChineseName } from "./bangumi";

export interface IGDBGameResult {
	id: number;
	name: string;
	first_release_date?: number;
	cover?: { image_id: string };
	platforms?: { name: string }[];
	collection?: { name: string };
	franchises?: { name: string }[];
	alternative_names?: { name: string; comment?: string }[];
	involved_companies?: {
		developer: boolean;
		company: { name: string; country?: number };
	}[];
	game_localizations?: { name: string; region?: { name: string } }[];
	bangumiTitle?: string;
}

function normalizeSearchText(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeAliasTitle(value: string): string {
	return value.replace(/・/g, "·").replace(/：/g, ":").trim();
}

function rankSearchResults(results: IGDBGameResult[], title: string): IGDBGameResult[] {
	const query = normalizeSearchText(title);

	return results
		.map((game, index) => {
			const name = normalizeSearchText(game.name);
			let matchRank = 3;
			if (name === query) matchRank = 0;
			else if (name.startsWith(query)) matchRank = 1;
			else if (name.includes(query)) matchRank = 2;
			return { game, index, matchRank };
		})
		.sort((a, b) => {
			if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
			const nameLength = a.game.name.length - b.game.name.length;
			return nameLength !== 0 ? nameLength : a.index - b.index;
		})
		.map(({ game }) => game);
}

/** Normalize IGDB search results into frontmatter fields for the note. */
export interface ResolvedGameFields {
	studio?: string[];
	origin?: string;
	platform?: string[];
	series?: string[];
	released?: string;
	cover?: string;
	aliases?: string[];
}

function asWikiLink(value: string): string {
	const trimmed = value.trim();
	return `[[${trimmed}]]`;
}

export class IGDBClient {
	constructor(private plugin: MetadataFillerPlugin) {}

	private get settings() {
		return this.plugin.settings;
	}

	/** Fetch or refresh the Twitch OAuth access token when needed. */
	private async ensureToken(): Promise<string> {
		const s = this.settings;
		if (!s.twitchClientId || !s.twitchClientSecret) {
			throw new Error(
				"Twitch Client ID / Client Secret has not been configured yet. Please add them in the plugin settings page."
			);
		}

		const now = Date.now();
		if (s.accessToken && now < s.tokenExpiresAt - 60_000) {
			return s.accessToken;
		}

		const url =
			`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
				s.twitchClientId
			)}` +
			`&client_secret=${encodeURIComponent(s.twitchClientSecret)}` +
			`&grant_type=client_credentials`;

		const res = await requestUrl({ url, method: "POST" });
		const data = res.json as { access_token: string; expires_in: number };

		s.accessToken = data.access_token;
		s.tokenExpiresAt = now + data.expires_in * 1000;
		await this.plugin.saveSettings();

		return s.accessToken;
	}

	/** Search games by title and return matching candidate results. */
	async searchGames(title: string): Promise<IGDBGameResult[]> {
		const token = await this.ensureToken();

		const body = `
search "${title.replace(/"/g, '\\"')}";
fields name, first_release_date, cover.image_id, platforms.name,
       collection.name, franchises.name, alternative_names.name,
       involved_companies.developer, involved_companies.company.name,
       involved_companies.company.country, alternative_names.comment,
       game_localizations.name, game_localizations.region.name;
limit 50;
		`.trim();

		const res = await requestUrl({
			url: "https://api.igdb.com/v4/games",
			method: "POST",
			headers: {
				"Client-ID": this.settings.twitchClientId,
				Authorization: `Bearer ${token}`,
				"Content-Type": "text/plain",
			},
			body,
		});

		const ranked = rankSearchResults(res.json as IGDBGameResult[], title);
		const enriched = await Promise.all(
			ranked.slice(0, 10).map(async (game) => ({
				...game,
				bangumiTitle: await findBangumiGameChineseName(game.name),
			}))
		);
		return [...enriched, ...ranked.slice(10)];
	}

	/** Convert one IGDB result into frontmatter fields to write to the note. */
	async resolveFields(game: IGDBGameResult, title: string): Promise<ResolvedGameFields> {
		const fields: ResolvedGameFields = {};

		const companies = game.involved_companies ?? [];
		const developers = companies.filter((c) => c.developer);
		const chosen = developers.length > 0 ? developers : companies;
		let originCountry: number | undefined;
		if (chosen.length > 0) {
			fields.studio = Array.from(
				new Set(chosen.map((c) => c.company?.name).filter(Boolean) as string[])
			).map(asWikiLink);
			const withCountry = chosen.find((c) => c.company?.country != null);
			if (withCountry) {
				originCountry = withCountry.company.country;
				const country = countryCodeToName(withCountry.company.country);
				if (country) {
					fields.origin = country;
				}
			}
		}

		const aliasLanguage = this.settings.aliasesInTraditionalChinese
			? "zh"
			: originCountryToAliasLanguage(originCountry);
		const originAlias = resolveOriginAlias(
			game.alternative_names ?? [],
			(game.game_localizations ?? []).map((localization) => ({
				name: localization.name,
				regionName: localization.region?.name,
			})),
			aliasLanguage
		);
		const bangumiAlias = aliasLanguage === "zh" && !originAlias
			? game.bangumiTitle ?? (await findBangumiGameChineseName(title))
			: undefined;
		fields.aliases = [
			normalizeAliasTitle(
				originAlias ?? bangumiAlias ??
					(aliasLanguage === "zh" ? toTraditional(game.name) : game.name)
			),
		];

		if (game.platforms && game.platforms.length > 0) {
			const platformNames = Array.from(
				new Set(
					game.platforms
						.map((p): "Android" | "iOS" | "Nintendo Switch" | "PlayStation" | "Windows" | undefined => {
							const normalized = p.name.trim().toLowerCase();
							if (normalized.includes("android")) return "Android";
							if (normalized === "ios" || normalized.includes("iphone") || normalized.includes("ipad")) return "iOS";
							if (normalized.includes("nintendo switch")) return "Nintendo Switch";
							if (normalized.includes("playstation") || normalized === "psp" || normalized.includes("ps vita")) return "PlayStation";
							if (
								normalized === "pc (microsoft windows)" ||
								normalized === "microsoft windows" ||
								normalized === "windows"
							) return "Windows";
							return undefined;
						})
						.filter(
							(name): name is "Android" | "iOS" | "Nintendo Switch" | "PlayStation" | "Windows" =>
								name !== undefined
						)
				)
			);
			if (platformNames.length > 0) fields.platform = platformNames.map(asWikiLink);
		}

		if (game.collection?.name) {
			fields.series = [asWikiLink(game.collection.name)];
		} else if (game.franchises && game.franchises.length > 0) {
			fields.series = [asWikiLink(game.franchises[0].name)];
		}

		if (game.first_release_date) {
			const d = new Date(game.first_release_date * 1000);
			fields.released = d.toISOString().slice(0, 10);
		}

		if (game.cover?.image_id) {
			fields.cover = `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`;
		}

		return fields;
	}
}
