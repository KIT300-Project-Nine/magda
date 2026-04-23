import { ChainInput } from "../commons";

jest.mock("../../../libs/sqlUtils", () => ({
    runQuery: jest.fn(async () => [{ colA: "value" }])
}));

jest.mock("../Messaging", () => ({
    createChatEventMessageCompleteMsg: (msg: string) => ({ msg })
}));

const { createQueryDatasetTool } = require("./queryDataset");

function createInput(): ChainInput {
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
            searchResults: [{ identifier: "dataset-1" }],
            selectedDataset: {
                identifier: "dataset-1",
                title: "Dataset One",
                distributions: [
                    {
                        identifier: "dist-1",
                        title: "Distribution One",
                        format: "CSV"
                    }
                ]
            },
            datasetSchema: undefined,
            datasetSchemaReady: false
        }
    };
}

describe("queryDataset tool", () => {
    it("inspects selected dataset distributions and marks schema ready", async () => {
        const input = createInput();
        const tool = await createQueryDatasetTool(input);
        expect(tool).toBeTruthy();

        const result = await tool!.func.call(input);

        expect(result).toContain("distributionRef");
        expect(result).toContain("executeSQLQuery");
        expect(input.keyContextData.datasetSchemaReady).toBe(true);
        expect(input.keyContextData.datasetSchema?.[0]?.distributionRef).toBe(
            "dist-1"
        );
    });

    it("returns guidance when no dataset can be resolved", async () => {
        const input = createInput();
        input.keyContextData.selectedDataset = undefined;
        const tool = await createQueryDatasetTool(input);
        const result = await tool!.func.call(input);
        expect(result).toContain("No dataset is currently selected");
    });
});
