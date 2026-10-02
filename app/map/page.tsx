"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import FarmMapCanvas, {
  type MapMarker,
  type MapTrack,
} from "@/src/components/farm-map-canvas";
import { createClient } from "@/src/lib/supabase/client";
import {
  getNamedFarmContexts,
  loadCloudFields,
  rememberFarmSelection,
  type CloudField,
  type FarmContext,
} from "@/src/lib/farm-cloud";
import {
  formatDistance,
  googleMapsDirectionsUrl,
  haversineMeters,
  routeDistance,
  type LatLng,
  type MapWaypoint,
} from "@/src/lib/farm-map";
import { collectPages } from "@/src/lib/pagination";

type Poi = {
  id: string;
  farm_id: string;
  field_id: string | null;
  name: string;
  category: string;
  notes: string | null;
  lat: number;
  lng: number;
  created_by: string;
};

type RoutePlan = {
  id: string;
  name: string;
  travel_mode: "driving" | "walking";
  waypoints: MapWaypoint[];
  notes: string | null;
  created_by: string;
};

type TrackSession = {
  id: string;
  user_id: string;
  mode: string;
  label: string | null;
  started_at: string;
  ended_at: string | null;
  distance_m: number;
};

type TrackPoint = {
  id: string;
  session_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  sequence_no: number;
};

type ActiveTrack = {
  id: string;
  mode: "walking" | "driving" | "equipment" | "other";
  label: string;
  startedAt: string;
  points: TrackPoint[];
  distanceM: number;
};

type LayerOptions = {
  records: boolean;
  crew: boolean;
  h2a: boolean;
  evidence: boolean;
  shifts: boolean;
  tracks: boolean;
};

const defaultLayers: LayerOptions = {
  records: true,
  crew: true,
  h2a: true,
  evidence: true,
  shifts: true,
  tracks: true,
};

const poiCategories = [
  ["gate", "Gate / entrance"],
  ["water", "Water"],
  ["building", "Building"],
  ["storage", "Storage"],
  ["hazard", "Hazard"],
  ["equipment", "Equipment"],
  ["field_access", "Field access"],
  ["other", "Other"],
] as const;

function historyStart(days: string) {
  if (days === "all") return null;
  const date = new Date(Date.now() - Number(days) * 86400000);
  return date.toISOString();
}

function coordinate(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positionOnce() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("This device does not provide GPS location."));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export default function FarmMapPage() {
  const [supabase] = useState(() => createClient());
  const [farms, setFarms] = useState<FarmContext[]>([]);
  const [farmId, setFarmId] = useState("");
  const [fields, setFields] = useState<CloudField[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [sessions, setSessions] = useState<TrackSession[]>([]);
  const [tracks, setTracks] = useState<MapTrack[]>([]);
  const [historyMarkers, setHistoryMarkers] = useState<MapMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [historyDays, setHistoryDays] = useState("30");
  const [layers, setLayers] = useState<LayerOptions>(defaultLayers);
  const [message, setMessage] = useState("Loading your farm map…");
  const [loading, setLoading] = useState(false);

  const [poiName, setPoiName] = useState("");
  const [poiCategory, setPoiCategory] = useState("gate");
  const [poiFieldId, setPoiFieldId] = useState("");
  const [poiNotes, setPoiNotes] = useState("");
  const [poiLat, setPoiLat] = useState("");
  const [poiLng, setPoiLng] = useState("");

  const [routeName, setRouteName] = useState("");
  const [routeMode, setRouteMode] = useState<"driving" | "walking">("driving");
  const [routeDraft, setRouteDraft] = useState<MapWaypoint[]>([]);
  const [routeNotes, setRouteNotes] = useState("");

  const [trackMode, setTrackMode] =
    useState<ActiveTrack["mode"]>("walking");
  const [trackLabel, setTrackLabel] = useState("");
  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const activeTrackRef = useRef<ActiveTrack | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);

  const ctx = farms.find((farm) => farm.farmId === farmId) ?? null;

  const poiMarkers = useMemo<MapMarker[]>(
    () =>
      pois.map((poi) => ({
        id: `poi:${poi.id}`,
        lat: poi.lat,
        lng: poi.lng,
        label: poi.name,
        kind: "poi",
        detail: poi.notes || poi.category.replaceAll("_", " "),
      })),
    [pois],
  );

  const visibleHistory = useMemo(
    () =>
      historyMarkers.filter((marker) => {
        if (marker.kind === "record") return layers.records;
        if (marker.kind === "clock") return layers.crew;
        if (marker.kind === "h2a") return layers.h2a;
        if (marker.kind === "evidence") return layers.evidence;
        if (marker.kind === "shift") return layers.shifts;
        return true;
      }),
    [historyMarkers, layers],
  );

  const visibleTracks = layers.tracks ? tracks : [];
  const activeTrackLine: MapTrack[] = activeTrack
    ? [{
        id: activeTrack.id,
        label: activeTrack.label || activeTrack.mode,
        points: activeTrack.points,
        startedAt: activeTrack.startedAt,
      }]
    : [];

  async function loadFarms() {
    const rows = await getNamedFarmContexts(supabase);
    setFarms(rows);
    const remembered = localStorage.getItem("farmvoice_selected_farm_id");
    const initial =
      rows.find((farm) => farm.farmId === remembered)?.farmId ??
      rows[0]?.farmId ??
      "";
    setFarmId(initial);
    if (!rows.length) setMessage("Join or create a farm before using Farm Map.");
  }

  async function loadMap(nextFarmId = farmId) {
    if (!nextFarmId) return;
    setLoading(true);
    setMessage("Loading map layers…");
    try {
      rememberFarmSelection(nextFarmId);
      const nextFields = await loadCloudFields(supabase, nextFarmId);
      setFields(nextFields);

      if (!navigator.onLine) {
        setMessage(
          "Offline: cached field boundaries are available. POIs, routes and historical GPS layers refresh when service returns.",
        );
        return;
      }

      const start = historyStart(historyDays);

      const [
        poiRows,
        routeRows,
        sessionRows,
        recordRows,
        timeRows,
        h2aRows,
        evidenceRows,
        shiftRows,
      ] = await Promise.all([
        collectPages<Poi>((from, to) =>
          supabase
            .from("farm_map_pois")
            .select("id,farm_id,field_id,name,category,notes,lat,lng,created_by")
            .eq("farm_id", nextFarmId)
            .order("name")
            .range(from, to),
        ),
        collectPages<RoutePlan>((from, to) =>
          supabase
            .from("farm_map_route_plans")
            .select("id,name,travel_mode,waypoints,notes,created_by")
            .eq("farm_id", nextFarmId)
            .order("updated_at", { ascending: false })
            .range(from, to),
        ),
        collectPages<TrackSession>((from, to) => {
          let query = supabase
            .from("farm_map_track_sessions")
            .select("id,user_id,mode,label,started_at,ended_at,distance_m")
            .eq("farm_id", nextFarmId)
            .order("started_at", { ascending: false });
          if (start) query = query.gte("started_at", start);
          return query.range(from, to);
        }),
        collectPages<any>((from, to) => {
          let query = supabase
            .from("farm_records")
            .select("id,record_type,payload,recording_lat,recording_lng,recording_captured_at,created_at")
            .eq("farm_id", nextFarmId)
            .not("recording_lat", "is", null)
            .not("recording_lng", "is", null)
            .order("created_at", { ascending: false });
          if (start) query = query.gte("created_at", start);
          return query.range(from, to);
        }),
        collectPages<any>((from, to) => {
          let query = supabase
            .from("time_entries")
            .select("id,job,field_name,clock_in,clock_out,clock_in_lat,clock_in_lng,clock_out_lat,clock_out_lng")
            .eq("farm_id", nextFarmId)
            .order("clock_in", { ascending: false });
          if (start) query = query.gte("clock_in", start);
          return query.range(from, to);
        }),
        collectPages<any>((from, to) => {
          let query = supabase
            .from("h2a_daily_records")
            .select("id,work_date,job,field_name,gps_lat,gps_lng,gps_captured_at")
            .eq("farm_id", nextFarmId)
            .not("gps_lat", "is", null)
            .not("gps_lng", "is", null)
            .order("work_date", { ascending: false });
          if (start) query = query.gte("work_date", start.slice(0, 10));
          return query.range(from, to);
        }),
        collectPages<any>((from, to) => {
          let query = supabase
            .from("farm_photo_evidence")
            .select("id,category,record_type,captured_at,gps_lat,gps_lng")
            .eq("farm_id", nextFarmId)
            .not("gps_lat", "is", null)
            .not("gps_lng", "is", null)
            .order("captured_at", { ascending: false });
          if (start) query = query.gte("captured_at", start);
          return query.range(from, to);
        }),
        collectPages<any>((from, to) => {
          let query = supabase
            .from("shifts")
            .select("id,job,field_name,starts_at,jobsite_lat,jobsite_lng")
            .eq("farm_id", nextFarmId)
            .not("jobsite_lat", "is", null)
            .not("jobsite_lng", "is", null)
            .order("starts_at", { ascending: false });
          if (start) query = query.gte("starts_at", start);
          return query.range(from, to);
        }),
      ]);

      const sessionIds = sessionRows.map((session) => session.id);
      const pointRows: TrackPoint[] = [];
      for (let offset = 0; offset < sessionIds.length; offset += 100) {
        const ids = sessionIds.slice(offset, offset + 100);
        pointRows.push(
          ...(await collectPages<TrackPoint>((from, to) =>
            supabase
              .from("farm_map_track_points")
              .select("id,session_id,recorded_at,lat,lng,sequence_no")
              .eq("farm_id", nextFarmId)
              .in("session_id", ids)
              .order("sequence_no")
              .range(from, to),
          )),
        );
      }

      setPois(poiRows);
      setRoutes(routeRows);
      setSessions(sessionRows);
      setTracks(
        sessionRows.map((session) => ({
          id: session.id,
          label: session.label || session.mode,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          points: pointRows
            .filter((point) => point.session_id === session.id)
            .sort((a, b) => a.sequence_no - b.sequence_no),
        })),
      );

      const markers: MapMarker[] = [];
      for (const row of recordRows) {
        const payload = row.payload ?? {};
        markers.push({
          id: `record:${row.id}`,
          lat: Number(row.recording_lat),
          lng: Number(row.recording_lng),
          label:
            row.record_type === "pesticide"
              ? String(payload.productName ?? "Pesticide record")
              : String(payload.item ?? payload.vendor ?? "Purchase record"),
          kind: "record",
          detail: row.record_type,
          occurredAt: row.recording_captured_at ?? row.created_at,
        });
      }
      for (const row of timeRows) {
        if (row.clock_in_lat != null && row.clock_in_lng != null)
          markers.push({
            id: `clock-in:${row.id}`,
            lat: Number(row.clock_in_lat),
            lng: Number(row.clock_in_lng),
            label: `Clock in · ${row.job || "Farm work"}`,
            kind: "clock",
            detail: row.field_name,
            occurredAt: row.clock_in,
          });
        if (row.clock_out_lat != null && row.clock_out_lng != null)
          markers.push({
            id: `clock-out:${row.id}`,
            lat: Number(row.clock_out_lat),
            lng: Number(row.clock_out_lng),
            label: `Clock out · ${row.job || "Farm work"}`,
            kind: "clock",
            detail: row.field_name,
            occurredAt: row.clock_out,
          });
      }
      for (const row of h2aRows)
        markers.push({
          id: `h2a:${row.id}`,
          lat: Number(row.gps_lat),
          lng: Number(row.gps_lng),
          label: `H-2A · ${row.job || "Daily crew record"}`,
          kind: "h2a",
          detail: row.field_name,
          occurredAt: row.gps_captured_at ?? row.work_date,
        });
      for (const row of evidenceRows)
        markers.push({
          id: `evidence:${row.id}`,
          lat: Number(row.gps_lat),
          lng: Number(row.gps_lng),
          label: `Evidence · ${String(row.category).replaceAll("_", " ")}`,
          kind: "evidence",
          detail: row.record_type,
          occurredAt: row.captured_at,
        });
      for (const row of shiftRows)
        markers.push({
          id: `shift:${row.id}`,
          lat: Number(row.jobsite_lat),
          lng: Number(row.jobsite_lng),
          label: `Scheduled · ${row.job}`,
          kind: "shift",
          detail: row.field_name,
          occurredAt: row.starts_at,
        });

      setHistoryMarkers(markers);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load Farm Map.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFarms().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Could not load farms."),
    );
  }, [supabase]);

  useEffect(() => {
    if (!farmId || !farms.some((farm) => farm.farmId === farmId)) return;
    void loadMap(farmId);
  }, [farmId, historyDays, farms.length]);

  useEffect(() => {
    const reconnect = () => farmId && void loadMap(farmId);
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [farmId, historyDays]);

  useEffect(
    () => () => {
      if (watchIdRef.current != null)
        navigator.geolocation?.clearWatch(watchIdRef.current);
    },
    [],
  );

  async function useCurrentLocationForPoi() {
    try {
      const position = await positionOnce();
      setPoiLat(String(position.coords.latitude));
      setPoiLng(String(position.coords.longitude));
      setMessage("Current GPS location added to the POI form.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GPS is unavailable.");
    }
  }

  async function savePoi(event: FormEvent) {
    event.preventDefault();
    if (!ctx) return;
    const lat = coordinate(poiLat);
    const lng = coordinate(poiLng);
    if (!poiName.trim() || lat == null || lng == null)
      return setMessage("Enter a POI name and valid latitude/longitude.");
    setLoading(true);
    const { error } = await supabase.from("farm_map_pois").insert({
      farm_id: ctx.farmId,
      field_id: poiFieldId || null,
      name: poiName.trim(),
      category: poiCategory,
      notes: poiNotes.trim() || null,
      lat,
      lng,
      created_by: ctx.userId,
    });
    setLoading(false);
    if (error) return setMessage(error.message);
    setPoiName("");
    setPoiNotes("");
    setPoiLat("");
    setPoiLng("");
    setPoiFieldId("");
    await loadMap(ctx.farmId);
    setMessage("Point of interest saved.");
  }

  function addPoiToRoute(poi: Poi) {
    setRouteDraft((current) => {
      if (current.some((point) => point.lat === poi.lat && point.lng === poi.lng))
        return current;
      return [...current, { lat: poi.lat, lng: poi.lng, label: poi.name }].slice(0, 10);
    });
  }

  async function addCurrentLocationToRoute() {
    try {
      const position = await positionOnce();
      setRouteDraft((current) =>
        [
          ...current,
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            label: "Current location",
          },
        ].slice(0, 10),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GPS is unavailable.");
    }
  }

  async function saveRoute() {
    if (!ctx || routeDraft.length < 2)
      return setMessage("Add at least two route stops.");
    const name = routeName.trim() || `Route ${new Date().toLocaleDateString()}`;
    const { error } = await supabase.from("farm_map_route_plans").insert({
      farm_id: ctx.farmId,
      name,
      travel_mode: routeMode,
      waypoints: routeDraft,
      notes: routeNotes.trim() || null,
      created_by: ctx.userId,
    });
    if (error) return setMessage(error.message);
    setRouteName("");
    setRouteNotes("");
    await loadMap(ctx.farmId);
    setMessage("Route plan saved.");
  }

  function openDirections(waypoints = routeDraft, mode = routeMode) {
    const url = googleMapsDirectionsUrl(waypoints, mode);
    if (!url) return setMessage("Add at least two route stops.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function loadRoute(route: RoutePlan) {
    setRouteName(route.name);
    setRouteMode(route.travel_mode);
    setRouteDraft(route.waypoints);
    setRouteNotes(route.notes ?? "");
    setMessage(`Loaded route: ${route.name}`);
  }

  async function startTracking() {
    if (!ctx || activeTrack) return;
    try {
      const first = await positionOnce();
      const id = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const label = trackLabel.trim() || `${trackMode} session`;
      const { error } = await supabase.from("farm_map_track_sessions").insert({
        id,
        farm_id: ctx.farmId,
        user_id: ctx.userId,
        mode: trackMode,
        label,
        started_at: startedAt,
        start_lat: first.coords.latitude,
        start_lng: first.coords.longitude,
      });
      if (error) throw error;

      const firstPoint: TrackPoint = {
        id: crypto.randomUUID(),
        session_id: id,
        sequence_no: 0,
        recorded_at: startedAt,
        lat: first.coords.latitude,
        lng: first.coords.longitude,
      };
      const pointInsert = await supabase.from("farm_map_track_points").insert({
        ...firstPoint,
        farm_id: ctx.farmId,
        user_id: ctx.userId,
        accuracy_m: first.coords.accuracy,
        speed_mps: first.coords.speed,
        heading_deg: first.coords.heading,
      });
      if (pointInsert.error) throw pointInsert.error;

      const initial: ActiveTrack = {
        id,
        mode: trackMode,
        label,
        startedAt,
        points: [firstPoint],
        distanceM: 0,
      };
      sequenceRef.current = 1;
      activeTrackRef.current = initial;
      setActiveTrack(initial);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const current = activeTrackRef.current;
          if (!current || !ctx) return;
          const previous = current.points[current.points.length - 1];
          const next: LatLng = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const moved = previous
            ? haversineMeters(previous, next)
            : Number.POSITIVE_INFINITY;
          if (moved < 5) return;

          const point: TrackPoint = {
            id: crypto.randomUUID(),
            session_id: current.id,
            sequence_no: sequenceRef.current++,
            recorded_at: new Date().toISOString(),
            lat: next.lat,
            lng: next.lng,
          };
          const updated: ActiveTrack = {
            ...current,
            points: [...current.points, point],
            distanceM: current.distanceM + moved,
          };
          activeTrackRef.current = updated;
          setActiveTrack(updated);

          void supabase
            .from("farm_map_track_points")
            .insert({
              ...point,
              farm_id: ctx.farmId,
              user_id: ctx.userId,
              accuracy_m: position.coords.accuracy,
              speed_mps: position.coords.speed,
              heading_deg: position.coords.heading,
            })
            .then(({ error }) => {
              if (error)
                setMessage(
                  "GPS is still tracking, but one track point could not be uploaded. Keep this screen open until service is stable.",
                );
            });
        },
        (error) => setMessage(`GPS tracking warning: ${error.message}`),
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 20000,
        },
      );
      setMessage(`${label} tracking started.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start tracking.");
    }
  }

  async function stopTracking() {
    const current = activeTrackRef.current;
    if (!current || !ctx) return;
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const last = current.points[current.points.length - 1];
    const endedAt = new Date().toISOString();
    const { error } = await supabase
      .from("farm_map_track_sessions")
      .update({
        ended_at: endedAt,
        end_lat: last?.lat ?? null,
        end_lng: last?.lng ?? null,
        distance_m: current.distanceM,
      })
      .eq("id", current.id)
      .eq("farm_id", ctx.farmId);
    if (error) return setMessage(error.message);
    activeTrackRef.current = null;
    setActiveTrack(null);
    setTrackLabel("");
    await loadMap(ctx.farmId);
    setMessage(
      `Track saved · ${formatDistance(current.distanceM)} · ${current.points.length} GPS points.`,
    );
  }

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Farm intelligence</div>
        <h1>Farm Map</h1>
        <p className="lede">
          See field boundaries, GPS-linked records, crew activity, points of
          interest, planned routes and tracked walking/driving sessions on one
          farm map.
        </p>
      </div>

      {farms.length > 1 && (
        <section className="card form">
          <div className="field">
            <label htmlFor="map-farm">Farm</label>
            <select
              id="map-farm"
              value={farmId}
              onChange={(event) => setFarmId(event.target.value)}
            >
              {farms.map((farm) => (
                <option key={farm.farmId} value={farm.farmId}>
                  {farm.farmName ?? farm.farmId}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section className="card stack">
        <div className="inline map-toolbar">
          <div className="field">
            <label htmlFor="map-history">History</label>
            <select
              id="map-history"
              value={historyDays}
              onChange={(event) => setHistoryDays(event.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
              <option value="all">All available</option>
            </select>
          </div>
          {Object.entries(layers).map(([key, checked]) => (
            <label className="map-layer-toggle" key={key}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  setLayers((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
              {key}
            </label>
          ))}
        </div>

        <FarmMapCanvas
          fields={fields}
          markers={[...poiMarkers, ...visibleHistory]}
          tracks={[...visibleTracks, ...activeTrackLine]}
          route={routeDraft}
          selectedMarkerId={selectedMarker?.id}
          onMarkerSelect={setSelectedMarker}
        />

        {selectedMarker && (
          <div className="notice">
            <strong>{selectedMarker.label}</strong>
            {selectedMarker.detail && <div>{selectedMarker.detail}</div>}
            {selectedMarker.occurredAt && (
              <div className="small muted">
                {new Date(selectedMarker.occurredAt).toLocaleString()}
              </div>
            )}
            <div className="small muted">
              {selectedMarker.lat.toFixed(6)}, {selectedMarker.lng.toFixed(6)}
            </div>
          </div>
        )}
      </section>

      <section className="grid-2">
        <form className="card form" onSubmit={savePoi}>
          <div>
            <div className="kicker">Points of interest</div>
            <h2>Add POI</h2>
          </div>
          <div className="field">
            <label htmlFor="poi-name">Name</label>
            <input
              id="poi-name"
              value={poiName}
              onChange={(event) => setPoiName(event.target.value)}
              placeholder="North gate"
            />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="poi-category">Type</label>
              <select
                id="poi-category"
                value={poiCategory}
                onChange={(event) => setPoiCategory(event.target.value)}
              >
                {poiCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="poi-field">Field (optional)</label>
              <select
                id="poi-field"
                value={poiFieldId}
                onChange={(event) => setPoiFieldId(event.target.value)}
              >
                <option value="">No field</option>
                {fields.map((field) => (
                  <option key={field.id} value={field.id}>{field.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="poi-lat">Latitude</label>
              <input id="poi-lat" value={poiLat} onChange={(event) => setPoiLat(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="poi-lng">Longitude</label>
              <input id="poi-lng" value={poiLng} onChange={(event) => setPoiLng(event.target.value)} />
            </div>
          </div>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void useCurrentLocationForPoi()}
          >
            Use current GPS
          </button>
          <div className="field">
            <label htmlFor="poi-notes">Notes</label>
            <textarea id="poi-notes" value={poiNotes} onChange={(event) => setPoiNotes(event.target.value)} />
          </div>
          <button className="btn" disabled={loading}>Save POI</button>
        </form>

        <section className="card stack">
          <div>
            <div className="kicker">Saved POIs</div>
            <h2>{pois.length} locations</h2>
          </div>
          {pois.length ? (
            pois.map((poi) => (
              <div className="map-list-row" key={poi.id}>
                <div>
                  <strong>{poi.name}</strong>
                  <div className="small muted">
                    {poi.category.replaceAll("_", " ")} · {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
                  </div>
                </div>
                <button className="btn secondary" onClick={() => addPoiToRoute(poi)}>
                  Add to route
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No points of interest saved yet.</p>
          )}
        </section>
      </section>

      <section className="grid-2">
        <section className="card form">
          <div>
            <div className="kicker">Route planning</div>
            <h2>Plan farm route</h2>
          </div>
          <div className="field">
            <label htmlFor="route-name">Route name</label>
            <input id="route-name" value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="Morning irrigation route" />
          </div>
          <div className="field">
            <label htmlFor="route-mode">Mode</label>
            <select id="route-mode" value={routeMode} onChange={(event) => setRouteMode(event.target.value as "driving" | "walking")}>
              <option value="driving">Driving</option>
              <option value="walking">Walking</option>
            </select>
          </div>
          <button className="btn secondary" type="button" onClick={() => void addCurrentLocationToRoute()}>
            Add current location
          </button>
          <ol className="map-route-list">
            {routeDraft.map((point, index) => (
              <li key={`${point.lat}:${point.lng}:${index}`}>
                <span>{point.label || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</span>
                <button type="button" onClick={() => setRouteDraft((current) => current.filter((_, i) => i !== index))}>Remove</button>
              </li>
            ))}
          </ol>
          {routeDraft.length >= 2 && (
            <div className="notice">
              Straight-line farm distance: <strong>{formatDistance(routeDistance(routeDraft))}</strong>
            </div>
          )}
          <div className="field">
            <label htmlFor="route-notes">Notes</label>
            <textarea id="route-notes" value={routeNotes} onChange={(event) => setRouteNotes(event.target.value)} />
          </div>
          <div className="inline">
            <button className="btn" type="button" onClick={() => void saveRoute()}>Save route</button>
            <button className="btn secondary" type="button" onClick={() => openDirections()}>Open directions</button>
            <button className="text-button" type="button" onClick={() => setRouteDraft([])}>Clear</button>
          </div>
        </section>

        <section className="card stack">
          <div>
            <div className="kicker">Saved routes</div>
            <h2>{routes.length} route plans</h2>
          </div>
          {routes.map((route) => (
            <div className="map-list-row" key={route.id}>
              <div>
                <strong>{route.name}</strong>
                <div className="small muted">
                  {route.travel_mode} · {route.waypoints.length} stops · {formatDistance(routeDistance(route.waypoints))}
                </div>
              </div>
              <div className="inline">
                <button className="btn secondary" onClick={() => loadRoute(route)}>Load</button>
                <button className="btn secondary" onClick={() => openDirections(route.waypoints, route.travel_mode)}>Directions</button>
              </div>
            </div>
          ))}
          {!routes.length && <p className="muted">No saved routes yet.</p>}
        </section>
      </section>

      <section className="grid-2">
        <section className="card form">
          <div>
            <div className="kicker">GPS track sessions</div>
            <h2>Track walking or driving</h2>
          </div>
          <div className="field">
            <label htmlFor="track-label">Session label</label>
            <input id="track-label" value={trackLabel} onChange={(event) => setTrackLabel(event.target.value)} placeholder="Fence inspection" disabled={Boolean(activeTrack)} />
          </div>
          <div className="field">
            <label htmlFor="track-mode">Mode</label>
            <select id="track-mode" value={trackMode} disabled={Boolean(activeTrack)} onChange={(event) => setTrackMode(event.target.value as ActiveTrack["mode"])}>
              <option value="walking">Walking</option>
              <option value="driving">Driving</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </select>
          </div>
          {activeTrack ? (
            <>
              <div className="notice">
                <strong>{activeTrack.label}</strong>
                <div>{formatDistance(activeTrack.distanceM)} · {activeTrack.points.length} GPS points</div>
                <div className="small muted">Started {new Date(activeTrack.startedAt).toLocaleString()}</div>
              </div>
              <button className="btn" type="button" onClick={() => void stopTracking()}>Stop & save track</button>
            </>
          ) : (
            <button className="btn" type="button" onClick={() => void startTracking()}>Start GPS tracking</button>
          )}
          <p className="small muted">
            Keep FarmVoice open while tracking. GPS is recorded only during an active session.
          </p>
        </section>

        <section className="card stack">
          <div>
            <div className="kicker">Historical tracks</div>
            <h2>{sessions.length} sessions</h2>
          </div>
          {sessions.map((session) => (
            <div className="map-list-row" key={session.id}>
              <div>
                <strong>{session.label || session.mode}</strong>
                <div className="small muted">
                  {new Date(session.started_at).toLocaleString()} · {formatDistance(Number(session.distance_m))}
                </div>
              </div>
              <span className="badge">{session.ended_at ? "saved" : "open"}</span>
            </div>
          ))}
          {!sessions.length && <p className="muted">No tracked sessions in this history window.</p>}
        </section>
      </section>

      <section className="card stack">
        <div>
          <div className="kicker">Historical activity</div>
          <h2>{visibleHistory.length} GPS-linked events</h2>
          <p className="muted">
            Includes farm records, clock-in/out positions, H-2A daily GPS,
            evidence locations and scheduled jobsites for the selected history window.
          </p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Type</th><th>Activity</th><th>Location</th></tr>
            </thead>
            <tbody>
              {visibleHistory.slice(0, 250).map((marker) => (
                <tr key={marker.id}>
                  <td>{marker.occurredAt ? new Date(marker.occurredAt).toLocaleString() : "—"}</td>
                  <td>{marker.kind}</td>
                  <td>{marker.label}</td>
                  <td>{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleHistory.length > 250 && (
          <p className="small muted">
            Showing the newest 250 events in the table; all loaded events remain on the map.
          </p>
        )}
      </section>

      {message && <div className="notice" role="status">{message}</div>}
    </main>
  );
}
