export declare const DEFAULT_API_BASE = "https://www.agent404.dev";
export type Suggestion = {
    url: string;
    title: string;
    description?: string;
    score: number;
    matchType: string;
};
export type SuggestPayload = {
    deadUrl: string;
    suggestions: Suggestion[];
    jsonLd: object;
};
export type RecoveryConfig = {
    apiKey: string;
    apiBase?: string;
    origin?: string;
    timeoutMs?: number;
};
export declare function buildJsonLd(suggestions: {
    url: string;
    title: string;
    matchType: string;
}[]): object;
export declare function isSafeHttpUrl(url: string): boolean;
export declare function sanitizeSuggestions<T extends {
    url: string;
    title?: string;
}>(suggestions: T[]): T[];
export declare function buildLinkHeader(suggestions: {
    url: string;
    title: string;
}[]): string;
export declare function prefersJson(accept: string | null | undefined): boolean;
export declare function suggestionListHtml(suggestions: Suggestion[]): string;
export declare function jsonLdScript(jsonLd: object): string;
export declare function injectRecoveryHtml(html: string, payload: SuggestPayload): string;
export declare function fetchSuggestions(deadUrl: string, config: RecoveryConfig): Promise<SuggestPayload | null>;
/**
 * Rewrite a 404 Response so agents see suggestions without executing JS.
 * Status stays 404. `Accept: application/json` gets the /api/suggest body.
 */
export declare function recover404(request: Request, response: Response, config: RecoveryConfig): Promise<Response>;
