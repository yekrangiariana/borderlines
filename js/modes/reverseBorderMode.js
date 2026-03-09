import { normalize, shuffle } from "../gameData.js";
import { formatCountryWithFlag } from "../countryDisplay.js";
import { createCyclingPicker } from "./randomCycle.js";

const ROUNDS = 10;

export function createReverseBorderQuestion(data, target, rng) {
  const itemSingular = data?.meta?.itemSingular || "country";
  const itemPlural = data?.meta?.itemPlural || "countries";
  const clueIso2 = shuffle([...target.neighbors], rng).slice(0, 3);
  const clues = clueIso2
    .map((iso2) => {
      const country = data.iso2ToCountry.get(iso2);
      return country ? formatCountryWithFlag(country.name, country.iso2) : "";
    })
    .filter(Boolean);
  const targetLabel = formatCountryWithFlag(target.name, target.iso2);
  const clueItems = clueIso2
    .map((iso2) => data.iso2ToCountry.get(iso2))
    .filter(Boolean)
    .map((country) => ({
      label: country.name,
      feature: country.feature,
    }));
  clueItems.push({
    label: "Answer",
    isUnknown: true,
  });

  return {
    prompt: `Which ${itemSingular} borders all of these ${itemPlural}: ${clues.join(", ")}?`,
    hint: `The clue ${itemPlural} outlines are shown below. Toggle map assist on if you want extra help.`,
    input: { type: "text", placeholder: `Type ${itemSingular}` },
    visuals: { layout: "multi", items: clueItems },
    mapAssistDefaultOn: false,
    worldAssist: {
      highlights: [
        ...clueIso2.map((iso2) => ({ iso2, role: "clue" })),
        { iso2: target.iso2, role: "answer" },
      ],
      zoomIso2: [target.iso2, ...clueIso2],
      labels: [{ iso2: target.iso2, text: "Answer" }],
    },
    submit(rawAnswer) {
      const guess = normalize(rawAnswer || "");
      if (!guess) {
        return {
          correct: false,
          points: 0,
          message: `Enter a ${itemSingular} name.`,
        };
      }

      if (target.aliases.has(guess)) {
        return {
          correct: true,
          points: 1,
          message: `Correct. The country was ${targetLabel}.`,
        };
      }

      return {
        correct: false,
        points: 0,
        message: `Not quite. The answer was ${targetLabel}.`,
      };
    },
    reveal() {
      return {
        correct: false,
        points: 0,
        message: `Revealed. The answer was ${targetLabel}.`,
      };
    },
  };
}

export function createReverseBorderMode(data, rng = Math.random) {
  let round = 0;
  const candidates = data.countries.filter(
    (country) => country.neighbors.size >= 3,
  );
  const picker = createCyclingPicker(
    candidates.length ? candidates : data.countries,
    rng,
  );

  return {
    id: "reverse-border",
    name: "Reverse Border",
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
      return createReverseBorderQuestion(data, target, rng);
    },
  };
}
