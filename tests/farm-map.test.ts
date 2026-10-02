import test from "node:test";
import assert from "node:assert/strict";
import {
  boundaryRings,
  formatDistance,
  googleMapsDirectionsUrl,
  haversineMeters,
  mapBounds,
  projectPoint,
  routeDistance,
} from "../src/lib/farm-map.ts";

test("Farm Map extracts USDA polygon and multipolygon boundaries", () => {
  const polygon = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[-77.6,35.5],[-77.59,35.5],[-77.59,35.51],[-77.6,35.5]]],
    },
  };
  assert.equal(boundaryRings(polygon).length,1);
  assert.equal(boundaryRings(polygon)[0][0].lat,35.5);

  const multi = {
    type: "Feature",
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [[[-77.6,35.5],[-77.59,35.5],[-77.59,35.51],[-77.6,35.5]]],
        [[[-77.7,35.6],[-77.69,35.6],[-77.69,35.61],[-77.7,35.6]]],
      ],
    },
  };
  assert.equal(boundaryRings(multi).length,2);
});

test("Farm Map projects field and GPS points into a stable SVG viewport", () => {
  const rings = [[
    {lat:35.5,lng:-77.6},
    {lat:35.51,lng:-77.6},
    {lat:35.51,lng:-77.59},
  ]];
  const bounds = mapBounds(rings,[{lat:35.505,lng:-77.595}]);
  assert.ok(bounds);
  const point = projectPoint({lat:35.505,lng:-77.595},bounds!);
  assert.ok(point.x > 0 && point.x < 1000);
  assert.ok(point.y > 0 && point.y < 650);
});

test("Farm Map distance and directions helpers support route planning", () => {
  const a={lat:35.5,lng:-77.6};
  const b={lat:35.501,lng:-77.6};
  const meters=haversineMeters(a,b);
  assert.ok(meters > 100 && meters < 120);
  assert.equal(routeDistance([a,b]),meters);
  assert.match(formatDistance(meters),/ft/);

  const url=googleMapsDirectionsUrl(
    [
      {...a,label:"Gate"},
      {lat:35.5005,lng:-77.6005,label:"Water"},
      {...b,label:"Barn"},
    ],
    "driving",
  );
  assert.ok(url);
  assert.match(url!,/google\.com\/maps\/dir/);
  assert.match(url!,/travelmode=driving/);
  assert.match(url!,/waypoints=/);
});

test("Farm Map UI is wired into navigation and offline shell caching", async () => {
  const { readFile } = await import("node:fs/promises");
  const [nav,pwa,sw,page]=await Promise.all([
    readFile(new URL("../src/components/auth-navigation.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/pwa-register.tsx",import.meta.url),"utf8"),
    readFile(new URL("../public/sw.js",import.meta.url),"utf8"),
    readFile(new URL("../app/map/page.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(nav,/href="\/map"/);
  assert.match(pwa,/"\/map"/);
  assert.match(sw,/"\/map"/);
  assert.match(page,/Farm Map/);
  assert.match(page,/farm_map_pois/);
  assert.match(page,/farm_map_track_sessions/);
  assert.match(page,/farm_map_route_plans/);
});
