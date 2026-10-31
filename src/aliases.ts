import { Converter } from "opencc-js";

// Simplified Chinese → Traditional Chinese using standard traditional forms without region-specific wording conversion, so game titles are not rewritten into Taiwan/Hong Kong variants.
const toTraditional = Converter({ from: "cn", to: "t" });

export interface AltNameEntry {
	name: string;
	comment?: string;
}

export type AliasLanguage = "en" | "zh" | "ja" | "ko";

const HANGUL = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
const KANA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/;
const HAN = /[\u4E00-\u9FFF\u3400-\u4DBF]/;

/** Convert full-width colons to half-width colons while leaving other characters unchanged. */
function normalizeColon(s: string): string {
	return s.replace(/：/g, ":").trim();
}

/** Guess the language from the comment text; when there is no clue, fall back to the script used in the name itself. */
function detectLang(entry: AltNameEntry): AliasLanguage | null {
	const c = (entry.comment ?? "").toLowerCase();

	if (
		c.includes("chinese") ||
		c.includes("中文") ||
		c.includes("繁體") ||
		c.includes("繁体") ||
		c.includes("简体") ||
		c.includes("mandarin") ||
		c.includes("cantonese")
	) {
		return "zh";
	}
	if (c.includes("japan") || c.includes("japanese") || c.includes("日本")) {
		return "ja";
	}
	if (c.includes("korea") || c.includes("korean") || c.includes("한국")) {
		return "ko";
	}
	if (c.includes("english") || c.includes("英語")) {
		return "en";
	}

	// No clue in the comment: fall back to the script used in the name itself.
	const name = entry.name;
	if (HANGUL.test(name)) return "ko";
	if (KANA.test(name)) return "ja";
	if (HAN.test(name)) return "zh"; // Pure Han characters cannot reliably distinguish Chinese from Japanese, so default to Chinese.
	return null;
}

/** Infer the language from the region name in game_localizations (official IGDB data is more accurate than alternative_names). */
function regionToLang(regionName: string | undefined): AliasLanguage | null {
	if (!regionName) return null;
	const r = regionName.toLowerCase();
	if (r.includes("japan")) return "ja";
	if (r.includes("korea")) return "ko";
	if (
		r.includes("china") ||
		r.includes("taiwan") ||
		r.includes("hong kong") ||
		r.includes("macau")
	) {
		return "zh";
	}
	if (
		r.includes("united states") ||
		r.includes("north america") ||
		r.includes("united kingdom") ||
		r.includes("europe") ||
		r.includes("australia") ||
		r.includes("worldwide")
	) {
		return "en";
	}
	return null;
}

export interface LocalizationEntry {
	name: string;
	regionName?: string;
}

/**
 * Map IGDB's developer country to the language normally used for the original title.
 */
export function originCountryToAliasLanguage(countryCode: number | undefined): AliasLanguage {
	if (countryCode === 410) return "ko";
	if (
		countryCode === 156 ||
		countryCode === 158 ||
		countryCode === 344 ||
		countryCode === 446
	) {
		return "zh";
	}
	if (countryCode === 392) return "ja";
	return "en";
}

/** Pick an IGDB title matching the game's origin language, preferring regional localizations. */
export function resolveOriginAlias(
	altNames: AltNameEntry[],
	localizations: LocalizationEntry[],
	language: AliasLanguage
): string | undefined {
	const aliases: string[] = [];

	for (const loc of localizations) {
		if (!loc.name || loc.name.trim().length === 0) continue;
		if (regionToLang(loc.regionName) !== language) continue;
		aliases.push(normalizeAlias(loc.name, language));
	}

	for (const entry of altNames) {
		if (!entry.name || entry.name.trim().length === 0) continue;
		if (detectLang(entry) !== language) continue;
		aliases.push(normalizeAlias(entry.name, language));
	}

	return aliases[0];
}

function normalizeAlias(value: string, language: AliasLanguage): string {
	const normalized = normalizeColon(value);
	return language === "zh" ? toTraditional(normalized) : normalized;
}