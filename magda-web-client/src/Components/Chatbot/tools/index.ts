import { ChainInput, getLocationType } from "../commons";
import defaultAgent from "./defaultAgent";
import searchDatasets from "./searchDatasets";
import { createQueryDatasetTool } from "./queryDataset";
import { WebLLMTool } from "../ChatWebLLM";
import { createPresentPreviousQueryResultAsChartTool } from "./presentPreviousQueryResultAsChart";

async function createTools(input: ChainInput): Promise<WebLLMTool[]> {
    const type = getLocationType(input.location);

    const tools: (WebLLMTool | null)[] = [searchDatasets, defaultAgent];

    if (
        type === "DATASET_PAGE" ||
        type === "DISTRIBUTION_PAGE" ||
        input.dataset
    ) {
        tools.push(await createQueryDatasetTool(input));
        tools.push(await createPresentPreviousQueryResultAsChartTool(input));
    }

    return tools.filter((item) => !!item) as WebLLMTool[];
}

export default createTools;
