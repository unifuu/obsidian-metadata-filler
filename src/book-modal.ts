import { App, FuzzySuggestModal } from "obsidian";
import type { WikidataCandidate } from "./wikidata";

export class BookChoiceModal extends FuzzySuggestModal<WikidataCandidate> {
	constructor(
		app: App,
		private candidates: WikidataCandidate[],
		private onChoose: (candidate: WikidataCandidate) => void
	) {
		super(app);
		this.setPlaceholder("Multiple results found. Choose the correct book/work…");
	}

	getItems(): WikidataCandidate[] {
		return this.candidates;
	}

	getItemText(candidate: WikidataCandidate): string {
		return `${candidate.label}${candidate.description ? ` — ${candidate.description}` : ""} (${candidate.id})`;
	}

	onChooseItem(candidate: WikidataCandidate): void {
		this.onChoose(candidate);
	}
}
