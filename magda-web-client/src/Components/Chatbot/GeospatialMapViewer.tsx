import React, { FunctionComponent } from "react";
import GeoJsonViewer from "./GeoJsonViewer";

interface GeospatialMapViewerProps {
    mapData: any;
    isJsonString?: boolean;
}

const GeospatialMapViewer: FunctionComponent<GeospatialMapViewerProps> = ({
    mapData,
    isJsonString
}) => {
    return <GeoJsonViewer geoJson={mapData} isJsonString={isJsonString} />;
};

export default GeospatialMapViewer;
