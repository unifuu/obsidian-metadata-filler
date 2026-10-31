import { Converter } from "opencc-js";

// Simplified → Traditional (standard Traditional, character-level only, no regional wording conversion)
const toTraditionalConverter = Converter({ from: "cn", to: "t" });

export function toTraditional(s: string): string {
	return toTraditionalConverter(s);
}

/** Replace full-width colons with half-width colons */
export function normalizeColon(s: string): string {
	return s.replace(/：/g, ":").trim();
}
