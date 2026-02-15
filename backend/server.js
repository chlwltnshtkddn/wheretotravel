const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ quiet: true });
const {
  buildR2State,
  putBuffer,
  putJson,
  listObjects,
  getObjectText,
  headObject,
  signedGetUrl,
  syncSeedData,
  objectUrl,
} = require("./r2");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const TAXONOMY_FILE = path.join(DATA_DIR, "tag_taxonomy.v1.json");
const COUNTRIES_FILE = path.join(DATA_DIR, "countries.v1.json");
const RUNTIME_DIR = path.join(DATA_DIR, "runtime");
const SESSIONS_DIR = path.join(RUNTIME_DIR, "sessions");
const EVENTS_FILE = path.join(RUNTIME_DIR, "events.jsonl");
const PORT = Number(process.env.PORT || 8787);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const PERSONAS = [
  {
    id: "P01",
    name: "자연 힐링파 (광합성 요정)",
    high: ["forest_nature", "relaxation"],
    low: ["urban", "nightlife"],
    summary: "자연과 휴식에서 에너지를 회복하는 타입",
  },
  {
    id: "P02",
    name: "자연 야생파 (베어그릴스)",
    high: ["forest_nature", "activity", "exoticness"],
    low: ["luxury"],
    summary: "편안함보다 체험과 모험을 더 좋아하는 타입",
  },
  {
    id: "P03",
    name: "도시 쇼핑파 (쇼퍼홀릭)",
    high: ["urban", "shopping", "luxury"],
    low: ["forest_nature"],
    summary: "도시의 속도와 쇼핑 동선에서 만족도가 높은 타입",
  },
  {
    id: "P04",
    name: "도시 예술파 (박물관 덕후)",
    high: ["urban", "heritage_culture", "landmark_architecture"],
    low: ["activity"],
    summary: "역사·문화·건축 스토리를 즐기는 타입",
  },
  {
    id: "P05",
    name: "럭셔리 휴양파 (호캉스족)",
    high: ["relaxation", "luxury", "water"],
    low: ["activity"],
    summary: "휴식 품질과 숙소 경험을 가장 중요하게 보는 타입",
  },
  {
    id: "P06",
    name: "로컬 미식파 (시장 탐험가)",
    high: ["food", "heritage_culture", "exoticness"],
    low: ["luxury"],
    summary: "로컬 음식과 분위기에서 여행의 재미를 찾는 타입",
  },
  {
    id: "P07",
    name: "계획적 관광파 (랜드마크 콜렉터)",
    high: ["heritage_culture", "landmark_architecture"],
    low: ["nightlife"],
    summary: "핵심 명소를 효율적으로 수집하는 타입",
  },
  {
    id: "P08",
    name: "즉흥적 낭만파 (골목길/야경)",
    high: ["nightlife", "water", "urban"],
    low: ["landmark_architecture"],
    summary: "야경과 분위기 중심의 즉흥 동선을 선호하는 타입",
  },
];

const state = {
  taxonomy: null,
  countries: [],
  tags: [],
  tagIndexMap: {},
  countriesByCode: new Map(),
  placesById: new Map(),
  allPlaces: [],
  sessions: new Map(),
  r2: null,
};

function nowIso() {
  return new Date().toISOString();
}

async function ensureRuntimeDirs() {
  await fsp.mkdir(SESSIONS_DIR, { recursive: true });
  await fsp.mkdir(RUNTIME_DIR, { recursive: true });
  try {
    await fsp.access(EVENTS_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(EVENTS_FILE, "", "utf8");
  }
}

function createError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function loadData() {
  const [taxonomyRaw, countriesRaw] = await Promise.all([
    fsp.readFile(TAXONOMY_FILE, "utf8"),
    fsp.readFile(COUNTRIES_FILE, "utf8"),
  ]);
  state.taxonomy = JSON.parse(taxonomyRaw);
  const countriesObj = JSON.parse(countriesRaw);
  state.countries = countriesObj.countries ?? [];
  state.tags = state.taxonomy.tags ?? [];
  state.tagIndexMap = Object.fromEntries(state.tags.map((tag, idx) => [tag.id, idx]));
  state.countriesByCode.clear();
  state.placesById.clear();
  state.allPlaces = [];

  for (const country of state.countries) {
    state.countriesByCode.set(country.country_code, country);
    for (const place of country.places) {
      const withRef = { ...place, __country: country };
      state.placesById.set(place.place_id, withRef);
      state.allPlaces.push(withRef);
    }
  }
}

async function appendEvent(type, payload = {}) {
  const line = JSON.stringify({ at: nowIso(), type, payload });
  await fsp.appendFile(EVENTS_FILE, `${line}\n`, "utf8");
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function magnitude(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  return Math.sqrt(sum);
}

function cosineSimilarity(a, b) {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (!ma || !mb) return 0;
  return dot(a, b) / (ma * mb);
}

function similarityScore(a, b) {
  const cos = cosineSimilarity(a, b);
  const raw = dot(a, b) / (a.length || 1);
  return cos * 0.85 + raw * 0.15;
}

function topTagIdsFromVector(vector, count = 3) {
  return state.tags
    .map((tag, idx) => ({ id: tag.id, score: vector[idx] ?? 0 }))
    .sort((x, y) => y.score - x.score)
    .slice(0, count)
    .map((row) => row.id);
}

function placeSummary(place) {
  return {
    place_id: place.place_id,
    name_en: place.name_en,
    city: place.city,
    country_code: place.country_code,
    country_name_en: place.__country.country_name_en,
    region: place.__country.region,
    tags_vector: place.tags_vector,
  };
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickStage1Pool(target = 10) {
  const byRegion = {};
  for (const country of state.countries) {
    byRegion[country.region] ??= [];
    byRegion[country.region].push(country);
  }

  const selected = [];
  const regions = shuffle(Object.keys(byRegion));
  for (const region of regions) {
    if (selected.length >= target) break;
    const countries = shuffle(byRegion[region]);
    for (const country of countries) {
      if (!country.places.length) continue;
      const place = country.places[Math.floor(Math.random() * country.places.length)];
      selected.push(place.place_id);
      break;
    }
  }

  if (selected.length < target) {
    const leftovers = shuffle(state.allPlaces).map((place) => place.place_id);
    for (const placeId of leftovers) {
      if (selected.length >= target) break;
      if (!selected.includes(placeId)) selected.push(placeId);
    }
  }

  return selected.slice(0, target);
}

function buildStage2Pool(session) {
  const target = 26 + Math.floor(Math.random() * 5); // 26~30
  const seen = new Set(session.votes.map((vote) => vote.place_id));
  const candidates = state.allPlaces
    .filter((place) => !seen.has(place.place_id))
    .map((place) => ({
      place,
      score: similarityScore(session.user_vector, place.tags_vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 500);

  const countryCap = 3;
  const countryCount = {};
  const selected = [];

  for (const row of candidates) {
    const code = row.place.country_code;
    const count = countryCount[code] ?? 0;
    if (count >= countryCap) continue;
    selected.push(row.place.place_id);
    countryCount[code] = count + 1;
    if (selected.length >= target) break;
  }

  if (selected.length < target) {
    const fallback = shuffle(state.allPlaces);
    for (const place of fallback) {
      if (selected.length >= target) break;
      if (seen.has(place.place_id)) continue;
      if (selected.includes(place.place_id)) continue;
      selected.push(place.place_id);
    }
  }

  return { target, pool: selected.slice(0, target) };
}

function getCurrentPool(session) {
  if (session.stage === "stage1") return session.stage1_pool;
  if (session.stage === "stage2") return session.stage2_pool;
  return [];
}

function getCurrentTarget(session) {
  if (session.stage === "stage1") return session.stage1_target;
  if (session.stage === "stage2") return session.stage2_target;
  return 0;
}

function getCurrentPlace(session) {
  const pool = getCurrentPool(session);
  const placeId = pool[session.cursor];
  if (!placeId) return null;
  return state.placesById.get(placeId) ?? null;
}

async function saveSession(session) {
  session.updated_at = nowIso();
  const sessionFile = path.join(SESSIONS_DIR, `${session.session_id}.json`);
  await fsp.writeFile(sessionFile, JSON.stringify(session, null, 2), "utf8");
  state.sessions.set(session.session_id, session);
}

async function loadSession(sessionId) {
  if (state.sessions.has(sessionId)) return state.sessions.get(sessionId);
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    const raw = await fsp.readFile(sessionFile, "utf8");
    const session = JSON.parse(raw);
    state.sessions.set(sessionId, session);
    return session;
  } catch {
    throw createError("session not found", 404);
  }
}

function sessionResponse(session) {
  const current = getCurrentPlace(session);
  return {
    session_id: session.session_id,
    stage: session.stage,
    cursor: session.cursor,
    stage1_target: session.stage1_target,
    stage2_target: session.stage2_target,
    total_votes: session.votes.length,
    completed: session.stage === "completed",
    current_place: current ? placeSummary(current) : null,
  };
}

function resolvePersona(userVector) {
  const scored = PERSONAS.map((persona) => {
    let score = 0;
    for (const id of persona.high) score += userVector[state.tagIndexMap[id]] ?? 0;
    for (const id of persona.low) score -= userVector[state.tagIndexMap[id]] ?? 0;
    return { ...persona, _score: score };
  }).sort((a, b) => b._score - a._score);
  return scored[0];
}

function placeReasons(place, userVector) {
  const weighted = place.tags_vector.map((v, idx) => v * Math.max(userVector[idx] ?? 0, 0));
  const tags = topTagIdsFromVector(weighted, 3);
  return tags.map((tagId) => `${tagId} 성향 점수가 높아 ${place.city} 경험과 잘 맞습니다.`);
}

function buildRecommendation(session) {
  const rankedCountries = state.countries
    .map((country) => ({
      country,
      score: similarityScore(session.user_vector, country.tags_vector),
    }))
    .sort((a, b) => b.score - a.score);

  const primaryCountry = rankedCountries[0]?.country;
  const secondaryCountry =
    rankedCountries.find((row) => row.country.region !== primaryCountry?.region)?.country ||
    rankedCountries[1]?.country;
  if (!primaryCountry || !secondaryCountry) {
    throw createError("insufficient country data", 500);
  }

  function bestPlace(country) {
    const rows = country.places
      .map((place) => ({
        place: state.placesById.get(place.place_id),
        score: similarityScore(session.user_vector, place.tags_vector),
      }))
      .sort((a, b) => b.score - a.score);
    return rows[0].place;
  }

  const primaryPlace = bestPlace(primaryCountry);
  const secondaryPlace = bestPlace(secondaryCountry);
  const persona = resolvePersona(session.user_vector);

  return {
    persona: {
      id: persona.id,
      name: persona.name,
      summary: persona.summary,
    },
    primary_result: {
      country_code: primaryCountry.country_code,
      country_name_en: primaryCountry.country_name_en,
      place: placeSummary(primaryPlace),
      reasons: placeReasons(primaryPlace, session.user_vector),
    },
    secondary_result: {
      country_code: secondaryCountry.country_code,
      country_name_en: secondaryCountry.country_name_en,
      place: placeSummary(secondaryPlace),
      reasons: placeReasons(secondaryPlace, session.user_vector),
    },
  };
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw createError("body too large", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw createError("invalid json body", 400);
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendError(res, err) {
  const status = err.status || 500;
  sendJson(res, status, {
    error: {
      message: err.message || "internal server error",
      status,
    },
  });
}

function toOtaLinks(city, country, travelers = 2, month = "", budget = "mid") {
  const booking = new URL("https://www.booking.com/searchresults.html");
  booking.searchParams.set("ss", `${city}, ${country}`);
  booking.searchParams.set("group_adults", String(travelers));
  booking.searchParams.set("no_rooms", "1");

  if (month) {
    const [yy, mm] = month.split("-").map(Number);
    if (yy && mm) {
      const checkin = new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
      const checkout = new Date(Date.UTC(yy, mm - 1, 4)).toISOString().slice(0, 10);
      booking.searchParams.set("checkin", checkin);
      booking.searchParams.set("checkout", checkout);
    }
  }

  const flight = new URL("https://www.google.com/travel/flights");
  flight.searchParams.set("q", `Flights to ${city}`);
  flight.searchParams.set("budget", budget);

  return {
    hotel_url: booking.toString(),
    flight_url: flight.toString(),
  };
}

function ensureR2Enabled() {
  if (!state.r2 || !state.r2.enabled) {
    throw createError("r2 not configured. set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY", 503);
  }
}

function sanitizeObjectKey(value) {
  const key = String(value || "").trim().replace(/^\/+/, "");
  if (!key) throw createError("key is required", 400);
  if (key.includes("..")) throw createError("invalid key", 400);
  return key;
}

async function handleR2Api(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/r2/status") {
    const configured = Boolean(state.r2 && state.r2.enabled);
    return sendJson(res, 200, {
      configured,
      endpoint: state.r2?.config.endpoint || "",
      bucket: state.r2?.config.bucket || "",
      public_base_url: state.r2?.config.publicBaseUrl || "",
    });
  }

  ensureR2Enabled();

  if (req.method === "POST" && pathname === "/api/r2/sync-seed-data") {
    const uploaded = await syncSeedData(state.r2, ROOT_DIR);
    await appendEvent("r2_sync_seed_data", {
      bucket: state.r2.config.bucket,
      files: uploaded.map((f) => f.key),
    });
    return sendJson(res, 200, {
      message: "seed data synced to r2",
      uploaded,
    });
  }

  if (req.method === "GET" && pathname === "/api/r2/list") {
    const prefix = searchParams.get("prefix") || "";
    const limit = Number(searchParams.get("limit") || "100");
    const objects = await listObjects(state.r2, prefix, limit);
    return sendJson(res, 200, { objects });
  }

  if (req.method === "POST" && pathname === "/api/r2/upload-json") {
    const body = await readJsonBody(req, 2 * 1024 * 1024);
    const key = sanitizeObjectKey(body.key);
    const value = body.value;
    if (value === undefined) throw createError("value is required", 400);
    const uploaded = await putJson(state.r2, key, value);
    await appendEvent("r2_upload_json", { key });
    return sendJson(res, 201, {
      message: "json uploaded",
      ...uploaded,
    });
  }

  if (req.method === "POST" && pathname === "/api/r2/upload-base64") {
    const body = await readJsonBody(req, 15 * 1024 * 1024);
    const key = sanitizeObjectKey(body.key);
    if (!body.content_base64) throw createError("content_base64 is required", 400);
    const contentType = String(body.content_type || "application/octet-stream");
    const buffer = Buffer.from(String(body.content_base64), "base64");
    const uploaded = await putBuffer(state.r2, key, buffer, contentType, {
      source: "api_upload_base64",
    });
    await appendEvent("r2_upload_base64", { key, bytes: buffer.length });
    return sendJson(res, 201, {
      message: "object uploaded",
      bytes: buffer.length,
      ...uploaded,
    });
  }

  if (req.method === "POST" && pathname === "/api/r2/upload-image-url") {
    const body = await readJsonBody(req, 2 * 1024 * 1024);
    const key = sanitizeObjectKey(body.key);
    const sourceUrl = String(body.source_url || "").trim();
    if (!sourceUrl) throw createError("source_url is required", 400);

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw createError(`failed to fetch source_url: ${response.status}`, 400);
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const arr = await response.arrayBuffer();
    const buffer = Buffer.from(arr);
    const uploaded = await putBuffer(state.r2, key, buffer, contentType, {
      source: "upload_image_url",
    });
    await appendEvent("r2_upload_image_url", {
      key,
      source_url: sourceUrl,
      bytes: buffer.length,
    });
    return sendJson(res, 201, {
      message: "image uploaded from url",
      bytes: buffer.length,
      content_type: contentType,
      ...uploaded,
    });
  }

  if (req.method === "GET" && pathname === "/api/r2/object") {
    const key = sanitizeObjectKey(searchParams.get("key"));
    const text = await getObjectText(state.r2, key);
    const info = await headObject(state.r2, key);
    return sendJson(res, 200, {
      key,
      info,
      preview: text.slice(0, 2000),
    });
  }

  if (req.method === "GET" && pathname === "/api/r2/signed-url") {
    const key = sanitizeObjectKey(searchParams.get("key"));
    const expires = Number(searchParams.get("expires") || "3600");
    const signed = await signedGetUrl(state.r2, key, expires);
    return sendJson(res, 200, {
      key,
      ...signed,
    });
  }

  if (req.method === "GET" && pathname === "/api/r2/public-url") {
    const key = sanitizeObjectKey(searchParams.get("key"));
    return sendJson(res, 200, {
      key,
      url: objectUrl(state.r2, key),
    });
  }

  throw createError("r2 api route not found", 404);
}

function parseSessionIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(vote|recommendation|ota-links))?$/);
  if (!match) return null;
  return {
    sessionId: match[1],
    action: match[2] || "",
  };
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      now: nowIso(),
      storage: "data/runtime",
      countries: state.countries.length,
      places: state.allPlaces.length,
      r2: {
        configured: Boolean(state.r2 && state.r2.enabled),
        bucket: state.r2?.config.bucket || "",
      },
    });
  }

  if (pathname.startsWith("/api/r2/")) {
    return handleR2Api(req, res, url);
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    const source = searchParams.get("source") || "local";
    if (source === "r2") {
      ensureR2Enabled();
      const [taxonomyText, countriesText] = await Promise.all([
        getObjectText(state.r2, "data/v1/tag_taxonomy.v1.json"),
        getObjectText(state.r2, "data/v1/countries.v1.json"),
      ]);
      const taxonomy = JSON.parse(taxonomyText);
      const countriesObj = JSON.parse(countriesText);
      return sendJson(res, 200, {
        source: "r2",
        taxonomy,
        countries: countriesObj.countries || [],
        meta: countriesObj.meta || {},
      });
    }

    return sendJson(res, 200, {
      source: "local",
      taxonomy: state.taxonomy,
      countries: state.countries,
      meta: {
        countries: state.countries.length,
        places: state.allPlaces.length,
      },
    });
  }

  if (req.method === "GET" && pathname === "/api/countries") {
    const slim = state.countries.map((country) => ({
      country_code: country.country_code,
      country_name_en: country.country_name_en,
      region: country.region,
      seed_place_count: country.seed_place_count,
      place_count_bucket: country.place_count_bucket,
    }));
    return sendJson(res, 200, { countries: slim });
  }

  if (req.method === "POST" && pathname === "/api/sessions") {
    const sessionId = crypto.randomUUID();
    const stage1Pool = pickStage1Pool(10);
    const session = {
      session_id: sessionId,
      created_at: nowIso(),
      updated_at: nowIso(),
      stage: "stage1",
      cursor: 0,
      stage1_target: 10,
      stage2_target: null,
      stage1_pool: stage1Pool,
      stage2_pool: [],
      user_vector: new Array(state.tags.length).fill(0),
      votes: [],
    };

    await saveSession(session);
    await appendEvent("session_created", { session_id: sessionId });
    return sendJson(res, 201, {
      message: "session created",
      ...sessionResponse(session),
    });
  }

  const parsed = parseSessionIdFromPath(pathname);
  if (!parsed) throw createError("api route not found", 404);

  const session = await loadSession(parsed.sessionId);

  if (req.method === "GET" && !parsed.action) {
    return sendJson(res, 200, sessionResponse(session));
  }

  if (req.method === "POST" && parsed.action === "vote") {
    if (session.stage === "completed") {
      throw createError("session already completed", 409);
    }
    const body = await readJsonBody(req);
    const { place_id: placeId, choice } = body;
    if (!placeId || !["like", "neutral", "dislike"].includes(choice)) {
      throw createError("place_id and choice are required", 400);
    }

    const pool = getCurrentPool(session);
    const expectedPlaceId = pool[session.cursor];
    if (!expectedPlaceId) throw createError("no more places in current stage", 409);
    if (placeId !== expectedPlaceId) {
      throw createError("place_id does not match current cursor place", 409);
    }

    const place = state.placesById.get(placeId);
    if (!place) throw createError("place not found", 404);

    let sign = 0;
    if (choice === "like") sign = 1;
    if (choice === "dislike") sign = -1;

    if (sign !== 0) {
      for (let i = 0; i < session.user_vector.length; i += 1) {
        session.user_vector[i] += sign * place.tags_vector[i];
      }
    }

    session.votes.push({
      at: nowIso(),
      stage: session.stage,
      place_id: placeId,
      choice,
    });
    session.cursor += 1;

    const target = getCurrentTarget(session);
    if (session.cursor >= target) {
      if (session.stage === "stage1") {
        const stage2 = buildStage2Pool(session);
        session.stage = "stage2";
        session.cursor = 0;
        session.stage2_target = stage2.target;
        session.stage2_pool = stage2.pool;
        await appendEvent("stage1_complete", {
          session_id: session.session_id,
          stage2_target: stage2.target,
        });
      } else {
        session.stage = "completed";
        session.cursor = 0;
        await appendEvent("stage2_complete", {
          session_id: session.session_id,
          total_votes: session.votes.length,
        });
      }
    }

    await saveSession(session);
    return sendJson(res, 200, {
      message: "vote accepted",
      ...sessionResponse(session),
    });
  }

  if (req.method === "POST" && parsed.action === "recommendation") {
    const result = buildRecommendation(session);
    await appendEvent("recommendation_requested", {
      session_id: session.session_id,
      completed: session.stage === "completed",
    });
    return sendJson(res, 200, {
      ...result,
      session: sessionResponse(session),
    });
  }

  if (req.method === "POST" && parsed.action === "ota-links") {
    const body = await readJsonBody(req);
    const city =
      body.city ||
      (session.stage === "completed"
        ? buildRecommendation(session).primary_result.place.city
        : null);
    if (!city) throw createError("city is required before completion", 400);

    const country = body.country || "";
    const links = toOtaLinks(
      city,
      country,
      Number(body.travelers || 2),
      body.month || "",
      body.budget || "mid"
    );
    return sendJson(res, 200, links);
  }

  throw createError("api route not found", 404);
}

function safeJoin(root, targetPath) {
  const filePath = path.normalize(path.join(root, targetPath));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = safeJoin(ROOT_DIR, pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".json" ? "no-store" : "public, max-age=120",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    sendError(res, err);
  }
}

async function bootstrap(port = PORT) {
  await ensureRuntimeDirs();
  await loadData();
  state.r2 = buildR2State();
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => {
    server.listen(port, () => {
      resolve();
    });
  });
  console.log(`[backend] running at http://localhost:${port}`);
  console.log(`[backend] sessions stored in ${SESSIONS_DIR}`);
  if (state.r2.enabled) {
    console.log(`[backend] r2 configured for bucket ${state.r2.config.bucket}`);
  } else {
    console.log("[backend] r2 not configured");
  }
  return server;
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error("[backend] failed to start", err);
    process.exit(1);
  });
}

module.exports = {
  bootstrap,
};
