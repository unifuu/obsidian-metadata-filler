import { requestUrl } from "obsidian";

const ANILIST_API = "https://graphql.anilist.co";

export interface AniListCandidate {
	id: number;
	romaji?: string;
	english?: string;
	native?: string;
	seasonYear?: number;
	format?: string;
}

export interface AniListDetails {
	id: number;
	episodes?: number;
	titleRomaji?: string;
	titleEnglish?: string;
	titleNative?: string;
	cover?: string;
	studios: string[];
	countryOfOrigin?: string; // ISO 3166-1 alpha-2
	releasedDate?: string; // YYYY-MM-DD
	synonyms: string[];
}

interface GraphQLResponse<T> {
	data?: T;
	errors?: { message: string; status?: number }[];
}

interface RequestError {
	message?: string;
	status?: number;
}

async function graphql<T>(
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	let res;
	try {
		res = await requestUrl({
			url: ANILIST_API,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ query, variables }),
		});
	} catch (error) {
		const requestError = error as RequestError;
		if (requestError.status === 403 || requestError.message?.includes("403")) {
			throw new Error(
				"AniList is temporarily unavailable (HTTP 403). The AniList API has been disabled by its service operator; please try again later."
			);
		}
		throw error;
	}

	const data = res.json as GraphQLResponse<T>;
	if (!data.data) {
		const message = data.errors?.map((e) => e.message).join("; ");
		if (data.errors?.some((error) => error.status === 403)) {
			throw new Error(
				"AniList is temporarily unavailable (HTTP 403). The AniList API has been disabled by its service operator; please try again later."
			);
		}
		throw new Error(message || "AniList query failed");
	}
	return data.data;
}

const SEARCH_QUERY = `
query ($search: String) {
	Page(perPage: 10) {
		media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
			id
			format
			seasonYear
			title {
				romaji
				english
				native
			}
		}
	}
}`;

interface SearchMedia {
	id: number;
	format?: string;
	seasonYear?: number;
	title?: { romaji?: string; english?: string; native?: string };
}

/** Search anime by title and return multiple candidates. */
export async function searchAnime(title: string): Promise<AniListCandidate[]> {
	const data = await graphql<{ Page: { media: SearchMedia[] } }>(SEARCH_QUERY, {
		search: title,
	});

	return (data.Page.media ?? []).map((m) => ({
		id: m.id,
		romaji: m.title?.romaji,
		english: m.title?.english,
		native: m.title?.native,
		seasonYear: m.seasonYear,
		format: m.format,
	}));
}

const DETAILS_QUERY = `
query ($id: Int) {
	Media(id: $id, type: ANIME) {
		id
				episodes
		title {
			romaji
			english
			native
		}
		coverImage {
			large
		}
		startDate {
			year
			month
			day
		}
		countryOfOrigin
		synonyms
		studios {
			nodes {
				name
				isAnimationStudio
			}
		}
	}
}`;

interface DetailsMedia {
	id: number;
	episodes?: number;
	title?: { romaji?: string; english?: string; native?: string };
	coverImage?: { large?: string };
	startDate?: { year?: number; month?: number; day?: number };
	countryOfOrigin?: string;
	synonyms?: string[];
	studios?: { nodes?: { name: string; isAnimationStudio: boolean }[] };
}

/** Fetch details for a single anime title. */
export async function fetchAnimeDetails(id: number): Promise<AniListDetails> {
	const data = await graphql<{ Media: DetailsMedia }>(DETAILS_QUERY, { id });
	const m = data.Media;

	const allStudios = m.studios?.nodes ?? [];
	const animationStudios = allStudios.filter((s) => s.isAnimationStudio);
	const studios = (animationStudios.length > 0 ? animationStudios : allStudios).map(
		(s) => s.name
	);

	let releasedDate: string | undefined;
	const sd = m.startDate;
	if (sd?.year) {
		const mm = String(sd.month ?? 1).padStart(2, "0");
		const dd = String(sd.day ?? 1).padStart(2, "0");
		releasedDate = `${sd.year}-${mm}-${dd}`;
	}

	return {
		id: m.id,
		episodes: m.episodes ?? undefined,
		titleRomaji: m.title?.romaji,
		titleEnglish: m.title?.english,
		titleNative: m.title?.native,
		cover: m.coverImage?.large,
		studios,
		countryOfOrigin: m.countryOfOrigin,
		releasedDate,
		synonyms: m.synonyms ?? [],
	};
}
