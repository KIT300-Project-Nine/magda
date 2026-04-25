import { createChatEventMessageCompleteMsg } from "../Messaging";
import { ChainInput } from "../commons";
import type { WebLLMTool } from "../ChatWebLLM";
import { runQuery } from "../../../libs/sqlUtils";

const executeSQLQuery: WebLLMTool = {
    name: "executeSQLQuery",
    func: async function (this: ChainInput, sqlQuery: string) {
        this.queue.push(
            createChatEventMessageCompleteMsg("Executing queries...")
        );
        const records = await runQuery<Record<string, any>[]>(sqlQuery);
        if (!records?.length) {
            this.queue.push(
                createChatEventMessageCompleteMsg(
                    "Sorry. After examining relevant data files, I didn't find any useful information related to your inquiry."
                )
            );
            return null;
        }
        const MAX_ROWS = 20;
        const MAX_SAMPLE_ROWS = 5;
        let resultRecords = records;
        let truncationNote = "";

        if (records.length > MAX_ROWS) {
            resultRecords = records.slice(0, MAX_ROWS);
            truncationNote = `\n\n*(Note: The query returned ${records.length} rows. Only the first ${MAX_ROWS} are shown here to prevent context window overflow. If you need a more specific summary, refine your SQL query with aggregates like COUNT, SUM, AVG, or a WHERE clause before answering the user.)*`;
        }

        this.keyContextData.queryResult = resultRecords;
        const columns = Object.keys(resultRecords[0]);
        const sampleRows = resultRecords.slice(0, MAX_SAMPLE_ROWS);
        return `SQL query executed successfully. Rows returned: ${
            records.length
        }. Columns: ${columns.join(", ")}. Sample rows: ${JSON.stringify(
            sampleRows
        )}${truncationNote}`;
    },
    description:
        "execute the supplied SQL query on the dataset. The table name MUST be wrapped in the source() function, e.g. SELECT * FROM source('your-distributionRef') limit 10",
    parameters: [
        {
            name: "sqlQuery",
            type: "string" as const,
            description: "the SQL query string to be executed"
        }
    ],
    requiredParameters: ["sqlQuery"]
};

export default executeSQLQuery;
