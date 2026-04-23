import { WebLLMTool } from "../ChatWebLLM";
import { ChainInput } from "../commons";

const selectDataset: WebLLMTool = {
    name: "selectDataset",

    func: async function (this: ChainInput, datasetId: string) {
        console.log("[selectDataset] START");
        console.log(
            "[selectDataset] this.keyContextData:",
            this.keyContextData
        );
        console.log("[selectDataset] datasetId:", datasetId);

        const context = (this as unknown) as ChainInput;

        const datasets = context.keyContextData.queryResult;

        if (!datasets || !datasets.length) {
            return "No datasets available to select. Please search for datasets first.";
        }

        const selected = datasets.find((d: any) => d.identifier === datasetId);

        if (!selected) {
            return `Dataset with ID ${datasetId} not found in the search results.`;
        }

        context.keyContextData.selectedDataset = selected;

        return `Dataset "${selected.title}" selected. You can now examine its contents`;
    },

    description:
        "Select a dataset from previously searched datasets using its ID. " +
        "You must call this after searchDatasets and before queryDataset",

    parameters: [
        {
            name: "datasetId",
            type: "string" as const,
            description:
                "The ID of the dataset to select (from search results)."
        }
    ],

    requiredParameters: ["datasetId"]
};

export default selectDataset;
