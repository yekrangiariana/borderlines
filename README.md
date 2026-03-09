# Borderlines

A local-first geography game using country and US state outlines plus border-adjacency data.

## Modes

- `Region Chain`: Build a valid 4-step border chain between two locations.
- `Reverse Border`: Guess a location from neighboring-location clues.
- `Battle Mode`: Pick which of two outlines has more land neighbors.
- `Daily Puzzle`: A deterministic 5-question mixed set that changes daily.

## Settings

- From the mode selection screen, open `Settings` and choose a region.
- Supported regions include `All Countries`, individual continents, `US States`, `UK Areas`, and `Finland Regions`.
- The selected region limits question generation and accepted answers across non-competitive modes.

## Run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Competitive Mixed Mode (Supabase Leaderboard)

You can keep hosting the frontend on GitHub Pages and use Supabase for leaderboard storage.

Mixed mode (`Daily Puzzle`) uses a deterministic 5-question set each day.
Scoring is 1 point per correct answer, so total score is always out of 5 in this mode.
The daily reset now follows the player's local midnight.

### 1. Create The Table In Supabase

Open Supabase SQL Editor and run:

```sql
create table if not exists public.leaderboard_scores (
	id bigint generated always as identity primary key,
	mode_id text not null,
	day_key date not null,
	display_name text not null,
	score integer not null,
	max_score integer not null,
	continent text not null default 'All',
	played_at timestamptz not null default now()
);

create index if not exists leaderboard_scores_mode_day_idx
	on public.leaderboard_scores (mode_id, day_key, score desc, played_at asc);
```

### 2. Turn On Row Level Security

In Supabase Table Editor, enable RLS for `leaderboard_scores`.

Then run these policies:

```sql
create policy "Public can read leaderboard rows"
on public.leaderboard_scores
for select
to anon
using (true);

create policy "Public can insert bounded mixed scores"
on public.leaderboard_scores
for insert
to anon
with check (
	mode_id = 'daily-puzzle'
	and day_key is not null
	and device_id is not null
	and char_length(device_id) >= 12
	and (player_country is null or char_length(player_country) = 2)
	and score >= 0 and score <= 5
	and max_score = 5
	and char_length(display_name) between 3 and 16
);
```

### 2.1 Enforce One Competitive Play Per Day (Per Device)

Run this SQL migration to prevent multiple daily submissions from the same device:

```sql
alter table public.leaderboard_scores
	add column if not exists device_id text;

alter table public.leaderboard_scores
	add column if not exists player_country text;

create unique index if not exists leaderboard_scores_daily_unique_device_idx
	on public.leaderboard_scores (mode_id, day_key, device_id);
```

If you already created the insert policy earlier, update it:

```sql
drop policy if exists "Public can insert bounded mixed scores" on public.leaderboard_scores;

create policy "Public can insert bounded mixed scores"
on public.leaderboard_scores
for insert
to anon
with check (
	mode_id = 'daily-puzzle'
	and day_key is not null
	and device_id is not null
	and char_length(device_id) >= 12
	and (player_country is null or char_length(player_country) = 2)
	and score >= 0 and score <= 5
	and max_score = 5
	and char_length(display_name) between 3 and 16
);
```

This project also blocks the user from starting Competitive Mode again on the same day in the UI.
Country capture is best-effort from browser locale and is saved as a two-letter country code when available.

### 3. Add Supabase Project Keys

In Supabase dashboard: `Project Settings -> API`

Copy:
- Project URL
- `anon` public key

Paste into `js/supabaseConfig.js`:

```js
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

### 4. Deploy On GitHub Pages

No server is required for hosting the game UI.
The static site stays on GitHub Pages, and browser requests go directly to Supabase.

### Security Note

This is good for casual competition. Since gameplay runs in the browser, determined users can still fake requests.
For stricter anti-cheat, add a Supabase Edge Function that validates signed game events before insert.

## Project Structure

- `js/app.js`: Main game shell, mode picker, and shared round flow.
- `js/gameData.js`: Data loading, normalization, and SVG outline rendering.
- `js/modes/regionChainMode.js`: Region Chain mode logic.
- `js/modes/reverseBorderMode.js`: Reverse Border mode logic.
- `js/modes/battleMode.js`: Battle Mode logic.
- `js/modes/dailyPuzzleMode.js`: Daily Puzzle mode logic.

## Local Data Assets

- `data/all_primary_countries.min.geojson` (country outlines)
- `data/us_states_10m.json` (US states topology)
- `data/uk_admin_areas.geojson` (UK admin areas)
- `data/finland_admin_areas.geojson` (Finland admin areas)
- `data/GEODATASOURCE-COUNTRY-BORDERS.CSV` (border relationships)
- `data/countries.csv` (country attributes)
- `data/svgs/` and `data/svgs.zip` (WRI SVG map files)
- `vendor/d3.v7.min.js` (vendored D3)
- `vendor/topojson-client.min.js` (vendored TopoJSON client)

## Attribution

- Outline data from `wri/wri-bounds`.
- Border relationship data from `https://www.geodatasource.com`.
