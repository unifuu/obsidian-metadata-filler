import { requestUrl } from "obsidian";
import { normalizeColon, toTraditional } from "./textUtils";

const BGM_API = "https://api.bgm.tv";

export interface BangumiCandidate {
	id: number;
	name: string;
	nameCn?: string;
	date?: string;
	episodes?: number;
}

export interface BangumiAnimeDetails {
	id: number;
	episodes?: number;
	name: string;
	nameCn?: string;
	date?: string;
	cover?: string;
	studios: string[];
	aliases: string[];
}

interface V0Subject {
	id: number;
	name?: string;
	name_cn?: string;
	eps?: number;
	date?: string;
	images?: { large?: string; common?: string; medium?: string };
	infobox?: { key: string; value: unknown }[];
}

interface V0SearchResponse {
	data?: V0Subject[];
}

function normalizeCoverUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;

	try {
		const coverUrl = new URL(url);
		coverUrl.protocol = "https:";
		return coverUrl.toString();
	} catch {
		return undefined;
	}
}

function traditionalText(value: string | undefined): string | undefined {
	return value ? normalizeColon(toTraditional(value)) : undefined;
}

function infoboxValue(subject: V0Subject, keys: string[]): unknown {
	return subject.infobox?.find((entry) => keys.includes(entry.key))?.value;
}

function stringValues(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => (typeof entry === "string" ? entry : (entry as { v?: unknown }).v))
		.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function subjectToCandidate(subject: V0Subject): BangumiCandidate {
	return {
		id: subject.id,
		episodes: typeof subject.eps === "number" ? subject.eps : undefined,
		name: subject.name ?? String(subject.id),
		nameCn: traditionalText(subject.name_cn),
		date: subject.date,
	};
}

/** Search Bangumi's current v0 API for anime when AniList and Jikan are unavailable. */
export async function searchAnimeBangumi(title: string): Promise<BangumiCandidate[]> {
	const res = await requestUrl({
		url: `${BGM_API}/v0/search/subjects`,
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			keyword: title,
			filter: { type: [2] },
			limit: 10,
		}),
	});
	const data = res.json as V0SearchResponse;
	return (data.data ?? []).map(subjectToCandidate);
}

export async function fetchAnimeDetailsBangumi(id: number): Promise<BangumiAnimeDetails> {
	const res = await requestUrl({ url: `${BGM_API}/v0/subjects/${id}`, method: "GET" });
	const subject = res.json as V0Subject;
	if (!subject?.id) throw new Error("Anime not found on Bangumi.");

	const aliases = [
		traditionalText(subject.name_cn),
		...stringValues(infoboxValue(subject, ["别名", "中文名"])),
	]
		.map((value) => traditionalText(value))
		.filter((value): value is string => Boolean(value?.trim()));
	const studioValues = stringValues(infoboxValue(subject, ["动画制作", "製作"]))
		.map((value) => traditionalText(value) ?? value);

	return {
		id: subject.id,
		name: subject.name ?? String(subject.id),
		nameCn: traditionalText(subject.name_cn),
		date: subject.date,
		cover: normalizeCoverUrl(subject.images?.large ?? subject.images?.common ?? subject.images?.medium),
		studios: studioValues,
		aliases: Array.from(new Set(aliases)),
	};
}

/**
 * Search Bangumi (bgm.tv) by title and prefer the first result with a Chinese name.
 * type=2 means anime. The public GET endpoint requires no API key.
 */
export interface BangumiSubjectMatch {
	nameCn?: string;
	cover?: string;
}

export async function findBangumiSubject(
	titles: string | string[],
	type = 2
): Promise<BangumiSubjectMatch | undefined> {
	for (const title of Array.isArray(titles) ? titles : [titles]) {
		if (!title.trim()) continue;

		try {
			const res = await requestUrl({
				url: `${BGM_API}/v0/search/subjects`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					keyword: title,
										filter: { type: [type] },
					limit: 10,
				}),
			});
			const data = res.json as V0SearchResponse;
			const subjects = data.data ?? [];
			const match =
				subjects.find((s) => s.name_cn && s.name_cn.trim().length > 0) ??
				subjects[0];
			if (match) {
				return {
					nameCn: traditionalText(match.name_cn),
					cover: normalizeCoverUrl(
						match.images?.large ?? match.images?.common ?? match.images?.medium
					),
				};
			}
		} catch {
			// Try the next title; Bangumi is optional to the main workflow.
		}
	}

	return undefined;
}

export async function findBangumiChineseName(title: string): Promise<string | undefined> {
	return (await findBangumiSubject(title))?.nameCn;
}

export async function findBangumiGameChineseName(
	title: string
): Promise<string | undefined> {
	return (await findBangumiSubject(title, 4))?.nameCn;
}
