import {
  drawOutline,
  loadFinlandAreaData,
  loadWorldGameDataFull,
  loadWorldGameDataMinimal,
  loadUkAreaData,
  loadUsStateData,
  normalize,
} from "./gameData.js";
import { createMapAssistManager } from "./mapAssist.js";
import {
  detectPlayerCountry,
  fetchMyCompetitiveRunToday,
  fetchDailyLeaderboard,
  fetchWeeklyLeaderboard,
  getOrCreateDeviceId,
  getNextLocalMidnightDate,
  parseCountryInputToCode,
  getTodayDayKey,
  hasPlayedCompetitiveToday,
  isLeaderboardEnabled,
  sanitizeDisplayName,
  submitDailyScore,
} from "./leaderboard.js";
import { generateFunnyName } from "./nameGenerator.js";
import { countryCodeToFlagEmoji } from "./countryDisplay.js";
import { createBattleMode } from "./modes/battleMode.js";
import { createDailyPuzzleMode } from "./modes/dailyPuzzleMode.js";
import { createNormalMode } from "./modes/normalMode.js";
import { createMapSelectMode } from "./modes/mapSelectMode.js";
import { createRegionChainMode } from "./modes/regionChainMode.js";
import { createReverseBorderMode } from "./modes/reverseBorderMode.js";
import { createCountryAutocompleteManager } from "./countryAutocomplete.js";
import { createPlayedProgressStore } from "./playedProgress.js";

const PLAYER_NAME_STORAGE_KEY = "borderlinesPlayerName";
const PLAYER_COUNTRY_STORAGE_KEY = "borderlinesPlayerCountry";
const COMPETITIVE_PROGRESS_STORAGE_KEY = "borderlinesCompetitiveProgress";
const MAP_ASSIST_PREFS_STORAGE_KEY = "borderlinesMapAssistPrefs";
const LEGACY_PLAYER_NAME_STORAGE_KEY = "mapMysteryPlayerName";
const LEGACY_PLAYER_COUNTRY_STORAGE_KEY = "mapMysteryPlayerCountry";
const LEGACY_COMPETITIVE_PROGRESS_STORAGE_KEY = "mapMysteryCompetitiveProgress";
const COMPETITIVE_MODE_ID = "daily-puzzle";

const modeCards = document.getElementById("modeCards");
const outlineBackdrop = document.getElementById("outlineBackdrop");
const topNavRow = document.getElementById("topNavRow");
const headerDescription = document.getElementById("headerDescription");
const headerMeta = document.getElementById("headerMeta");
const headerModeLabel = document.getElementById("headerModeLabel");
const modeSelect = document.getElementById("modeSelect");
const openProgressBtn = document.getElementById("openProgressBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsPanel = document.getElementById("settingsPanel");
const nameEntryOverlay = document.getElementById("nameEntryOverlay");
const nameEntryPanel = document.getElementById("nameEntryPanel");
const nameEntryInput = document.getElementById("nameEntryInput");
const generateNameBtn = document.getElementById("generateNameBtn");
const nameEntryCountryInput = document.getElementById("nameEntryCountryInput");
const nameEntryCountryEmoji = document.getElementById("nameEntryCountryEmoji");
const nameEntryError = document.getElementById("nameEntryError");
const saveNameBtn = document.getElementById("saveNameBtn");
const cancelNameBtn = document.getElementById("cancelNameBtn");
const continentSelect = document.getElementById("continentSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const activeContinentLabel = document.getElementById("activeContinentLabel");
const gameSection = document.getElementById("gameSection");
const roundLabel = document.getElementById("roundLabel");
const scoreLabel = document.getElementById("scoreLabel");
const promptLabel = document.getElementById("promptLabel");
const hintLabel = document.getElementById("hintLabel");
const mapAssistRow = document.getElementById("mapAssistRow");
const mapAssistToggle = document.getElementById("mapAssistToggle");
const mapAssistToggleText = document.getElementById("mapAssistToggleText");
const worldMapWrap = document.getElementById("worldMapWrap");
const worldMapSvg = document.getElementById("worldMapSvg");
const mapZoomInBtn = document.getElementById("mapZoomInBtn");
const mapZoomOutBtn = document.getElementById("mapZoomOutBtn");
const singleWrap = document.getElementById("singleWrap");
const outlineSvg = document.getElementById("outlineSvg");
const duelWrap = document.getElementById("duelWrap");
const multiWrap = document.getElementById("multiWrap");
const leftSvg = document.getElementById("leftSvg");
const rightSvg = document.getElementById("rightSvg");
const leftTag = document.getElementById("leftTag");
const rightTag = document.getElementById("rightTag");
const textInputWrap = document.getElementById("textInputWrap");
const answerInput = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const chainBuilderWrap = document.getElementById("chainBuilderWrap");
const chainInput1 = document.getElementById("chainInput1");
const chainInput2 = document.getElementById("chainInput2");
const chainSubmitBtn = document.getElementById("chainSubmitBtn");
const chainPreviewCard1 = document.getElementById("chainPreviewCard1");
const chainPreviewCard2 = document.getElementById("chainPreviewCard2");
const chainPreview1 = document.getElementById("chainPreview1");
const chainPreview2 = document.getElementById("chainPreview2");
const choiceWrap = document.getElementById("choiceWrap");
const secondaryActions = document.getElementById("secondaryActions");
const revealBtn = document.getElementById("revealBtn");
const feedback = document.getElementById("feedback");
const resultOverlay = document.getElementById("resultOverlay");
const resultOverlayCard = document.getElementById("resultOverlayCard");
const resultOverlayMessage = document.getElementById("resultOverlayMessage");
const overlayNextBtn = document.getElementById("overlayNextBtn");
const finishCard = document.getElementById("finishCard");
const finalScore = document.getElementById("finalScore");
const playerNameLabel = document.getElementById("playerNameLabel");
const leaderboardWrap = document.getElementById("leaderboardWrap");
const leaderboardTitle = document.getElementById("leaderboardTitle");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardDailyTab = document.getElementById("leaderboardDailyTab");
const leaderboardWeeklyTab = document.getElementById("leaderboardWeeklyTab");
const backToModesBtn = document.getElementById("backToModesBtn");

let resolveNamePrompt = null;
let competitiveCountdownTimer = null;
let mapPointerStart = null;

function readStartupRequestFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const startMode = String(params.get("startMode") || "").trim();
    if (!startMode) {
      return null;
    }

    return {
      modeId: startMode,
      quizPool: String(params.get("quizPool") || "all").trim(),
      region: String(params.get("region") || "all-countries").trim(),
    };
  } catch {
    return null;
  }
}

function readOpenSettingsRequestFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = String(params.get("openSettings") || "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  } catch {
    return false;
  }
}

function clearStartupRequestFromUrl() {
  try {
    if (!window.location.search) {
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
  } catch {
    // Ignore history API failures.
  }
}

const countryAutocomplete = createCountryAutocompleteManager({
  getSourceData: () => state.activeData || state.data,
  normalizeInput: normalize,
  minChars: 3,
  maxSuggestions: 5,
});

const playedProgressStore = createPlayedProgressStore();

const modeCatalog = [
  {
    id: "daily-puzzle",
    title: "Competitive Mode",
    iconClass: "fa-solid fa-trophy",
    build: (data) => createDailyPuzzleMode(data),
  },
  {
    id: "normal",
    title: "Normal Mode",
    iconClass: "fa-solid fa-earth-americas",
    build: (data, options) => createNormalMode(data, Math.random, options),
  },
  {
    id: "map-select",
    title: "Map Select",
    iconClass: "fa-solid fa-hand-pointer",
    build: (data) => createMapSelectMode(data),
  },
  {
    id: "region-chain",
    title: "Region Chain",
    iconClass: "fa-solid fa-link",
    build: (data) => createRegionChainMode(data),
  },
  {
    id: "reverse-border",
    title: "Reverse Border",
    iconClass: "fa-solid fa-puzzle-piece",
    build: (data) => createReverseBorderMode(data),
  },
  {
    id: "battle",
    title: "Battle Mode",
    iconClass: "fa-solid fa-scale-balanced",
    build: (data) => createBattleMode(data),
  },
];

const state = {
  data: null,
  usStateData: null,
  ukAreaData: null,
  finlandAreaData: null,
  deferredRegionLoads: {
    worldFull: null,
    usStates: null,
    ukAreas: null,
    finlandAreas: null,
  },
  activeData: null,
  session: null,
  currentQuestion: null,
  selectedModeId: null,
  settings: {
    region: "all-countries",
    quizPool: "all",
  },
  deviceId: "",
  detectedCountry: null,
  playerCountry: null,
  todayKey: "",
  competitive: {
    playedToday: false,
    run: null,
    localProgress: null,
  },
  leaderboardPeriod: "daily",
  playerName: "",
  round: 0,
  score: 0,
  hasSubmitted: false,
  mapSelectReadyForNext: false,
};

let backdropRenderTimer = null;

function renderModeCardSkeletons() {
  if (!modeCards) {
    return;
  }

  modeCards.classList.add("is-loading");
  modeCards.innerHTML = "";
  for (let i = 0; i < modeCatalog.length; i += 1) {
    const card = document.createElement("div");
    card.className = "mode-card-skeleton";
    card.setAttribute("aria-hidden", "true");
    modeCards.appendChild(card);
  }
}

function loadUsStateDataDeferred() {
  if (state.usStateData) {
    return Promise.resolve(state.usStateData);
  }

  if (!state.deferredRegionLoads.usStates) {
    state.deferredRegionLoads.usStates = loadUsStateData()
      .then((data) => {
        state.usStateData = data;
        return data;
      })
      .catch((error) => {
        state.deferredRegionLoads.usStates = null;
        throw error;
      });
  }

  return state.deferredRegionLoads.usStates;
}

function loadWorldDataFullDeferred() {
  if (state.data?.meta?.fullData) {
    return Promise.resolve(state.data);
  }

  if (!state.deferredRegionLoads.worldFull) {
    state.deferredRegionLoads.worldFull = loadWorldGameDataFull()
      .then((data) => {
        state.data = data;
        if (!state.selectedModeId) {
          renderModeCards();
          renderOutlineBackdrop(state.data);
        }
        return data;
      })
      .catch((error) => {
        state.deferredRegionLoads.worldFull = null;
        throw error;
      });
  }

  return state.deferredRegionLoads.worldFull;
}

function loadUkAreaDataDeferred() {
  if (state.ukAreaData) {
    return Promise.resolve(state.ukAreaData);
  }

  if (!state.deferredRegionLoads.ukAreas) {
    state.deferredRegionLoads.ukAreas = loadUkAreaData()
      .then((data) => {
        state.ukAreaData = data;
        return data;
      })
      .catch((error) => {
        state.deferredRegionLoads.ukAreas = null;
        throw error;
      });
  }

  return state.deferredRegionLoads.ukAreas;
}

function loadFinlandAreaDataDeferred() {
  if (state.finlandAreaData) {
    return Promise.resolve(state.finlandAreaData);
  }

  if (!state.deferredRegionLoads.finlandAreas) {
    state.deferredRegionLoads.finlandAreas = loadFinlandAreaData()
      .then((data) => {
        state.finlandAreaData = data;
        return data;
      })
      .catch((error) => {
        state.deferredRegionLoads.finlandAreas = null;
        throw error;
      });
  }

  return state.deferredRegionLoads.finlandAreas;
}

async function ensureRegionDataLoaded(regionValue) {
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
  }
}

function warmSecondaryRegionDatasets() {
  // Warm region data in the background so first paint is not blocked by optional datasets.
  setTimeout(() => {
    void loadWorldDataFullDeferred();
    void loadUsStateDataDeferred();
    void loadUkAreaDataDeferred();
    void loadFinlandAreaDataDeferred();
  }, 0);
}

function loadMapAssistPrefs() {
  try {
    const raw = localStorage.getItem(MAP_ASSIST_PREFS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function readMapAssistPref(modeId) {
  const prefs = loadMapAssistPrefs();
  return typeof prefs?.[modeId] === "boolean" ? prefs[modeId] : null;
}

function writeMapAssistPref(modeId, enabled) {
  if (!modeId || typeof enabled !== "boolean") {
    return;
  }

  try {
    const prefs = loadMapAssistPrefs();
    prefs[modeId] = enabled;
    localStorage.setItem(MAP_ASSIST_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    // Ignore storage failures (private mode/quota limits).
  }
}

function resolveMapAssistDefaultForMode(modeId) {
  if (modeId === "region-chain") {
    const saved = readMapAssistPref(modeId);
    return saved ?? true;
  }

  if (modeId === "reverse-border") {
    const saved = readMapAssistPref(modeId);
    return saved ?? false;
  }

  return false;
}

const mapAssist = createMapAssistManager({
  mapAssistRow,
  mapAssistToggle,
  worldMapWrap,
  worldMapSvg,
  mapZoomInBtn,
  mapZoomOutBtn,
  getSourceData: () => state.activeData || state.data,
});

function setHomeViewClass(enabled) {
  document.body.classList.toggle("home-view", enabled);
}

function setHeaderGameMeta(enabled) {
  headerDescription.classList.toggle("hidden", enabled);
  headerMeta.classList.toggle("hidden", !enabled);
  document.body.classList.toggle("in-mode", enabled);
}

function setHeaderModeLabel(modeName = "") {
  if (!headerModeLabel) {
    return;
  }

  const clean = String(modeName || "").trim();
  headerModeLabel.textContent = clean;
  headerModeLabel.classList.toggle("hidden", !clean);
}

function setSettingsOpen(enabled) {
  settingsPanel.classList.toggle("hidden", !enabled);
  settingsOverlay.classList.toggle("hidden", !enabled);
  document.body.classList.toggle("settings-open", enabled);

  if (enabled) {
    continentSelect.focus();
  }
}

function getSeenSetForData(data) {
  return playedProgressStore.getSeenSet(data?.meta?.id);
}

function buildPlayedOnlyData(data) {
  if (!data?.countries?.length) {
    return null;
  }

  const seenSet = getSeenSetForData(data);
  const filteredCountries = data.countries.filter((country) =>
    seenSet.has(country.iso2),
  );

  if (!filteredCountries.length) {
    return null;
  }

  const isoSet = new Set(filteredCountries.map((country) => country.iso2));
  const countries = filteredCountries.map((country) => ({
    ...country,
    neighbors: new Set(
      [...(country.neighbors || [])].filter((iso2) => isoSet.has(iso2)),
    ),
  }));

  const iso2ToCountry = new Map(
    countries.map((country) => [country.iso2, country]),
  );

  countries.forEach((country) => {
    country.neighborNames = [...country.neighbors]
      .map((iso2) => iso2ToCountry.get(iso2)?.name)
      .filter(Boolean)
      .sort();
  });

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
      ...(data.meta || {}),
      quizPool: "played",
      regionLabel: `${data?.meta?.regionLabel || "Current Region"} (Played Only)`,
    },
  };
}

function recordSeenFromQuestion(question) {
  if (!question) {
    return;
  }

  const sourceData = state.activeData || state.data;
  const datasetId = sourceData?.meta?.id;
  if (!datasetId) {
    return;
  }

  const iso2List = Array.isArray(question.exposedIso2)
    ? question.exposedIso2
    : question.exposedIso2
      ? [question.exposedIso2]
      : [];

  if (!iso2List.length) {
    return;
  }

  playedProgressStore.markManySeen(datasetId, iso2List);
}

function setNameEntryOpen(enabled) {
  if (!nameEntryPanel || !nameEntryOverlay) {
    return;
  }

  nameEntryPanel.classList.toggle("hidden", !enabled);
  nameEntryOverlay.classList.toggle("hidden", !enabled);
  document.body.classList.toggle("name-modal-open", enabled);

  if (enabled) {
    nameEntryInput.focus();
    nameEntryInput.select();
  }
}

function resolveNamePromptResult(value) {
  if (!resolveNamePrompt) {
    return;
  }
  const resolve = resolveNamePrompt;
  resolveNamePrompt = null;
  resolve(value);
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

  // Keep rows separated by a fixed pixel step so short viewports never collide.
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

function getContinentOptions(data) {
  const set = new Set(
    data.countries.map((country) => country.continent).filter(Boolean),
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

function updateActiveFilterLabel() {
  const selected = getRegionOptions().find(
    (option) => option.value === state.settings.region,
  );
  activeContinentLabel.textContent = `Region: ${selected?.label || "All Countries"}`;
  activeContinentLabel.title = "Competitive Mode always uses All Countries.";
}

function getEffectiveRegionForMode(modeId) {
  return modeId === COMPETITIVE_MODE_ID
    ? "all-countries"
    : state.settings.region;
}

function getActiveVocabulary() {
  const sourceData = state.activeData || state.data;
  const singular = sourceData?.meta?.itemSingular || "country";
  const plural = sourceData?.meta?.itemPlural || "countries";
  const mapLabel = sourceData?.meta?.mapLabel || "world map";
  return {
    singular,
    plural,
    mapLabel,
    singularTitle: singular.charAt(0).toUpperCase() + singular.slice(1),
  };
}

function getModeCardVocabulary(modeId) {
  // Competitive always uses the world-country pool regardless of settings.
  if (modeId === COMPETITIVE_MODE_ID) {
    const worldMeta = state.data?.meta || {};
    return {
      singular: worldMeta.itemSingular || "country",
      plural: worldMeta.itemPlural || "countries",
      mapLabel: worldMeta.mapLabel || "world map",
    };
  }

  const previewData =
    buildActiveDataForRegion(state.settings.region) || state.data;
  return {
    singular: previewData?.meta?.itemSingular || "country",
    plural: previewData?.meta?.itemPlural || "countries",
    mapLabel: previewData?.meta?.mapLabel || "world map",
  };
}

function getModeDescription(modeId) {
  const { singular, plural, mapLabel } = getModeCardVocabulary(modeId);
  switch (modeId) {
    case COMPETITIVE_MODE_ID:
      return "A daily 5-question challenge with ranked leaderboard scoring (All Countries only).";
    case "normal":
      return `Classic ${singular}-outline guessing mode.`;
    case "map-select":
      return `Given a ${singular} name, click it on the ${mapLabel} and submit.`;
    case "region-chain":
      return `Build a valid 4-${singular} border chain between two ${plural}.`;
    case "reverse-border":
      return `You get neighboring ${plural} as clues. Guess the target ${singular}.`;
    case "battle":
      return `Two ${singular} outlines face off. Pick which has more land neighbors.`;
    default:
      return "Play a geography challenge mode.";
  }
}

function updateMapAssistLabel() {
  if (!mapAssistToggleText) {
    return;
  }
  const { mapLabel } = getActiveVocabulary();
  mapAssistToggleText.textContent = `${mapLabel} assist`;
  worldMapSvg.setAttribute("aria-label", `${mapLabel} helper`);
}

function setFeedback(message, kind = "") {
  feedback.textContent = message;
  feedback.className = `feedback ${kind}`.trim();
}

function loadStoredPlayerName() {
  try {
    const latest = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (latest) {
      return latest;
    }

    const legacy = localStorage.getItem(LEGACY_PLAYER_NAME_STORAGE_KEY) || "";
    if (legacy) {
      localStorage.setItem(PLAYER_NAME_STORAGE_KEY, legacy);
    }
    return legacy;
  } catch {
    return "";
  }
}

function normalizeCountryCode(rawCountry) {
  const clean = String(rawCountry || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(clean) ? clean : null;
}

function resolveCountryCodeFromInput(inputValue) {
  const parsed = parseCountryInputToCode(inputValue, state.detectedCountry);
  if (parsed) {
    return parsed;
  }

  const alias = normalize(inputValue || "");
  if (!alias) {
    return normalizeCountryCode(state.detectedCountry);
  }

  const fromGameData = state.data?.aliasToIso2?.get(alias) || null;
  return normalizeCountryCode(fromGameData);
}

function countryCodeToDisplayName(code) {
  const clean = normalizeCountryCode(code);
  if (!clean) {
    return "";
  }

  try {
    const displayName = new Intl.DisplayNames(["en"], { type: "region" }).of(
      clean,
    );
    return displayName || clean;
  } catch {
    return clean;
  }
}

function loadStoredPlayerCountry() {
  try {
    const latest = normalizeCountryCode(
      localStorage.getItem(PLAYER_COUNTRY_STORAGE_KEY),
    );
    if (latest) {
      return latest;
    }

    const legacy = normalizeCountryCode(
      localStorage.getItem(LEGACY_PLAYER_COUNTRY_STORAGE_KEY),
    );
    if (legacy) {
      localStorage.setItem(PLAYER_COUNTRY_STORAGE_KEY, legacy);
    }
    return legacy;
  } catch {
    return null;
  }
}

function loadCompetitiveProgress(dayKey) {
  try {
    const raw =
      localStorage.getItem(COMPETITIVE_PROGRESS_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_COMPETITIVE_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.modeId !== COMPETITIVE_MODE_ID ||
      parsed.dayKey !== dayKey
    ) {
      return null;
    }

    const answeredCount = Number.parseInt(parsed.answeredCount, 10);
    const score = Number.parseInt(parsed.score, 10);
    const maxScore = Number.parseInt(parsed.maxScore, 10);

    if (!Number.isInteger(answeredCount) || answeredCount < 0) {
      return null;
    }

    if (!Number.isInteger(score) || score < 0) {
      return null;
    }

    if (!Number.isInteger(maxScore) || maxScore <= 0) {
      return null;
    }

    const migrated = {
      modeId: COMPETITIVE_MODE_ID,
      dayKey,
      answeredCount: Math.min(answeredCount, maxScore),
      score: Math.min(score, maxScore),
      maxScore,
      completed: Boolean(parsed.completed),
    };

    // Normalize stored progress into the new key once loaded.
    localStorage.setItem(
      COMPETITIVE_PROGRESS_STORAGE_KEY,
      JSON.stringify(migrated),
    );
    return migrated;
  } catch {
    return null;
  }
}

function clearCompetitiveProgress() {
  try {
    localStorage.removeItem(COMPETITIVE_PROGRESS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_COMPETITIVE_PROGRESS_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function persistCompetitiveProgress(progress) {
  const safeProgress = {
    modeId: COMPETITIVE_MODE_ID,
    dayKey: progress.dayKey,
    answeredCount: Math.max(
      0,
      Number.parseInt(progress.answeredCount, 10) || 0,
    ),
    score: Math.max(0, Number.parseInt(progress.score, 10) || 0),
    maxScore: Math.max(1, Number.parseInt(progress.maxScore, 10) || 5),
    completed: Boolean(progress.completed),
  };

  safeProgress.answeredCount = Math.min(
    safeProgress.answeredCount,
    safeProgress.maxScore,
  );
  safeProgress.score = Math.min(safeProgress.score, safeProgress.maxScore);

  try {
    localStorage.setItem(
      COMPETITIVE_PROGRESS_STORAGE_KEY,
      JSON.stringify(safeProgress),
    );
  } catch {
    // Ignore storage failures.
  }

  state.competitive.localProgress = safeProgress;
}

function saveCompetitiveInProgressSnapshot() {
  if (
    state.selectedModeId !== COMPETITIVE_MODE_ID ||
    !state.session ||
    !state.todayKey
  ) {
    return;
  }

  const maxScore = state.session.totalRounds || 5;
  persistCompetitiveProgress({
    dayKey: state.todayKey,
    answeredCount: state.round,
    score: state.score,
    maxScore,
    completed: false,
  });
}

function savePlayerName(name, countryCode = state.playerCountry) {
  state.playerName = name;
  state.playerCountry = normalizeCountryCode(countryCode);
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
    if (state.playerCountry) {
      localStorage.setItem(PLAYER_COUNTRY_STORAGE_KEY, state.playerCountry);
    } else {
      localStorage.removeItem(PLAYER_COUNTRY_STORAGE_KEY);
    }
  } catch {
    // Local storage can fail in private browsing modes.
  }
  updatePlayerNameLabel();
}

function updatePlayerNameLabel() {
  if (!playerNameLabel) {
    return;
  }

  if (!state.playerName) {
    playerNameLabel.textContent = "Player: not set";
    return;
  }

  const activeCountry = state.playerCountry || detectPlayerCountry();
  const flag = countryCodeToFlagEmoji(activeCountry);
  playerNameLabel.textContent = flag
    ? `Player: ${flag} ${state.playerName}`
    : `Player: ${state.playerName}`;
}

function updateCountryEmojiPreview(inputValue) {
  if (!nameEntryCountryEmoji) {
    return;
  }

  const resolvedCode = resolveCountryCodeFromInput(inputValue);
  const flag = countryCodeToFlagEmoji(resolvedCode);
  nameEntryCountryEmoji.textContent = flag || "🌐";
}

function askForPlayerName() {
  if (!nameEntryPanel || !nameEntryOverlay) {
    const fallback = window.prompt(
      "Enter your display name (3-16 chars, letters/numbers/spaces/_).",
      state.playerName || "",
    );
    if (fallback === null) {
      return Promise.resolve(null);
    }
    const validation = sanitizeDisplayName(fallback);
    if (!validation.ok) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      name: validation.value,
      countryCode: state.playerCountry,
    });
  }

  nameEntryInput.value = state.playerName || "";
  if (nameEntryCountryInput) {
    nameEntryCountryInput.value = countryCodeToDisplayName(state.playerCountry);
    updateCountryEmojiPreview(nameEntryCountryInput.value);
  }
  nameEntryError.textContent = "";
  setNameEntryOpen(true);

  return new Promise((resolve) => {
    resolveNamePrompt = resolve;
  });
}

async function ensureCompetitiveName(modeId) {
  if (modeId !== COMPETITIVE_MODE_ID || !isLeaderboardEnabled()) {
    return true;
  }

  const currentValidation = sanitizeDisplayName(state.playerName);
  if (currentValidation.ok) {
    return true;
  }

  const pickedProfile = await askForPlayerName();
  if (!pickedProfile) {
    return false;
  }

  savePlayerName(pickedProfile.name, pickedProfile.countryCode);
  return true;
}

async function ensureCompetitiveDailyEligibility(modeId) {
  if (modeId !== COMPETITIVE_MODE_ID || !isLeaderboardEnabled()) {
    return true;
  }

  const localProgress = state.competitive.localProgress;
  if (localProgress && localProgress.dayKey === state.todayKey) {
    if (localProgress.completed) {
      window.alert(
        "You already played Competitive Mode today. Come back tomorrow.",
      );
      return false;
    }

    // Incomplete local run means we should resume instead of restarting.
    if (localProgress.answeredCount < localProgress.maxScore) {
      return true;
    }
  }

  const result = await hasPlayedCompetitiveToday(state.deviceId);
  if (!result.ok) {
    window.alert(result.message || "Could not verify today's eligibility.");
    return false;
  }

  if (!result.played) {
    return true;
  }

  window.alert(
    "You already played Competitive Mode today. Come back tomorrow.",
  );
  return false;
}

function getNextMidnightDate() {
  return getNextLocalMidnightDate();
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0",
  );
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function getCompetitiveCardDetail() {
  const localProgress = state.competitive.localProgress;
  if (
    localProgress &&
    !localProgress.completed &&
    localProgress.dayKey === state.todayKey
  ) {
    const nextQuestion = Math.min(localProgress.answeredCount + 1, 5);
    return `Resume today's run: question ${nextQuestion}/5, score ${localProgress.score}/5.`;
  }

  if (!state.competitive.playedToday) {
    return "A daily 5-question challenge with ranked leaderboard scoring.";
  }

  const score = Number.isInteger(state.competitive.run?.score)
    ? state.competitive.run.score
    : 0;
  const maxScore = Number.isInteger(state.competitive.run?.max_score)
    ? state.competitive.run.max_score
    : 5;
  const remaining = getNextMidnightDate().getTime() - Date.now();
  return `Today's result: ${score}/${maxScore}. Tap to view again. New round in ${formatCountdown(remaining)}.`;
}

function renderFinalScoreSummary(scoreValue, maxScoreValue) {
  const score = Math.max(0, Number.parseInt(scoreValue, 10) || 0);
  const maxScore = Math.max(1, Number.parseInt(maxScoreValue, 10) || 1);
  const accuracy = maxScore ? Math.round((score / maxScore) * 100) : 0;
  const accuracyLabel =
    accuracy >= 90
      ? "Elite run"
      : accuracy >= 70
        ? "Strong run"
        : accuracy >= 50
          ? "Solid attempt"
          : "Keep training";

  finalScore.innerHTML = `
    <div class="score-summary-label">Final Score</div>
    <div class="score-summary-value">
      <span class="score-summary-main">${score}</span>
      <span class="score-summary-divider">/</span>
      <span class="score-summary-max">${maxScore}</span>
    </div>
    <div class="score-summary-meta">
      <span>${accuracy}% accuracy</span>
      <span class="score-summary-dot" aria-hidden="true"></span>
      <span>${accuracyLabel}</span>
    </div>
  `;
}

function openCompetitiveResultCard() {
  if (!state.competitive.playedToday) {
    return;
  }

  const score = Number.isInteger(state.competitive.run?.score)
    ? state.competitive.run.score
    : 0;
  const maxScore = Number.isInteger(state.competitive.run?.max_score)
    ? state.competitive.run.max_score
    : 5;

  state.session = null;
  state.activeData = null;
  state.currentQuestion = null;
  state.selectedModeId = COMPETITIVE_MODE_ID;
  document.body.classList.remove("mode-reverse-border");

  modeSelect.classList.add("hidden");
  gameSection.classList.add("hidden");
  finishCard.classList.remove("hidden");
  topNavRow.classList.remove("hidden");
  worldMapWrap.classList.add("hidden");
  worldMapSvg.innerHTML = "";
  resultOverlay.classList.add("hidden");
  setFeedback("");
  setHomeViewClass(false);
  setHeaderGameMeta(false);
  setHeaderModeLabel("Competitive Mode");
  updateMapAssistLabel();

  renderFinalScoreSummary(score, maxScore);

  if (leaderboardWrap) {
    leaderboardWrap.classList.remove("hidden");
  }

  if (isLeaderboardEnabled()) {
    const periodLabel = getLeaderboardPeriodLabel(state.leaderboardPeriod);
    setLeaderboardStatus(`Loading ${periodLabel.toLowerCase()} leaderboard...`);
    void refreshDailyLeaderboard({
      autoScrollToMine: true,
      period: state.leaderboardPeriod,
    });
  } else {
    renderLeaderboardRows([]);
    setLeaderboardStatus(
      "Leaderboard disabled until Supabase keys are configured.",
      "wrong",
    );
  }
}

async function refreshCompetitiveState() {
  state.todayKey = getTodayDayKey();
  state.competitive.localProgress = loadCompetitiveProgress(state.todayKey);

  if (!state.competitive.localProgress) {
    clearCompetitiveProgress();
  }

  if (!isLeaderboardEnabled()) {
    state.competitive.playedToday = Boolean(
      state.competitive.localProgress?.completed,
    );
    state.competitive.run = null;
    return;
  }

  const [playedResult, runResult] = await Promise.all([
    hasPlayedCompetitiveToday(state.deviceId),
    fetchMyCompetitiveRunToday(state.deviceId),
  ]);

  if (!playedResult.ok) {
    if (state.competitive.localProgress?.completed) {
      state.competitive.playedToday = true;
      state.competitive.run = {
        score: state.competitive.localProgress.score,
        max_score: state.competitive.localProgress.maxScore,
        played_at: null,
      };
      return;
    }

    state.competitive.playedToday = false;
    state.competitive.run = null;
    return;
  }

  if (playedResult.played) {
    state.competitive.playedToday = true;
    state.competitive.run = runResult.ok ? runResult.row : null;
    return;
  }

  if (state.competitive.localProgress?.completed) {
    state.competitive.playedToday = true;
    state.competitive.run = {
      score: state.competitive.localProgress.score,
      max_score: state.competitive.localProgress.maxScore,
      played_at: null,
    };
    return;
  }

  state.competitive.playedToday = false;
  state.competitive.run = null;
}

async function refreshCompetitiveStateAndUi() {
  await refreshCompetitiveState();
  renderModeCards();
}

function updateCompetitiveCardDetailText() {
  if (!modeCards) {
    return;
  }

  const competitiveCard = modeCards.querySelector(
    `[data-mode-id="${COMPETITIVE_MODE_ID}"]`,
  );
  if (!competitiveCard) {
    return;
  }

  const detailEl = competitiveCard.querySelector(".mode-card-copy > span");
  if (!detailEl) {
    return;
  }

  detailEl.textContent = getCompetitiveCardDetail();
}

function startCompetitiveCountdownTimer() {
  if (competitiveCountdownTimer) {
    clearInterval(competitiveCountdownTimer);
  }

  competitiveCountdownTimer = setInterval(() => {
    if (!state.competitive.playedToday) {
      return;
    }

    updateCompetitiveCardDetailText();

    const currentDayKey = getTodayDayKey();
    if (currentDayKey !== state.todayKey) {
      void refreshCompetitiveStateAndUi();
    }
  }, 1000);
}

function setLeaderboardStatus(message, kind = "") {
  if (!leaderboardStatus) {
    return;
  }
  leaderboardStatus.textContent = message;
  leaderboardStatus.className = `leaderboard-status ${kind}`.trim();
}

function getLeaderboardPeriodLabel(period = "daily") {
  return period === "weekly" ? "Weekly" : "Daily";
}

function updateLeaderboardTabUi() {
  if (leaderboardDailyTab) {
    const isDaily = state.leaderboardPeriod === "daily";
    leaderboardDailyTab.classList.toggle("is-active", isDaily);
    leaderboardDailyTab.setAttribute("aria-selected", String(isDaily));
  }

  if (leaderboardWeeklyTab) {
    const isWeekly = state.leaderboardPeriod === "weekly";
    leaderboardWeeklyTab.classList.toggle("is-active", isWeekly);
    leaderboardWeeklyTab.setAttribute("aria-selected", String(isWeekly));
  }

  if (leaderboardTitle) {
    leaderboardTitle.textContent = `Competitive Mode ${getLeaderboardPeriodLabel(state.leaderboardPeriod)} Leaderboard`;
  }
}

function setLeaderboardPeriod(period = "daily") {
  state.leaderboardPeriod = period === "weekly" ? "weekly" : "daily";
  updateLeaderboardTabUi();
}

function getLeaderboardRowMatchScore(row) {
  const cleanDeviceId = String(state.deviceId || "").trim();
  if (cleanDeviceId && row.device_id === cleanDeviceId) {
    return 100;
  }

  const run = state.competitive.run || {};
  let score = 0;

  if (run.display_name && row.display_name === run.display_name) {
    score += 30;
  }

  if (Number.isInteger(run.score) && Number.isInteger(row.score)) {
    if (row.score === run.score) {
      score += 20;
    }
  }

  if (Number.isInteger(run.max_score) && Number.isInteger(row.max_score)) {
    if (row.max_score === run.max_score) {
      score += 10;
    }
  }

  if (
    run.player_country &&
    row.player_country &&
    run.player_country === row.player_country
  ) {
    score += 10;
  }

  if (run.played_at && row.played_at && run.played_at === row.played_at) {
    score += 25;
  }

  return score;
}

function findMyLeaderboardRowIndex(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return -1;
  }

  const deviceMatch = rows.findIndex((row) => {
    const cleanDeviceId = String(state.deviceId || "").trim();
    return cleanDeviceId && row.device_id === cleanDeviceId;
  });
  if (deviceMatch >= 0) {
    return deviceMatch;
  }

  let bestIndex = -1;
  let bestScore = 0;

  rows.forEach((row, idx) => {
    const score = getLeaderboardRowMatchScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  });

  return bestScore >= 50 ? bestIndex : -1;
}

function renderLeaderboardRows(rows, options = {}) {
  if (!leaderboardList) {
    return;
  }

  const { autoScrollToMine = false, period = "daily" } = options;

  leaderboardList.innerHTML = "";

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "leaderboard-row";
    li.textContent =
      period === "weekly"
        ? "No scores submitted yet this week."
        : "No scores submitted yet today.";
    leaderboardList.appendChild(li);
    return;
  }

  const myRowIndex = findMyLeaderboardRowIndex(rows);
  let myRowEl = null;

  rows.forEach((row, idx) => {
    const li = document.createElement("li");
    li.className = "leaderboard-row";

    if (idx === myRowIndex) {
      li.classList.add("me");
      myRowEl = li;
    }

    const name = row.display_name || "Anonymous";
    const flag = countryCodeToFlagEmoji(row.player_country);
    const score = Number.isInteger(row.score) ? row.score : 0;
    const maxScore = Number.isInteger(row.max_score) ? row.max_score : 0;
    const stamp = row.played_at
      ? period === "weekly"
        ? new Date(row.played_at).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })
        : new Date(row.played_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
      : period === "weekly"
        ? "-- --"
        : "--:--";

    const rankEl = document.createElement("span");
    rankEl.className = "lb-rank";
    rankEl.textContent = `#${idx + 1}`;

    const nameEl = document.createElement("span");
    nameEl.className = "lb-name";
    nameEl.textContent = flag ? `${flag} ${name}` : name;

    const scoreEl = document.createElement("span");
    scoreEl.className = "lb-score";
    scoreEl.textContent = `${score}/${maxScore}`;

    const timeEl = document.createElement("span");
    timeEl.className = "lb-time";
    timeEl.textContent = stamp;

    li.appendChild(rankEl);
    li.appendChild(nameEl);
    li.appendChild(scoreEl);
    li.appendChild(timeEl);

    if (idx === myRowIndex) {
      const youEl = document.createElement("span");
      youEl.className = "lb-you";
      youEl.textContent = "You";
      li.appendChild(youEl);
    }

    leaderboardList.appendChild(li);
  });

  const shouldScroll =
    autoScrollToMine &&
    myRowEl &&
    !leaderboardWrap?.classList.contains("hidden") &&
    !finishCard?.classList.contains("hidden");

  if (shouldScroll) {
    requestAnimationFrame(() => {
      myRowEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });
  }
}

async function refreshDailyLeaderboard(options = {}) {
  const {
    autoScrollToMine = false,
    period = state.leaderboardPeriod || "daily",
  } = options;

  setLeaderboardPeriod(period);
  const periodLabel = getLeaderboardPeriodLabel(state.leaderboardPeriod);

  if (!isLeaderboardEnabled()) {
    renderLeaderboardRows([], { period: state.leaderboardPeriod });
    setLeaderboardStatus(
      "Leaderboard disabled until Supabase keys are configured.",
      "wrong",
    );
    return;
  }

  const result =
    state.leaderboardPeriod === "weekly"
      ? await fetchWeeklyLeaderboard(20)
      : await fetchDailyLeaderboard(20);

  if (!result.ok) {
    renderLeaderboardRows([], { period: state.leaderboardPeriod });
    setLeaderboardStatus(
      result.message || "Failed to load leaderboard.",
      "wrong",
    );
    return;
  }

  renderLeaderboardRows(result.rows || [], {
    autoScrollToMine,
    period: state.leaderboardPeriod,
  });
  setLeaderboardStatus(`Showing ${periodLabel.toLowerCase()} top scores.`);
}

async function submitCompetitiveScore(maxScore) {
  if (!isLeaderboardEnabled()) {
    setLeaderboardStatus(
      "Set Supabase URL and anon key in js/supabaseConfig.js to enable leaderboard.",
      "wrong",
    );
    return;
  }

  if (!state.playerName) {
    setLeaderboardStatus("Set a player name to submit your score.", "wrong");
    return;
  }

  setLeaderboardStatus("Submitting score...");
  const submitResult = await submitDailyScore({
    displayName: state.playerName,
    score: state.score,
    maxScore,
    continent: "All",
    deviceId: state.deviceId,
    playerCountry: state.playerCountry || detectPlayerCountry(),
  });

  if (!submitResult.ok) {
    setLeaderboardStatus(
      submitResult.message || "Could not submit score.",
      "wrong",
    );
    return;
  }

  state.competitive.playedToday = true;
  state.competitive.run = {
    score: state.score,
    max_score: maxScore,
    played_at: new Date().toISOString(),
    display_name: state.playerName,
    player_country: state.playerCountry || detectPlayerCountry(),
  };
  clearCompetitiveProgress();
  state.competitive.localProgress = null;
  renderModeCards();

  setLeaderboardStatus("Score submitted. Refreshing leaderboard...");
  await refreshDailyLeaderboard({ autoScrollToMine: true });
}

function renderModeCards() {
  modeCards.classList.remove("is-loading");
  modeCards.innerHTML = "";

  modeCatalog.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-card";
    btn.setAttribute("data-mode-id", mode.id);

    const isCompetitive = mode.id === COMPETITIVE_MODE_ID;
    const resumableToday =
      isCompetitive &&
      state.competitive.localProgress?.dayKey === state.todayKey &&
      !state.competitive.localProgress?.completed;
    const lockedToday = isCompetitive && state.competitive.playedToday;
    const description = isCompetitive
      ? getCompetitiveCardDetail()
      : getModeDescription(mode.id);

    if (isCompetitive) {
      if (lockedToday) {
        btn.classList.add("competitive-played");
      } else if (resumableToday) {
        btn.classList.add("competitive-unfinished");
      }
    }

    btn.innerHTML = `
      <span class="mode-card-top">
        <span class="mode-card-icon" aria-hidden="true">
          <i class="${mode.iconClass || "fa-solid fa-shapes"}"></i>
        </span>
        <span class="mode-card-copy">
          <strong>${mode.title}</strong>
          <span>${description}</span>
        </span>
      </span>
    `;

    if (lockedToday || resumableToday) {
      const lockNote = document.createElement("span");
      lockNote.className = "mode-lock-note";
      lockNote.textContent = lockedToday
        ? "View today's result"
        : "Resume available";
      btn.appendChild(lockNote);
    }

    btn.addEventListener("click", () => {
      if (isCompetitive && lockedToday) {
        openCompetitiveResultCard();
        return;
      }

      state.settings.quizPool = "all";
      void startMode(mode.id);
    });
    modeCards.appendChild(btn);
  });
}

function renderVisuals(visuals) {
  singleWrap.classList.add("hidden");
  duelWrap.classList.add("hidden");
  multiWrap.classList.add("hidden");
  multiWrap.innerHTML = "";

  if (!visuals || visuals.layout === "none") {
    return;
  }

  const renderMiniOutlineCard = (item) => {
    const card = document.createElement("div");
    card.className = "mini-outline-card";

    const label = document.createElement("span");
    label.className = "mini-outline-label";
    label.textContent = item.label || "Clue";
    card.appendChild(label);

    if (item?.isUnknown) {
      card.classList.add("unknown-slot");
      const mark = document.createElement("span");
      mark.className = "mini-outline-mark";
      mark.textContent = "?";
      mark.setAttribute("aria-hidden", "true");
      card.appendChild(mark);
      multiWrap.appendChild(card);
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 640 380");
    svg.setAttribute("class", "mini-outline-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", item.label || "Clue outline");

    card.appendChild(svg);
    multiWrap.appendChild(card);
    drawOutline(svg, item.feature);
  };

  if (visuals.layout === "reverse-clue") {
    if (visuals.feature) {
      singleWrap.classList.remove("hidden");
      drawOutline(outlineSvg, visuals.feature);
    }

    if (Array.isArray(visuals.items) && visuals.items.length) {
      multiWrap.classList.remove("hidden");
      visuals.items.forEach((item) => {
        renderMiniOutlineCard(item);
      });
    }
    return;
  }

  if (visuals.layout === "single" && visuals.feature) {
    singleWrap.classList.remove("hidden");
    drawOutline(outlineSvg, visuals.feature);
    return;
  }

  if (
    visuals.layout === "duel" &&
    visuals.leftFeature &&
    visuals.rightFeature
  ) {
    if (state.selectedModeId === "region-chain") {
      return;
    }

    duelWrap.classList.remove("hidden");
    leftTag.textContent = visuals.leftLabel || "A";
    rightTag.textContent = visuals.rightLabel || "B";
    drawOutline(leftSvg, visuals.leftFeature);
    drawOutline(rightSvg, visuals.rightFeature);
    return;
  }

  if (
    visuals.layout === "multi" &&
    Array.isArray(visuals.items) &&
    visuals.items.length
  ) {
    multiWrap.classList.remove("hidden");
    visuals.items.forEach((item) => {
      renderMiniOutlineCard(item);
    });
  }
}

function updateChainPreview(inputEl, svgEl) {
  const cardEl =
    svgEl === chainPreview1 ? chainPreviewCard1 : chainPreviewCard2;
  const value = inputEl.value.trim();
  const sourceData = state.activeData || state.data;
  const iso2 = sourceData?.aliasToIso2?.get(normalize(value));
  const country = iso2 ? sourceData.iso2ToCountry.get(iso2) : null;

  if (!country) {
    svgEl.innerHTML = "";
    cardEl.classList.add("hidden");
    return;
  }

  cardEl.classList.remove("hidden");
  drawOutline(svgEl, country.feature);
}

function shouldEnableCountryAutocomplete(input) {
  if (!input || input.type !== "text") {
    return false;
  }

  const prompt = String(state.currentQuestion?.prompt || "");
  const hint = String(state.currentQuestion?.hint || "");
  const placeholder = String(input.placeholder || "");
  const context = `${prompt} ${hint} ${placeholder}`.toLowerCase();
  return /(country|state|province|territory|region|name)/.test(context);
}

function renderInput(input) {
  textInputWrap.classList.add("hidden");
  textInputWrap.classList.remove("docked-input");
  secondaryActions.classList.remove("paired-with-input");
  secondaryActions.classList.remove("paired-with-choice");
  secondaryActions.classList.remove("paired-with-chain");
  chainBuilderWrap.classList.add("hidden");
  chainBuilderWrap.classList.remove("without-inline-submit");
  choiceWrap.classList.add("hidden");
  choiceWrap.classList.remove("docked-choice");
  secondaryActions.classList.remove("hidden");
  revealBtn.classList.remove("hidden");
  revealBtn.textContent = "Reveal";
  revealBtn.disabled = false;
  submitBtn.classList.add("hidden");
  chainSubmitBtn.classList.add("hidden");
  choiceWrap.innerHTML = "";
  countryAutocomplete.setEnabled(answerInput, false);
  countryAutocomplete.setEnabled(chainInput1, false);
  countryAutocomplete.setEnabled(chainInput2, false);

  if (input.type === "choice") {
    choiceWrap.classList.remove("hidden");
    choiceWrap.classList.add("docked-choice");
    secondaryActions.classList.add("paired-with-choice");
    input.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = option.label;
      btn.addEventListener("click", () => submitAnswer(option.value));
      choiceWrap.appendChild(btn);
    });
    return;
  }

  if (input.type === "chain-builder") {
    const { singular } = getActiveVocabulary();
    chainBuilderWrap.classList.remove("hidden");
    chainBuilderWrap.classList.add("without-inline-submit");
    secondaryActions.classList.add("paired-with-chain");
    submitBtn.classList.remove("hidden");
    submitBtn.textContent = "Submit Chain";
    chainInput1.value = "";
    chainInput2.value = "";
    chainInput1.placeholder =
      input.placeholders?.[0] || `First middle ${singular}`;
    chainInput2.placeholder =
      input.placeholders?.[1] || `Second middle ${singular}`;
    chainPreview1.innerHTML = "";
    chainPreview2.innerHTML = "";
    chainPreviewCard1.classList.add("hidden");
    chainPreviewCard2.classList.add("hidden");
    countryAutocomplete.setEnabled(chainInput1, true);
    countryAutocomplete.setEnabled(chainInput2, true);
    return;
  }

  if (input.type === "map-select") {
    textInputWrap.classList.add("hidden");
    submitBtn.classList.remove("hidden");
    answerInput.classList.add("hidden");
    answerInput.value = "";
    answerInput.type = "text";
    answerInput.placeholder = "";
    answerInput.readOnly = true;
    submitBtn.textContent = "Submit Selection";
    return;
  }

  textInputWrap.classList.remove("hidden");
  textInputWrap.classList.add("docked-input");
  secondaryActions.classList.add("paired-with-input");
  submitBtn.classList.remove("hidden");
  answerInput.classList.remove("hidden");
  submitBtn.textContent = "Submit";
  answerInput.readOnly = false;
  answerInput.value = "";
  answerInput.type = input.type === "number" ? "number" : "text";
  answerInput.placeholder = input.placeholder || "Type answer";
  countryAutocomplete.setEnabled(
    answerInput,
    shouldEnableCountryAutocomplete(input),
  );
}

function finalizeAnswer(result) {
  state.hasSubmitted = true;
  state.score += result.points || 0;
  recordSeenFromQuestion(state.currentQuestion);
  updateStatus();
  saveCompetitiveInProgressSnapshot();
  const shouldResetMapAssistZoom =
    state.currentQuestion?.input?.type === "map-select";
  mapAssist.renderWorldAssist(state.currentQuestion, state.hasSubmitted, {
    resetZoom: shouldResetMapAssistZoom,
  });

  if (state.currentQuestion?.input?.type === "map-select") {
    setFeedback(result.message, result.correct ? "correct" : "wrong");
    revealBtn.disabled = true;
    submitBtn.disabled = false;
    submitBtn.textContent = "Next";
    state.mapSelectReadyForNext = true;
    return;
  }

  resultOverlayMessage.textContent = result.message;
  resultOverlayCard.classList.add(result.correct ? "correct" : "wrong");
  resultOverlay.classList.remove("hidden");

  submitBtn.disabled = true;
  revealBtn.disabled = true;
  answerInput.disabled = true;
  chainSubmitBtn.disabled = true;
  chainInput1.disabled = true;
  chainInput2.disabled = true;
  [...choiceWrap.querySelectorAll("button")].forEach((btn) => {
    btn.disabled = true;
  });

  overlayNextBtn.focus();
}

function updateStatus() {
  if (!state.session) {
    roundLabel.textContent = "Round 0 / 0";
    scoreLabel.textContent = "Score: 0";
    headerMeta.innerHTML = "";
    return;
  }

  roundLabel.textContent = `Round ${state.round} / ${state.session.totalRounds}`;
  scoreLabel.textContent = `Score: ${state.score}`;
  headerMeta.innerHTML = `
    <span class="meta-pill">Questions ${state.round}/${state.session.totalRounds}</span>
    <span class="meta-pill">Score ${state.score}</span>
  `;
}

function applyMapAssistDefault(question) {
  if (question?.mapAssistPolicy === "disabled") {
    mapAssistToggle.checked = false;
    return;
  }

  if (
    state.selectedModeId === "reverse-border" ||
    state.selectedModeId === "region-chain"
  ) {
    const saved = readMapAssistPref(state.selectedModeId);
    if (typeof saved === "boolean") {
      mapAssistToggle.checked = saved;
      return;
    }
  }

  if (typeof question?.mapAssistDefaultOn === "boolean") {
    mapAssistToggle.checked = question.mapAssistDefaultOn;
  }
}

function updateWorldMapInteractionMode() {
  if (!worldMapSvg) {
    return;
  }

  const isMapSelect = state.currentQuestion?.input?.type === "map-select";
  worldMapSvg.classList.toggle("map-select-mode", isMapSelect);
}

function showQuestion() {
  state.currentQuestion = state.session.nextQuestion();
  state.hasSubmitted = false;
  state.mapSelectReadyForNext = false;
  setFeedback("");
  resultOverlay.classList.add("hidden");
  resultOverlayCard.classList.remove("correct", "wrong");

  if (!state.currentQuestion) {
    finishGame();
    return;
  }

  state.round += 1;
  updateStatus();

  promptLabel.textContent = state.currentQuestion.prompt;
  hintLabel.textContent = state.currentQuestion.hint || "";
  updateWorldMapInteractionMode();
  applyMapAssistDefault(state.currentQuestion);
  mapAssist.renderWorldAssist(state.currentQuestion, state.hasSubmitted, {
    resetZoom: true,
  });
  renderVisuals(state.currentQuestion.visuals || { layout: "none" });
  renderInput(state.currentQuestion.input || { type: "text" });
}

function submitAnswer(rawAnswer) {
  if (!state.currentQuestion || state.hasSubmitted) {
    return;
  }

  const inputType = state.currentQuestion.input?.type || "text";
  let hasAnswer = true;

  if (inputType === "map-select") {
    hasAnswer = String(rawAnswer || "").trim().length > 0;
  } else if (inputType === "chain-builder") {
    hasAnswer =
      Array.isArray(rawAnswer) &&
      rawAnswer.length >= 2 &&
      rawAnswer.every((part) => String(part || "").trim().length > 0);
  } else if (inputType !== "choice") {
    hasAnswer = String(rawAnswer || "").trim().length > 0;
  }

  if (!hasAnswer) {
    if (inputType === "map-select") {
      const { singular, mapLabel } = getActiveVocabulary();
      setFeedback(`Select a ${singular} on the ${mapLabel} first.`, "wrong");
      return;
    }

    if (inputType === "chain-builder") {
      setFeedback("Enter both middle countries before submitting.", "wrong");
      if (!String(chainInput1.value || "").trim()) {
        chainInput1.focus();
      } else {
        chainInput2.focus();
      }
      return;
    }

    setFeedback("Enter an answer before submitting.", "wrong");
    answerInput.focus();
    return;
  }

  const result = state.currentQuestion.submit(rawAnswer);
  finalizeAnswer(result);
}

function applyWorldMapSelectionForEvent(event) {
  if (!state.currentQuestion || state.hasSubmitted) {
    return;
  }

  if (mapAssist.shouldIgnoreSelectionEvent()) {
    return;
  }

  if (state.currentQuestion.input?.type !== "map-select") {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const countryPath = target?.closest?.(".world-country");
  if (!countryPath) {
    return;
  }

  const iso2 = countryPath.getAttribute("data-iso2");
  if (!iso2) {
    return;
  }

  if (typeof state.currentQuestion.setSelection === "function") {
    state.currentQuestion.setSelection(iso2);
  }

  // Keep selection silent to avoid revealing country names.
  if (!state.hasSubmitted) {
    setFeedback("");
  }
  mapAssist.renderWorldAssist(state.currentQuestion, false);
}

function handleWorldMapPointerDown(event) {
  if (!state.currentQuestion || state.hasSubmitted) {
    return;
  }

  if (state.currentQuestion.input?.type !== "map-select") {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  mapPointerStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    at: Date.now(),
  };
}

function handleWorldMapPointerUp(event) {
  if (!mapPointerStart) {
    return;
  }

  if (event.pointerId !== mapPointerStart.pointerId) {
    return;
  }

  const dx = event.clientX - mapPointerStart.x;
  const dy = event.clientY - mapPointerStart.y;
  const moved = Math.hypot(dx, dy) > 14;
  const heldTooLong = Date.now() - mapPointerStart.at > 1200;
  mapPointerStart = null;

  if (moved || heldTooLong) {
    return;
  }

  applyWorldMapSelectionForEvent(event);
}

function handleWorldMapPointerCancel() {
  mapPointerStart = null;
}

function revealAnswer() {
  if (!state.currentQuestion || state.hasSubmitted) {
    return;
  }

  if (state.currentQuestion.input?.type === "map-select") {
    const result =
      typeof state.currentQuestion.reveal === "function"
        ? state.currentQuestion.reveal()
        : {
            correct: false,
            points: 0,
            message: "Revealed on map.",
          };

    state.hasSubmitted = true;
    recordSeenFromQuestion(state.currentQuestion);
    updateStatus();
    saveCompetitiveInProgressSnapshot();
    mapAssist.renderWorldAssist(state.currentQuestion, state.hasSubmitted, {
      resetZoom: true,
    });
    setFeedback(result.message || "Revealed on map.", "wrong");
    revealBtn.disabled = true;
    submitBtn.disabled = false;
    submitBtn.textContent = "Next";
    state.mapSelectReadyForNext = true;
    return;
  }

  const result =
    typeof state.currentQuestion.reveal === "function"
      ? state.currentQuestion.reveal()
      : {
          correct: false,
          points: 0,
          message: "Answer reveal is not available for this question.",
        };

  finalizeAnswer({
    correct: false,
    points: 0,
    ...result,
  });
}

function finishGame() {
  gameSection.classList.add("hidden");
  finishCard.classList.remove("hidden");
  topNavRow.classList.remove("hidden");
  setHeaderGameMeta(false);
  headerDescription.classList.add("hidden");
  headerMeta.classList.add("hidden");

  const maxScore = state.session?.totalRounds || state.round || 0;
  renderFinalScoreSummary(state.score, maxScore);

  if (state.selectedModeId === COMPETITIVE_MODE_ID && leaderboardWrap) {
    persistCompetitiveProgress({
      dayKey: state.todayKey,
      answeredCount: maxScore,
      score: state.score,
      maxScore,
      completed: true,
    });
    state.competitive.playedToday = true;
    state.competitive.run = {
      score: state.score,
      max_score: maxScore,
      played_at: new Date().toISOString(),
      display_name: state.playerName || "",
      player_country: state.playerCountry || detectPlayerCountry(),
    };
    renderModeCards();

    leaderboardWrap.classList.remove("hidden");
    void submitCompetitiveScore(maxScore);
    return;
  }

  if (leaderboardWrap) {
    leaderboardWrap.classList.add("hidden");
  }
}

async function startMode(modeId) {
  const modeDef = modeCatalog.find((mode) => mode.id === modeId);
  if (!modeDef) {
    return;
  }

  const canStart = await ensureCompetitiveName(modeId);
  if (!canStart) {
    return;
  }

  const canPlayToday = await ensureCompetitiveDailyEligibility(modeId);
  if (!canPlayToday) {
    return;
  }

  try {
    await loadWorldDataFullDeferred();
  } catch (error) {
    console.error(error);
    setFeedback(
      "Could not load full world dataset. Please try again.",
      "wrong",
    );
    return;
  }

  const isPlayedOnlyNormalQuiz =
    modeId === "normal" && state.settings.quizPool === "played";
  if (modeId !== "normal") {
    state.settings.quizPool = "all";
  }
  const effectiveRegion = getEffectiveRegionForMode(modeId);

  try {
    await ensureRegionDataLoaded(effectiveRegion);
  } catch (error) {
    console.error(error);
    setFeedback(
      "Could not load the selected region dataset. Please try again.",
      "wrong",
    );
    return;
  }

  state.activeData = buildActiveDataForRegion(effectiveRegion);
  if (!state.activeData?.countries?.length) {
    setFeedback("Still loading data. Please try again in a moment.", "wrong");
    return;
  }

  if (isPlayedOnlyNormalQuiz) {
    const playedOnlyData = buildPlayedOnlyData(state.activeData);
    const playableCount = playedOnlyData?.countries?.length || 0;
    if (!playedOnlyData || playableCount < 5) {
      setFeedback(
        "Not enough played outlines yet for played-only quiz. You need at least 5.",
        "wrong",
      );
      return;
    }
    state.activeData = playedOnlyData;
  }

  state.selectedModeId = modeId;
  document.body.classList.toggle(
    "mode-reverse-border",
    modeId === "reverse-border",
  );
  const competitiveResume =
    modeId === COMPETITIVE_MODE_ID &&
    state.competitive.localProgress?.dayKey === state.todayKey &&
    !state.competitive.localProgress?.completed
      ? state.competitive.localProgress
      : null;

  state.session = modeDef.build(
    state.activeData,
    modeId === COMPETITIVE_MODE_ID ? { dayKey: state.todayKey } : undefined,
  );
  state.round = competitiveResume?.answeredCount || 0;
  state.score = competitiveResume?.score || 0;

  if (modeId === COMPETITIVE_MODE_ID) {
    if (competitiveResume) {
      for (let i = 0; i < competitiveResume.answeredCount; i += 1) {
        state.session.nextQuestion();
      }
    } else {
      persistCompetitiveProgress({
        dayKey: state.todayKey,
        answeredCount: 0,
        score: 0,
        maxScore: state.session.totalRounds || 5,
        completed: false,
      });
    }
  }

  mapAssistToggle.checked = resolveMapAssistDefaultForMode(modeId);
  setSettingsOpen(false);

  modeSelect.classList.add("hidden");
  finishCard.classList.add("hidden");
  if (leaderboardWrap) {
    leaderboardWrap.classList.add("hidden");
  }
  gameSection.classList.remove("hidden");
  topNavRow.classList.remove("hidden");
  setHomeViewClass(false);
  setHeaderGameMeta(true);
  setHeaderModeLabel(modeDef.title);

  submitBtn.disabled = false;
  answerInput.disabled = false;

  updateMapAssistLabel();

  showQuestion();
}

function backToModes() {
  state.session = null;
  state.activeData = null;
  state.currentQuestion = null;
  state.selectedModeId = null;
  document.body.classList.remove("mode-reverse-border");

  modeSelect.classList.remove("hidden");
  gameSection.classList.add("hidden");
  finishCard.classList.add("hidden");
  topNavRow.classList.add("hidden");
  worldMapWrap.classList.add("hidden");
  worldMapSvg.innerHTML = "";
  worldMapSvg.classList.remove("map-select-mode");
  resultOverlay.classList.add("hidden");
  setFeedback("");
  setHomeViewClass(true);
  setHeaderGameMeta(false);
  setHeaderModeLabel("");
  state.settings.quizPool = "all";
  setSettingsOpen(false);
  updateMapAssistLabel();
  renderModeCards();
}

openSettingsBtn.addEventListener("click", () => {
  setSettingsOpen(true);
});

openProgressBtn?.addEventListener("click", () => {
  window.location.href = "./progress.html";
});

activeContinentLabel.setAttribute("role", "button");
activeContinentLabel.setAttribute("tabindex", "0");
activeContinentLabel.setAttribute(
  "aria-label",
  "Open settings and change region",
);
activeContinentLabel.addEventListener("click", () => {
  setSettingsOpen(true);
});
activeContinentLabel.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  setSettingsOpen(true);
});

closeSettingsBtn.addEventListener("click", () => {
  setSettingsOpen(false);
});

settingsOverlay.addEventListener("click", () => {
  setSettingsOpen(false);
});

saveSettingsBtn.addEventListener("click", () => {
  state.settings.region = continentSelect.value || "all-countries";
  state.settings.quizPool = "all";
  updateActiveFilterLabel();
  renderModeCards();
  setSettingsOpen(false);
});

if (continentSelect) {
  continentSelect.addEventListener("change", () => {
    // Region selection only applies to game settings on this page.
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !nameEntryPanel.classList.contains("hidden")) {
    setNameEntryOpen(false);
    resolveNamePromptResult(null);
    return;
  }

  if (event.key === "Escape" && !settingsPanel.classList.contains("hidden")) {
    setSettingsOpen(false);
    return;
  }
});

submitBtn.addEventListener("click", () => {
  if (state.currentQuestion?.input?.type === "map-select") {
    if (state.mapSelectReadyForNext) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Selection";
      showQuestion();
      return;
    }

    const selectedIso2 =
      typeof state.currentQuestion.getSelection === "function"
        ? state.currentQuestion.getSelection()
        : "";
    submitAnswer(selectedIso2 || "");
    return;
  }

  if (state.currentQuestion?.input?.type === "chain-builder") {
    submitAnswer([chainInput1.value, chainInput2.value]);
    return;
  }

  submitAnswer(answerInput.value);
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitAnswer(answerInput.value);
  }
});

overlayNextBtn.addEventListener("click", () => {
  resultOverlay.classList.add("hidden");
  resultOverlayCard.classList.remove("correct", "wrong");
  submitBtn.disabled = false;
  revealBtn.disabled = false;
  answerInput.disabled = false;
  chainSubmitBtn.disabled = false;
  chainInput1.disabled = false;
  chainInput2.disabled = false;
  showQuestion();
});

chainInput1.addEventListener("input", () => {
  updateChainPreview(chainInput1, chainPreview1);
});

chainInput2.addEventListener("input", () => {
  updateChainPreview(chainInput2, chainPreview2);
});

chainSubmitBtn.addEventListener("click", () => {
  submitAnswer([chainInput1.value, chainInput2.value]);
});

chainInput2.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitAnswer([chainInput1.value, chainInput2.value]);
  }
});

mapAssistToggle.addEventListener("change", () => {
  if (
    state.selectedModeId === "reverse-border" ||
    state.selectedModeId === "region-chain"
  ) {
    writeMapAssistPref(state.selectedModeId, mapAssistToggle.checked);
  }
  mapAssist.renderWorldAssist(state.currentQuestion, state.hasSubmitted);
});

if (typeof window.PointerEvent === "function") {
  worldMapSvg.addEventListener("pointerdown", handleWorldMapPointerDown);
  worldMapSvg.addEventListener("pointerup", handleWorldMapPointerUp);
  worldMapSvg.addEventListener("pointercancel", handleWorldMapPointerCancel);
  worldMapSvg.addEventListener("pointerleave", handleWorldMapPointerCancel);
} else {
  worldMapSvg.addEventListener("click", applyWorldMapSelectionForEvent);
}

backToModesBtn.addEventListener("click", backToModes);

if (leaderboardDailyTab) {
  leaderboardDailyTab.addEventListener("click", () => {
    if (state.leaderboardPeriod === "daily") {
      return;
    }
    setLeaderboardStatus("Loading daily leaderboard...");
    void refreshDailyLeaderboard({ autoScrollToMine: true, period: "daily" });
  });
}

if (leaderboardWeeklyTab) {
  leaderboardWeeklyTab.addEventListener("click", () => {
    if (state.leaderboardPeriod === "weekly") {
      return;
    }
    setLeaderboardStatus("Loading weekly leaderboard...");
    void refreshDailyLeaderboard({ autoScrollToMine: true, period: "weekly" });
  });
}

if (nameEntryOverlay) {
  nameEntryOverlay.addEventListener("click", () => {
    setNameEntryOpen(false);
    resolveNamePromptResult(null);
  });
}

if (cancelNameBtn) {
  cancelNameBtn.addEventListener("click", () => {
    setNameEntryOpen(false);
    resolveNamePromptResult(null);
  });
}

if (saveNameBtn) {
  saveNameBtn.addEventListener("click", () => {
    const validation = sanitizeDisplayName(nameEntryInput.value);
    if (!validation.ok) {
      nameEntryError.textContent = validation.message;
      return;
    }

    const rawCountryInput = nameEntryCountryInput?.value || "";
    const hasCountryText = String(rawCountryInput).trim().length > 0;
    const resolvedCountryCode = resolveCountryCodeFromInput(rawCountryInput);

    if (hasCountryText && !resolvedCountryCode) {
      nameEntryError.textContent =
        "Country not recognized. Try a country name or 2-letter code (example: Japan or JP).";
      return;
    }

    nameEntryError.textContent = "";
    setNameEntryOpen(false);
    resolveNamePromptResult({
      name: validation.value,
      countryCode: resolvedCountryCode,
    });
  });
}

if (generateNameBtn) {
  generateNameBtn.addEventListener("click", () => {
    nameEntryInput.value = generateFunnyName();
    if (nameEntryError.textContent) {
      nameEntryError.textContent = "";
    }
  });
}

if (nameEntryInput) {
  nameEntryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveNameBtn?.click();
    }
  });

  nameEntryInput.addEventListener("input", () => {
    if (nameEntryError.textContent) {
      nameEntryError.textContent = "";
    }
  });
}

if (nameEntryCountryInput) {
  nameEntryCountryInput.addEventListener("input", () => {
    updateCountryEmojiPreview(nameEntryCountryInput.value);
    if (nameEntryError.textContent) {
      nameEntryError.textContent = "";
    }
  });
}

if (revealBtn) {
  revealBtn.addEventListener("click", revealAnswer);
}

async function init() {
  const startupRequest = readStartupRequestFromUrl();
  const openSettingsRequested = readOpenSettingsRequestFromUrl();
  setLeaderboardPeriod("daily");
  setHomeViewClass(true);
  setHeaderGameMeta(false);
  setSettingsOpen(false);
  state.deviceId = getOrCreateDeviceId();
  state.detectedCountry = detectPlayerCountry();
  state.playerCountry = loadStoredPlayerCountry() || state.detectedCountry;
  state.todayKey = getTodayDayKey();
  state.playerName = loadStoredPlayerName();
  updatePlayerNameLabel();
  renderModeCardSkeletons();
  setFeedback("Loading local datasets...");
  try {
    countryAutocomplete.attachInput(answerInput);
    countryAutocomplete.attachInput(chainInput1);
    countryAutocomplete.attachInput(chainInput2);

    state.data = await loadWorldGameDataMinimal();
    warmSecondaryRegionDatasets();

    const options = getRegionOptions();
    continentSelect.innerHTML = "";
    options.forEach((region) => {
      const option = document.createElement("option");
      option.value = region.value;
      option.textContent = region.label;
      continentSelect.appendChild(option);
    });
    continentSelect.value = state.settings.region;
    if (!continentSelect.value) {
      state.settings.region = "all-countries";
      continentSelect.value = state.settings.region;
    }

    if (startupRequest?.region) {
      state.settings.region = startupRequest.region;
      if (
        continentSelect.querySelector(
          `option[value="${startupRequest.region}"]`,
        )
      ) {
        continentSelect.value = startupRequest.region;
      }
    }

    if (startupRequest?.quizPool === "played") {
      state.settings.quizPool = "played";
    }

    updateActiveFilterLabel();
    updateMapAssistLabel();
    if (state.data?.meta?.fullData) {
      renderOutlineBackdrop(state.data);
    }
    renderModeCards();
    setFeedback("");
    await refreshCompetitiveStateAndUi();
    startCompetitiveCountdownTimer();

    if (startupRequest?.modeId) {
      if (startupRequest.region) {
        await ensureRegionDataLoaded(startupRequest.region);
      }
      clearStartupRequestFromUrl();
      void startMode(startupRequest.modeId);
    } else if (openSettingsRequested) {
      clearStartupRequestFromUrl();
      setSettingsOpen(true);
    }

    if (isLeaderboardEnabled()) {
      void refreshDailyLeaderboard();
    }
  } catch (err) {
    console.error(err);
    setFeedback(
      "Failed to load local data files. Start via local server and try again.",
      "wrong",
    );
  }
}

window.addEventListener("resize", () => {
  clearTimeout(backdropRenderTimer);
  backdropRenderTimer = setTimeout(() => {
    if (state.data) {
      renderOutlineBackdrop(state.data);
    }
  }, 180);
});

init();
