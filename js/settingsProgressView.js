function toPercent(part, total) {
  if (!total) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function createProgressCardMarkup(label, playedCount, totalCount) {
  const percent = toPercent(playedCount, totalCount);
  const circumference = 2 * Math.PI * 16;
  const progressLength = (percent / 100) * circumference;
  const remainderLength = Math.max(0, circumference - progressLength);

  return `
    <article class="sp-region-card">
      <div class="sp-region-top pie-layout">
        <div class="sp-region-copy">
          <strong>${label}</strong>
          <span>${playedCount}/${totalCount}</span>
        </div>
        <div class="sp-pie-wrap" aria-hidden="true">
          <svg class="sp-pie" viewBox="0 0 40 40">
            <circle class="sp-pie-bg" cx="20" cy="20" r="16"></circle>
            <circle
              class="sp-pie-progress"
              cx="20"
              cy="20"
              r="16"
              stroke-dasharray="${progressLength.toFixed(2)} ${remainderLength.toFixed(2)}"
            ></circle>
          </svg>
          <span>${percent}%</span>
        </div>
      </div>
    </article>
  `;
}

export function createSettingsProgressView({
  rootEl,
  drawOutline,
  getRegionOptions,
  getPreviewRegionValue,
  getDataForRegion,
  getSeenSet,
  getSeenEntries,
  onStartPlayedQuiz,
  onRegionChange,
}) {
  if (!rootEl) {
    return {
      render() {},
      setMessage() {},
    };
  }

  let statusMessage = "";
  let statusKind = "";

  function getProgressForRegion(regionValue) {
    const data = getDataForRegion(regionValue);
    const countries = data?.countries || [];
    const datasetId = data?.meta?.id || "";
    const seenSet = getSeenSet(datasetId);

    const played = countries.filter((country) => seenSet.has(country.iso2));
    const unplayed = countries.filter((country) => !seenSet.has(country.iso2));

    const seenEntries = getSeenEntries(datasetId);
    const seenTimestampByIso2 = new Map(
      seenEntries.map((entry) => [entry.iso2, entry.timestamp]),
    );

    played.sort((a, b) => {
      const aTs = seenTimestampByIso2.get(a.iso2) || 0;
      const bTs = seenTimestampByIso2.get(b.iso2) || 0;
      return bTs - aTs;
    });

    return {
      datasetId,
      countries,
      played,
      unplayed,
      totalCount: countries.length,
      playedCount: played.length,
    };
  }

  function render() {
    const regionValue = getPreviewRegionValue();
    const regionOptions = getRegionOptions();
    const current = getProgressForRegion(regionValue);

    const allRegionCards = regionOptions
      .map((option) => {
        const stats = getProgressForRegion(option.value);
        return createProgressCardMarkup(
          option.label,
          stats.playedCount,
          stats.totalCount,
        );
      })
      .join("");

    const regionOptionsMarkup = regionOptions
      .map(
        (option) =>
          `<option value="${option.value}" ${
            option.value === regionValue ? "selected" : ""
          }>${option.label}</option>`,
      )
      .join("");

    const showcasedPlayed = current.played.slice(0, 10);
    const showcasedUnplayed = current.unplayed.slice(0, 8);

    const playedCards = showcasedPlayed.length
      ? showcasedPlayed
          .map(
            (country, index) => `
        <article class="sp-outline-card played" data-card-iso2="${country.iso2}">
          <div class="sp-outline-head">
            <span class="sp-badge">Played</span>
            <span class="sp-index">${index + 1}</span>
          </div>
          <svg class="sp-outline-svg" viewBox="0 0 640 380" aria-label="${country.name} outline"></svg>
          <p>${country.name}</p>
        </article>
      `,
          )
          .join("")
      : '<p class="sp-empty">No played outlines in this region yet. Start a round to begin collecting them.</p>';

    const unplayedCards = showcasedUnplayed.length
      ? showcasedUnplayed
          .map(
            (country) => `
        <article class="sp-outline-card locked" data-card-iso2="${country.iso2}">
          <div class="sp-outline-head">
            <span class="sp-badge locked">Unplayed</span>
          </div>
          <svg class="sp-outline-svg" viewBox="0 0 640 380" aria-label="${country.name} outline"></svg>
          <p>${country.name}</p>
        </article>
      `,
          )
          .join("")
      : '<p class="sp-empty success">You have played every outline in this region.</p>';

    const canStartPlayedQuiz = current.playedCount >= 5;

    rootEl.innerHTML = `
      <div class="sp-controls-row">
        <div class="sp-region-picker">
          <label for="progressRegionSelect">Region</label>
          <p class="sp-region-help">Filter progress and quiz-by-played to a specific map set.</p>
          <select id="progressRegionSelect" class="sp-region-select">${regionOptionsMarkup}</select>
        </div>
        <button id="startPlayedQuizBtn" class="sp-quiz-btn" type="button" ${canStartPlayedQuiz ? "" : "disabled"}>
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          <span>Quiz me on played</span>
        </button>
      </div>
      <div class="sp-status ${statusKind}">${statusMessage || ""}</div>
      <details class="sp-section" open>
        <summary>Played Outlines</summary>
        <div class="sp-carousel" id="playedCarousel">${playedCards}</div>
      </details>
      <details class="sp-section" open>
        <summary>Outlines To Collect</summary>
        <div class="sp-carousel">${unplayedCards}</div>
      </details>
      <section class="sp-section sp-region-progress" aria-label="Region Progress">
        <h5>Progress</h5>
        <div class="sp-region-grid">${allRegionCards}</div>
      </section>
    `;

    const idToCountry = new Map(
      [...showcasedPlayed, ...showcasedUnplayed].map((country) => [
        country.iso2,
        country,
      ]),
    );

    rootEl.querySelectorAll("[data-card-iso2]").forEach((cardEl) => {
      const iso2 = cardEl.getAttribute("data-card-iso2");
      const country = idToCountry.get(iso2);
      const svg = cardEl.querySelector(".sp-outline-svg");
      if (!country || !svg) {
        return;
      }
      drawOutline(svg, country.feature);
    });

    const startBtn = rootEl.querySelector("#startPlayedQuizBtn");
    const regionSelectEl = rootEl.querySelector("#progressRegionSelect");

    if (regionSelectEl) {
      regionSelectEl.addEventListener("change", () => {
        if (typeof onRegionChange === "function") {
          onRegionChange(regionSelectEl.value);
        }
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => {
        if (!canStartPlayedQuiz) {
          return;
        }
        onStartPlayedQuiz({
          regionValue,
          datasetId: current.datasetId,
          playableCount: current.playedCount,
        });
      });
    }
  }

  function setMessage(message, kind = "") {
    statusMessage = String(message || "");
    statusKind = String(kind || "");
    render();
  }

  return {
    render,
    setMessage,
  };
}
