import { createChatEventMessageCompleteMsg } from "../Messaging";
import { ChainInput } from "../commons";
import type { WebLLMTool } from "../ChatWebLLM";

const DEFAULT_FEATURE_LIMIT = 500;

type GeoJsonFeature = {
    type: "Feature";
    properties: Record<string, any>;
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
};

type GeoJsonFeatureCollection = {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
};

function toNumber(value: any): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length) {
        const num = Number(value.trim());
        return Number.isFinite(num) ? num : null;
    }
    return null;
}

function isValidCoordinatePair(lat: number, lon: number): boolean {
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function pickColumnName(
    records: Record<string, any>[],
    explicitName: string | undefined,
    fallbacks: string[]
): string | null {
    if (!records.length) {
        return null;
    }

    const keys = Object.keys(records[0]);
    const keyLookup = new Map(keys.map((key) => [key.toLowerCase(), key]));

    if (explicitName && explicitName.trim().length) {
        return keyLookup.get(explicitName.trim().toLowerCase()) || null;
    }

    for (const fallback of fallbacks) {
        const matched = keyLookup.get(fallback.toLowerCase());
        if (matched) {
            return matched;
        }
    }

    return null;
}

function rowsToFeatureCollection(
    records: Record<string, any>[],
    latitudeColumn?: string,
    longitudeColumn?: string,
    featureLimit: number = DEFAULT_FEATURE_LIMIT
): GeoJsonFeatureCollection {
    if (!records.length) {
        throw new Error("No query rows available to render as map.");
    }

    const latKey = pickColumnName(records, latitudeColumn, [
        "latitude",
        "lat",
        "y",
        "y_coord",
        "ycoord"
    ]);
    const lonKey = pickColumnName(records, longitudeColumn, [
        "longitude",
        "lon",
        "lng",
        "x",
        "x_coord",
        "xcoord"
    ]);

    if (!latKey || !lonKey) {
        throw new Error(
            "Unable to determine latitude/longitude columns. Please provide latitudeColumn and longitudeColumn explicitly."
        );
    }

    const features: GeoJsonFeature[] = [];
    const cappedRecords = records.slice(0, featureLimit);

    for (const row of cappedRecords) {
        const lat = toNumber(row?.[latKey]);
        const lon = toNumber(row?.[lonKey]);

        if (lat === null || lon === null || !isValidCoordinatePair(lat, lon)) {
            continue;
        }

        const properties = { ...row };
        features.push({
            type: "Feature",
            properties,
            geometry: {
                type: "Point",
                coordinates: [lon, lat]
            }
        });
    }

    if (!features.length) {
        throw new Error(
            "No valid coordinate rows found. Ensure latitude and longitude values are present and within valid ranges."
        );
    }

    return {
        type: "FeatureCollection",
        features
    };
}

function parseGeoJsonInput(rawGeoJsonData: string): GeoJsonFeatureCollection {
    // Try to parse as JSON first. Handle common wrapper cases where the
    // input may be a JSON-stringified string (e.g., "| col | ...") or an
    // object like { value: "...table..." } coming from agent tooling.
    try {
        const parsed = JSON.parse(rawGeoJsonData);

        // If parsing produced a plain string, treat it as raw table/text and try table parsing.
        if (typeof parsed === "string") {
            const records = parseMarkdownTableToRecords(parsed);
            if (records && records.length) {
                return rowsToFeatureCollection(records);
            }
            throw new Error("GeoJSON must be a FeatureCollection object.");
        }

        // Some tools may wrap the payload: { value: '...'} or {name, value}
        if (parsed && typeof parsed === "object") {
            if (
                parsed.type === "FeatureCollection" &&
                Array.isArray(parsed.features)
            ) {
                return parsed as GeoJsonFeatureCollection;
            }

            if (
                typeof parsed.value === "string" &&
                parsed.value.trim().length
            ) {
                const records = parseMarkdownTableToRecords(parsed.value);
                if (records && records.length) {
                    return rowsToFeatureCollection(records);
                }
            }
        }

        throw new Error("GeoJSON must be a FeatureCollection object.");
    } catch (jsonErr) {
        // If JSON parsing failed, attempt to parse common ASCII/markdown table outputs
        const records = parseMarkdownTableToRecords(rawGeoJsonData);
        if (records && records.length) {
            return rowsToFeatureCollection(records);
        }

        throw new Error("Invalid GeoJSON JSON string.");
    }
}

function parseMarkdownTableToRecords(raw: string): Record<string, any>[] {
    const lines = raw
        .split(/\r?\n/) // split into lines
        .map((l) => l.trim())
        .filter((l) => l.length);

    // Look for a markdown-style table header (lines containing |)
    const tableLines = lines.filter((l) => l.includes("|"));
    if (tableLines.length < 2) {
        return [];
    }

    // Find the header line and separator (----)
    let headerIndex = -1;
    for (let i = 0; i < tableLines.length - 1; i++) {
        const next = tableLines[i + 1];
        if (/^\s*\|?\s*:?-{2,}/.test(next) || /^\s*-{3,}\s*$/.test(next)) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        // fallback: assume first table-like line is header
        headerIndex = 0;
    }

    const headerLine = tableLines[headerIndex];
    const headers = headerLine
        .split("|")
        .map((h) => h.trim())
        .filter((h) => h.length);

    const dataLines = tableLines.slice(headerIndex + 2);
    if (dataLines.length === 0) {
        return [];
    }

    const records: Record<string, any>[] = [];
    for (const line of dataLines) {
        const cols = line.split("|").map((c) => c.trim());
        if (cols.length < headers.length) continue;
        const rec: Record<string, any> = {};
        for (let i = 0; i < headers.length; i++) {
            rec[headers[i]] = cols[i + 1] !== undefined ? cols[i + 1] : cols[i];
        }
        records.push(rec);
    }

    return records;
}

const renderGeospatialMap: WebLLMTool = {
    name: "renderGeospatialMap",
    func: async function (
        this: ChainInput,
        mapTitle?: string,
        geoJsonData?: string,
        latitudeColumn?: string,
        longitudeColumn?: string
    ) {
        const looksLikeSpatialPayload = (value: string): boolean => {
            const v = value.trim();
            return (
                v.startsWith("{") ||
                v.startsWith("[") ||
                v.includes("\n|") ||
                v.startsWith("|")
            );
        };

        // Be defensive against argument-order mistakes from model tool-calling.
        let normalizedTitle = mapTitle?.trim() || "";
        let normalizedGeoJsonData = geoJsonData;
        if (
            (!normalizedGeoJsonData || !normalizedGeoJsonData.trim()) &&
            normalizedTitle &&
            looksLikeSpatialPayload(normalizedTitle)
        ) {
            normalizedGeoJsonData = normalizedTitle;
            normalizedTitle = "";
        }

        const title = normalizedTitle.length
            ? normalizedTitle
            : "Spatial query result";

        let featureCollection: GeoJsonFeatureCollection;
        try {
            if (normalizedGeoJsonData && normalizedGeoJsonData.trim().length) {
                try {
                    featureCollection = parseGeoJsonInput(
                        normalizedGeoJsonData
                    );
                } catch (parseError) {
                    // If user/model supplied malformed GeoJSON-like text, fallback to
                    // latest query rows when available to avoid dead-end loops.
                    const records = this.keyContextData?.queryResult;
                    if (!Array.isArray(records) || !records.length) {
                        throw parseError;
                    }
                    featureCollection = rowsToFeatureCollection(
                        records,
                        latitudeColumn,
                        longitudeColumn
                    );
                }
            } else {
                const records = this.keyContextData?.queryResult;
                if (!Array.isArray(records)) {
                    return "Failed to render map: no previous query result is available. Run executeSQLQuery first, then call renderGeospatialMap.";
                }
                featureCollection = rowsToFeatureCollection(
                    records,
                    latitudeColumn,
                    longitudeColumn
                );
            }
        } catch (e) {
            const errorMessage =
                e instanceof Error
                    ? e.message
                    : "Unknown geospatial conversion error";
            return `Failed to render map: ${errorMessage}`;
        }

        const payload = JSON.stringify(featureCollection);
        this.queue.push(
            createChatEventMessageCompleteMsg(
                `### ${title}\n\n\`\`\`geospatialmap\n${payload}\n\`\`\``
            )
        );

        return "Map has been generated and displayed successfully.";
    },
    description:
        "Render an interactive map from a GeoJSON FeatureCollection JSON string. If you do not have a GeoJSON string, you MUST first use the 'queryDataset' and 'executeSQLQuery' tools to retrieve data with latitude and longitude columns, and THEN call this tool without the 'geoJsonData' parameter.",
    parameters: [
        {
            name: "mapTitle",
            type: "string",
            description: "A short title shown above the rendered map."
        },
        {
            name: "geoJsonData",
            type: "string",
            description:
                "Optional GeoJSON FeatureCollection JSON string. If omitted, this tool will convert the previous query result rows to GeoJSON Point features."
        },
        {
            name: "latitudeColumn",
            type: "string",
            description:
                "Optional latitude column name used when converting previous query rows to GeoJSON."
        },
        {
            name: "longitudeColumn",
            type: "string",
            description:
                "Optional longitude column name used when converting previous query rows to GeoJSON."
        }
    ]
};

export default renderGeospatialMap;
