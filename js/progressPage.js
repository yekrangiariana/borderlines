import {
  drawOutline,
  loadFinlandAreaData,
  loadWorldGameDataFull,
  loadWorldGameDataMinimal,
  loadUkAreaData,
  loadUsStateData,
} from "./gameData.js";
import { createPlayedProgressStore } from "./playedProgress.js";
import { createSettingsProgressView } from "./settingsProgressView.js";

const outlineBackdrop = document.getElementById("outlineBackdrop");
const backToModesBtn = document.getElementById("backToModesBtn");
const settingsProgressPanel = document.getElementById("settingsProgressPanel");
const openSettingsBtn = document.getElementById("openSettingsBtn");

const playedProgressStore = createPlayedProgressStore();

const state = {
  data: null,
  usStateData: null,
  ukAreaData: null,
  finlandAreaData: null,
  region: "all-countries",
  deferredLoads: {
    worldFull: null,
    usStates: null,
    ukAreas: null,
    finlandAreas: null,
  },
};

let progressView = null;

function getContinentOptions(data) {
  const set = new Set(
    (data?.countries || []).map((country) => country.continent).filter(Boolean),
  );
  return [...set].sort((a, b) => a.localeCompare(b));
}

function buildFilteredData(data, continent) {
  if (!data || continent === "All") {
    return data;
  }

  const allowed = data.countries.filter(
    (country) => country.continent === continent,
  );
  if (!allowed.length) {
    return data;
  }

  const allowedIso = new Set(allowed.map((country) => country.iso2));
  const countries = allowed.map((country) => {
    const neighbors = new Set(
      [...country.neighbors].filter((iso2) => allowedIso.has(iso2)),
    );
    return {
      ...country,
      neighbors,
      neighborNames: [...neighbors]
        .map((iso2) => data.iso2ToCountry.get(iso2)?.name)
        .filter(Boolean)
        .sort(),
    };
  });

  const iso2ToCountry = new Map(
    countries.map((country) => [country.iso2, country]),
  );
  const aliasToIso2 = new Map();
  countries.forEach((country) => {
    country.aliases.forEach((alias) => {
      if (!aliasToIso2.has(alias)) {
        aliasToIso2.set(alias, country.iso2);
      }
    });
  });

  return {
    countries,
    iso2ToCountry,
    aliasToIso2,
    meta: {
      ...data.meta,
      regionLabel: continent,
    },
  };
}

function getRegionOptions() {
  const continents = getContinentOptions(state.data || { countries: [] });
  return [
    { value: "all-countries", label: "All Countries" },
    ...continents.map((continent) => ({
      value: `continent:${continent}`,
      label: continent,
    })),
    { value: "us-states", label: "US States" },
    { value: "uk-areas", label: "UK Areas" },
    { value: "finland-areas", label: "Finland Regions" },
  ];
}

function buildActiveDataForRegion(regionValue) {
  if (regionValue === "us-states") {
    return state.usStateData;
  }

  if (regionValue === "uk-areas") {
    return state.ukAreaData;
  }

  if (regionValue === "finland-areas") {
    return state.finlandAreaData;
  }

  if (String(regionValue || "").startsWith("continent:")) {
    const continent = regionValue.slice("continent:".length);
    return buildFilteredData(state.data, continent || "All");
  }

  return state.data;
}

function loadWorldDataFullDeferred() {
  if (state.data?.meta?.fullData) {
    return Promise.resolve(state.data);
  }

  if (!state.deferredLoads.worldFull) {
    state.deferredLoads.worldFull = loadWorldGameDataFull()
      .then((data) => {
        state.data = data;
        if (progressView) {
          renderOutlineBackdrop(state.data);
          progressView.render();
        }
        return data;
      })
      .catch((error) => {
        state.deferredLoads.worldFull = null;
        throw error;
      });
  }

  return state.deferredLoads.worldFull;
}

function loadUsStateDataDeferred() {
  if (state.usStateData) {
    return Promise.resolve(state.usStateData);
  }
  if (!state.deferredLoads.usStates) {
    state.deferredLoads.usStates = loadUsStateData()
      .then((data) => {
        state.usStateData = data;
        progressView?.render();
        return data;
      })
      .catch((error) => {
        state.deferredLoads.usStates = null;
        throw error;
      });
  }
  return state.deferredLoads.usStates;
}

function loadUkAreaDataDeferred() {
  if (state.ukAreaData) {
    return Promise.resolve(state.ukAreaData);
  }
  if (!state.deferredLoads.ukAreas) {
    state.deferredLoads.ukAreas = loadUkAreaData()
      .then((data) => {
        state.ukAreaData = data;
        progressView?.render();
        return data;
      })
      .catch((error) => {
        state.deferredLoads.ukAreas = null;
        throw error;
      });
  }
  return state.deferredLoads.ukAreas;
}

function loadFinlandAreaDataDeferred() {
  if (state.finlandAreaData) {
    return Promise.resolve(state.finlandAreaData);
  }
  if (!state.deferredLoads.finlandAreas) {
    state.deferredLoads.finlandAreas = loadFinlandAreaData()
      .then((data) => {
        state.finlandAreaData = data;
        progressView?.render();
        return data;
      })
      .catch((error) => {
        state.deferredLoads.finlandAreas = null;
        throw error;
      });
  }
  return state.deferredLoads.finlandAreas;
}

async function ensureRegionDataLoaded(regionValue) {
  if (String(regionValue || "").startsWith("continent:")) {
    await loadWorldDataFullDeferred();
    return;
  }

  if (regionValue === "us-states") {
    await loadUsStateDataDeferred();
    return;
  }

  if (regionValue === "uk-areas") {
    await loadUkAreaDataDeferred();
    return;
  }

  if (regionValue === "finland-areas") {
    await loadFinlandAreaDataDeferred();
    return;
  }

  await loadWorldDataFullDeferred();
}

function warmDeferredProgressDatasets() {
  setTimeout(() => {
    void loadWorldDataFullDeferred();
    void loadUsStateDataDeferred();
    void loadUkAreaDataDeferred();
    void loadFinlandAreaDataDeferred();
  }, 0);
}

function createBackdropToken(country) {
  const d3 = globalThis.d3;
  const feature = country?.feature;
  if (!d3 || !feature) {
    return null;
  }

  const projection = d3.geoMercator();
  projection.fitExtent(
    [
      [4, 4],
      [68, 40],
    ],
    feature,
  );
  const path = d3.geoPath(projection);
  const pathD = path(feature);
  if (!pathD) {
    return null;
  }

  const token = document.createElement("div");
  token.className = "outline-backdrop-token";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "outline-backdrop-svg");
  svg.setAttribute("viewBox", "0 0 72 44");
  svg.setAttribute("aria-hidden", "true");

  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", pathD);
  p.setAttribute("class", "outline-backdrop-path");
  svg.appendChild(p);
  token.appendChild(svg);
  return token;
}

function renderOutlineBackdrop(data) {
  if (!outlineBackdrop) {
    return;
  }

  outlineBackdrop.innerHTML = "";
  if (!data?.countries?.length) {
    return;
  }

  const isMobile = window.matchMedia("(max-width: 780px)").matches;
  const isWide = window.matchMedia("(min-width: 1280px)").matches;
  const viewportHeight = Math.max(window.innerHeight || 0, 320);

  const tokenHeight = isMobile ? 50 : isWide ? 90 : 72;
  const lineGap = isMobile ? 12 : isWide ? 20 : 16;
  const rowStep = tokenHeight + lineGap;
  const computedRows = Math.floor((viewportHeight - tokenHeight) / rowStep) + 1;
  const rows = isWide
    ? Math.max(8, Math.ceil(viewportHeight / rowStep) + 1)
    : Math.max(4, Math.min(10, computedRows));
  const occupiedHeight = tokenHeight + (rows - 1) * rowStep;
  const startTop = isWide
    ? 0
    : Math.max(0, Math.floor((viewportHeight - occupiedHeight) / 2));

  const perRow = isMobile ? 8 : isWide ? 14 : 11;

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "outline-backdrop-row";
    if (rowIndex % 2 === 1) {
      row.classList.add("reverse");
    }
    row.style.top = `${startTop + rowIndex * rowStep}px`;
    row.style.setProperty("--row-duration", `${28 + Math.random() * 18}s`);
    row.style.setProperty("--row-delay", `${-1 * Math.random() * 10}s`);

    const track = document.createElement("div");
    track.className = "outline-backdrop-track";
    const tokens = [];

    for (let i = 0; i < perRow; i += 1) {
      const country =
        data.countries[Math.floor(Math.random() * data.countries.length)];
      const token = createBackdropToken(country);
      if (token) {
        tokens.push(token);
        track.appendChild(token);
      }
    }

    tokens.forEach((token) => {
      track.appendChild(token.cloneNode(true));
    });

    row.appendChild(track);
    outlineBackdrop.appendChild(row);
  }
}

async function init() {
  backToModesBtn?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  openSettingsBtn?.addEventListener("click", () => {
    window.location.href = "./index.html?openSettings=1";
  });

  settingsProgressPanel.innerHTML =
    '<p class="sp-empty">Loading progress data...</p>';

  state.data = await loadWorldGameDataMinimal();

  progressView = createSettingsProgressView({
    rootEl: settingsProgressPanel,
    drawOutline,
    getRegionOptions,
    getPreviewRegionValue: () => state.region,
    getDataForRegion: (regionValue) =>
      buildActiveDataForRegion(regionValue) || state.data,
    getSeenSet: (datasetId) => playedProgressStore.getSeenSet(datasetId),
    getSeenEntries: (datasetId) =>
      playedProgressStore.getSeenEntries(datasetId),
    onStartPlayedQuiz: ({ regionValue, playableCount }) => {
      if (playableCount < 5) {
        progressView.setMessage(
          "Play at least 5 outlines in this region to unlock played-only quiz.",
          "wrong",
        );
        return;
      }

      const params = new URLSearchParams({
        startMode: "normal",
        quizPool: "played",
        region: regionValue || "all-countries",
      });
      window.location.href = `./index.html?${params.toString()}`;
    },
    onRegionChange: async (nextRegion) => {
      state.region = nextRegion || "all-countries";
      progressView.setMessage("Loading region data...");
      try {
        await ensureRegionDataLoaded(state.region);
        progressView.setMessage("");
      } catch (error) {
        console.error(error);
        progressView.setMessage(
          "Could not load selected region data. Please try again.",
          "wrong",
        );
      }
      progressView?.render();
    },
  });

  progressView.render();
  warmDeferredProgressDatasets();
}

window.addEventListener("resize", () => {
  if (state.data?.meta?.fullData) {
    renderOutlineBackdrop(state.data);
  }
});

init().catch((error) => {
  console.error(error);
});
