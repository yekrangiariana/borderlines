const GEOJSON_URL = new URL(
  "../data/all_primary_countries.min.geojson",
  import.meta.url,
);
const MISSING_GEOMETRIES_URL = new URL(
  "../data/missing_geometries.geojson",
  import.meta.url,
);
const AUDIT_OVERRIDES_URL = new URL(
  "../data/geometry_overrides_audit.geojson",
  import.meta.url,
);
const WORLD_MINIMAL_URL = new URL(
  "../data/world_minimal.json",
  import.meta.url,
);
const WORLD_ADJACENCY_URL = new URL(
  "../data/world_adjacency.json",
  import.meta.url,
);
const DATA_CACHE_MANIFEST_URL = new URL(
  "../data/cache_manifest.json",
  import.meta.url,
);
const US_STATES_TOPOLOGY_URL = new URL(
  "../data/us_states_10m.json",
  import.meta.url,
);
const UK_AREAS_GEOJSON_URL = new URL(
  "../data/uk_admin_areas.geojson",
  import.meta.url,
);
const FINLAND_AREAS_GEOJSON_URL = new URL(
  "../data/finland_admin_areas.geojson",
  import.meta.url,
);

const BORDER_OVERRIDES = [["SG", "MY"]];

const EXCLUDED_CONTINENTS = new Set(["Oceania", "Seven seas (open ocean)"]);

const COUNTRY_NAME_OVERRIDES = new Map([["IL", "Palestine"]]);

const EXCLUDED_US_FIPS = new Set([
  "11", // District of Columbia
  "60", // American Samoa
  "66", // Guam
  "69", // Northern Mariana Islands
  "72", // Puerto Rico
  "78", // US Virgin Islands
]);

const US_STATE_CODE_BY_FIPS = new Map([
  ["01", "AL"],
  ["02", "AK"],
  ["04", "AZ"],
  ["05", "AR"],
  ["06", "CA"],
  ["08", "CO"],
  ["09", "CT"],
  ["10", "DE"],
  ["12", "FL"],
  ["13", "GA"],
  ["15", "HI"],
  ["16", "ID"],
  ["17", "IL"],
  ["18", "IN"],
  ["19", "IA"],
  ["20", "KS"],
  ["21", "KY"],
  ["22", "LA"],
  ["23", "ME"],
  ["24", "MD"],
  ["25", "MA"],
  ["26", "MI"],
  ["27", "MN"],
  ["28", "MS"],
  ["29", "MO"],
  ["30", "MT"],
  ["31", "NE"],
  ["32", "NV"],
  ["33", "NH"],
  ["34", "NJ"],
  ["35", "NM"],
  ["36", "NY"],
  ["37", "NC"],
  ["38", "ND"],
  ["39", "OH"],
  ["40", "OK"],
  ["41", "OR"],
  ["42", "PA"],
  ["44", "RI"],
  ["45", "SC"],
  ["46", "SD"],
  ["47", "TN"],
  ["48", "TX"],
  ["49", "UT"],
  ["50", "VT"],
  ["51", "VA"],
  ["53", "WA"],
  ["54", "WV"],
  ["55", "WI"],
  ["56", "WY"],
]);

const FINLAND_REGION_NAME_BY_CODE = new Map([
  ["FI-02", "Etelä-Karjala"],
  ["FI-03", "Etelä-Pohjanmaa"],
  ["FI-04", "Etelä-Savo"],
  ["FI-05", "Kainuu"],
  ["FI-06", "Kanta-Häme"],
  ["FI-07", "Keski-Pohjanmaa"],
  ["FI-08", "Keski-Suomi"],
  ["FI-09", "Kymenlaakso"],
  ["FI-10", "Lappi"],
  ["FI-11", "Pirkanmaa"],
  ["FI-12", "Pohjanmaa"],
  ["FI-13", "Pohjois-Karjala"],
  ["FI-14", "Pohjois-Pohjanmaa"],
  ["FI-15", "Pohjois-Savo"],
  ["FI-16", "Päijät-Häme"],
  ["FI-17", "Satakunta"],
  ["FI-18", "Uusimaa"],
  ["FI-19", "Varsinais-Suomi"],
]);

const DATA_CACHE_DB_NAME = "borderlines-data-cache";
const DATA_CACHE_DB_VERSION = 1;
const DATA_CACHE_STORE = "json";
const DATA_CACHE_VERSION_KEY = "schema-v1";
const WORLD_MINIMAL_CACHE_KEY = "world-minimal";
const WORLD_ADJACENCY_CACHE_KEY = "world-adjacency";
const WORLD_FULL_CACHE_KEY = "world-full";
const CACHE_MANIFEST_BUILD_KEY = "cache-manifest-build-id";

let cacheVersionInitPromise = null;

export function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function sample(items, rng = Math.random) {
  if (!items.length) {
    return null;
  }
  const index = Math.floor(rng() * items.length);
  return items[index];
}

export function shuffle(items, rng = Math.random) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCacheEntryKey(cacheKey) {
  return `${DATA_CACHE_VERSION_KEY}:${cacheKey}`;
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDataCacheDb() {
  if (!hasIndexedDb()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DATA_CACHE_DB_NAME, DATA_CACHE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DATA_CACHE_STORE)) {
        db.createObjectStore(DATA_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

async function readCachedJson(cacheKey) {
  const db = await openDataCacheDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_CACHE_STORE, "readonly");
    const store = tx.objectStore(DATA_CACHE_STORE);
    const req = store.get(getCacheEntryKey(cacheKey));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
  });
}

async function writeCachedJson(cacheKey, payload) {
  const db = await openDataCacheDb();
  if (!db) {
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_CACHE_STORE, "readwrite");
    const store = tx.objectStore(DATA_CACHE_STORE);
    store.put(payload, getCacheEntryKey(cacheKey));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
  });
}

async function clearDataCacheStore() {
  const db = await openDataCacheDb();
  if (!db) {
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_CACHE_STORE, "readwrite");
    const store = tx.objectStore(DATA_CACHE_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB clear failed"));
  });
}

async function readCacheManifestBuildId() {
  try {
    const res = await fetch(DATA_CACHE_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) {
      return "";
    }
    const payload = await res.json();
    return String(payload?.buildId || "").trim();
  } catch {
    return "";
  }
}

async function ensureDataCacheVersion() {
  if (!hasIndexedDb()) {
    return;
  }

  if (!cacheVersionInitPromise) {
    cacheVersionInitPromise = (async () => {
      const currentBuildId = await readCacheManifestBuildId();
      if (!currentBuildId) {
        return;
      }

      const cachedBuildId = String(
        (await readCachedJson(CACHE_MANIFEST_BUILD_KEY)) || "",
      ).trim();

      if (cachedBuildId === currentBuildId) {
        return;
      }

      await clearDataCacheStore();
      await writeCachedJson(CACHE_MANIFEST_BUILD_KEY, currentBuildId);
    })().catch(() => {
      // Ignore cache invalidation failures and continue with network-backed loads.
    });
  }

  await cacheVersionInitPromise;
}

async function fetchJsonWithCache(url, cacheKey) {
  try {
    const cached = await readCachedJson(cacheKey);
    if (cached) {
      return cached;
    }
  } catch {
    // Ignore cache read failures and fall back to network.
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dataset: ${res.status}`);
  }
  const parsed = await res.json();

  try {
    await writeCachedJson(cacheKey, parsed);
  } catch {
    // Ignore cache write failures.
  }

  return parsed;
}

function hydrateCountryRows(countryRows) {
  return (countryRows || []).map((country) => ({
    iso2: country.iso2,
    iso3: country.iso3,
    name: country.name,
    continent: country.continent,
    feature: country.feature || null,
    aliases: new Set(country.aliases || []),
    neighbors: new Set(country.neighbors || []),
  }));
}

function buildDatasetFromCountries(countries, meta) {
  const iso2ToCountry = new Map();
  const aliasToIso2 = new Map();

  countries.forEach((country) => {
    iso2ToCountry.set(country.iso2, country);
    country.aliases.forEach((alias) => {
      if (!aliasToIso2.has(alias)) {
        aliasToIso2.set(alias, country.iso2);
      }
    });
  });

  countries.forEach((country) => {
    country.neighborNames = [...country.neighbors]
      .map((iso2) => iso2ToCountry.get(iso2)?.name)
      .filter(Boolean)
      .sort();
  });

  return {
    countries,
    iso2ToCountry,
    aliasToIso2,
    meta,
  };
}

function applyAdjacency(countries, adjacencyByIso2) {
  const validIso = new Set(countries.map((country) => country.iso2));
  countries.forEach((country) => {
    const neighborList = adjacencyByIso2?.[country.iso2] || [];
    country.neighbors = new Set(
      neighborList.filter((iso2) => validIso.has(iso2)),
    );
  });
}

function serializeCountriesForCache(countries) {
  return countries.map((country) => ({
    iso2: country.iso2,
    iso3: country.iso3,
    name: country.name,
    continent: country.continent,
    feature: country.feature || null,
    aliases: [...(country.aliases || [])],
    neighbors: [...(country.neighbors || [])],
  }));
}

function buildAliasSet(props) {
  const candidates = [
    props.name,
    props.short_name,
    props.iso_short,
    props.formal_nam,
    props.sovereign,
  ];
  return new Set(candidates.map(normalize).filter(Boolean));
}

function ensureD3() {
  if (!globalThis.d3) {
    throw new Error(
      "D3 was not found. Ensure vendor/d3.v7.min.js is loaded first.",
    );
  }
  return globalThis.d3;
}

function ensureTopojson() {
  if (!globalThis.topojson) {
    throw new Error(
      "TopoJSON client was not found. Ensure vendor/topojson-client.min.js is loaded first.",
    );
  }
  return globalThis.topojson;
}

function hasRenderableGeometry(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !geometry.type) {
    return false;
  }

  // GeoJSON geometries that can produce paths must have coordinate payloads.
  if (
    geometry.type === "GeometryCollection" &&
    !Array.isArray(geometry.geometries)
  ) {
    return false;
  }

  if (
    geometry.type !== "GeometryCollection" &&
    !Array.isArray(geometry.coordinates)
  ) {
    return false;
  }

  return true;
}

function coordinateKey(coord) {
  if (!Array.isArray(coord) || coord.length < 2) {
    return "";
  }
  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return "";
  }
  return `${lon.toFixed(5)},${lat.toFixed(5)}`;
}

function addRingSegments(ring, ownerId, segmentOwners) {
  if (!Array.isArray(ring) || ring.length < 2) {
    return;
  }

  for (let i = 1; i < ring.length; i += 1) {
    const left = coordinateKey(ring[i - 1]);
    const right = coordinateKey(ring[i]);
    if (!left || !right || left === right) {
      continue;
    }

    const segmentKey = left < right ? `${left}|${right}` : `${right}|${left}`;
    if (!segmentOwners.has(segmentKey)) {
      segmentOwners.set(segmentKey, new Set());
    }
    segmentOwners.get(segmentKey).add(ownerId);
  }
}

function addFeatureSegments(feature, ownerId, segmentOwners) {
  const geometry = feature?.geometry;
  if (!geometry) {
    return;
  }

  if (geometry.type === "Polygon") {
    (geometry.coordinates || []).forEach((ring) => {
      addRingSegments(ring, ownerId, segmentOwners);
    });
    return;
  }

  if (geometry.type === "MultiPolygon") {
    (geometry.coordinates || []).forEach((polygon) => {
      (polygon || []).forEach((ring) => {
        addRingSegments(ring, ownerId, segmentOwners);
      });
    });
  }
}

function buildNeighborMapBySharedSegments(items) {
  const byId = new Map();
  const segmentOwners = new Map();
  items.forEach((item) => {
    if (!item?.id || !item?.feature) {
      return;
    }
    byId.set(item.id, item);
    addFeatureSegments(item.feature, item.id, segmentOwners);
  });

  const neighborsById = new Map();
  byId.forEach((_, id) => neighborsById.set(id, new Set()));

  segmentOwners.forEach((owners) => {
    if (!owners || owners.size < 2) {
      return;
    }

    const ids = [...owners];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        neighborsById.get(ids[i])?.add(ids[j]);
        neighborsById.get(ids[j])?.add(ids[i]);
      }
    }
  });

  return neighborsById;
}

export async function loadWorldGameDataMinimal() {
  await ensureDataCacheVersion();

  const [minimalPayload, adjacencyPayload] = await Promise.all([
    fetchJsonWithCache(WORLD_MINIMAL_URL, WORLD_MINIMAL_CACHE_KEY),
    fetchJsonWithCache(WORLD_ADJACENCY_URL, WORLD_ADJACENCY_CACHE_KEY),
  ]);

  const countries = hydrateCountryRows(minimalPayload?.countries || []);
  applyAdjacency(countries, adjacencyPayload?.adjacency || {});

  return buildDatasetFromCountries(countries, {
    ...(minimalPayload?.meta || {}),
    fullData: false,
  });
}

export async function loadWorldGameDataFull() {
  await ensureDataCacheVersion();

  try {
    const cachedFull = await readCachedJson(WORLD_FULL_CACHE_KEY);
    if (cachedFull?.countries?.length) {
      const cachedCountries = hydrateCountryRows(cachedFull.countries);
      return buildDatasetFromCountries(cachedCountries, {
        ...(cachedFull.meta || {}),
        fullData: true,
      });
    }
  } catch {
    // Ignore processed-cache read failures and rebuild.
  }

  const [geojson, supplementalGeojson, auditOverrideGeojson, adjacencyPayload] =
    await Promise.all([
      fetchJsonWithCache(GEOJSON_URL, "world-geojson"),
      fetchJsonWithCache(MISSING_GEOMETRIES_URL, "world-missing-geojson"),
      fetchJsonWithCache(AUDIT_OVERRIDES_URL, "world-audit-geojson"),
      fetchJsonWithCache(WORLD_ADJACENCY_URL, WORLD_ADJACENCY_CACHE_KEY),
    ]);

  const supplementalByIso3 = new Map();
  (supplementalGeojson.features || []).forEach((feature) => {
    const iso3 = (feature?.properties?.ADM0_A3 || "").toUpperCase();
    if (!iso3 || !hasRenderableGeometry(feature)) {
      return;
    }
    supplementalByIso3.set(iso3, feature);
  });

  const auditOverridesByIso2 = new Map();
  (auditOverrideGeojson.features || []).forEach((feature) => {
    const iso2 = (feature?.properties?.ISO_A2 || "").toUpperCase();
    if (!iso2 || !hasRenderableGeometry(feature)) {
      return;
    }
    auditOverridesByIso2.set(iso2, feature);
  });

  const countries = [];

  (geojson.features || []).forEach((feature) => {
    const props = feature.properties || {};
    const iso2 = (props.iso_a2 || "").toUpperCase();
    const iso3 = (props.iso_a3 || "").toUpperCase();
    const continent = props.continent || "Unknown";
    if (!iso2 || EXCLUDED_CONTINENTS.has(continent)) {
      return;
    }

    let featureForRender = feature;

    const auditOverride = auditOverridesByIso2.get(iso2);
    if (auditOverride) {
      featureForRender = {
        ...feature,
        geometry: auditOverride.geometry,
      };
    }

    if (!hasRenderableGeometry(featureForRender) && iso3) {
      const supplemental = supplementalByIso3.get(iso3);
      if (supplemental) {
        featureForRender = {
          ...feature,
          geometry: supplemental.geometry,
        };
      }
    }

    if (!hasRenderableGeometry(featureForRender)) {
      return;
    }

    const displayName =
      COUNTRY_NAME_OVERRIDES.get(iso2) || props.name || props.iso_short || iso2;
    const aliases = buildAliasSet(props);
    if (COUNTRY_NAME_OVERRIDES.has(iso2)) {
      aliases.add(normalize(displayName));
    }

    countries.push({
      iso2,
      iso3,
      name: displayName,
      continent,
      feature: featureForRender,
      aliases,
      neighbors: new Set(),
    });
  });

  applyAdjacency(countries, adjacencyPayload?.adjacency || {});

  const dataset = buildDatasetFromCountries(countries, {
    id: "world-countries",
    regionLabel: "All Countries",
    itemSingular: "country",
    itemPlural: "countries",
    mapLabel: "world map",
    fullData: true,
  });

  try {
    await writeCachedJson(WORLD_FULL_CACHE_KEY, {
      meta: dataset.meta,
      countries: serializeCountriesForCache(dataset.countries),
    });
  } catch {
    // Ignore processed-cache write failures.
  }

  return dataset;
}

export async function loadGameData() {
  return loadWorldGameDataFull();
}

export async function loadUsStateData() {
  const topojson = ensureTopojson();

  const topologyRes = await fetch(US_STATES_TOPOLOGY_URL);
  if (!topologyRes.ok) {
    throw new Error(`Failed to load US states outlines: ${topologyRes.status}`);
  }

  const topology = await topologyRes.json();
  const allStateGeometries = topology?.objects?.states?.geometries || [];
  const stateGeometries = allStateGeometries.filter((geometry) => {
    const fips = String(geometry?.id || "").padStart(2, "0");
    const code = US_STATE_CODE_BY_FIPS.get(fips);
    return Boolean(code) && !EXCLUDED_US_FIPS.has(fips);
  });

  const stateCollection = {
    type: "GeometryCollection",
    geometries: stateGeometries,
  };
  const geojson = topojson.feature(topology, stateCollection);
  const neighborsByIndex = topojson.neighbors(stateGeometries);

  const countries = [];
  const iso2ToCountry = new Map();
  const aliasToIso2 = new Map();

  geojson.features.forEach((feature, index) => {
    const geometry = stateGeometries[index];
    const fips = String(geometry?.id || "").padStart(2, "0");
    const stateCode = US_STATE_CODE_BY_FIPS.get(fips);
    const stateName = String(feature?.properties?.name || "").trim();
    if (!stateCode || !stateName || !hasRenderableGeometry(feature)) {
      return;
    }

    const iso2 = `US-${stateCode}`;
    const aliases = new Set([
      normalize(stateName),
      normalize(stateCode),
      normalize(`state of ${stateName}`),
    ]);

    const entry = {
      iso2,
      iso3: stateCode,
      name: stateName,
      continent: "United States",
      feature,
      aliases,
      neighbors: new Set(),
    };

    countries.push(entry);
    iso2ToCountry.set(iso2, entry);
    aliases.forEach((alias) => {
      if (alias && !aliasToIso2.has(alias)) {
        aliasToIso2.set(alias, iso2);
      }
    });
  });

  countries.forEach((state, index) => {
    const neighborIndices = neighborsByIndex[index] || [];
    neighborIndices.forEach((neighborIndex) => {
      const neighbor = countries[neighborIndex];
      if (neighbor?.iso2 && neighbor.iso2 !== state.iso2) {
        state.neighbors.add(neighbor.iso2);
      }
    });
  });

  countries.forEach((state) => {
    state.neighborNames = [...state.neighbors]
      .map((iso2) => iso2ToCountry.get(iso2)?.name)
      .filter(Boolean)
      .sort();
  });

  return {
    countries,
    iso2ToCountry,
    aliasToIso2,
    meta: {
      id: "us-states",
      regionLabel: "US States",
      itemSingular: "state",
      itemPlural: "states",
      mapLabel: "country map",
    },
  };
}

export async function loadUkAreaData() {
  const geoRes = await fetch(UK_AREAS_GEOJSON_URL);
  if (!geoRes.ok) {
    throw new Error(`Failed to load UK area outlines: ${geoRes.status}`);
  }

  const geojson = await geoRes.json();
  const countries = [];
  const iso2ToCountry = new Map();
  const aliasToIso2 = new Map();

  (geojson.features || []).forEach((feature) => {
    const props = feature?.properties || {};
    const rawCode = String(props.code || "")
      .trim()
      .toUpperCase();
    const name = String(props.name || "").trim();
    if (!rawCode || !name || !hasRenderableGeometry(feature)) {
      return;
    }

    const shortCode = rawCode.startsWith("GB-") ? rawCode.slice(3) : rawCode;
    const iso2 = rawCode;
    const aliases = new Set([
      normalize(name),
      normalize(shortCode),
      normalize(rawCode),
    ]);

    const entry = {
      iso2,
      iso3: shortCode,
      name,
      continent: "United Kingdom",
      feature,
      aliases,
      neighbors: new Set(),
    };

    countries.push(entry);
    iso2ToCountry.set(iso2, entry);
    aliases.forEach((alias) => {
      if (alias && !aliasToIso2.has(alias)) {
        aliasToIso2.set(alias, iso2);
      }
    });
  });

  const neighborsById = buildNeighborMapBySharedSegments(
    countries.map((area) => ({ id: area.iso2, feature: area.feature })),
  );

  countries.forEach((area) => {
    area.neighbors = neighborsById.get(area.iso2) || new Set();
  });

  countries.forEach((area) => {
    area.neighborNames = [...area.neighbors]
      .map((iso2) => iso2ToCountry.get(iso2)?.name)
      .filter(Boolean)
      .sort();
  });

  return {
    countries,
    iso2ToCountry,
    aliasToIso2,
    meta: {
      id: "uk-areas",
      regionLabel: "UK Areas",
      itemSingular: "area",
      itemPlural: "areas",
      mapLabel: "country map",
    },
  };
}

export async function loadFinlandAreaData() {
  const geoRes = await fetch(FINLAND_AREAS_GEOJSON_URL);
  if (!geoRes.ok) {
    throw new Error(`Failed to load Finland area outlines: ${geoRes.status}`);
  }

  const geojson = await geoRes.json();
  const countries = [];
  const iso2ToCountry = new Map();
  const aliasToIso2 = new Map();

  (geojson.features || []).forEach((feature) => {
    const props = feature?.properties || {};
    const rawCode = String(props.code || "")
      .trim()
      .toUpperCase();
    const englishName = String(props.name || "").trim();
    const name = FINLAND_REGION_NAME_BY_CODE.get(rawCode) || englishName;
    if (!rawCode || !name || !hasRenderableGeometry(feature)) {
      return;
    }

    const shortCode = rawCode.startsWith("FI-") ? rawCode.slice(3) : rawCode;
    const iso2 = rawCode;
    const aliases = new Set([
      normalize(name),
      normalize(englishName),
      normalize(shortCode),
      normalize(rawCode),
      normalize(`region of ${name}`),
      normalize(`region of ${englishName}`),
    ]);

    const entry = {
      iso2,
      iso3: shortCode,
      name,
      continent: "Finland",
      feature,
      aliases,
      neighbors: new Set(),
    };

    countries.push(entry);
    iso2ToCountry.set(iso2, entry);
    aliases.forEach((alias) => {
      if (alias && !aliasToIso2.has(alias)) {
        aliasToIso2.set(alias, iso2);
      }
    });
  });

  const neighborsById = buildNeighborMapBySharedSegments(
    countries.map((area) => ({ id: area.iso2, feature: area.feature })),
  );

  countries.forEach((area) => {
    area.neighbors = neighborsById.get(area.iso2) || new Set();
  });

  countries.forEach((area) => {
    area.neighborNames = [...area.neighbors]
      .map((iso2) => iso2ToCountry.get(iso2)?.name)
      .filter(Boolean)
      .sort();
  });

  return {
    countries,
    iso2ToCountry,
    aliasToIso2,
    meta: {
      id: "finland-areas",
      regionLabel: "Finland Regions",
      itemSingular: "region",
      itemPlural: "regions",
      mapLabel: "country map",
    },
  };
}

export function drawOutline(svgEl, feature) {
  const d3 = ensureD3();
  const width = 640;
  const height = 380;

  if (!hasRenderableGeometry(feature)) {
    svgEl.innerHTML =
      '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="#444">Outline unavailable</text>';
    return;
  }

  const projection = d3.geoMercator();
  projection.fitSize([width - 32, height - 32], feature);
  const path = d3.geoPath(projection);
  const pathD = path(feature);

  if (!pathD) {
    svgEl.innerHTML =
      '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="#444">Outline unavailable</text>';
    return;
  }

  svgEl.innerHTML = "";
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", "translate(16 16)");

  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("class", "country-path");
  p.setAttribute("d", pathD);

  g.appendChild(p);
  svgEl.appendChild(g);
}

export function createSeededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return function seededRandom() {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
