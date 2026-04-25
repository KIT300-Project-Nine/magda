import { searchDatasets as searchDatasetsApi } from "api-clients/SearchApis";
import { createChatEventMessageCompleteMsg } from "../Messaging";
import { config } from "../../../config";
import { ChainInput } from "../commons";
import type { WebLLMTool } from "../ChatWebLLM";

const MAX_DESC_DISPLAY_LENGTH = 120;
const MAX_DATASET_LIST_ITEMS = 6;
const { uiBaseUrl } = config;

async function retrieveDatasets(question: string, limit: number = 5) {
    const notFound =
        "Sorry, I didn't find any datasets related to your inquiry.";
    if (!question) {
        return notFound;
    }
    const result = await searchDatasetsApi({ q: question, limit });
    if (!result?.dataSets?.length) {
        return notFound;
    }
    const datasets = result.dataSets
        .slice(0, MAX_DATASET_LIST_ITEMS)
        .map((item) => {
            const desc = (item?.description?.length > MAX_DESC_DISPLAY_LENGTH
                ? item.description.substring(0, MAX_DESC_DISPLAY_LENGTH + 1) +
                  "..."
                : item.description
            ).replace(/\n|\r|<br\s*\/>/g, " ");
            const datasetId = encodeURIComponent(
                encodeURIComponent(item.identifier)
            );
            const title = `[${item.title}](${
                uiBaseUrl === "/"
                    ? `/dataset/${datasetId}`
                    : `${uiBaseUrl}/dataset/${datasetId}`
            }) (ID: ${item.identifier})`;
            return `- ${title}${desc ? `: ${desc}` : ""}`;
        });

    return `I found the following datasets that might be related to your inquiry:\n${datasets.join(
        "\n"
    )}`;
}

const searchDatasets: WebLLMTool = {
    name: "searchDatasets",
    func: async function (queryString: string) {
        const context = (this as unknown) as ChainInput;
        const { queue } = context;
        queue.push(createChatEventMessageCompleteMsg("Searching datasets..."));

        // call search API
        const result = await searchDatasetsApi({ q: queryString });

        // store datasets for future tools
        context.keyContextData.searchResults = result?.dataSets || [];
        context.keyContextData.selectedDataset = undefined;
        context.keyContextData.datasetSchema = undefined;
        context.keyContextData.datasetSchemaReady = false;
        context.keyContextData.queryResult = undefined;
        context.keyContextData.chartRendered = false;
        context.keyContextData.unqueryableDatasetIds = [];

        return await retrieveDatasets(queryString);
    },
    description:
        "This tool can be used to search datasets relevant to the user's inquiry and present the dataset list to user as the answer. You must use this call when there is no better tool to use." +
        "You should generate one or more keywords or a sentence on the user inquiry and supply as the compulsory `queryString` parameter." +
        "If a dataset looks relevant, you should use its ID with the 'queryDataset' tool to explore its files",
    parameters: [
        {
            name: "queryString",
            type: "string" as const,
            description:
                "a query string used to search relevant datasets. Can be one or more keywords (separated by space). Must be a non-empty string."
        },
        {
            name: "limit",
            type: "number" as const,
            description:
                "The max. number of datasets that you want to return. This is not a compulsory parameter. Default value is 5."
        }
    ],
    requiredParameters: ["queryString"]
};

export default searchDatasets;
