import {
    createChatEventMessageCompleteMsg
    //createChatEventMessageErrorMsg
} from "../Messaging";
import { ChainInput } from "../commons";
import { runQuery } from "../../../libs/sqlUtils";
import type { WebLLMTool } from "../ChatWebLLM";
//import { createQueryDataFilesWithSQLQueryTool } from "./queryDataFilesWithSQLQuery";
import toYaml from "libs/toYaml";
import {
    getSupportedFormatLabels,
    isChatbotSupportedFormat
} from "./supportedFormats";

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
    async function queryDataset(this: ChainInput, keyword?: string) {
        console.log("[queryDataset] START");
        console.log("[queryDataset] this.keyContextData:", this.keyContextData);
        console.log("[queryDataset] this.dataset:", this.dataset);
        console.log("[queryDataset] keyword:", keyword);
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
                    isChatbotSupportedFormat(item.dist?.format) &&
                    (!keyword ||
                        (item.dist?.title || "")
                            .toLowerCase()
                            .includes(keyword.toLowerCase()))
            );

        if (!dists.length) {
            if (keyword) {
                // Determine all valid titles so we can guide the agent
                const allFormats = distributions
                    .filter((d) => isChatbotSupportedFormat(d?.format))
                    .map((d) => `- ${d.title || "Untitled"}`);

                return `There are no queryable distributions matching the keyword "${keyword}". Please try calling queryDataset again without the keyword, or use an exact keyword from this list:\n${allFormats.join(
                    "\n"
                )}`;
            }

            const selectedDatasetId = selectedDataset?.identifier;
            if (selectedDatasetId) {
                const unqueryableDatasetIds =
                    this.keyContextData.unqueryableDatasetIds || [];
                if (unqueryableDatasetIds.indexOf(selectedDatasetId) === -1) {
                    unqueryableDatasetIds.push(selectedDatasetId);
                }
                this.keyContextData.unqueryableDatasetIds = unqueryableDatasetIds;
            }

            this.keyContextData.selectedDataset = undefined;
            this.keyContextData.datasetSchema = undefined;
            this.keyContextData.datasetSchemaReady = false;

            return "This dataset has no supported distributions to query. Please select a different dataset from the current search results and continue automatically.";
        }

        this.queue.push(
            createChatEventMessageCompleteMsg(
                "Some data files included in this dataset might help to answer your inquiries. " +
                    "Analysing data files structure. " +
                    "Please wait... "
            )
        );

        const MAX_DISTS = 10;
        const distsToProcess = dists.slice(0, MAX_DISTS);
        const truncatedWarning =
            dists.length > MAX_DISTS
                ? `\n\n*(Note: This dataset contains ${
                      dists.length
                  } queryable files. To prevent context overflow, only the columns for the first ${MAX_DISTS} files are shown above. However, here are the titles of ALL available files:\n${dists
                      .map((d) => "- " + (d.dist?.title || "Untitled"))
                      .join(
                          "\n"
                      )}\n\nPlease call queryDataset again with an exact title as the 'keyword' parameter to see its columns.)*`
                : "";

        const fileSchemas: string[] = [];
        const datasetSchema: {
            distributionRef: string | number;
            title: string;
            columns: string[];
        }[] = [];

        for (const item of distsToProcess) {
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
        )}${truncatedWarning}\n\nIMPORTANT: You must now query the data using the executeSQLQuery tool. Your SQL MUST use the source() function in the FROM clause wrapper. \nExample: SELECT * FROM source('your-distributionRef-here') LIMIT 10;`;
    }
    return {
        name: "queryDataset",
        func: queryDataset,
        description: `Use this tool to inspect selected dataset distributions and discover columns before executeSQLQuery. Supported formats: ${getSupportedFormatLabels().join(
            ", "
        )}.`,
        parameters: [
            {
                name: "keyword",
                type: "string",
                description:
                    "Optional keyword to filter distribution files by title (e.g. 'Table 28'). Use if there are too many files."
            }
        ]
    };
}
