import { searchDatasets as searchDatasetsApi } from "api-clients/SearchApis";
import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { config } from "../../../config";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";

const MAX_DESC_DISPLAY_LENGTH = 250;
const { uiBaseUrl } = config;

// Neutral 404-style security message used to avoid revealing whether a dataset exists or is simply inaccessible to the current user.
const SAFE_RECORD_ACCESS_MESSAGE =
    "The requested record is not available or you may not have access.";

// Attempts to extract a dataset/record identifier from the user's query. Supports queries such as:"dataset abc123xyz" or "record id abc123xyz"
function extractDatasetId(question: string): string | null {
    const match = question.match(
        /(?:dataset|record)\s+(?:id\s+)?["']?([a-zA-Z0-9_-]+)["']?/i
    );

    return match ? match[1] : null;
}

// Checks whether the requested dataset record can be accessed through the Registry API. If the request fails or returns a non-success status, the chatbot will display a neutral safe-access message instead.
async function checkDatasetAccess(datasetId: string): Promise<boolean> {
    const encodedId = encodeURIComponent(encodeURIComponent(datasetId));

    const url =
        uiBaseUrl === "/"
            ? `/api/v0/registry/records/${encodedId}`
            : `${uiBaseUrl}/api/v0/registry/records/${encodedId}`;

    const response = await fetch(url);

    return response.ok;
}

// Main chatbot dataset retrieval flow. If a specific dataset ID is detected, the chatbot first verifies access through the Registry API before performing broader dataset search.
async function retrieveDatasets(question: string, limit: number = 5) {
    if (!question) {
        return SAFE_RECORD_ACCESS_MESSAGE;
    }

    const datasetId = extractDatasetId(question);

    if (datasetId) {
        try {
            const canAccessDataset = await checkDatasetAccess(datasetId);

            if (!canAccessDataset) {
                return SAFE_RECORD_ACCESS_MESSAGE;
            }
        } catch (e) {
            return SAFE_RECORD_ACCESS_MESSAGE;
        }
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
        return "The requested record is not available or you may not have access.";
    }

    // Show real results only if we have reasonably good matches
    const datasets = result.dataSets.map((item) => {
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
        return await retrieveDatasets(queryString);
    },
    description:
        "This tool can be used to search datasets relevant to the user's inquiry and present the dataset list to user as the answer. " +
        "If the user asks for a specific dataset or record ID, pass that exact ID phrase into queryString. " +
        "You must use this call when there is no better tool to use." +
        "You should generate one or more keywords or a sentence on the user inquiry and supply as the compulsory `queryString` parameter.",
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
