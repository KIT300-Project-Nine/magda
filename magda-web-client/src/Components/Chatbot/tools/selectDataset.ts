import type { WebLLMTool } from "../ChatWebLLM";
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

        const datasets = context.keyContextData.searchResults;
        const unqueryableDatasetIds =
            context.keyContextData.unqueryableDatasetIds || [];

        if (!datasets || !datasets.length) {
            return "No datasets available to select. Please search for datasets first.";
        }

        const selectedById = datasets.find(
            (d: any) => d.identifier === datasetId
        );
        const selected =
            selectedById &&
            unqueryableDatasetIds.indexOf(selectedById.identifier) === -1
                ? selectedById
                : datasets.find(
                      (d: any) =>
                          unqueryableDatasetIds.indexOf(d.identifier) === -1
                  );

        if (!selectedById) {
            return `Dataset with ID ${datasetId} not found in the search results.`;
        }

        if (!selected) {
            return "I could not find any remaining queryable dataset candidates from the current search results. Please refine the search query.";
        }

        context.keyContextData.selectedDataset = selected;
        context.keyContextData.datasetSchema = undefined;
        context.keyContextData.datasetSchemaReady = false;

        if (selected.identifier !== selectedById.identifier) {
            return `Dataset "${selectedById.title}" was previously found to be non-queryable, so I selected "${selected.title}" instead. You can now examine its contents.`;
        }

        return `Dataset "${selected.title}" selected. You can now examine its contents.`;
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
