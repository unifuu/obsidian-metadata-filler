import { App, PluginSettingTab, Setting } from "obsidian";
import type MetadataFillerPlugin from "./main";

export interface MetadataFillerSettings {
	twitchClientId: string;
	twitchClientSecret: string;
	accessToken: string;
	tokenExpiresAt: number;
	alwaysAskWhenMultiple: boolean;
	aliasesInTraditionalChinese: boolean;
}

export const DEFAULT_SETTINGS: MetadataFillerSettings = {
	twitchClientId: "",
	twitchClientSecret: "",
	accessToken: "",
	tokenExpiresAt: 0,
	alwaysAskWhenMultiple: true,
	aliasesInTraditionalChinese: false,
};

export class MetadataFillerSettingTab extends PluginSettingTab {
	plugin: MetadataFillerPlugin;

	constructor(app: App, plugin: MetadataFillerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Metadata Filler Settings" });

		const info = containerEl.createEl("p");
		info.innerHTML = "Game metadata uses IGDB; book metadata uses Google Books, Wikidata, and Open Library.";

		new Setting(containerEl)
			.setName("IGDB Client ID")
			.addText((text) => text.setValue(this.plugin.settings.twitchClientId).onChange(async (value) => {
				this.plugin.settings.twitchClientId = value.trim();
				this.plugin.settings.accessToken = "";
				this.plugin.settings.tokenExpiresAt = 0;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("IGDB Client Secret")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(this.plugin.settings.twitchClientSecret).onChange(async (value) => {
					this.plugin.settings.twitchClientSecret = value.trim();
					this.plugin.settings.accessToken = "";
					this.plugin.settings.tokenExpiresAt = 0;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Ask me when multiple results are found")
			.setDesc("If disabled, the first search result is used automatically.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alwaysAskWhenMultiple)
					.onChange(async (value) => {
						this.plugin.settings.alwaysAskWhenMultiple = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use Traditional Chinese for aliases")
			.setDesc("When enabled, use the Chinese title for game aliases regardless of origin. Otherwise, use the origin-language title.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.aliasesInTraditionalChinese)
					.onChange(async (value) => {
						this.plugin.settings.aliasesInTraditionalChinese = value;
						await this.plugin.saveSettings();
					})
			);

	}
}
