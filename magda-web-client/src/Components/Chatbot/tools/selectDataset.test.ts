import selectDataset from "./selectDataset";
import { ChainInput } from "../commons";

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
            searchResults: [
                {
                    identifier: "dataset-1",
                    title: "Dataset One",
                    distributions: []
                }
            ],
            selectedDataset: undefined,
            datasetSchema: [{ distributionRef: 0, title: "x", columns: ["a"] }],
            datasetSchemaReady: true
        }
    };
}

describe("selectDataset tool", () => {
    it("selects dataset from search results and resets schema state", async () => {
        const input = createInput();
        const message = await selectDataset.func.call(input, "dataset-1");

        expect(message).toContain('Dataset "Dataset One" selected');
        expect(input.keyContextData.selectedDataset?.identifier).toBe(
            "dataset-1"
        );
        expect(input.keyContextData.datasetSchema).toBeUndefined();
        expect(input.keyContextData.datasetSchemaReady).toBe(false);
    });

    it("returns guidance when search results are missing", async () => {
        const input = createInput();
        input.keyContextData.searchResults = undefined;
        const message = await selectDataset.func.call(input, "dataset-1");
        expect(message).toContain("Please search for datasets first");
    });
});
