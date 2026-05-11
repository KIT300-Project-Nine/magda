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
    let parsed: any;
    try {
        parsed = JSON.parse(rawGeoJsonData);
    } catch (e) {
        throw new Error("Invalid GeoJSON JSON string.");
    }

    if (
        parsed?.type !== "FeatureCollection" ||
        !Array.isArray(parsed?.features)
    ) {
        throw new Error("GeoJSON must be a FeatureCollection object.");
    }

    return parsed as GeoJsonFeatureCollection;
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
        const title = mapTitle?.trim()?.length
            ? mapTitle.trim()
            : "Spatial query result";

        let featureCollection: GeoJsonFeatureCollection;
        try {
            if (geoJsonData && geoJsonData.trim().length) {
                featureCollection = parseGeoJsonInput(geoJsonData);
            } else {
                const records = this.keyContextData?.queryResult;
                if (!Array.isArray(records)) {
                    return "Failed to render map: no previous query result is available.";
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
        "Render an interactive map from a GeoJSON FeatureCollection or from the previous SQL query result using latitude and longitude columns.",
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
