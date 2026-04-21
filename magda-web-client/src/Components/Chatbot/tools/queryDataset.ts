import {
    createChatEventMessageCompleteMsg
    //createChatEventMessageErrorMsg
} from "../Messaging";
import { ChainInput } from "../commons";
import { runQuery } from "../../../libs/sqlUtils";
import { WebLLMTool } from "../ChatWebLLM";
//import { createQueryDataFilesWithSQLQueryTool } from "./queryDataFilesWithSQLQuery";
import toYaml from "libs/toYaml";

const SUPPORT_FORMATS = ["CSV-GEO-AU", "CSV"];

export async function getDistColumnNames(
    distIdx: number
): Promise<string[] | null> {
    const records = await runQuery(`SELECT * FROM source(${distIdx}) limit 1`);
    if (!records?.length) {
        return null;
    }
    const data = records[0];
    return Object.keys(data);
}

export async function createQueryDatasetTool(
    input: ChainInput
): Promise<WebLLMTool | null> {
    const { dataset, distribution } = input;
    const distributions = distribution?.identifier
        ? [distribution]
        : dataset?.distributions?.length
        ? dataset.distributions
        : [];
    if (!distributions?.length) {
        return null;
    }
    const dists = distributions
        .map((dist, idx) => ({
            idx: idx,
            dist
        }))
        .filter(
            (item) =>
                SUPPORT_FORMATS.indexOf(
                    item.dist?.format?.trim().toUpperCase()
                ) !== -1
        );
    if (!dists.length) {
        return null;
    }
    const distTitleList = dists
        .map((item) => `- ${item.dist.title}`)
        .join("\n");
    async function queryDataset(this: ChainInput) {
        if (!this.dataset) {
            return "No dataset is currently selected. Please choose a dataset first before querying it.";
        }

        this.queue.push(
            createChatEventMessageCompleteMsg(
                "Some data files included in this dataset might help to answer your inquiries. " +
                    "Analysing data files structure. " +
                    "Please wait... "
            )
        );

        const fileSchemas: string[] = [];

        for (const item of dists) {
            const columns = await getDistColumnNames(item.idx);
            if (columns) {
                fileSchemas.push(
                    toYaml({
                        fileIndex: item.idx,
                        title: item.dist.title,
                        columns: columns
                    })
                );
            }
        }

        return `I found the following files and columns in this dataset:\n\n${fileSchemas.join(
            "\n---\n"
        )}\n\nYou can now use the executeSQLQuery tool to query these files using source(fileIndex).`;
    }
    return {
        // note: this tool doesn't take the actual SQL query. We mainly need to fetch column information in this tool.
        name: "queryDataset",
        func: queryDataset,
        description:
            "This tool can work out the answer by querying a list of available data files based on the user's question. " +
            "You should use this tool if any of the following data files appears relevant to the user's question: \n" +
            distTitleList
    };
}
