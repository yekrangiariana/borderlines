/**
 * Cloudflare Worker - Borderlines Leaderboard API
 *
 * This worker proxies requests to Turso database securely.
 * Deploy to Cloudflare Workers and set environment variables:
 *   - TURSO_URL: Your Turso database URL
 *   - TURSO_AUTH_TOKEN: Your Turso auth token
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MODE_ID = "daily-puzzle";
const NAME_MIN = 3;
const NAME_MAX = 16;

async function queryTurso(env, sql, args = []) {
  const url = env.TURSO_URL.replace(/\/$/, "") + "/v2/pipeline";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map((a) => ({ type: "text", value: String(a) })),
          },
        },
        { type: "close" },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Turso error: ${response.status} - ${text}`);
  }

  const data = await response.json();

  if (data.results?.[0]?.type === "error") {
    throw new Error(data.results[0].error.message);
  }

  return data.results?.[0]?.response?.result || { rows: [] };
}

function getTodayDayKey() {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizeDisplayName(rawName) {
  const trimmed = String(rawName || "").trim();
  const cleaned = trimmed.replace(/\s+/g, " ");
  const validPattern = /^[A-Za-z0-9_ ]+$/;

  if (!cleaned) {
    return { ok: false, message: "Enter a display name." };
  }

  if (cleaned.length < NAME_MIN || cleaned.length > NAME_MAX) {
    return {
      ok: false,
      message: `Name must be ${NAME_MIN}-${NAME_MAX} characters.`,
    };
  }

  if (!validPattern.test(cleaned)) {
    return {
      ok: false,
      message: "Use letters, numbers, spaces, or underscore only.",
    };
  }

  return { ok: true, value: cleaned };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function handleSubmitScore(env, body) {
  const { displayName, score, maxScore, continent, deviceId, playerCountry } =
    body;

  const nameResult = sanitizeDisplayName(displayName);
  if (!nameResult.ok) {
    return jsonResponse({ ok: false, message: nameResult.message }, 400);
  }

  const numericScore = Number(score);
  const numericMax = Number(maxScore);
  if (!Number.isInteger(numericScore) || !Number.isInteger(numericMax)) {
    return jsonResponse({ ok: false, message: "Invalid score values." }, 400);
  }

  const cleanDeviceId = String(deviceId || "").trim();
  if (!cleanDeviceId) {
    return jsonResponse(
      { ok: false, message: "Missing device identifier." },
      400,
    );
  }

  const dayKey = getTodayDayKey();
  const cleanCountry =
    playerCountry && /^[A-Za-z]{2}$/.test(String(playerCountry))
      ? String(playerCountry).toUpperCase()
      : null;

  try {
    await queryTurso(
      env,
      `INSERT INTO leaderboard_scores 
       (mode_id, day_key, display_name, device_id, player_country, score, max_score, continent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        MODE_ID,
        dayKey,
        nameResult.value,
        cleanDeviceId,
        cleanCountry,
        numericScore,
        numericMax,
        continent || "All",
      ],
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return jsonResponse(
        {
          ok: false,
          alreadyPlayed: true,
          message: "You already played today's Competitive Mode.",
        },
        409,
      );
    }
    console.error("Submit error:", error);
    return jsonResponse({ ok: false, message: "Could not submit score." }, 500);
  }
}

async function handleFetchDaily(env, limit = 20) {
  const dayKey = getTodayDayKey();

  try {
    const result = await queryTurso(
      env,
      `SELECT display_name, score, max_score, continent, played_at, player_country, device_id 
       FROM leaderboard_scores 
       WHERE mode_id = ? AND day_key = ?
       ORDER BY score DESC, played_at ASC
       LIMIT ?`,
      [MODE_ID, dayKey, limit],
    );

    const rows = (result.rows || []).map((row) => {
      const cols = result.cols.map((c) => c.name);
      const obj = {};
      cols.forEach((col, i) => {
        obj[col] = row[i]?.value ?? null;
      });
      return obj;
    });

    return jsonResponse({ ok: true, rows });
  } catch (error) {
    console.error("Fetch daily error:", error);
    return jsonResponse(
      { ok: false, message: "Could not load leaderboard.", rows: [] },
      500,
    );
  }
}

async function handleFetchWeekly(env, limit = 20) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);

  try {
    const result = await queryTurso(
      env,
      `SELECT display_name, score, max_score, continent, played_at, player_country, device_id 
       FROM leaderboard_scores 
       WHERE mode_id = ? AND played_at >= ?
       ORDER BY score DESC, played_at ASC
       LIMIT ?`,
      [MODE_ID, weekStart.toISOString(), limit],
    );

    const rows = (result.rows || []).map((row) => {
      const cols = result.cols.map((c) => c.name);
      const obj = {};
      cols.forEach((col, i) => {
        obj[col] = row[i]?.value ?? null;
      });
      return obj;
    });

    return jsonResponse({ ok: true, rows });
  } catch (error) {
    console.error("Fetch weekly error:", error);
    return jsonResponse(
      { ok: false, message: "Could not load leaderboard.", rows: [] },
      500,
    );
  }
}

async function handleCheckPlayed(env, deviceId) {
  const cleanDeviceId = String(deviceId || "").trim();
  if (!cleanDeviceId) {
    return jsonResponse(
      { ok: false, message: "Missing device identifier.", played: false },
      400,
    );
  }

  const dayKey = getTodayDayKey();

  try {
    const result = await queryTurso(
      env,
      `SELECT COUNT(*) as count FROM leaderboard_scores 
       WHERE mode_id = ? AND day_key = ? AND device_id = ?`,
      [MODE_ID, dayKey, cleanDeviceId],
    );

    const count = result.rows?.[0]?.[0]?.value ?? 0;
    return jsonResponse({ ok: true, played: parseInt(count, 10) > 0 });
  } catch (error) {
    console.error("Check played error:", error);
    return jsonResponse(
      { ok: false, message: "Could not check eligibility.", played: false },
      500,
    );
  }
}

async function handleMyRun(env, deviceId) {
  const cleanDeviceId = String(deviceId || "").trim();
  if (!cleanDeviceId) {
    return jsonResponse(
      { ok: false, message: "Missing device identifier.", row: null },
      400,
    );
  }

  const dayKey = getTodayDayKey();

  try {
    const result = await queryTurso(
      env,
      `SELECT score, max_score, played_at, display_name, player_country 
       FROM leaderboard_scores 
       WHERE mode_id = ? AND day_key = ? AND device_id = ?
       LIMIT 1`,
      [MODE_ID, dayKey, cleanDeviceId],
    );

    if (!result.rows || result.rows.length === 0) {
      return jsonResponse({ ok: true, row: null });
    }

    const cols = result.cols.map((c) => c.name);
    const row = {};
    cols.forEach((col, i) => {
      row[col] = result.rows[0][i]?.value ?? null;
    });

    return jsonResponse({ ok: true, row });
  } catch (error) {
    console.error("My run error:", error);
    return jsonResponse(
      { ok: false, message: "Could not load today's run.", row: null },
      500,
    );
  }
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // POST /submit - Submit a score
      if (request.method === "POST" && path === "/submit") {
        const body = await request.json();
        return handleSubmitScore(env, body);
      }

      // GET /daily - Fetch daily leaderboard
      if (request.method === "GET" && path === "/daily") {
        const limit = parseInt(url.searchParams.get("limit") || "20", 10);
        return handleFetchDaily(env, Math.min(limit, 100));
      }

      // GET /weekly - Fetch weekly leaderboard
      if (request.method === "GET" && path === "/weekly") {
        const limit = parseInt(url.searchParams.get("limit") || "20", 10);
        return handleFetchWeekly(env, Math.min(limit, 100));
      }

      // GET /check - Check if device has played today
      if (request.method === "GET" && path === "/check") {
        const deviceId = url.searchParams.get("deviceId");
        return handleCheckPlayed(env, deviceId);
      }

      // GET /my-run - Get current device's run for today
      if (request.method === "GET" && path === "/my-run") {
        const deviceId = url.searchParams.get("deviceId");
        return handleMyRun(env, deviceId);
      }

      // Health check
      if (request.method === "GET" && path === "/health") {
        return jsonResponse({ ok: true, service: "borderlines-leaderboard" });
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker error:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  },
};
