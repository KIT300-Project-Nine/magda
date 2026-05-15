export const CHATBOT_SUPPORTED_FORMATS = [
    "CSV-GEO-AU",
    "CSV",
    "TSV",
    "TAB",
    "XLSX",
    "XLS",
    "JSON",
    "JSONL",
    "NDJSON"
] as const;

export type ChatbotSupportedFormat = typeof CHATBOT_SUPPORTED_FORMATS[number];

export function normalizeFormat(format?: string): string {
    return typeof format === "string" ? format.trim().toUpperCase() : "";
}

export function isChatbotSupportedFormat(format?: string): boolean {
    const normalized = normalizeFormat(format);
    return (
        CHATBOT_SUPPORTED_FORMATS.indexOf(
            normalized as ChatbotSupportedFormat
        ) !== -1
    );
}

export function getSupportedFormatLabels(): string[] {
    return [...CHATBOT_SUPPORTED_FORMATS];
}
