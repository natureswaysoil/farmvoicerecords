"use client";

import {
  boundaryRings,
  mapBounds,
  projectPoint,
  type LatLng,
  type MapWaypoint,
} from "@/src/lib/farm-map";
import type { CloudField } from "@/src/lib/farm-cloud";

export type MapMarker = LatLng & {
  id: string;
  label: string;
  kind: "poi" | "record" | "clock" | "h2a" | "evidence" | "shift";
  detail?: string | null;
  occurredAt?: string | null;
};

export type MapTrack = {
  id: string;
  label: string;
  points: LatLng[];
  startedAt?: string | null;
  endedAt?: string | null;
};

type Props = {
  fields: CloudField[];
  markers: MapMarker[];
  tracks: MapTrack[];
  route?: MapWaypoint[];
  selectedMarkerId?: string | null;
  onMarkerSelect?: (marker: MapMarker) => void;
};

const width = 1000;
const height = 650;

export default function FarmMapCanvas({
  fields,
  markers,
  tracks,
  route = [],
  selectedMarkerId,
  onMarkerSelect,
}: Props) {
  const fieldRings = fields.flatMap((field) =>
    boundaryRings(field.boundary_geojson).map((points, index) => ({
      id: `${field.id}:${index}`,
      fieldId: field.id,
      fieldName: field.name,
      points,
    })),
  );
  const trackPoints = tracks.flatMap((track) => track.points);
  const bounds = mapBounds(
    fieldRings.map((ring) => ring.points),
    [...markers, ...trackPoints, ...route],
  );

  if (!bounds) {
    return (
      <div className="map-empty">
        <strong>No mappable coordinates yet.</strong>
        <p className="muted">
          Import USDA/FSA field boundaries, add a point of interest, or capture
          GPS activity to populate the farm map.
        </p>
      </div>
    );
  }

  const polygonPoints = (points: LatLng[]) =>
    points
      .map((point) => {
        const projected = projectPoint(point, bounds, width, height);
        return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
      })
      .join(" ");

  const trackPath = (points: LatLng[]) =>
    points
      .map((point, index) => {
        const projected = projectPoint(point, bounds, width, height);
        return `${index ? "L" : "M"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="farm-map-wrap">
      <svg
        className="farm-map-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Farm map with field boundaries and GPS activity"
      >
        <rect x="0" y="0" width={width} height={height} className="map-background" />
        {fieldRings.map((ring) => (
          <g key={ring.id}>
            <polygon
              points={polygonPoints(ring.points)}
              className="map-field"
            />
            {ring.points[0] && (() => {
              const p = projectPoint(ring.points[0], bounds, width, height);
              return (
                <text x={p.x + 5} y={p.y - 6} className="map-field-label">
                  {ring.fieldName}
                </text>
              );
            })()}
          </g>
        ))}

        {tracks.map((track) =>
          track.points.length >= 2 ? (
            <path
              key={track.id}
              d={trackPath(track.points)}
              className="map-track"
            >
              <title>{track.label}</title>
            </path>
          ) : null,
        )}

        {route.length >= 2 ? (
          <path d={trackPath(route)} className="map-route">
            <title>Planned route</title>
          </path>
        ) : null}

        {route.map((point, index) => {
          const p = projectPoint(point, bounds, width, height);
          return (
            <g key={`route-${index}`}>
              <circle cx={p.x} cy={p.y} r="9" className="map-route-point" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="map-route-number">
                {index + 1}
              </text>
            </g>
          );
        })}

        {markers.map((marker) => {
          const p = projectPoint(marker, bounds, width, height);
          const selected = marker.id === selectedMarkerId;
          return (
            <g
              key={marker.id}
              role="button"
              tabIndex={0}
              aria-label={marker.label}
              onClick={() => onMarkerSelect?.(marker)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  onMarkerSelect?.(marker);
              }}
              className="map-marker-group"
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={selected ? 10 : 7}
                className={`map-marker map-marker-${marker.kind}${selected ? " selected" : ""}`}
              />
              <title>{marker.label}</title>
            </g>
          );
        })}
      </svg>
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-field" />Field boundary</span>
        <span><i className="legend-poi" />POI</span>
        <span><i className="legend-record" />Farm record</span>
        <span><i className="legend-clock" />Crew GPS</span>
        <span><i className="legend-track" />Tracked session</span>
        <span><i className="legend-route" />Planned route</span>
      </div>
    </div>
  );
}
