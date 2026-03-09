import { normalize } from "../gameData.js";
import { formatCountryWithFlag } from "../countryDisplay.js";
import { createCyclingPicker } from "./randomCycle.js";

const ROUNDS = 10;

export function createNormalQuestion(target) {
  const itemSingular = target?.meta?.itemSingular || "country";
  const targetLabel = formatCountryWithFlag(target.name, target.iso2);

  return {
    prompt: `Identify this ${itemSingular} outline.`,
    hint: `Type the ${itemSingular} name.`,
    input: {
      type: "text",
      placeholder: `${itemSingular.charAt(0).toUpperCase() + itemSingular.slice(1)} name`,
    },
    visuals: { layout: "single", feature: target.feature },
    mapAssistPolicy: "disabled",
    submit(rawAnswer) {
      const guess = normalize(rawAnswer || "");
      const correct = target.aliases.has(guess);
      return {
        correct,
        points: correct ? 1 : 0,
        message: correct
          ? `Correct. It is ${targetLabel}.`
          : `Wrong. The answer is ${targetLabel}.`,
      };
    },
    reveal() {
      return {
        correct: false,
        points: 0,
        message: `Revealed. The answer is ${targetLabel}.`,
      };
    },
  };
}

export function createNormalMode(data, rng = Math.random) {
  let round = 0;
  const picker = createCyclingPicker(data.countries, rng);

  return {
    id: "normal",
    name: "Normal Mode",
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
      return createNormalQuestion({ ...target, meta: data?.meta || null });
    },
  };
}
