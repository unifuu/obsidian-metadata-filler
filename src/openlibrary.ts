import { requestUrl } from "obsidian";

interface OpenLibraryDoc {
	title?: string;
	author_name?: string[];
	first_publish_year?: number;
	cover_i?: number;
	edition_key?: string[];
}

interface OpenLibraryTocEntry {
	title?: string;
}

interface OpenLibraryEdition {
	table_of_contents?: OpenLibraryTocEntry[];
}

export interface OpenLibraryMetadata {
	author?: string[];
	released?: string;
	cover?: string;
	chapters?: number;
}

function normalizeTitle(title: string): string {
	return title
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim();
}

function countExplicitChapters(contents: OpenLibraryTocEntry[] | undefined): number | undefined {
	if (!contents) return undefined;

	const chapterHeading = /^(?:chapter|chap\.?|ch\.?)\s*(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b|^第[零〇一二三四五六七八九十百千\d]+章/i;
	const count = contents.filter((entry) => chapterHeading.test(entry.title?.trim() ?? "")).length;
	return count > 0 ? count : undefined;
}

/** Look up a cover and explicit chapter entries from Open Library when available. */
export async function findOpenLibraryMetadata(
	title: string,
	author?: string,
	includeChapters = true
): Promise<OpenLibraryMetadata> {
	const params = new URLSearchParams({
		title,
		limit: "5",
		fields: "title,author_name,first_publish_year,edition_key,cover_i",
	});
	if (author) params.set("author", author);

	const url = `https://openlibrary.org/search.json?${params.toString()}`;
	const res = await requestUrl({ url, method: "GET" });
	const data = res.json as { docs?: OpenLibraryDoc[] };
	const docs = data.docs ?? [];
	const metadata: OpenLibraryMetadata = {};

	const exactTitle = normalizeTitle(title);
	const exactDocs = docs.filter((doc) => doc.title && normalizeTitle(doc.title) === exactTitle);
	const exactDoc = exactDocs.find((doc) => doc.cover_i !== undefined && doc.cover_i > 0) ?? exactDocs[0];
	if (exactDoc?.author_name?.length) {
		metadata.author = [...new Set(exactDoc.author_name)].map((author) => `[[${author}]]`);
	}
	if (exactDoc?.first_publish_year !== undefined) {
		metadata.released = `${String(exactDoc.first_publish_year).padStart(4, "0")}-01-01`;
	}

	if (exactDoc?.cover_i) {
		metadata.cover = `https://covers.openlibrary.org/b/id/${exactDoc.cover_i}-L.jpg`;
	}

	if (!includeChapters) return metadata;

	const editionKeys = exactDocs.flatMap((doc) => doc.edition_key ?? []).slice(0, 5);
	for (const editionKey of editionKeys) {
		try {
			const editionResponse = await requestUrl({
				url: `https://openlibrary.org/books/${encodeURIComponent(editionKey)}.json`,
				method: "GET",
			});
			const edition = editionResponse.json as OpenLibraryEdition;
			const chapters = countExplicitChapters(edition.table_of_contents);
			if (chapters !== undefined) {
				metadata.chapters = chapters;
				break;
			}
		} catch (error) {
			console.warn(`Open Library edition lookup failed for ${editionKey}:`, error);
		}
	}
	return metadata;
}
