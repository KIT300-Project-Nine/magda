import { ChainInput, getLocationType } from "../commons";
import defaultAgent from "./defaultAgent";
import searchDatasets from "./searchDatasets";
import selectDataset from "./selectDataset";
import { createQueryDatasetTool } from "./queryDataset";
import { WebLLMTool } from "../ChatWebLLM";
import { createPresentPreviousQueryResultAsChartTool } from "./presentPreviousQueryResultAsChart";

async function createTools(input: ChainInput): Promise<WebLLMTool[]> {
    const type = getLocationType(input.location);

    const tools: (WebLLMTool | null)[] = [
        searchDatasets,
        defaultAgent,
        selectDataset
    ];

    if (
        type === "DATASET_PAGE" ||
        type === "DISTRIBUTION_PAGE" ||
        input.dataset
    ) {
        const queryTool = await createQueryDatasetTool(input);
        if (queryTool) tools.push(queryTool);

        const chartTool = await createPresentPreviousQueryResultAsChartTool(
            input
        );

        if (chartTool) tools.push(chartTool);
    }

    return tools.filter((item) => !!item) as WebLLMTool[];
}

export default createTools;
