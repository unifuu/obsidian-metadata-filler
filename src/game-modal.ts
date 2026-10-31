import { App, FuzzySuggestModal } from "obsidian";
import type { IGDBGameResult } from "./igdb";

export class GameChoiceModal extends FuzzySuggestModal<IGDBGameResult> {
	constructor(
		app: App,
		private games: IGDBGameResult[],
		private onChoose: (game: IGDBGameResult) => void
	) {
		super(app);
		this.setPlaceholder("Multiple results found. Please choose the correct game…");
	}

	getItems(): IGDBGameResult[] {
		return this.games;
	}

	getItemText(game: IGDBGameResult): string {
		const year = game.first_release_date
			? new Date(game.first_release_date * 1000).getFullYear()
			: "Unknown year";
		const dev = game.involved_companies?.find((c) => c.developer)?.company
			?.name;
				const platforms = game.platforms?.map((platform) => platform.name).join(", ");
				const chineseTitle = game.bangumiTitle ? ` / ${game.bangumiTitle}` : "";
				return `${game.name}${chineseTitle} (${year})${dev ? " - " + dev : ""}${platforms ? " - " + platforms : ""}`;
	}

	onChooseItem(game: IGDBGameResult): void {
		this.onChoose(game);
	}
}
