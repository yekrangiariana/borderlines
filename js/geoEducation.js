const EARTH_RADIUS_KM = 6371.0088;

function normalizeGeoId(value) {
  const geoId = String(value || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(geoId)) {
    return geoId;
  }
  if (/^[A-Z]{2}-[A-Z]{2}$/.test(geoId)) {
    return geoId;
  }
  return "";
}

function toPairKey(geoIdA, geoIdB) {
  return geoIdA < geoIdB ? `${geoIdA}|${geoIdB}` : `${geoIdB}|${geoIdA}`;
}

function pushSampledRingPoints(ring, points) {
  if (!Array.isArray(ring) || ring.length < 2) {
    return;
  }

  const targetMaxPerRing = 120;
  const step = Math.max(1, Math.floor(ring.length / targetMaxPerRing));
  for (let i = 0; i < ring.length; i += step) {
    const point = ring[i];
    if (
      Array.isArray(point) &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
    ) {
      points.push([point[0], point[1]]);
    }
  }
}

function extractBoundaryPoints(feature) {
  const geometry = feature?.geometry;
  if (!geometry) {
    return [];
  }

  const points = [];
  if (geometry.type === "Polygon") {
    (geometry.coordinates || []).forEach((ring) => {
      pushSampledRingPoints(ring, points);
    });
    return points;
  }

  if (geometry.type === "MultiPolygon") {
    (geometry.coordinates || []).forEach((polygon) => {
      (polygon || []).forEach((ring) => {
        pushSampledRingPoints(ring, points);
      });
    });
    return points;
  }

  return points;
}

function computeMinimumBoundaryDistanceKm(fromFeature, toFeature, d3) {
  const fromPoints = extractBoundaryPoints(fromFeature);
  const toPoints = extractBoundaryPoints(toFeature);
  if (!fromPoints.length || !toPoints.length) {
    return null;
  }

  let minRadians = Number.POSITIVE_INFINITY;
  fromPoints.forEach((fromPoint) => {
    toPoints.forEach((toPoint) => {
      const radians = d3.geoDistance(fromPoint, toPoint);
      if (Number.isFinite(radians) && radians < minRadians) {
        minRadians = radians;
      }
    });
  });

  if (!Number.isFinite(minRadians)) {
    return null;
  }
  return Math.max(0, Math.round(minRadians * EARTH_RADIUS_KM));
}

export function createCountryDistanceLookup(iso2ToCountry) {
  const cacheByPair = new Map();

  function getDistanceKm(fromIso2Raw, toIso2Raw) {
    const fromIso2 = normalizeGeoId(fromIso2Raw);
    const toIso2 = normalizeGeoId(toIso2Raw);
    if (!fromIso2 || !toIso2) {
      return null;
    }

    if (fromIso2 === toIso2) {
      return 0;
    }

    const pairKey = toPairKey(fromIso2, toIso2);
    const cached = cacheByPair.get(pairKey);
    if (typeof cached === "number") {
      return cached;
    }

    const fromCountry = iso2ToCountry?.get?.(fromIso2);
    const toCountry = iso2ToCountry?.get?.(toIso2);
    const d3 = globalThis.d3;
    if (!fromCountry?.feature || !toCountry?.feature || !d3?.geoCentroid) {
      return null;
    }

    try {
      // Use one consistent metric for all geographies:
      // shortest border-to-border geodesic distance.
      if (
        fromCountry?.neighbors instanceof Set &&
        fromCountry.neighbors.has(toIso2)
      ) {
        cacheByPair.set(pairKey, 0);
        return 0;
      }

      const boundaryKm = computeMinimumBoundaryDistanceKm(
        fromCountry.feature,
        toCountry.feature,
        d3,
      );
      if (Number.isFinite(boundaryKm)) {
        cacheByPair.set(pairKey, boundaryKm);
        return boundaryKm;
      }

      return null;
    } catch {
      return null;
    }
  }

  return {
    getDistanceKm,
  };
}
