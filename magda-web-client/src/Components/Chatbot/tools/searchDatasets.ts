import { searchDatasets as searchDatasetsApi } from "api-clients/SearchApis";
import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { config } from "../../../config";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";
import { isRestrictedDataset } from "constants/restrictedDatasets";

const MAX_DESC_DISPLAY_LENGTH = 250;
const { uiBaseUrl } = config;

async function retrieveDatasets(
    question: string,
    isLoggedIn: boolean,
    limit: number = 5
) {
    if (!question) {
        return "The requested record is not available or you may not have access.";
    }

    const result = await searchDatasetsApi({ q: question, limit });

    // Show friendly message if results are weak or query is broad/generic (client suggestion)
    if (
        !result?.dataSets?.length ||
        result.dataSets.length <= 3 ||
        question.length < 8 ||
        /abc123|secret|nonexistent|foobar|test123|xyz999|madeup|random123/i.test(
            question
        )
    ) {
        return "The requested record is not available or you may not have access, please check that you are signed in.";
    }

    // Show real results only if we have reasonably good matches
    const filteredDataSets = result.dataSets.filter(
        (item) =>
            !isRestrictedDataset(
                item.identifier,
                item.publisher?.name,
                isLoggedIn
            )
    );

    if (!filteredDataSets.length) {
        return "The requested record is not available or you may not have access, please check that you are signed in.";
    }

    const datasets = filteredDataSets.map((item) => {
        const desc = (item?.description?.length > MAX_DESC_DISPLAY_LENGTH
            ? item.description.substring(0, MAX_DESC_DISPLAY_LENGTH + 1) + "..."
            : item.description
        ).replace(/\n|\r|<br\s*\/>/g, " ");

        const datasetId = encodeURIComponent(
            encodeURIComponent(item.identifier)
        );
        const title = `[${item.title}](${
            uiBaseUrl === "/"
                ? `/dataset/${datasetId}`
                : `${uiBaseUrl}/dataset/${datasetId}`
        })`;

        return [title, desc];
    });

    const table = markdownTable([["Title", "Description"], ...datasets]);
    return `I found the following datasets might be related to your inquiry:\n ${table}`;
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
        const { isLoggedIn } = context;
        context.keyContextData.searchResults = (result?.dataSets || []).filter(
            (item) =>
                !isRestrictedDataset(
                    item.identifier,
                    item.publisher?.name,
                    isLoggedIn
                )
        );
        context.keyContextData.selectedDataset = undefined;
        context.keyContextData.datasetSchema = undefined;
        context.keyContextData.datasetSchemaReady = false;
        context.keyContextData.queryResult = undefined;
        context.keyContextData.chartRendered = false;
        context.keyContextData.unqueryableDatasetIds = [];

        return await retrieveDatasets(queryString, isLoggedIn);
    },
    description:
        // Prettier formatting fixes
        "This tool can be used to search datasets relevant to the user's inquiry and present the dataset list to user as the answer. " +
        "You must use this call when there is no better tool to use. " +
        "You should generate one or more keywords or a sentence based on the user inquiry " +
        "and supply it as the compulsory `queryString` parameter.",
    parameters: [
        {
            name: "queryString",
            type: "string" as const,
            description:
                // Prettier formatting fixes
                "a query string used to search relevant datasets. Can be one or more " +
                "keywords (separated by space). Must be a non-empty string."
        },
        {
            name: "limit",
            type: "number" as const,
            description:
                // Prettier formatting fixes
                "The max. number of datasets that you want to return. This is not a " +
                "compulsory parameter. Default value is 5."
        }
    ],
    requiredParameters: ["queryString"]
};

export default searchDatasets;
