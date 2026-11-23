import { requestUrl } from "obsidian";
import { normalizeColon, toTraditional } from "./textUtils";

const BGM_API = "https://api.bgm.tv";

interface V0Subject {
	id: number;
	name_cn?: string;
}

interface V0SearchResponse {
	data?: V0Subject[];
}

function traditionalText(value: string | undefined): string | undefined {
	return value ? normalizeColon(toTraditional(value)) : undefined;
}

export async function findBangumiGameChineseName(
	title: string
): Promise<string | undefined> {
	try {
		const res = await requestUrl({
			url: `${BGM_API}/v0/search/subjects`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				keyword: title,
				filter: { type: [4] },
				limit: 10,
			}),
		});
		const subjects = (res.json as V0SearchResponse).data ?? [];
		const match = subjects.find((subject) => subject.name_cn?.trim()) ?? subjects[0];
		return traditionalText(match?.name_cn);
	} catch {
		return undefined;
	}
}
