import { filterAvailableTools, serializeToolResult } from "./orchestration";
import { ChainInput } from "./commons";
import type { WebLLMTool } from "./ChatWebLLM";

function createInput(overrides: Partial<ChainInput> = {}): ChainInput {
    return {
        appName: "magda",
        question: "test",
        queue: { push: jest.fn(), done: jest.fn() } as any,
        history: {} as any,
        location: { pathname: "/" } as any,
        model: {} as any,
        dataset: undefined,
        distribution: undefined,
        keyContextData: {
            queryResult: undefined,
            searchResults: undefined,
            selectedDataset: undefined,
            datasetSchema: undefined,
            datasetSchemaReady: false
        },
        ...overrides
    };
}

describe("AgentChain helpers", () => {
    const tools: WebLLMTool[] = [
        { name: "searchDatasets", func: async () => undefined },
        { name: "defaultAgent", func: async () => undefined },
        { name: "selectDataset", func: async () => undefined },
        { name: "queryDataset", func: async () => undefined },
        { name: "executeSQLQuery", func: async () => undefined }
    ];

    it("filters select/query/sql tools by execution state", () => {
        const input = createInput();
        let available = filterAvailableTools(tools, input).map(
            (item) => item.name
        );
        expect(available).toEqual(["searchDatasets", "defaultAgent"]);

        input.keyContextData.searchResults = [{ identifier: "dataset-1" }];
        available = filterAvailableTools(tools, input).map((item) => item.name);
        expect(available).toEqual([
            "searchDatasets",
            "defaultAgent",
            "selectDataset"
        ]);

        input.keyContextData.selectedDataset = { identifier: "dataset-1" };
        available = filterAvailableTools(tools, input).map((item) => item.name);
        expect(available).toEqual([
            "searchDatasets",
            "selectDataset",
            "queryDataset"
        ]);

        input.keyContextData.datasetSchemaReady = true;
        available = filterAvailableTools(tools, input).map((item) => item.name);
        expect(available).toEqual([
            "searchDatasets",
            "selectDataset",
            "queryDataset",
            "executeSQLQuery"
        ]);
    });

    it("serializes non-json-safe values safely", () => {
        const circular: Record<string, any> = {};
        circular.self = circular;
        expect(serializeToolResult(circular)).toBe("[object Object]");
        expect(serializeToolResult(undefined)).toBe("undefined");
    });
});
