import type { ChainInput } from "./commons";
import type { WebLLMTool } from "./ChatWebLLM";

export const MAX_TOOL_STEPS = 80;
export const MAX_CONSECUTIVE_SAME_TOOL_CALLS = 2;
const MAX_SERIALIZED_TOOL_RESULT_CHARS = 1800;

export function serializeToolResult(value: any): string {
    let result = "";
    if (typeof value === "undefined") {
        result = "undefined";
    } else if (typeof value === "string") {
        result = value;
    } else {
        try {
            result = JSON.stringify(value);
        } catch (_e) {
            result = String(value);
        }
    }

    if (result.length <= MAX_SERIALIZED_TOOL_RESULT_CHARS) {
        return result;
    }

    return `${result.slice(
        0,
        MAX_SERIALIZED_TOOL_RESULT_CHARS
    )}\n...[tool output truncated: ${result.length} chars total]`;
}

export function filterAvailableTools(
    tools: WebLLMTool[],
    input: ChainInput
): WebLLMTool[] {
    const hasSearchResults = !!input.keyContextData?.searchResults?.length;
    const hasSelectedDataset = !!input.keyContextData?.selectedDataset;
    const hasDistributionContext =
        !!input.distribution?.identifier ||
        !!input.dataset?.distributions?.length;
    const hasQueryResult = !!input.keyContextData?.queryResult?.length;
    const canQueryDataset = hasSelectedDataset || hasDistributionContext;
    const canExecuteSQL = !!input.keyContextData?.datasetSchemaReady;
    const chartRendered = !!input.keyContextData?.chartRendered;
    const shouldForceWorkflowProgress =
        (hasSelectedDataset || (hasDistributionContext && !hasSearchResults)) &&
        !hasQueryResult &&
        !chartRendered;

    return tools.filter((tool) => {
        if (tool.name === "defaultAgent" && shouldForceWorkflowProgress) {
            return false;
        }
        if (tool.name === "selectDataset") {
            return hasSearchResults;
        }
        if (tool.name === "queryDataset") {
            return canQueryDataset;
        }
        if (tool.name === "executeSQLQuery") {
            return canExecuteSQL;
        }
        if (tool.name === "renderGeospatialMap") {
            return hasQueryResult;
        }
        return true;
    });
}
