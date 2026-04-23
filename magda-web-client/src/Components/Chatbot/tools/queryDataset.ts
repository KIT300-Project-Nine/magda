import {
    createChatEventMessageCompleteMsg
    //createChatEventMessageErrorMsg
} from "../Messaging";
import { ChainInput } from "../commons";
import { runQuery } from "../../../libs/sqlUtils";
import type { WebLLMTool } from "../ChatWebLLM";
//import { createQueryDataFilesWithSQLQueryTool } from "./queryDataFilesWithSQLQuery";
import toYaml from "libs/toYaml";

const SUPPORT_FORMATS = ["CSV-GEO-AU", "CSV"];

export async function getDistColumnNames(
    distRef: string | number
): Promise<string[] | null> {
    const refLiteral =
        typeof distRef === "number"
            ? `${distRef}`
            : `'${String(distRef).replace(/'/g, "''")}'`;
    const records = await runQuery(
        `SELECT * FROM source(${refLiteral}) limit 1`
    );
    if (!records?.length) {
        return null;
    }
    const data = records[0];
    return Object.keys(data);
}

export async function createQueryDatasetTool(
    input: ChainInput
): Promise<WebLLMTool | null> {
    async function queryDataset(this: ChainInput) {
        console.log("[queryDataset] START");
        console.log("[queryDataset] this.keyContextData:", this.keyContextData);
        console.log("[queryDataset] this.dataset:", this.dataset);
        const selectedDataset = this.keyContextData?.selectedDataset;
        const targetDataset = selectedDataset || this.dataset;

        const distributions = this.distribution?.identifier
            ? [this.distribution]
            : targetDataset?.distributions?.length
            ? targetDataset.distributions
            : [];

        if (!distributions.length) {
            return "No dataset is currently selected. Please choose a dataset first before querying it.";
        }

        const dists = distributions
            .map((dist, idx) => {
                const ref = dist?.identifier?.trim()?.length
                    ? dist.identifier
                    : idx;
                return {
                    ref,
                    dist
                };
            })
            .filter(
                (item) =>
                    SUPPORT_FORMATS.indexOf(
                        item.dist?.format?.trim().toUpperCase()
                    ) !== -1
            );

        if (!dists.length) {
            return "This dataset has no supported CSV distributions to query.";
        }

        this.queue.push(
            createChatEventMessageCompleteMsg(
                "Some data files included in this dataset might help to answer your inquiries. " +
                    "Analysing data files structure. " +
                    "Please wait... "
            )
        );

        const fileSchemas: string[] = [];
        const datasetSchema: {
            distributionRef: string | number;
            title: string;
            columns: string[];
        }[] = [];

        for (const item of dists) {
            const columns = await getDistColumnNames(item.ref);
            const resolvedColumns = columns || [];
            datasetSchema.push({
                distributionRef: item.ref,
                title: item.dist.title,
                columns: resolvedColumns
            });
            fileSchemas.push(
                toYaml({
                    distributionRef: item.ref,
                    title: item.dist.title,
                    columns: resolvedColumns
                })
            );
        }

        this.keyContextData.datasetSchema = datasetSchema;
        this.keyContextData.datasetSchemaReady = datasetSchema.length > 0;

        if (!datasetSchema.length) {
            return "I could not inspect any supported distributions from the selected dataset.";
        }

        return `I found the following files and columns in this dataset:\n\n${fileSchemas.join(
            "\n---\n"
        )}\n\nYou can now use the executeSQLQuery tool with source(distributionRef).`;
    }
    return {
        name: "queryDataset",
        func: queryDataset,
        description:
            "Use this tool to inspect selected dataset distributions and discover columns before executeSQLQuery."
    };
}
