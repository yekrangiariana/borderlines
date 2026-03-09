import { createCyclingPicker } from "./randomCycle.js";
import { createCountryDistanceLookup } from "../geoEducation.js";
import { formatCountryWithFlag } from "../countryDisplay.js";

const ROUNDS = 10;

export function createMapSelectQuestion(
  target,
  iso2ToCountry = null,
  distanceLookup = null,
) {
  let selectedIso2 = null;
  const itemSingular = target?.meta?.itemSingular || "country";
  const mapLabel = target?.meta?.mapLabel || "world map";

  const countryNameFromIso2 = (iso2) => {
    const cleanIso2 = String(iso2 || "").toUpperCase();
    if (!cleanIso2 || !iso2ToCountry?.get) {
      return cleanIso2 || `that ${itemSingular}`;
    }
    return iso2ToCountry.get(cleanIso2)?.name || cleanIso2;
  };

  const targetLabel = formatCountryWithFlag(target.name, target.iso2);

  const toAssist = () => {
    const highlights = [];
    if (selectedIso2) {
      highlights.push({ iso2: selectedIso2, role: "selected" });
    }

    return {
      highlights,
      // Keep a stable camera while choosing to avoid abrupt reprojection.
      zoomIso2: [],
    };
  };

  return {
    prompt: `Find ${targetLabel} on the ${mapLabel} and select it.`,
    hint: `Tap or click a ${itemSingular} on the map, then press Submit.`,
    input: {
      type: "map-select",
      placeholder: `Click a ${itemSingular} on the map`,
    },
    visuals: { layout: "none" },
    mapAssistPolicy: "required",
    worldAssist: toAssist(),
    getSelection() {
      return selectedIso2;
    },
    setSelection(iso2) {
      selectedIso2 = iso2 || null;
      this.worldAssist = toAssist();
    },
    submit(rawAnswer) {
      const selected = String(rawAnswer || "").toUpperCase();
      if (!selected) {
        return {
          correct: false,
          points: 0,
          message: `Select a ${itemSingular} on the ${mapLabel} first.`,
        };
      }

      const correct = selected === target.iso2;

      if (correct) {
        this.worldAssist = {
          highlights: [{ iso2: target.iso2, role: "answer" }],
          zoomIso2: [target.iso2],
          focusStrength: "soft",
          labels: [{ iso2: target.iso2, text: "Correct" }],
        };

        return {
          correct: true,
          points: 1,
          message: `Correct. You selected ${target.name}.`,
        };
      }

      this.worldAssist = {
        highlights: [
          { iso2: target.iso2, role: "answer" },
          { iso2: selected, role: "clue" },
        ],
        zoomIso2: [selected, target.iso2],
        focusStrength: "soft",
        distanceLinkIso2: [selected, target.iso2],
        labels: [{ iso2: target.iso2, text: `Answer: ${target.name}` }],
      };

      const selectedName = countryNameFromIso2(selected);
      const selectedLabel = formatCountryWithFlag(selectedName, selected);
      const answerLabel = formatCountryWithFlag(target.name, target.iso2);
      const distanceKm = distanceLookup?.getDistanceKm(selected, target.iso2);
      if (Number.isFinite(distanceKm)) {
        this.worldAssist.fixedLabels = [
          `Border-to-border geodesic distance: ${distanceKm.toLocaleString()} km`,
        ];
      }

      return {
        correct: false,
        points: 0,
        message: Number.isFinite(distanceKm)
          ? `Not quite. You chose ${selectedLabel}. Border-to-border geodesic distance: ${distanceKm.toLocaleString()} km, and ${answerLabel} is here.`
          : `Not quite. You chose ${selectedLabel}, and ${answerLabel} is here.`,
      };
    },
    reveal() {
      this.worldAssist = {
        highlights: [{ iso2: target.iso2, role: "answer" }],
        zoomIso2: [target.iso2],
        focusStrength: "soft",
        labels: [{ iso2: target.iso2, text: `Answer: ${target.name}` }],
      };

      return {
        correct: false,
        points: 0,
        message: `Revealed. ${target.name} is highlighted on the map. Move around to inspect, then press Next.`,
      };
    },
  };
}

export function createMapSelectMode(data, rng = Math.random) {
  let round = 0;
  const picker = createCyclingPicker(data.countries, rng);
  const distanceLookup = createCountryDistanceLookup(data.iso2ToCountry);

  return {
    id: "map-select",
    name: "Map Select",
    totalRounds: ROUNDS,
    nextQuestion() {
      if (round >= ROUNDS) {
        return null;
      }
      round += 1;
      const target = picker.next();
      if (!target) {
        return null;
      }
      return createMapSelectQuestion(
        { ...target, meta: data?.meta || null },
        data.iso2ToCountry,
        distanceLookup,
      );
    },
  };
}
