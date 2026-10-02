export type LatLng = { lat: number; lng: number };
export type MapWaypoint = LatLng & { label?: string };

export type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type GeoGeometry = {
  type?: string;
  coordinates?: unknown;
};

function validLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Number(value[0]) >= -180 &&
    Number(value[0]) <= 180 &&
    Number(value[1]) >= -90 &&
    Number(value[1]) <= 90
  );
}

function geometryOf(value: unknown): GeoGeometry | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (object.type === "Feature" && object.geometry && typeof object.geometry === "object")
    return object.geometry as GeoGeometry;
  return object as GeoGeometry;
}

export function boundaryRings(value: unknown): LatLng[][] {
  const geometry = geometryOf(value);
  if (!geometry?.type || !geometry.coordinates) return [];
  const rings: LatLng[][] = [];

  const addRing = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return;
    const points = candidate
      .filter(validLngLat)
      .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
    if (points.length >= 3) rings.push(points);
  };

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    for (const ring of geometry.coordinates) addRing(ring);
  } else if (
    geometry.type === "MultiPolygon" &&
    Array.isArray(geometry.coordinates)
  ) {
    for (const polygon of geometry.coordinates) {
      if (!Array.isArray(polygon)) continue;
      for (const ring of polygon) addRing(ring);
    }
  }
  return rings;
}

export function mapBounds(
  rings: LatLng[][],
  points: LatLng[],
): MapBounds | null {
  const all = [...rings.flat(), ...points].filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
  if (!all.length) return null;
  let minLat = Math.min(...all.map((point) => point.lat));
  let maxLat = Math.max(...all.map((point) => point.lat));
  let minLng = Math.min(...all.map((point) => point.lng));
  let maxLng = Math.max(...all.map((point) => point.lng));

  if (minLat === maxLat) {
    minLat -= 0.0005;
    maxLat += 0.0005;
  }
  if (minLng === maxLng) {
    minLng -= 0.0005;
    maxLng += 0.0005;
  }

  const latPad = (maxLat - minLat) * 0.08;
  const lngPad = (maxLng - minLng) * 0.08;
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

export function projectPoint(
  point: LatLng,
  bounds: MapBounds,
  width = 1000,
  height = 650,
  padding = 36,
) {
  const x =
    padding +
    ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) *
      (width - padding * 2);
  const y =
    padding +
    ((bounds.maxLat - point.lat) / (bounds.maxLat - bounds.minLat)) *
      (height - padding * 2);
  return { x, y };
}

export function haversineMeters(a: LatLng, b: LatLng) {
  const r = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trackDistance(points: LatLng[]) {
  let total = 0;
  for (let index = 1; index < points.length; index++)
    total += haversineMeters(points[index - 1], points[index]);
  return total;
}

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return "0 ft";
  const feet = meters * 3.28084;
  if (feet < 5280) return `${Math.round(feet).toLocaleString()} ft`;
  return `${(feet / 5280).toFixed(2)} mi`;
}

export function googleMapsDirectionsUrl(
  waypoints: MapWaypoint[],
  mode: "driving" | "walking",
) {
  if (waypoints.length < 2) return null;
  const coordinate = (point: MapWaypoint) =>
    `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;
  const params = new URLSearchParams({
    api: "1",
    origin: coordinate(waypoints[0]),
    destination: coordinate(waypoints[waypoints.length - 1]),
    travelmode: mode,
  });
  if (waypoints.length > 2)
    params.set(
      "waypoints",
      waypoints.slice(1, -1).map(coordinate).join("|"),
    );
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function routeDistance(waypoints: MapWaypoint[]) {
  return trackDistance(waypoints);
}
