// Country codes are normalized to the wiki-link format used by note metadata.
export const COUNTRY_ALPHA2_MAP: Record<string, string> = {
	JP: "[[🇯🇵 Japan]]",
	KR: "[[🇰🇷 South Korea]]",
	CN: "[[🇨🇳 China]]",
	TW: "[[🇹🇼 Taiwan]]",
	HK: "[[🇭🇰 Hong Kong]]",
	US: "[[🇺🇸 United States]]",
	GB: "[[🇬🇧 United Kingdom]]",
	FR: "[[🇫🇷 France]]",
	DE: "[[🇩🇪 Germany]]",
	CA: "[[🇨🇦 Canada]]",
	SG: "[[🇸🇬 Singapore]]",
	PL: "[[🇵🇱 Poland]]",
	SE: "[[🇸🇪 Sweden]]",
	FI: "[[🇫🇮 Finland]]",
	NL: "[[🇳🇱 Netherlands]]",
	ES: "[[🇪🇸 Spain]]",
	IT: "[[🇮🇹 Italy]]",
	AU: "[[🇦🇺 Australia]]",
	RU: "[[🇷🇺 Russia]]",
	CZ: "[[🇨🇿 Czech Republic]]",
	BE: "[[🇧🇪 Belgium]]",
	DK: "[[🇩🇰 Denmark]]",
	NO: "[[🇳🇴 Norway]]",
	CH: "[[🇨🇭 Switzerland]]",
	UA: "[[🇺🇦 Ukraine]]",
	HU: "[[🇭🇺 Hungary]]",
	AT: "[[🇦🇹 Austria]]",
	NZ: "[[🇳🇿 New Zealand]]",
	IL: "[[🇮🇱 Israel]]",
};

export function countryAlpha2ToName(code: string | undefined): string | undefined {
	if (!code) return undefined;
	return COUNTRY_ALPHA2_MAP[code.toUpperCase()] ?? code;
}

// IGDB uses ISO 3166-1 numeric country codes for company.country.
export const COUNTRY_CODE_MAP: Record<number, string> = {
	840: "[[🇺🇸 United States]]",
	392: "[[🇯🇵 Japan]]",
	826: "[[🇬🇧 United Kingdom]]",
	276: "[[🇩🇪 Germany]]",
	250: "[[🇫🇷 France]]",
	124: "[[🇨🇦 Canada]]",
	410: "[[🇰🇷 South Korea]]",
	156: "[[🇨🇳 China]]",
	158: "[[🇹🇼 Taiwan]]",
	344: "[[🇭🇰 Hong Kong]]",
	702: "[[🇸🇬 Singapore]]",
	616: "[[🇵🇱 Poland]]",
	752: "[[🇸🇪 Sweden]]",
	246: "[[🇫🇮 Finland]]",
	528: "[[🇳🇱 Netherlands]]",
	724: "[[🇪🇸 Spain]]",
	380: "[[🇮🇹 Italy]]",
	36: "[[🇦🇺 Australia]]",
	643: "[[🇷🇺 Russia]]",
	203: "[[🇨🇿 Czech Republic]]",
	56: "[[🇧🇪 Belgium]]",
	208: "[[🇩🇰 Denmark]]",
	578: "[[🇳🇴 Norway]]",
	756: "[[🇨🇭 Switzerland]]",
	804: "[[🇺🇦 Ukraine]]",
	348: "[[🇭🇺 Hungary]]",
	40: "[[🇦🇹 Austria]]",
	554: "[[🇳🇿 New Zealand]]",
	376: "[[🇮🇱 Israel]]",
};

export function countryCodeToName(code: number | undefined | null): string | null {
	if (code === undefined || code === null) return null;
	return COUNTRY_CODE_MAP[code] ?? `Country code ${code}`;
}
