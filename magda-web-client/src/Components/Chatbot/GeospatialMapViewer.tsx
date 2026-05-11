import React, { FunctionComponent, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Map, TileLayer, CircleMarker } from "react-leaflet";
import { Message } from "rsuite";

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

interface GeospatialMapViewerProps {
    mapData: any;
    isJsonString?: boolean;
}

const GeospatialMapViewer: FunctionComponent<GeospatialMapViewerProps> = ({
    mapData,
    isJsonString
}) => {
    const featureCollection = useMemo(() => {
        if (typeof mapData === "string") {
            try {
                const parsed = JSON.parse(mapData);
                if (parsed?.type === "FeatureCollection") {
                    return parsed as GeoJsonFeatureCollection;
                }
            } catch (_e) {
                return null;
            }
        }

        if (mapData && typeof mapData === "object") {
            if (mapData?.type === "FeatureCollection") {
                return mapData as GeoJsonFeatureCollection;
            }
        }

        return null;
    }, [mapData]);

    const points = featureCollection?.features || [];
    const center = useMemo(() => {
        if (!points.length) {
            return [-37.8136, 144.9631] as [number, number];
        }

        const first = points[0]?.geometry?.coordinates;
        if (Array.isArray(first) && first.length >= 2) {
            return [first[1], first[0]] as [number, number];
        }

        return [-37.8136, 144.9631] as [number, number];
    }, [points]);

    const bounds = useMemo(() => {
        if (!points.length) {
            return null;
        }

        const latLngs = points
            .map((feature) => feature?.geometry?.coordinates)
            .filter(
                (coord): coord is [number, number] =>
                    Array.isArray(coord) && coord.length >= 2
            )
            .map((coord) => [coord[1], coord[0]] as [number, number]);

        if (!latLngs.length) {
            return null;
        }

        return L.latLngBounds(latLngs);
    }, [points]);

    if (!featureCollection) {
        return (
            <Message showIcon type="error">
                Failed to render GeoJson: unsupported or invalid feature
                collection.
            </Message>
        );
    }

    return (
        <div className="geospatial-map-viewer">
            <Map
                center={center}
                zoom={13}
                bounds={bounds || undefined}
                style={{ width: "100%", height: "500px" }}
                className="leaflet-container"
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {points.map((feature, index) => {
                    const coordinates = feature?.geometry?.coordinates;
                    if (!Array.isArray(coordinates) || coordinates.length < 2) {
                        return null;
                    }
                    const position: [number, number] = [
                        coordinates[1],
                        coordinates[0]
                    ];

                    return (
                        <CircleMarker
                            key={index}
                            center={position}
                            radius={6}
                        ></CircleMarker>
                    );
                })}
            </Map>
        </div>
    );
};

export default GeospatialMapViewer;
