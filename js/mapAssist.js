export function createMapAssistManager({
  mapAssistRow,
  mapAssistToggle,
  worldMapWrap,
  worldMapSvg,
  mapZoomInBtn,
  mapZoomOutBtn,
  getSourceData,
}) {
  let zoomBehavior = null;
  let svgSelection = null;
  let currentViewport = null;
  let fixedLabelHost = null;
  let currentTransform = null;
  let suppressSelectionUntil = 0;
  let zoomFrameId = 0;
  let pendingTransform = null;
  let zoomingClassTimer = null;
  let gestureNeedsSelectionSuppression = false;
  let gestureStartTransform = null;
  let gestureType = "";
  let isUserGestureActive = false;

  function clearMap() {
    worldMapWrap.classList.add("hidden");
    worldMapSvg.innerHTML = "";
    currentViewport = null;
    if (fixedLabelHost) {
      fixedLabelHost.innerHTML = "";
    }
    currentTransform = null;
    pendingTransform = null;
    worldMapSvg.classList.remove("is-zooming");
    if (zoomFrameId) {
      cancelAnimationFrame(zoomFrameId);
      zoomFrameId = 0;
    }
    if (zoomingClassTimer) {
      clearTimeout(zoomingClassTimer);
      zoomingClassTimer = null;
    }
  }

  function setViewportTransform(transform) {
    if (!currentViewport) {
      return;
    }
    currentViewport.setAttribute(
      "transform",
      `translate(${transform.x},${transform.y}) scale(${transform.k})`,
    );
    applyLabelScaleCompensation(transform.k);
  }

  function ensureFixedLabelHost() {
    if (fixedLabelHost) {
      return fixedLabelHost;
    }

    const host = document.createElement("div");
    host.className = "world-map-fixed-labels";
    worldMapWrap.appendChild(host);
    fixedLabelHost = host;
    return fixedLabelHost;
  }

  function renderFixedLabels(worldAssist = null) {
    const host = ensureFixedLabelHost();
    host.innerHTML = "";

    const labels = Array.isArray(worldAssist?.fixedLabels)
      ? worldAssist.fixedLabels
      : [];
    labels.forEach((entry) => {
      const text = typeof entry === "string" ? entry : entry?.text;
      if (!text) {
        return;
      }

      const chip = document.createElement("div");
      chip.className = "world-map-fixed-label";
      chip.textContent = text;
      host.appendChild(chip);
    });
  }

  function applyLabelScaleCompensation(zoomScale) {
    if (!currentViewport) {
      return;
    }

    const safeScale =
      Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;
    const keepSize = 1 / safeScale;
    const tags = currentViewport.querySelectorAll(".world-map-label-tag");
    tags.forEach((tag) => {
      const anchorX = Number.parseFloat(
        tag.getAttribute("data-anchor-x") || "0",
      );
      const anchorY = Number.parseFloat(
        tag.getAttribute("data-anchor-y") || "0",
      );
      tag.setAttribute(
        "transform",
        `translate(${anchorX},${anchorY}) scale(${keepSize}) translate(${-anchorX},${-anchorY})`,
      );
    });
  }

  function noteGesture(event) {
    const eventType = event?.sourceEvent?.type || "";
    const isTouchGesture = eventType.includes("touch");
    const isWheelGesture = eventType === "wheel";
    if (isTouchGesture || isWheelGesture) {
      gestureType = isTouchGesture ? "touch" : "wheel";
    }
  }

  function hasMeaningfulTransformDelta(nextTransform) {
    if (!gestureStartTransform || !nextTransform) {
      return false;
    }

    const dx = Math.abs(nextTransform.x - gestureStartTransform.x);
    const dy = Math.abs(nextTransform.y - gestureStartTransform.y);
    const dk = Math.abs(nextTransform.k - gestureStartTransform.k);
    return dx > 2 || dy > 2 || dk > 0.01;
  }

  function setZoomingVisualState(active) {
    if (zoomingClassTimer) {
      clearTimeout(zoomingClassTimer);
      zoomingClassTimer = null;
    }

    if (active) {
      worldMapSvg.classList.add("is-zooming");
      return;
    }

    zoomingClassTimer = setTimeout(() => {
      worldMapSvg.classList.remove("is-zooming");
      zoomingClassTimer = null;
    }, 90);
  }

  function scheduleViewportTransform(transform) {
    pendingTransform = transform;
    if (zoomFrameId) {
      return;
    }

    zoomFrameId = requestAnimationFrame(() => {
      zoomFrameId = 0;
      if (!pendingTransform) {
        return;
      }
      setViewportTransform(pendingTransform);
      pendingTransform = null;
    });
  }

  function ensureZoom(d3) {
    if (zoomBehavior && svgSelection) {
      return;
    }

    svgSelection = d3.select(worldMapSvg);
    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.55, 10])
      // Keep map movement unconstrained so reveal states never feel locked.
      .constrain((transform) => transform)
      .extent([
        [0, 0],
        [920, 430],
      ])
      .translateExtent([
        [-2200, -1600],
        [3120, 2230],
      ])
      .on("start", (event) => {
        isUserGestureActive = Boolean(event?.sourceEvent);
        gestureNeedsSelectionSuppression = false;
        gestureType = "";
        gestureStartTransform = event.transform;
        if (isUserGestureActive) {
          noteGesture(event);
        }
      })
      .on("zoom", (event) => {
        if (isUserGestureActive) {
          noteGesture(event);
          if (!gestureNeedsSelectionSuppression) {
            gestureNeedsSelectionSuppression = hasMeaningfulTransformDelta(
              event.transform,
            );
            if (gestureNeedsSelectionSuppression) {
              setZoomingVisualState(true);
            }
          }
        }
        currentTransform = event.transform;
        scheduleViewportTransform(event.transform);
      })
      .on("end", () => {
        if (
          isUserGestureActive &&
          gestureNeedsSelectionSuppression &&
          (gestureType === "touch" || gestureType === "wheel")
        ) {
          suppressSelectionUntil = Date.now() + 120;
        }
        gestureStartTransform = null;
        gestureType = "";
        if (isUserGestureActive && gestureNeedsSelectionSuppression) {
          setZoomingVisualState(false);
        }
        isUserGestureActive = false;
      });

    svgSelection.call(zoomBehavior).on("dblclick.zoom", null);
  }

  function renderWorldMap(worldAssist = null, options = {}) {
    const { forceVisible = false, resetZoom = false } = options;
    if (!forceVisible && !mapAssistToggle.checked) {
      clearMap();
      return;
    }

    worldMapWrap.classList.remove("hidden");
    renderFixedLabels(worldAssist);

    const d3 = globalThis.d3;
    const sourceData = getSourceData();
    if (!d3 || !sourceData?.countries?.length) {
      clearMap();
      return;
    }

    ensureZoom(d3);

    const zoomIso2 = worldAssist?.zoomIso2 || [];
    const focusStrength = worldAssist?.focusStrength || "default";
    const focusSet = new Set((zoomIso2 || []).filter(Boolean));
    const roleByIso2 = new Map();
    (worldAssist?.highlights || []).forEach((item) => {
      if (item?.iso2 && item?.role) {
        roleByIso2.set(item.iso2, item.role);
      }
    });

    const featureCollection = {
      type: "FeatureCollection",
      features: sourceData.countries.map((country) => country.feature),
    };
    const focusedFeatures = sourceData.countries
      .filter((country) => focusSet.has(country.iso2))
      .map((country) => country.feature);
    const focusCollection = {
      type: "FeatureCollection",
      features: focusedFeatures,
    };

    const isUsStatesDataset = sourceData?.meta?.id === "us-states";
    const projection = isUsStatesDataset
      ? d3.geoAlbersUsa()
      : d3.geoNaturalEarth1();
    // Smaller precision keeps coastlines smoother when users zoom deeply.
    if (!isUsStatesDataset && projection.precision) {
      projection.precision(0.35);
    }
    const worldExtent = [
      [56, 30],
      [864, 400],
    ];

    const useSoftSingleFocus =
      focusedFeatures.length === 1 && focusStrength === "soft";

    if (useSoftSingleFocus) {
      projection.fitExtent(worldExtent, featureCollection);
      const baseScale = projection.scale();
      const isMobileView =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 780px)").matches;
      const targetScale = baseScale * (isMobileView ? 2.8 : 2.25);
      projection.scale(targetScale);

      const center = d3.geoCentroid(focusedFeatures[0]);
      const projectedCenter = projection(center);
      if (Array.isArray(projectedCenter)) {
        const [currentTx, currentTy] = projection.translate();
        projection.translate([
          currentTx + (460 - projectedCenter[0]),
          currentTy + (215 - projectedCenter[1]),
        ]);
      }
    } else {
      const fitTarget = focusedFeatures.length
        ? focusCollection
        : featureCollection;
      const fitExtent = focusedFeatures.length
        ? [
            [92, 54],
            [828, 372],
          ]
        : worldExtent;
      projection.fitExtent(fitExtent, fitTarget);
    }
    const path = d3.geoPath(projection);

    worldMapSvg.innerHTML = "";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "marker",
    );
    marker.setAttribute("id", "worldArrowHead");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrowPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrowPath.setAttribute("fill", "#1e9b4e");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    worldMapSvg.appendChild(defs);

    currentViewport = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    currentViewport.setAttribute("class", "world-map-viewport");
    worldMapSvg.appendChild(currentViewport);

    const centroidByIso2 = new Map();
    sourceData.countries.forEach((country) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", path(country.feature));
      p.setAttribute("data-iso2", country.iso2);
      const role = roleByIso2.get(country.iso2);
      const roleClass = role
        ? ` role-${role}`
        : focusSet.has(country.iso2)
          ? " focus"
          : "";
      p.setAttribute("class", `world-country${roleClass}`);
      currentViewport.appendChild(p);
      centroidByIso2.set(country.iso2, path.centroid(country.feature));
    });

    const chainPath = worldAssist?.chainPathIso2 || [];
    for (let i = 0; i < chainPath.length - 1; i += 1) {
      const from = centroidByIso2.get(chainPath[i]);
      const to = centroidByIso2.get(chainPath[i + 1]);
      if (!from || !to) {
        continue;
      }

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", String(from[0]));
      line.setAttribute("y1", String(from[1]));
      line.setAttribute("x2", String(to[0]));
      line.setAttribute("y2", String(to[1]));
      line.setAttribute("class", "world-chain-arrow");
      currentViewport.appendChild(line);
    }

    const distanceLinkIso2 = worldAssist?.distanceLinkIso2 || [];
    if (distanceLinkIso2.length === 2) {
      const from = centroidByIso2.get(distanceLinkIso2[0]);
      const to = centroidByIso2.get(distanceLinkIso2[1]);
      if (from && to) {
        const distanceLine = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        distanceLine.setAttribute("x1", String(from[0]));
        distanceLine.setAttribute("y1", String(from[1]));
        distanceLine.setAttribute("x2", String(to[0]));
        distanceLine.setAttribute("y2", String(to[1]));
        distanceLine.setAttribute("class", "world-distance-line");
        currentViewport.appendChild(distanceLine);
      }
    }

    (worldAssist?.labels || []).forEach((entry) => {
      const xy = centroidByIso2.get(entry.iso2);
      if (!xy) {
        return;
      }

      const labelGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      labelGroup.setAttribute("class", "world-map-label-tag");
      labelGroup.setAttribute("data-anchor-x", String(xy[0]));
      labelGroup.setAttribute("data-anchor-y", String(xy[1]));

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", String(xy[0] + 6));
      text.setAttribute("y", String(xy[1] - 6));
      text.setAttribute("class", "world-map-label");
      text.textContent = entry.text;

      labelGroup.appendChild(text);
      currentViewport.appendChild(labelGroup);

      const bbox = text.getBBox();
      const padX = 7;
      const padY = 4;
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", String(bbox.x - padX));
      bg.setAttribute("y", String(bbox.y - padY));
      bg.setAttribute("width", String(bbox.width + padX * 2));
      bg.setAttribute("height", String(bbox.height + padY * 2));
      bg.setAttribute("rx", "5");
      bg.setAttribute("ry", "5");
      bg.setAttribute("class", "world-map-label-bg");
      labelGroup.insertBefore(bg, text);
    });

    if (!currentTransform || resetZoom) {
      currentTransform = d3.zoomIdentity;
    }

    svgSelection.call(zoomBehavior.transform, currentTransform);
    applyLabelScaleCompensation(currentTransform.k);
  }

  function renderWorldAssist(question, hasSubmitted = false, options = {}) {
    const { resetZoom = false } = options;
    const fallbackFocus = question?.worldFocusIso2 || [];
    const worldAssist = question?.worldAssist || { zoomIso2: fallbackFocus };
    const policy = question?.mapAssistPolicy || "optional";

    if (policy === "disabled") {
      mapAssistRow.classList.add("hidden");
      clearMap();
      return;
    }

    if (policy === "reveal-only") {
      mapAssistRow.classList.add("hidden");
      if (!hasSubmitted) {
        clearMap();
        return;
      }
      renderWorldMap(worldAssist);
      return;
    }

    if (policy === "required") {
      mapAssistRow.classList.add("hidden");
      renderWorldMap(worldAssist, { forceVisible: true, resetZoom });
      return;
    }

    mapAssistRow.classList.remove("hidden");
    renderWorldMap(worldAssist, { resetZoom });
  }

  function shouldIgnoreSelectionEvent() {
    return Date.now() < suppressSelectionUntil;
  }

  mapZoomInBtn.addEventListener("click", () => {
    const d3 = globalThis.d3;
    if (!d3 || !svgSelection || !zoomBehavior) {
      return;
    }
    svgSelection.interrupt();
    svgSelection.call(zoomBehavior.scaleBy, 1.24);
  });

  mapZoomOutBtn.addEventListener("click", () => {
    const d3 = globalThis.d3;
    if (!d3 || !svgSelection || !zoomBehavior) {
      return;
    }
    svgSelection.interrupt();
    svgSelection.call(zoomBehavior.scaleBy, 1 / 1.24);
  });

  return {
    renderWorldAssist,
    shouldIgnoreSelectionEvent,
  };
}
