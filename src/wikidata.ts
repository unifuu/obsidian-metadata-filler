import { requestUrl } from "obsidian";
import { countryAlpha2ToName } from "./countries";
import { normalizeColon, toTraditional } from "./textUtils";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

export interface WikidataCandidate {
	id: string;
	label: string;
	description?: string;
}

interface WikidataLabel {
	value: string;
}

interface WikidataClaim {
	mainsnak?: {
		datavalue?: {
			value?: unknown;
		};
	};
}

interface WikidataEntity {
	labels?: Record<string, WikidataLabel>;
	claims?: Record<string, WikidataClaim[]>;
}

interface WikidataSearchResponse {
	search?: { id: string; label?: string; description?: string }[];
}

export interface ResolvedBookFields {
	author?: string[];
	origin?: string;
	released?: string;
	chapters?: number;
	cover?: string;
	aliases?: string[];
}

/** Search Wikidata in Traditional Chinese, English, and Simplified Chinese. */
export async function searchBooks(title: string): Promise<WikidataCandidate[]> {
	const candidates = new Map<string, WikidataCandidate>();
	const failures: unknown[] = [];

	for (const language of ["zh-hant", "en", "zh"]) {
		const params = new URLSearchParams({
			action: "wbsearchentities",
			search: title,
			language,
			uselang: language,
			type: "item",
			limit: "10",
			format: "json",
		});

		try {
			const response = await requestUrl({
				url: `${WIKIDATA_API}?${params.toString()}`,
				method: "GET",
			});
			const data = response.json as WikidataSearchResponse;
			for (const item of data.search ?? []) {
				if (!candidates.has(item.id)) {
					candidates.set(item.id, {
						id: item.id,
						label: item.label ?? item.id,
						description: item.description,
					});
				}
			}
		} catch (error) {
			failures.push(error);
		}
	}

	if (candidates.size === 0 && failures.length > 0) {
		throw new Error(`Wikidata search requests failed: ${String(failures[0])}`);
	}
	return [...candidates.values()];
}

async function getEntities(
	ids: string[],
	props: string,
	languages: string
): Promise<Record<string, WikidataEntity>> {
	if (ids.length === 0) return {};
	const params = new URLSearchParams({
		action: "wbgetentities",
		ids: ids.join("|"),
		props,
		languages,
		format: "json",
	});
	const response = await requestUrl({
		url: `${WIKIDATA_API}?${params.toString()}`,
		method: "GET",
	});
	const data = response.json as { entities?: Record<string, WikidataEntity> };
	return data.entities ?? {};
}

function getEntityIds(
	claims: Record<string, WikidataClaim[]> | undefined,
	property: string
): string[] {
	return (claims?.[property] ?? [])
		.map((claim) => (claim.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id)
		.filter((id): id is string => Boolean(id));
}

function getEarliestDate(
	claims: Record<string, WikidataClaim[]> | undefined,
	property: string
): string | undefined {
	const dates = (claims?.[property] ?? [])
		.map((claim) => {
			const value = claim.mainsnak?.datavalue?.value as
				| { time?: string; precision?: number }
				| undefined;
			const match = value?.time?.match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
			if (!match) return undefined;

			const year = Number(match[2]) * (match[1] === "-" ? -1 : 1);
			if (!Number.isFinite(year)) return undefined;
			const precision = value?.precision ?? 11;
			const month = precision >= 10 ? match[3] : "01";
			const day = precision >= 11 ? match[4] : "01";
			const formattedYear = year >= 0
				? String(year).padStart(4, "0")
				: `-${String(Math.abs(year)).padStart(4, "0")}`;
			return { year, month, day, date: `${formattedYear}-${month}-${day}` };
		})
		.filter((date): date is { year: number; month: string; day: string; date: string } => date !== undefined)
		.sort((a, b) => a.year - b.year || a.month.localeCompare(b.month) || a.day.localeCompare(b.day));
	return dates[0]?.date;
}

function getStringClaim(
	claims: Record<string, WikidataClaim[]> | undefined,
	property: string
): string | undefined {
	const value = claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
	return typeof value === "string" ? value : undefined;
}

function pickTraditionalChineseLabel(
	labels: Record<string, WikidataLabel> | undefined
): string | undefined {
	for (const language of ["zh-hant", "zh-tw", "zh-hk"]) {
		const label = labels?.[language]?.value;
		if (label) return normalizeColon(label);
	}
	for (const language of ["zh-hans", "zh-cn", "zh"]) {
		const label = labels?.[language]?.value;
		if (label) return normalizeColon(toTraditional(label));
	}
	return undefined;
}

async function getEnglishLabels(ids: string[]): Promise<Record<string, string>> {
	const entities = await getEntities(ids, "labels", "en");
	return Object.fromEntries(
		ids.flatMap((id) => {
			const label = entities[id]?.labels?.en?.value;
			return label ? [[id, label]] : [];
		})
	);
}

async function getOrigin(ids: string[]): Promise<string | undefined> {
	if (ids.length === 0) return undefined;
	const entities = await getEntities(ids, "labels|claims", "en");
	const names = ids.flatMap((id) => {
		const entity = entities[id];
		const code = getStringClaim(entity?.claims, "P297");
		const origin = code
			? countryAlpha2ToName(code)
			: entity?.labels?.en?.value
				? `[[${entity.labels.en.value}]]`
				: undefined;
		return origin ? [origin] : [];
	});
	return names.length > 0 ? names.join(", ") : undefined;
}

/** Resolve Wikidata book claims into the metadata fields used by the vault. */
export async function resolveBookFields(qid: string): Promise<ResolvedBookFields> {
	const entities = await getEntities(
		[qid],
		"labels|claims",
		"en|zh|zh-hant|zh-hans|zh-tw|zh-hk|zh-cn"
	);
	const entity = entities[qid];
	if (!entity) return {};

	const claims = entity.claims;
	const fields: ResolvedBookFields = {};

	const authorIds = getEntityIds(claims, "P50");
	if (authorIds.length > 0) {
		const labels = await getEnglishLabels(authorIds);
		const authors = authorIds.map((id) => labels[id]).filter(Boolean);
		if (authors.length > 0) {
			fields.author = [...new Set(authors)].map((author) => `[[${author}]]`);
		}
	}

	const originIds = getEntityIds(claims, "P495");
	fields.origin = await getOrigin(
		originIds.length > 0 ? originIds : getEntityIds(claims, "P17")
	);

	fields.released = getEarliestDate(claims, "P577") ?? getEarliestDate(claims, "P571");

	const image = getStringClaim(claims, "P18");
	if (image) {
		fields.cover = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.replace(/ /g, "_"))}?width=800`;
	}

	const alias = pickTraditionalChineseLabel(entity.labels);
	if (alias) fields.aliases = [alias];
	return fields;
}
