import { indexEmbeddingText } from "../indexEmbeddingText.js";
import { BaseSemanticIndexerTest } from "./BaseSemanticIndexerTest.js";
import sinon from "sinon";
import { expect } from "chai";

describe("indexEmbeddingText", () => {
    let testEnv: BaseSemanticIndexerTest;

    beforeEach(() => {
        testEnv = new BaseSemanticIndexerTest();
    });

    afterEach(() => {
        testEnv.cleanup();
    });

    it("should chunk, embed and index user text", async () => {
        const embeddingTextResult = { text: "main text" };
        testEnv.chunker.chunk.returns([
            { text: "a", length: 1, position: 0, overlap: 0 }
        ]);
        testEnv.embeddingApiClient.get.resolves([[0.1, 0.2, 0.3]]);

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id1",
                fileFormat: "csv"
            }
        });

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        const expectedDoc = {
            itemType: config.itemType,
            recordId: "id1",
            fileFormat: "csv",
            index_text_chunk: "a",
            embedding: [0.1, 0.2, 0.3],
            only_one_index_text_chunk: true,
            index_text_chunk_length: 1,
            index_text_chunk_position: 0,
            index_text_chunk_overlap: 0,
            indexerId: testEnv.userConfig.id,
            createTime: testEnv.getCurrentTimeString(),
            updateTime: testEnv.getCurrentTimeString()
        };

        testEnv.expectIndexedDoc(expectedDoc);
    });

    it("should correctly handle multiple chunks with overlap and index multiple chunks", async () => {
        const embeddingTextResult = {
            text: "long text that needs multiple chunks"
        };
        testEnv.chunker.chunk.returns([
            { text: "long text", length: 9, position: 0, overlap: 2 },
            { text: "text that", length: 9, position: 7, overlap: 2 },
            { text: "that needs", length: 10, position: 14, overlap: 2 }
        ]);
        testEnv.embeddingApiClient.get.resolves([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ]);

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["txt"]
        });
        config.argv.semanticIndexerConfig.bulkIndexSize = 3;
        config.argv.semanticIndexerConfig.bulkEmbeddingsSize = 3;

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id2",
                fileFormat: "txt"
            }
        });

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        const expectedDocs = [
            {
                itemType: config.itemType,
                recordId: "id2",
                fileFormat: "txt",
                index_text_chunk: "long text",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: false,
                index_text_chunk_length: 9,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 2,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            },
            {
                itemType: config.itemType,
                recordId: "id2",
                fileFormat: "txt",
                index_text_chunk: "text that",
                embedding: [0.4, 0.5, 0.6],
                only_one_index_text_chunk: false,
                index_text_chunk_length: 9,
                index_text_chunk_position: 7,
                index_text_chunk_overlap: 2,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            },
            {
                itemType: config.itemType,
                recordId: "id2",
                fileFormat: "txt",
                index_text_chunk: "that needs",
                embedding: [0.7, 0.8, 0.9],
                only_one_index_text_chunk: false,
                index_text_chunk_length: 10,
                index_text_chunk_position: 14,
                index_text_chunk_overlap: 2,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectIndexedDocs(expectedDocs);
    });

    it("should handle text and subObjects and index into opensearch", async () => {
        testEnv.chunker.chunk
            .withArgs("main text")
            .returns([
                { text: "main text", length: 9, position: 0, overlap: 0 }
            ]);
        testEnv.chunker.chunk
            .withArgs("table1")
            .returns([{ text: "table1", length: 6, position: 0, overlap: 0 }]);
        testEnv.chunker.chunk
            .withArgs("table2")
            .returns([{ text: "table2", length: 6, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get.resolves([[0.1, 0.2, 0.3]]);

        const embeddingTextResult = {
            text: "main text",
            subObjects: [
                { subObjectId: "1", subObjectType: "table", text: "table1" },
                { subObjectId: "2", subObjectType: "table", text: "table2" }
            ]
        };

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id4",
                fileFormat: "csv"
            }
        });

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 3,
            embeddingApiCallCount: 3,
            bulkIndexCallCount: 3,
            deleteByQueryCallCount: 1
        });

        const expectedDocs = [
            {
                itemType: config.itemType,
                recordId: "id4",
                fileFormat: "csv",
                index_text_chunk: "main text",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 9,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        const expectedSubObjectDocs1 = [
            {
                itemType: config.itemType,
                recordId: "id4",
                fileFormat: "csv",
                subObjectId: "1",
                subObjectType: "table",
                index_text_chunk: "table1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 6,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        const expectedSubObjectDocs2 = [
            {
                itemType: config.itemType,
                recordId: "id4",
                fileFormat: "csv",
                subObjectId: "2",
                subObjectType: "table",
                index_text_chunk: "table2",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 6,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectIndexedDocs(expectedDocs, 0);
        testEnv.expectIndexedDocs(expectedSubObjectDocs1, 1);
        testEnv.expectIndexedDocs(expectedSubObjectDocs2, 2);
    });

    it("should default bulk index size to embedding batch size", async () => {
        const embeddingTextResult = {
            text: "long text that needs multiple chunks"
        };
        testEnv.chunker.chunk.returns([
            { text: "long text", length: 9, position: 0, overlap: 2 },
            { text: "text that", length: 9, position: 7, overlap: 2 },
            { text: "that needs", length: 10, position: 14, overlap: 2 }
        ]);
        testEnv.embeddingApiClient.get.resolves([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ]);

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["txt"]
        });
        config.argv.semanticIndexerConfig.bulkEmbeddingsSize = 2;
        config.argv.semanticIndexerConfig.bulkIndexSize = 0 as any;

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id5",
                fileFormat: "txt"
            }
        });

        testEnv.expectSuccessCalls({
            chunkCallCount: 1,
            embeddingApiCallCount: 2,
            bulkIndexCallCount: 2,
            deleteByQueryCallCount: 1
        });
    });

    it("should issue only one delete-by-query for many subObjects", async () => {
        const chunker = {
            chunk: sinon.stub().callsFake(async (text: string) => [
                { text, length: text.length, position: 0, overlap: 0 }
            ])
        };
        const embeddingApiClient = {
            get: sinon
                .stub()
                .callsFake(async (texts: string[]) =>
                    texts.map((_, i) => [i + 0.1, i + 0.2, i + 0.3])
                )
        };
        const opensearchApiClient = {
            bulkIndexDocument: sinon.stub().resolves(),
            deleteByQuery: sinon.stub().resolves({
                body: {
                    version_conflicts: 0,
                    timed_out: false
                }
            })
        };

        const subObjects = Array.from({ length: 10 }, (_, i) => ({
            subObjectId: `sub-${i}`,
            subObjectType: "table",
            text: `table-${i}`
        }));

        await indexEmbeddingText({
            options: {
                id: "perf-test-indexer",
                itemType: "storageObject",
                timeout: "3m",
                argv: {
                    semanticIndexerConfig: {
                        bulkEmbeddingsSize: 20,
                        bulkIndexSize: 20,
                        fullIndexName: "semantic-index-v1"
                    }
                }
            } as any,
            embeddingText: {
                text: "main-text",
                subObjects
            } as any,
            chunker: chunker as any,
            embeddingApiClient: embeddingApiClient as any,
            opensearchApiClient: opensearchApiClient as any,
            metadata: {
                recordId: "perf-record-id",
                fileFormat: "csv"
            }
        });

        expect(chunker.chunk.callCount).to.equal(11);
        expect(opensearchApiClient.deleteByQuery.callCount).to.equal(1);
    });

    it("should respect explicit bulk index size configuration", async () => {
        testEnv.chunker.chunk.returns([
            { text: "a", length: 1, position: 0, overlap: 0 },
            { text: "b", length: 1, position: 1, overlap: 0 },
            { text: "c", length: 1, position: 2, overlap: 0 }
        ]);
        testEnv.embeddingApiClient.get.resolves([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ]);

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["txt"]
        });
        config.argv.semanticIndexerConfig.bulkEmbeddingsSize = 3;
        config.argv.semanticIndexerConfig.bulkIndexSize = 2;

        await indexEmbeddingText({
            options: config,
            embeddingText: { text: "abc" },
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "bulk-index-config-id",
                fileFormat: "txt"
            }
        });

        testEnv.expectSuccessCalls({
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 2,
            deleteByQueryCallCount: 1
        });
    });
});
