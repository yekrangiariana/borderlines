# Borderlines

Borderlines is a newspaper-style geography puzzle game built around map outlines, border logic, and short daily challenges.

The experience is designed to feel fast, clean, and replayable: pick a mode, solve compact rounds, and improve your geographic intuition over time.

## Core Modes

- `Competitive Mode`: a daily five-question challenge with leaderboard scoring.
- `Normal Mode`: classic outline-to-name gameplay.
- `Map Select`: identify answers directly from the map.
- `Region Chain`: connect start and end locations through valid border steps.
- `Reverse Border`: infer the answer from neighboring-location clues.
- `Battle Mode`: compare two options and choose the stronger border match.

## Regions

Game content can be filtered by regithon sets such as:

- All Countries
- Continents
- US States
- UK Areas
- Finland Regions

## Product Notes

- Local-first gameplay and settings persistence.
- Browser-rendered vector outlines for crisp map visuals.
- Deterministic daily challenge behavior for fair competition.
- Optional online leaderboard support for competitive runs.

## Data And Libraries

- Geographic datasets are stored under `data/`.
- Core gameplay and mode logic live under `js/`.
- Vendor libraries are in `vendor/` (including D3 and TopoJSON client).

## Attribution

- Outline data from `wri/wri-bounds`.
- Border relationship data from `https://www.geodatasource.com`.
