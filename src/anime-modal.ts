import { App, FuzzySuggestModal } from "obsidian";
export interface PickerCandidate {
	id: number;
	displayName: string;
	subtitle?: string;
}

export class AnimeChoiceModal extends FuzzySuggestModal<PickerCandidate> {
	constructor(
		app: App,
		private candidates: PickerCandidate[],
		private onChoose: (candidate: PickerCandidate) => void
	) {
		super(app);
		this.setPlaceholder("Multiple results found. Choose the correct anime…");
	}

	getItems(): PickerCandidate[] {
		return this.candidates;
	}

	getItemText(candidate: PickerCandidate): string {
		return candidate.subtitle
			? `${candidate.displayName} - ${candidate.subtitle}`
			: candidate.displayName;
	}

	onChooseItem(candidate: PickerCandidate): void {
		this.onChoose(candidate);
	}
}
