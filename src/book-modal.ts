import { App, FuzzySuggestModal } from "obsidian";

interface BookChoiceCandidate {
	id: string;
	label: string;
	description?: string;
}

export class BookChoiceModal<T extends BookChoiceCandidate> extends FuzzySuggestModal<T> {
	constructor(
		app: App,
		private candidates: T[],
		private onChoose: (candidate: T) => void
	) {
		super(app);
		this.setPlaceholder("Multiple results found. Choose the correct book/work…");
	}

	getItems(): T[] {
		return this.candidates;
	}

	getItemText(candidate: T): string {
		return `${candidate.label}${candidate.description ? ` — ${candidate.description}` : ""} (${candidate.id})`;
	}

	onChooseItem(candidate: T): void {
		this.onChoose(candidate);
	}
}
