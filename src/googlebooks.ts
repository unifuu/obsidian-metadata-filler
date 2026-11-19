import { requestUrl } from "obsidian";

interface GoogleBooksVolume {
	id?: string;
	volumeInfo?: {
		title?: string;
		authors?: string[];
		publishedDate?: string;
		imageLinks?: {
			thumbnail?: string;
			smallThumbnail?: string;
		};
	};
}

interface GoogleBooksResponse {
	items?: GoogleBooksVolume[];
}

export interface GoogleBookFields {
	author?: string[];
	released?: string;
	cover?: string;
}

export interface GoogleBooksCandidate {
	id: string;
	label: string;
	description?: string;
	fields: GoogleBookFields;
}

function releasedDate(value: string | undefined): string | undefined {
	const match = value?.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
	if (!match) return undefined;

	const [, year, month = "01", day = "01"] = match;
	const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
		return undefined;
	}
	return `${year}-${month}-${day}`;
}

function toCandidate(volume: GoogleBooksVolume): GoogleBooksCandidate | undefined {
	const info = volume.volumeInfo;
	if (!volume.id || !info?.title) return undefined;

	const authors = info.authors ?? [];
	const thumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
	const fields: GoogleBookFields = {};
	if (authors.length > 0) fields.author = [...new Set(authors)].map((author) => `[[${author}]]`);
	const date = releasedDate(info.publishedDate);
	if (date) fields.released = date;
	if (thumbnail) fields.cover = thumbnail.replace(/^http:/, "https:");

	return {
		id: volume.id,
		label: info.title,
		description: [authors.join(", "), info.publishedDate].filter(Boolean).join(" — ") || undefined,
		fields,
	};
}

async function searchVolumes(query: string): Promise<GoogleBooksCandidate[]> {
	const params = new URLSearchParams({ q: query, maxResults: "10", printType: "books" });
	const response = await requestUrl({
		url: `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
		method: "GET",
	});
	const data = response.json as GoogleBooksResponse;
	return (data.items ?? [])
		.map(toCandidate)
		.filter((candidate): candidate is GoogleBooksCandidate => candidate !== undefined);
}

/** Search Google Books, interpreting a trailing " - Author" as a title/author pair. */
export async function searchGoogleBooks(title: string): Promise<GoogleBooksCandidate[]> {
	const titleAndAuthor = title.match(/^(.+?)\s+-\s+(.+)$/);
	if (titleAndAuthor) {
		const results = await searchVolumes(`intitle:${titleAndAuthor[1]} inauthor:${titleAndAuthor[2]}`);
		if (results.length > 0) return results;
	}
	return searchVolumes(`intitle:${title}`);
}
