import React, {
    FunctionComponent,
    useState,
    useRef,
    useCallback,
    useEffect
} from "react";
import { useSelector } from "react-redux";
import { StateType } from "../../reducers/reducer";
import AgentChain from "../Chatbot/AgentChain";
import { InitProgressReport } from "@mlc-ai/web-llm";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import { useLocation, useHistory } from "react-router-dom";
import { runQuery, distribution2ResourceItem } from "../../libs/sqlUtils";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import Input from "rsuite/Input";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import reportError from "helpers/reportError";
import "./TextToSQLPanel.scss";

function inferColumnType(value: any): string {
    if (value === null || value === undefined) return "unknown";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "object") {
        if (Array.isArray(value)) return "array";
        return "object";
    }
    if (typeof value === "string") {
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
        if (!isNaN(Number(value)) && value.trim() !== "") return "number";
        return "string";
    }
    return "string";
}

async function buildSchema(
    distributions: Array<{ idx: number; title: string }>
): Promise<string> {
    const lines: string[] = [];
    for (const dist of distributions) {
        try {
            const records = await runQuery(
                `SELECT * FROM source(${dist.idx}) limit 5`
            );
            if (!records?.length) {
                lines.push(
                    `source(${dist.idx}) - "${dist.title}": (no data available)`
                );
                continue;
            }
            const cols = Object.keys(records[0]).map((col) => {
                for (const row of records) {
                    const val = row[col];
                    if (val !== null && val !== undefined && val !== "") {
                        return `${col} (${inferColumnType(val)})`;
                    }
                }
                return `${col} (unknown)`;
            });
            lines.push(
                `source(${dist.idx}) - "${dist.title}": columns [${cols.join(
                    ", "
                )}]`
            );
        } catch (e) {
            lines.push(
                `source(${dist.idx}) - "${dist.title}": (schema unavailable)`
            );
        }
    }
    return lines.length ? lines.join("\n") : "source(0) - default data source";
}

interface Props {
    appName: string;
    onSQLGenerated: (sql: string) => void;
}

const TextToSQLPanel: FunctionComponent<Props> = ({
    appName,
    onSQLGenerated
}) => {
    const [nlQuery, setNlQuery] = useState("");
    const [isTranslating, setIsTranslating] = useState(false);
    const [modelReady, setModelReady] = useState(false);
    const [loadProgress, setLoadProgress] = useState<InitProgressReport | null>(
        null
    );
    const agentChainRef = useRef<AgentChain | null>(null);
    const location = useLocation();
    const history = useHistory();

    const dataset = useSelector<StateType, ParsedDataset | undefined>(
        (state) => state.record.dataset
    );
    const distribution = useSelector<StateType, ParsedDistribution | undefined>(
        (state) => state.record.distribution
    );

    useEffect(() => {
        const chain = AgentChain.create(
            appName,
            location,
            history,
            dataset,
            distribution,
            (report) => {
                setLoadProgress(report);
                if (report.progress >= 1) {
                    setModelReady(true);
                }
            },
            (e) =>
                reportError(`Failed to load LLM model: ${e}`, {
                    duration: 10000
                })
        );
        agentChainRef.current = chain;
        if (chain.loadProgress && chain.loadProgress.progress >= 1) {
            setModelReady(true);
        }
        return () => {
            agentChainRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTranslate = useCallback(async () => {
        const query = nlQuery.trim();
        if (!query || !agentChainRef.current?.model) return;

        setIsTranslating(true);
        try {
            const distributions = distribution?.identifier
                ? [
                      {
                          idx: 0,
                          title: distribution.title || "Distribution"
                      }
                  ]
                : dataset?.distributions?.length
                ? dataset.distributions
                      .filter((d) => !!distribution2ResourceItem(d))
                      .map((d, idx) => ({
                          idx,
                          title: d.title || `File ${idx}`
                      }))
                : [];

            const schema = await buildSchema(distributions);

            const systemText =
                `You are an expert SQL analyst. Your only task is to translate the user's question into a SQL query.\n` +
                `Data sources available via source(N) (0-indexed):\n${schema}\n\n` +
                `Rules:\n` +
                `- Output ONLY the raw SQL query, no explanation, no markdown, no code fences, no thinking tags\n` +
                `- Do NOT wrap your response in <think> tags or any XML tags\n` +
                `- Use source(N) to reference the Nth data source\n` +
                `- Use standard SQL syntax compatible with AlaSQL: use LIMIT instead of TOP, no schema prefixes\n` +
                `- Column types are shown in parentheses. Use appropriate comparisons for each type\n` +
                `- Limit to 25 rows unless the user specifies otherwise\n` +
                `/no_think`;

            const response = await agentChainRef.current.model.invoke([
                new SystemMessage(systemText),
                new HumanMessage(query)
            ]);

            let sql =
                typeof response.content === "string"
                    ? response.content
                    : Array.isArray(response.content)
                    ? response.content
                          .map((part) => (typeof part === "string" ? part : ""))
                          .join("")
                    : "";

            sql = sql.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
            sql = sql.replace(/```(?:sql)?\s*([\s\S]*?)```/g, "$1").trim();

            onSQLGenerated(sql);
        } catch (e) {
            reportError(`Translation failed: ${e}`, { duration: 5000 });
        } finally {
            setIsTranslating(false);
        }
    }, [nlQuery, dataset, distribution, onSQLGenerated]);

    const isModelLoading =
        !modelReady && (loadProgress === null || loadProgress.progress < 1);

    return (
        <div className="magda-text-to-sql-panel">
            {isModelLoading && (
                <Loader
                    backdrop
                    content={loadProgress?.text || "Loading LLM model..."}
                    vertical
                />
            )}
            {isTranslating && (
                <Loader backdrop content="Translating to SQL..." vertical />
            )}
            <div className="nl-input-row">
                <Input
                    as="textarea"
                    rows={2}
                    placeholder="Ask a question in plain English, e.g. 'Show the top 10 rows sorted by population'"
                    value={nlQuery}
                    onChange={(val) => setNlQuery(val)}
                    className="nl-query-input"
                />
                <Button
                    appearance="primary"
                    onClick={handleTranslate}
                    disabled={
                        isModelLoading || isTranslating || !nlQuery.trim()
                    }
                    className="translate-button"
                >
                    Translate to SQL
                </Button>
            </div>
        </div>
    );
};

export default TextToSQLPanel;
