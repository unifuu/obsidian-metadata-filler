import { toTraditional, normalizeColon } from "./textUtils";

const HAN = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const KANA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/;
const HANGUL = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

type AliasLanguage = "en" | "zh" | "ja" | "ko";

/**
 * Resolve an anime alias in its origin language, using Traditional Chinese for Chinese titles.
 */
export function resolveAnimeOriginAlias(
	countryOfOrigin: string | undefined,
	nativeTitle: string | undefined,
	englishTitle: string | undefined,
	synonyms: string[],
	bangumiChineseTitle?: string,
	fallbackTitle?: string
): string | undefined {
	const language = languageForCountry(countryOfOrigin);
	const normalizedSynonyms = synonyms.filter((synonym) => synonym?.trim().length > 0);
	let title: string | undefined;

	if (language === "zh") {
		title = bangumiChineseTitle ?? nativeTitle ?? normalizedSynonyms.find((synonym) => HAN.test(synonym));
	} else if (language === "ja") {
		title = nativeTitle ?? normalizedSynonyms.find((synonym) => KANA.test(synonym));
	} else if (language === "ko") {
		title = nativeTitle ?? normalizedSynonyms.find((synonym) => HANGUL.test(synonym));
	} else {
		title = englishTitle ?? normalizedSynonyms.find(
			(synonym) => !HAN.test(synonym) && !KANA.test(synonym) && !HANGUL.test(synonym)
		);
	}

	title ??= englishTitle ?? nativeTitle ?? fallbackTitle;
	if (!title) return undefined;
	return normalizeColon(language === "zh" ? toTraditional(title) : title);
}

function languageForCountry(countryOfOrigin: string | undefined): AliasLanguage {
	switch (countryOfOrigin?.toUpperCase()) {
		case "CN":
		case "TW":
		case "HK":
		case "MO":
			return "zh";
		case "JP":
			return "ja";
		case "KR":
			return "ko";
		default:
			return "en";
	}
}
