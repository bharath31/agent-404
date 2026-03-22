/**
 * Lightweight suffix-stripping stemmer for fuzzy token matching.
 * Single-pass, ordered longest-first. Result must be >= 3 chars.
 */

const SUFFIX_RULES: [string, string][] = [
	["izations", "ize"],
	["ments", ""],
	["ment", ""],
	["ing", ""],
	["tion", ""],
	["ers", ""],
	["ies", "y"],
	["es", ""],
	["ed", ""],
	["er", ""],
	["ly", ""],
	["s", ""],
];

export function stemToken(word: string): string {
	if (word.length <= 4) return word;

	for (const [suffix, replacement] of SUFFIX_RULES) {
		if (word.endsWith(suffix)) {
			const stem = word.slice(0, -suffix.length) + replacement;
			if (stem.length >= 3) return stem;
		}
	}

	return word;
}
