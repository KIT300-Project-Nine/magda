import type { ChainInput } from "./commons";
import type { WebLLMTool } from "./ChatWebLLM";

export const MAX_TOOL_STEPS = 8;
export const MAX_CONSECUTIVE_SAME_TOOL_CALLS = 2;

export function serializeToolResult(value: any): string {
    if (typeof value === "undefined") {
        return "undefined";
    }
    try {
        return JSON.stringify(value);
    } catch (_e) {
        return String(value);
    }
}

export function filterAvailableTools(
    tools: WebLLMTool[],
    input: ChainInput
): WebLLMTool[] {
    const hasSearchResults = !!input.keyContextData?.searchResults?.length;
    const hasSelectedDataset = !!input.keyContextData?.selectedDataset;
    const canQueryDataset =
        hasSelectedDataset || !!input.dataset || !!input.distribution;
    const canExecuteSQL = !!input.keyContextData?.datasetSchemaReady;

    return tools.filter((tool) => {
        if (tool.name === "selectDataset") {
            return hasSearchResults;
        }
        if (tool.name === "queryDataset") {
            return canQueryDataset;
        }
        if (tool.name === "executeSQLQuery") {
            return canExecuteSQL;
        }
        return true;
    });
}
