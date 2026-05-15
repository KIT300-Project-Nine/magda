import {
    CHATBOT_SUPPORTED_FORMATS,
    isChatbotSupportedFormat,
    normalizeFormat
} from "./supportedFormats";

describe("supportedFormats", () => {
    it("normalizes and recognizes supported chatbot formats", () => {
        expect(normalizeFormat("  xlsx  ")).toBe("XLSX");
        expect(isChatbotSupportedFormat("tsv")).toBe(true);
        expect(isChatbotSupportedFormat("pdf")).toBe(false);
        expect(CHATBOT_SUPPORTED_FORMATS).toContain("CSV");
        expect(CHATBOT_SUPPORTED_FORMATS).toContain("JSONL");
    });
});
