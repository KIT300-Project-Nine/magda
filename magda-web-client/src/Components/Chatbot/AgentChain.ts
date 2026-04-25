import { v4 as uuidv4 } from "uuid";
import { ChainInput, KeyContextData } from "./commons";
import { InitProgressCallback, InitProgressReport } from "@mlc-ai/web-llm";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";
import ChatWebLLM, { WebLLMInputs } from "./ChatWebLLM";
import AsyncQueue from "@ai-zen/async-queue";
import {
    CommonInputType,
    ChatEventMessage,
    createChatEventMessage,
    EVENT_TYPE_PARTIAL_MSG,
    EVENT_TYPE_PARTIAL_MSG_FINISH,
    EVENT_TYPE_ERROR,
    createChatEventMessageErrorMsg
} from "./Messaging";
import { History, Location } from "history";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import createTools from "./tools";
import {
    MAX_TOOL_STEPS,
    MAX_CONSECUTIVE_SAME_TOOL_CALLS,
    filterAvailableTools,
    serializeToolResult
} from "./orchestration";

class AgentChain {
    static agentChain: AgentChain | null = null;
    static llmLoadProgressCallbacks: InitProgressCallback[] = [];
    static create(
        appName: string,
        navLocation: Location,
        navHistory: History,
        dataset: ParsedDataset | undefined,
        distribution: ParsedDistribution | undefined,
        loadProgressCallback?: InitProgressCallback,
        errorHandler?: (e) => void
    ) {
        if (AgentChain.agentChain) {
            if (loadProgressCallback) {
                AgentChain.llmLoadProgressCallbacks.push(loadProgressCallback);
            }
            return AgentChain.agentChain;
        } else {
            if (loadProgressCallback) {
                AgentChain.llmLoadProgressCallbacks.push(loadProgressCallback);
            }
            AgentChain.agentChain = new AgentChain(
                appName,
                navLocation,
                navHistory,
                dataset,
                distribution,
                (report) => {
                    AgentChain.llmLoadProgressCallbacks.forEach((cb) =>
                        cb(report)
                    );
                }
            );
            AgentChain.agentChain.initialize(errorHandler);
            return AgentChain.agentChain;
        }
    }
    static removeLLMLoadProgressCallback(callback: InitProgressCallback) {
        const index = AgentChain.llmLoadProgressCallbacks.indexOf(callback);
        if (index !== -1) {
            AgentChain.llmLoadProgressCallbacks.splice(index, 1);
        }
    }

    public model: ChatWebLLM;
    public loadProgress?: InitProgressReport;
    private loadProgressCallback?: InitProgressCallback;
    public chatHistory: BaseMessage[] = [];
    public agentMessages: { role: string; content: string }[] = [];
    public navHistory: History;
    public navLocation: Location;
    public appName: string;
    public dataset: ParsedDataset | undefined;
    public distribution: ParsedDistribution | undefined;
    public keyContextData: KeyContextData = {
        queryResult: undefined,
        searchResults: undefined,
        selectedDataset: undefined,
        datasetSchema: undefined,
        datasetSchemaReady: false
    };
    public debug: boolean = false;
    public directModelAccess: boolean = false;
    public chain: Runnable<CommonInputType, string | null | undefined | void>;

    constructor(
        appName: string,
        navLocation: Location,
        navHistory: History,
        dataset: ParsedDataset | undefined,
        distribution: ParsedDistribution | undefined,
        loadProgressCallback?: InitProgressCallback
    ) {
        this.loadProgressCallback = loadProgressCallback;
        this.model = ChatWebLLM.createDefaultModel({
            loadProgressCallback: this.onProgress.bind(this)
        });
        this.appName = appName;
        this.navHistory = navHistory;
        this.navLocation = navLocation;
        this.dataset = dataset;
        this.distribution = distribution;
        this.chain = this.createChain();
        // for debug purpose;
        (window as any).chatBotAgentChain = this;
    }

    async updateModelConfig(
        modelConfig: Partial<WebLLMInputs>,
        errorHandler: (e) => void
    ) {
        this.onProgress({
            progress: 0,
            timeElapsed: 0,
            text: "Unloading model in order to apply new model config..."
        });
        this.model.getEngine().then((engine) => engine.unload());
        this.model = ChatWebLLM.createDefaultModel({
            ...modelConfig,
            loadProgressCallback: this.onProgress.bind(this)
        });
        await this.initialize(errorHandler);
    }

    async initialize(errorHandler?: (e) => void) {
        try {
            await this.model.initialize();
        } catch (e) {
            if (errorHandler) {
                errorHandler(e);
            } else {
                throw e;
            }
        }
    }

    enableDirectModelAccess(modelConfig: Partial<WebLLMInputs> = {}) {
        this.model = ChatWebLLM.createDefaultModel({
            ...modelConfig,
            loadProgressCallback: this.onProgress.bind(this)
        });
        this.directModelAccess = true;
    }

    setAppName(appName: string) {
        this.appName = appName;
    }

    setNavLocation(location: Location) {
        this.navLocation = location;
    }

    setNavHistory(history: History) {
        this.navHistory = history;
    }

    setDataset(dataset: ParsedDataset | undefined) {
        this.dataset = dataset;
    }

    setDistribution(distribution: ParsedDistribution | undefined) {
        this.distribution = distribution;
    }

    setLoadProgressCallback(loadProgressCallback?: InitProgressCallback) {
        this.loadProgressCallback = loadProgressCallback;
    }

    onProgress(progressReport: InitProgressReport) {
        this.loadProgress = progressReport;
        if (this.loadProgressCallback) {
            this.loadProgressCallback(progressReport);
        }
    }

    async stream(question: string): Promise<AsyncIterable<ChatEventMessage>> {
        this.agentMessages.push({
            role: "user",
            content: question
        });
        // Reset chart rendered flag for new query
        this.keyContextData.chartRendered = false;
        const queue = new AsyncQueue<ChatEventMessage>();
        const input: ChainInput = {
            question,
            queue,
            appName: this.appName,
            location: this.navLocation,
            history: this.navHistory,
            model: this.model,
            dataset: this.dataset,
            distribution: this.distribution,
            keyContextData: this.keyContextData
        };

        new Promise(async (resolve, reject) => {
            const msgId = uuidv4();
            let buffer = "";
            let partialMsgSent = false;

            const stream = await (this.directModelAccess
                ? this.model.stream(input.question)
                : this.chain.stream(input));

            for await (const chunk of stream) {
                if (chunk === null || typeof chunk === "undefined") {
                    continue;
                }
                partialMsgSent = true;
                const chunkText =
                    typeof chunk === "string" ? chunk : chunk.content;
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
                        id: msgId,
                        msg: chunkText
                    })
                );
                buffer += chunkText;
            }
            if (partialMsgSent) {
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
                        id: msgId
                    })
                );
            }
            queue.done();
            if (this.debug) {
                this.chatHistory.push(new AIMessage({ content: buffer }));
            }
            if (this.directModelAccess) {
                console.log(buffer);
            }
            resolve(buffer);
        }).catch((e) => {
            queue.push(createChatEventMessageErrorMsg(e as Error));
            queue.done();
        });
        return queue;
    }

    createChain() {
        return RunnableLambda.from(async (input: ChainInput) => {
            const { queue } = input;
            try {
                console.log("[Magda][chain] STEP START");
                const maxSteps = MAX_TOOL_STEPS;

                //start with initial question
                const currentMessages: any[] = [...this.agentMessages];
                let previousCallSignature = "";
                let repeatedCallCount = 0;

                for (let step = 0; step < maxSteps; step++) {
                    const tools = await createTools(input);
                    const availableTools = filterAvailableTools(tools, input);

                    console.log(
                        "TOOLS AVAILABLE:",
                        availableTools.map((t) => t.name)
                    );

                    if (!availableTools.length) {
                        throw new Error(
                            "No tools are available for the current execution state."
                        );
                    }

                    console.log("[Magda][chain] step:", step);
                    console.log(
                        "[Magda][chain] currentMessages:",
                        currentMessages
                    );

                    const result = await this.model.invokeTool(
                        currentMessages,
                        availableTools,
                        input
                    );

                    if (!result) return;

                    //We are done if it's a conversational response
                    if (result.name === "Conversational Response") {
                        const isDefaultAgentAvailable = availableTools.some(
                            (t) => t.name === "defaultAgent"
                        );

                        if (!isDefaultAgentAvailable) {
                            console.log(
                                "[Magda][chain] LLM produced text instead of using a required tool. Continuing chain."
                            );
                            currentMessages.push({
                                role: "assistant",
                                content: result.value
                            });
                            currentMessages.push({
                                role: "user",
                                content:
                                    "You must call the next tool to continue the workflow. Do not answer conversationally yet. Please use one of the available tools."
                            });
                            continue;
                        }

                        this.agentMessages.push({
                            role: "assistant",
                            content: result.value
                        });

                        this.agentMessages = this.agentMessages.slice(-10);

                        return result.value;
                    }

                    const currentCallSignature = `${
                        result.name
                    }:${JSON.stringify(result.args || {})}`;
                    if (currentCallSignature === previousCallSignature) {
                        repeatedCallCount += 1;
                        if (
                            repeatedCallCount >= MAX_CONSECUTIVE_SAME_TOOL_CALLS
                        ) {
                            throw new Error(
                                `The tool call loop is repeating ${result.name} with the same arguments.`
                            );
                        }
                    } else {
                        repeatedCallCount = 0;
                        previousCallSignature = currentCallSignature;
                    }

                    currentMessages.push({
                        role: "user",
                        content: `Tool ${
                            result.name
                        } returned: ${serializeToolResult(result.value)}`
                    });

                    console.log("[Magda][chain TOOL RESULT]:", result);

                    console.log("[Magda][chain TOOL USED]:", result.name);
                    console.log("[Magda][chain TOOL OUTPUT]:", result.value);

                    console.log("AGENT MESSAGES:", this.agentMessages);
                }

                return "Maximum steps reached without a final answer";
            } catch (e) {
                queue.push(createChatEventMessageErrorMsg(e as Error));
                return;
            }
        });
    }
}

export default AgentChain;
