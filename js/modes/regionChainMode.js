import { normalize, sample } from "../gameData.js";
import { formatCountryWithFlag } from "../countryDisplay.js";
import { createCyclingPicker } from "./randomCycle.js";

const ROUNDS = 10;

function buildChainQuestion(data, rng, startPicker, attemptLimit = 120) {
  const itemSingular = data?.meta?.itemSingular || "country";
  const itemPlural = data?.meta?.itemPlural || "countries";

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const start = startPicker.nextWhere(
      (country) => country.neighbors.size >= 2,
    );
    if (!start) {
      break;
    }

    const mid1Iso = sample([...start.neighbors], rng);
    const mid1 = data.iso2ToCountry.get(mid1Iso);
    if (!mid1 || mid1.iso2 === start.iso2 || mid1.neighbors.size < 2) {
      continue;
    }

    const mid2Choices = [...mid1.neighbors].filter(
      (iso2) => iso2 !== start.iso2,
    );
    const mid2Iso = sample(mid2Choices, rng);
    const mid2 = data.iso2ToCountry.get(mid2Iso);
    if (!mid2 || mid2.iso2 === mid1.iso2 || mid2.neighbors.size < 2) {
      continue;
    }

    const endChoices = [...mid2.neighbors].filter(
      (iso2) => iso2 !== mid1.iso2 && iso2 !== start.iso2,
    );
    const endIso = sample(endChoices, rng);
    const end = data.iso2ToCountry.get(endIso);
    if (!end || end.iso2 === mid2.iso2) {
      continue;
    }

    const expectedMiddleCount = 2;
    const startLabel = formatCountryWithFlag(start.name, start.iso2);
    const mid1Label = formatCountryWithFlag(mid1.name, mid1.iso2);
    const mid2Label = formatCountryWithFlag(mid2.name, mid2.iso2);
    const endLabel = formatCountryWithFlag(end.name, end.iso2);
    const correctPair = `${mid1.name}, ${mid2.name}`;

    return {
      prompt: `Fill in the two missing ${itemPlural}: ${startLabel} -> ? -> ? -> ${endLabel}`,
      hint: `Type the two middle ${itemPlural} in order.`,
      input: {
        type: "chain-builder",
        placeholders: [
          `First middle ${itemSingular}`,
          `Second middle ${itemSingular}`,
        ],
      },
      visuals: {
        layout: "duel",
        leftFeature: start.feature,
        rightFeature: end.feature,
        leftLabel: `Start: ${start.name}`,
        rightLabel: `End: ${end.name}`,
      },
      worldAssist: {
        highlights: [
          { iso2: start.iso2, role: "start" },
          { iso2: mid1.iso2, role: "mid" },
          { iso2: mid2.iso2, role: "mid" },
          { iso2: end.iso2, role: "destination" },
        ],
        chainPathIso2: [start.iso2, mid1.iso2, mid2.iso2, end.iso2],
        zoomIso2: [start.iso2, mid1.iso2, mid2.iso2, end.iso2],
        labels: [
          { iso2: start.iso2, text: `Start: ${start.name}` },
          { iso2: end.iso2, text: `End: ${end.name}` },
        ],
      },
      mapAssistDefaultOn: true,
      submit(rawAnswer) {
        const parts = Array.isArray(rawAnswer)
          ? rawAnswer.map((part) => String(part || "").trim()).filter(Boolean)
          : String(rawAnswer || "")
              .split(/,|->|>|;/)
              .map((part) => part.trim())
              .filter(Boolean);

        if (parts.length !== expectedMiddleCount) {
          return {
            correct: false,
            points: 0,
            message: `Wrong. Enter exactly two middle ${itemPlural}. Correct answer: ${correctPair}.`,
          };
        }

        const middleIso = parts.map((name) =>
          data.aliasToIso2.get(normalize(name)),
        );
        if (middleIso.some((iso2) => !iso2)) {
          return {
            correct: false,
            points: 0,
            message: `Wrong. One or more ${itemSingular} names were not recognized. Correct answer: ${correctPair}.`,
          };
        }

        const [m1, m2] = middleIso;
        const valid =
          start.neighbors.has(m1) &&
          data.iso2ToCountry.get(m1)?.neighbors.has(m2) &&
          data.iso2ToCountry.get(m2)?.neighbors.has(end.iso2) &&
          m1 !== m2 &&
          m1 !== end.iso2 &&
          m2 !== start.iso2;

        if (valid) {
          const part1Label = formatCountryWithFlag(parts[0], m1);
          const part2Label = formatCountryWithFlag(parts[1], m2);
          return {
            correct: true,
            points: 1,
            message: `Nice chain. ${startLabel} -> ${part1Label} -> ${part2Label} -> ${endLabel}`,
          };
        }

        return {
          correct: false,
          points: 0,
          message: `Wrong. A valid chain is ${startLabel} -> ${mid1Label} -> ${mid2Label} -> ${endLabel}.`,
        };
      },
      reveal() {
        return {
          correct: false,
          points: 0,
          message: `Revealed. A valid chain is ${startLabel} -> ${mid1Label} -> ${mid2Label} -> ${endLabel}.`,
        };
      },
    };
  }

  return {
    prompt: "Region Chain fallback round.",
    hint: "Could not find a suitable chain right now.",
    input: { type: "text", placeholder: "Type anything" },
    visuals: { layout: "none" },
    submit() {
      return {
        correct: false,
        points: 0,
        message: "Round skipped due to insufficient connected-border data.",
      };
    },
    reveal() {
      return {
        correct: false,
        points: 0,
        message:
          "Revealed. Round skipped due to insufficient connected-border data.",
      };
    },
  };
}

export function createRegionChainMode(data, rng = Math.random) {
  let round = 0;
  const startPicker = createCyclingPicker(data.countries, rng);

  return {
    id: "region-chain",
    name: "Region Chain",
    totalRounds: ROUNDS,
    nextQuestion() {
      if (round >= ROUNDS) {
        return null;
      }
      round += 1;
      return buildChainQuestion(data, rng, startPicker);
    },
  };
}
