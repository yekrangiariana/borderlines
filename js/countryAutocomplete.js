export function createCountryAutocompleteManager(options = {}) {
  const {
    getSourceData,
    normalizeInput,
    minChars = 3,
    maxSuggestions = 5,
  } = options;

  const bindings = new Map();

  const defaultNormalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalize =
    typeof normalizeInput === "function" ? normalizeInput : defaultNormalize;

  function hideSuggestions(inputEl) {
    const binding = bindings.get(inputEl);
    if (!binding) {
      return;
    }
    binding.suggestions = [];
    binding.container.innerHTML = "";
    binding.container.classList.add("hidden");
  }

  function getSuggestions(rawValue) {
    const sourceData =
      typeof getSourceData === "function" ? getSourceData() : null;
    if (!sourceData?.countries?.length) {
      return [];
    }

    const query = normalize(rawValue);
    if (query.length < minChars) {
      return [];
    }

    const candidates = [];
    sourceData.countries.forEach((country) => {
      const name = String(country?.name || "").trim();
      if (!name) {
        return;
      }

      const nameNorm = normalize(name);
      const aliases =
        country?.aliases instanceof Set ? [...country.aliases] : [];

      let score = -1;
      if (nameNorm.startsWith(query)) {
        score = 0;
      } else if (
        aliases.some((alias) => String(alias || "").startsWith(query))
      ) {
        score = 1;
      } else if (nameNorm.includes(query)) {
        score = 2;
      } else if (aliases.some((alias) => String(alias || "").includes(query))) {
        score = 3;
      }

      if (score < 0) {
        return;
      }

      candidates.push({
        iso2: country.iso2,
        name,
        nameNorm,
        score,
      });
    });

    candidates.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }

      const lenDiff = a.nameNorm.length - b.nameNorm.length;
      if (lenDiff !== 0) {
        return lenDiff;
      }

      return a.name.localeCompare(b.name);
    });

    const deduped = [];
    const seen = new Set();
    candidates.forEach((entry) => {
      const key = `${entry.iso2}:${entry.name}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      deduped.push(entry);
    });

    return deduped.slice(0, maxSuggestions);
  }

  function renderSuggestions(inputEl) {
    const binding = bindings.get(inputEl);
    if (!binding) {
      return;
    }

    if (!binding.enabled) {
      hideSuggestions(inputEl);
      return;
    }

    const suggestions = getSuggestions(inputEl.value);
    binding.suggestions = suggestions;
    binding.container.innerHTML = "";

    if (!suggestions.length) {
      binding.container.classList.add("hidden");
      return;
    }

    suggestions.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "country-suggest-chip";
      btn.textContent = item.name;
      btn.setAttribute("data-iso2", item.iso2 || "");
      btn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        inputEl.value = item.name;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        hideSuggestions(inputEl);
        inputEl.focus();
      });
      binding.container.appendChild(btn);
    });

    binding.container.classList.remove("hidden");
  }

  function attachInput(inputEl, config = {}) {
    if (!inputEl || bindings.has(inputEl)) {
      return;
    }

    const container = document.createElement("div");
    container.className = "country-suggest-bar hidden";
    container.setAttribute("aria-label", "Name suggestions");
    container.setAttribute("role", "listbox");

    if (inputEl.parentElement) {
      inputEl.parentElement.insertBefore(container, inputEl);
    }

    const binding = {
      inputEl,
      container,
      enabled: Boolean(config.enabled),
      suggestions: [],
    };
    bindings.set(inputEl, binding);

    inputEl.addEventListener("input", () => {
      renderSuggestions(inputEl);
    });

    inputEl.addEventListener("focus", () => {
      renderSuggestions(inputEl);
    });

    inputEl.addEventListener("blur", () => {
      window.setTimeout(() => {
        hideSuggestions(inputEl);
      }, 80);
    });
  }

  function setEnabled(inputEl, enabled) {
    const binding = bindings.get(inputEl);
    if (!binding) {
      return;
    }

    binding.enabled = Boolean(enabled);
    if (!binding.enabled) {
      hideSuggestions(inputEl);
      return;
    }

    renderSuggestions(inputEl);
  }

  return {
    attachInput,
    setEnabled,
    hideSuggestions,
  };
}
