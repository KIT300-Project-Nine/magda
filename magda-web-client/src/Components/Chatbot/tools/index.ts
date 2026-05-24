import { ChainInput } from "../commons";
import defaultAgent from "./defaultAgent";
import searchDatasets from "./searchDatasets";
import selectDataset from "./selectDataset";
import { createQueryDatasetTool } from "./queryDataset";
import type { WebLLMTool } from "../ChatWebLLM";
import { createPresentPreviousQueryResultAsChartTool } from "./presentPreviousQueryResultAsChart";
import executeSQLQuery from "./executeSQLQuery";

async function createTools(input: ChainInput): Promise<WebLLMTool[]> {
    const tools: (WebLLMTool | null)[] = [
        searchDatasets,
        defaultAgent,
        selectDataset
    ];
    const queryTool = await createQueryDatasetTool(input);
    if (queryTool) tools.push(queryTool);
    tools.push(executeSQLQuery);

    const chartTool = await createPresentPreviousQueryResultAsChartTool(input);
    if (chartTool) tools.push(chartTool);

    return tools.filter((item) => !!item) as WebLLMTool[];
}

export default createTools;
