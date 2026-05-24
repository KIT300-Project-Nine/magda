import { createChatEventMessageCompleteMsg } from "../Messaging";
import { ChainInput } from "../commons";
import type { WebLLMTool } from "../ChatWebLLM";

function pickCategoryKey(records: Record<string, any>[]): string | null {
    if (!records.length) {
        return null;
    }

    const keys = Object.keys(records[0]);
    const preferredKeys = ["species", "name", "category", "type", "label"];

    const preferred = preferredKeys.find((key) => keys.includes(key));
    if (preferred) {
        return preferred;
    }

    return (
        keys.find((key) =>
            records.some((row) => typeof row?.[key] === "string" && row[key])
        ) || null
    );
}

function buildDistributionChartConfig(records: Record<string, any>[]): string {
    const categoryKey = pickCategoryKey(records);
    if (!categoryKey) {
        throw new Error("Cannot determine a category column from query result");
    }

    const counts = new Map<string, number>();
    for (const row of records) {
        const rawValue = row?.[categoryKey];
        const category =
            rawValue === null ||
            typeof rawValue === "undefined" ||
            rawValue === ""
                ? "(Unknown)"
                : String(rawValue);
        counts.set(category, (counts.get(category) || 0) + 1);
    }

    const sortedEntries = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
    const labels = sortedEntries.map(([label]) => label);
    const values = sortedEntries.map(([, value]) => value);

    const config = {
        tooltip: { trigger: "axis" },
        legend: { show: true },
        xAxis: {
            type: "category",
            data: labels,
            axisLabel: {
                rotate: labels.length > 8 ? 25 : 0,
                interval: 0
            }
        },
        yAxis: {
            type: "value",
            name: "Count"
        },
        series: [
            {
                name: "Count",
                type: "bar",
                data: values
            }
        ]
    };

    return JSON.stringify(config);
}

const presentPreviousQueryResultAsChart: WebLLMTool = {
    name: "presentPreviousQueryResultAsChart",
    func: async function (this: ChainInput) {
        if (!this.keyContextData?.queryResult) {
            this.queue.push(
                createChatEventMessageCompleteMsg(
                    `Sorry. I attempted to generate visualization based on previous query result but can't locate any previous query result.`
                )
            );
            return "Failed to generate chart: no query result available";
        }
        const records = this.keyContextData.queryResult;
        if (!Array.isArray(records) || !records.length) {
            return "Failed to generate chart: query result is empty";
        }

        let configJsonStr = "";
        try {
            configJsonStr = buildDistributionChartConfig(records);
        } catch (e) {
            const errorMessage =
                e instanceof Error
                    ? e.message
                    : "Unknown chart generation error";
            return `Failed to generate chart: ${errorMessage}`;
        }

        this.queue.push(
            createChatEventMessageCompleteMsg(
                "```echarts\n" + configJsonStr + "\n```\n"
            )
        );
        this.keyContextData.chartRendered = true;
        return "Chart visualization has been generated and displayed successfully.";
    },
    description:
        "This tool can generate appropriate chart presentation based on the previous query result."
};

export async function createPresentPreviousQueryResultAsChartTool(
    input: ChainInput
): Promise<WebLLMTool | null> {
    if (input?.keyContextData?.queryResult) {
        return presentPreviousQueryResultAsChart;
    } else {
        return null;
    }
}

export default presentPreviousQueryResultAsChart;
