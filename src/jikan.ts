import { requestUrl } from "obsidian";

const JIKAN_API = "https://api.jikan.moe/v4";

export interface JikanCandidate {
	malId: number;
	title: string;
	titleEnglish?: string;
	titleJapanese?: string;
	year?: number;
}

export interface JikanDetails {
	malId: number;
	episodes?: number;
	titleEnglish?: string;
	titleJapanese?: string;
	studios: string[];
	releasedDate?: string;
	cover?: string;
	synonyms: string[];
}

interface JikanAnime {
	mal_id: number;
	episodes?: number;
	title?: string;
	title_english?: string;
	title_japanese?: string;
	title_synonyms?: string[];
	aired?: { from?: string };
	studios?: { name: string }[];
	images?: { jpg?: { large_image_url?: string; image_url?: string } };
}

interface JikanSearchResponse {
	data?: JikanAnime[];
}

interface JikanDetailResponse {
	data?: JikanAnime;
}

/** MyAnimeList data through Jikan, used when AniList is unavailable. */
export async function searchAnimeJikan(title: string): Promise<JikanCandidate[]> {
	const url = `${JIKAN_API}/anime?q=${encodeURIComponent(title)}&limit=10`;
	const res = await requestUrl({ url, method: "GET" });
	const data = res.json as JikanSearchResponse;

	return (data.data ?? []).map((anime) => ({
		malId: anime.mal_id,
		title: anime.title ?? String(anime.mal_id),
		titleEnglish: anime.title_english,
		titleJapanese: anime.title_japanese,
		year: anime.aired?.from ? Number(anime.aired.from.slice(0, 4)) : undefined,
	}));
}

export async function fetchAnimeDetailsJikan(malId: number): Promise<JikanDetails> {
	const url = `${JIKAN_API}/anime/${malId}`;
	const res = await requestUrl({ url, method: "GET" });
	const data = (res.json as JikanDetailResponse).data;
	if (!data) throw new Error("Anime not found on Jikan/MyAnimeList.");

	return {
		malId: data.mal_id,
		episodes: data.episodes ?? undefined,
		titleEnglish: data.title_english,
		titleJapanese: data.title_japanese,
		studios: (data.studios ?? []).map((studio) => studio.name),
		releasedDate: data.aired?.from?.slice(0, 10),
		cover: data.images?.jpg?.large_image_url ?? data.images?.jpg?.image_url,
		synonyms: data.title_synonyms ?? [],
	};
}
