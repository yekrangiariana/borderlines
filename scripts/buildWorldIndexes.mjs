import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");

const BORDER_OVERRIDES = [["SG", "MY"]];
const EXCLUDED_CONTINENTS = new Set(["Oceania", "Seven seas (open ocean)"]);
const COUNTRY_NAME_OVERRIDES = new Map([["IL", "Palestine"]]);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildAliasSet(props, displayName) {
  const aliases = new Set([
    normalize(props?.name),
    normalize(props?.short_name),
    normalize(props?.iso_short),
    normalize(props?.formal_nam),
    normalize(props?.sovereign),
    normalize(displayName),
  ]);
  return [...aliases].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function hasRenderableGeometry(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !geometry.type) {
    return false;
  }

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

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

function readJson(fileName) {
  const fullPath = join(dataDir, fileName);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function writeJson(fileName, payload) {
  const fullPath = join(dataDir, fileName);
  writeFileSync(fullPath, JSON.stringify(payload), "utf8");
}

function buildWorldIndexes() {
  const geojson = readJson("all_primary_countries.min.geojson");
  const supplementalGeojson = readJson("missing_geometries.geojson");
  const auditOverrideGeojson = readJson("geometry_overrides_audit.geojson");
  const borderCsv = readFileSync(
    join(dataDir, "GEODATASOURCE-COUNTRY-BORDERS.CSV"),
    "utf8",
  );

  const supplementalByIso3 = new Map();
  (supplementalGeojson.features || []).forEach((feature) => {
    const iso3 = String(feature?.properties?.ADM0_A3 || "").toUpperCase();
    if (!iso3 || !hasRenderableGeometry(feature)) {
      return;
    }
    supplementalByIso3.set(iso3, feature);
  });

  const auditOverridesByIso2 = new Map();
  (auditOverrideGeojson.features || []).forEach((feature) => {
    const iso2 = String(feature?.properties?.ISO_A2 || "").toUpperCase();
    if (!iso2 || !hasRenderableGeometry(feature)) {
      return;
    }
    auditOverridesByIso2.set(iso2, feature);
  });

  const countries = [];
  const isoSet = new Set();

  (geojson.features || []).forEach((feature) => {
    const props = feature?.properties || {};
    const iso2 = String(props.iso_a2 || "").toUpperCase();
    const iso3 = String(props.iso_a3 || "").toUpperCase();
    const continent = String(props.continent || "Unknown");

    if (!iso2 || EXCLUDED_CONTINENTS.has(continent)) {
      return;
    }

    let featureForRender = feature;
    const auditOverride = auditOverridesByIso2.get(iso2);
    if (auditOverride) {
      featureForRender = { ...feature, geometry: auditOverride.geometry };
    }

    if (!hasRenderableGeometry(featureForRender) && iso3) {
      const supplemental = supplementalByIso3.get(iso3);
      if (supplemental) {
        featureForRender = { ...feature, geometry: supplemental.geometry };
      }
    }

    if (!hasRenderableGeometry(featureForRender)) {
      return;
    }

    const displayName =
      COUNTRY_NAME_OVERRIDES.get(iso2) ||
      String(props.name || props.iso_short || iso2);

    countries.push({
      iso2,
      iso3,
      name: displayName,
      continent,
      aliases: buildAliasSet(props, displayName),
    });
    isoSet.add(iso2);
  });

  countries.sort((a, b) => a.name.localeCompare(b.name));

  const adjacency = {};
  countries.forEach((country) => {
    adjacency[country.iso2] = [];
  });

  const rows = parseCsv(borderCsv);
  rows.forEach((row) => {
    const from = String(row.country_code || "")
      .trim()
      .toUpperCase();
    const to = String(row.country_border_code || "")
      .trim()
      .toUpperCase();
    if (!from || !to || from === to || !isoSet.has(from) || !isoSet.has(to)) {
      return;
    }

    adjacency[from].push(to);
    adjacency[to].push(from);
  });

  BORDER_OVERRIDES.forEach(([a, b]) => {
    if (!isoSet.has(a) || !isoSet.has(b)) {
      return;
    }
    adjacency[a].push(b);
    adjacency[b].push(a);
  });

  Object.keys(adjacency).forEach((iso2) => {
    const uniqueSorted = [...new Set(adjacency[iso2])].sort((a, b) =>
      a.localeCompare(b),
    );
    adjacency[iso2] = uniqueSorted;
  });

  writeJson("world_minimal.json", {
    meta: {
      id: "world-countries",
      regionLabel: "All Countries",
      itemSingular: "country",
      itemPlural: "countries",
      mapLabel: "world map",
    },
    countries,
  });

  writeJson("world_adjacency.json", {
    source: "GEODATASOURCE-COUNTRY-BORDERS.CSV",
    generatedAt: new Date().toISOString(),
    adjacency,
  });

  writeJson("cache_manifest.json", {
    buildId: new Date().toISOString(),
    assets: [
      "world_minimal.json",
      "world_adjacency.json",
      "all_primary_countries.min.geojson",
      "missing_geometries.geojson",
      "geometry_overrides_audit.geojson",
      "GEODATASOURCE-COUNTRY-BORDERS.CSV",
    ],
  });

  console.log(`Generated world_minimal.json (${countries.length} countries)`);
  console.log(
    `Generated world_adjacency.json (${Object.keys(adjacency).length} keys)`,
  );
  console.log("Generated cache_manifest.json");
}

buildWorldIndexes();
