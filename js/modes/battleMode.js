import { createCyclingPicker } from "./randomCycle.js";
import { formatCountryWithFlag } from "../countryDisplay.js";

const ROUNDS = 10;

function formatBorderSummary(country) {
  const count = country?.neighbors?.size || 0;
  const suffix = count === 1 ? "" : "s";

  if (count === 0) {
    return "0 land borders";
  }

  const names = country?.neighborNames || [];
  if (!names.length || names.length > 4) {
    return `${count} land border${suffix}`;
  }

  return `${count} land border${suffix} (${names.join(", ")})`;
}

export function createBattleQuestion(left, right) {
  const itemSingular = left?.meta?.itemSingular || "country";
  const leftCount = left?.neighbors.size || 0;
  const rightCount = right?.neighbors.size || 0;
  const leftLabel = formatCountryWithFlag(left?.name, left?.iso2);
  const rightLabel = formatCountryWithFlag(right?.name, right?.iso2);
  let answer = "tie";
  if (leftCount > rightCount) {
    answer = "left";
  } else if (rightCount > leftCount) {
    answer = "right";
  }

  return {
    prompt: `Which ${itemSingular} has more land borders, ${leftLabel} or ${rightLabel}?`,
    hint: `Pick the ${itemSingular} with more land borders, or Tie.`,
    input: {
      type: "choice",
      options: [
        { value: "left", label: left.name },
        { value: "right", label: right.name },
        { value: "tie", label: "Tie" },
      ],
    },
    visuals: {
      layout: "duel",
      leftFeature: left?.feature,
      rightFeature: right?.feature,
      leftLabel: left.name,
      rightLabel: right.name,
    },
    mapAssistPolicy: "disabled",
    submit(rawAnswer) {
      const ok = rawAnswer === answer;
      const leftSummary = formatBorderSummary(left);
      const rightSummary = formatBorderSummary(right);
      const resultPrefix = ok ? "Correct." : "Not quite.";

      if (answer === "tie") {
        return {
          correct: ok,
          points: ok ? 1 : 0,
          message: `${resultPrefix} It's a tie: ${leftLabel} and ${rightLabel} both have ${leftSummary}.`,
        };
      }

      const winner = answer === "left" ? left : right;
      const loser = answer === "left" ? right : left;
      const winnerLabel = answer === "left" ? leftLabel : rightLabel;
      const winnerCount = winner?.neighbors?.size || 0;
      const loserCount = loser?.neighbors?.size || 0;

      if (ok) {
        return {
          correct: true,
          points: 1,
          message: `${resultPrefix} ${winnerLabel} has more land borders (${winnerCount} vs ${loserCount}). ${leftLabel}: ${leftSummary}. ${rightLabel}: ${rightSummary}.`,
        };
      }

      return {
        correct: false,
        points: 0,
        message: `${resultPrefix} ${winnerLabel} has more land borders (${winnerCount} vs ${loserCount}). ${leftLabel}: ${leftSummary}. ${rightLabel}: ${rightSummary}.`,
      };
    },
    reveal() {
      const leftSummary = formatBorderSummary(left);
      const rightSummary = formatBorderSummary(right);

      if (answer === "tie") {
        return {
          correct: false,
          points: 0,
          message: `Revealed. It's a tie: ${leftLabel} and ${rightLabel} both have ${leftSummary}.`,
        };
      }

      const winner = answer === "left" ? left : right;
      const loser = answer === "left" ? right : left;
      const winnerLabel = answer === "left" ? leftLabel : rightLabel;
      const winnerCount = winner?.neighbors?.size || 0;
      const loserCount = loser?.neighbors?.size || 0;

      return {
        correct: false,
        points: 0,
        message: `Revealed. ${winnerLabel} has more land borders (${winnerCount} vs ${loserCount}). ${leftLabel}: ${leftSummary}. ${rightLabel}: ${rightSummary}.`,
      };
    },
  };
}

export function createBattleMode(data, rng = Math.random) {
  let round = 0;
  const picker = createCyclingPicker(data.countries, rng);

  return {
    id: "battle",
    name: "Battle Mode",
    totalRounds: ROUNDS,
    nextQuestion() {
      if (round >= ROUNDS) {
        return null;
      }

      const left = picker.next();
      const right = picker.nextWhere((country) => country.iso2 !== left?.iso2);
      if (!left || !right) {
        return null;
      }

      round += 1;
      return createBattleQuestion(
        { ...left, meta: data?.meta || null },
        { ...right, meta: data?.meta || null },
      );
    },
  };
}
