const TAG_LABELS_KO = {
  forest_nature: "숲/자연",
  water: "물/해양",
  urban: "도시",
  relaxation: "휴양",
  heritage_culture: "역사·문화",
  food: "미식",
  nightlife: "야간활동",
  activity: "액티비티",
  shopping: "쇼핑",
  luxury: "럭셔리",
  exoticness: "이국성",
  landmark_architecture: "랜드마크·건축",
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

const VISUAL_COLORS = {
  forest_nature: "#3f8f52",
  water: "#2f8ea8",
  urban: "#596477",
  relaxation: "#91b46d",
  heritage_culture: "#9b6b38",
  food: "#d46f2d",
  nightlife: "#444a8e",
  activity: "#c94e4e",
  shopping: "#b55ea9",
  luxury: "#71624f",
  exoticness: "#cc8245",
  landmark_architecture: "#5d767c",
};

const DEFAULT_R2_IMAGE_BASE =
  "https://7129b3f4bf1db5e71866bf165166115c.r2.cloudflarestorage.com/wheretotravel-dev";
const R2_IMAGE_BASE = window.WHERETO_R2_IMAGE_BASE || DEFAULT_R2_IMAGE_BASE;

const state = {
  tags: [],
  countries: [],
  allPlaces: [],
  tagIndexMap: {},
  stage: 1,
  stage1Target: 10,
  stage2Target: 28,
  stage1Pool: [],
  stage2Pool: [],
  cursor: 0,
  votes: [],
  userVector: [],
  seenPlaceIds: new Set(),
  primary: null,
  secondary: null,
  persona: null,
  imageLoadToken: 0,
};

const dom = {
  statusPill: document.querySelector("#statusPill"),
  screens: {
    landing: document.querySelector("#screen-landing"),
    swipe: document.querySelector("#screen-swipe"),
    result: document.querySelector("#screen-result"),
  },
  startBtn: document.querySelector("#startBtn"),
  stageLabel: document.querySelector("#stageLabel"),
  counterLabel: document.querySelector("#counterLabel"),
  progressBar: document.querySelector("#progressBar"),
  undoBtn: document.querySelector("#undoBtn"),
  placeName: document.querySelector("#placeName"),
  placeCity: document.querySelector("#placeCity"),
  placeCountry: document.querySelector("#placeCountry"),
  tagChips: document.querySelector("#tagChips"),
  cardVisual: document.querySelector("#cardVisual"),
  placeImage: document.querySelector("#placeImage"),
  likeBtn: document.querySelector("#likeBtn"),
  neutralBtn: document.querySelector("#neutralBtn"),
  dislikeBtn: document.querySelector("#dislikeBtn"),
  personaName: document.querySelector("#personaName"),
  personaSummary: document.querySelector("#personaSummary"),
  primaryTitle: document.querySelector("#primaryTitle"),
  secondaryTitle: document.querySelector("#secondaryTitle"),
  primaryReasons: document.querySelector("#primaryReasons"),
  secondaryReasons: document.querySelector("#secondaryReasons"),
  contextForm: document.querySelector("#contextForm"),
  travelersInput: document.querySelector("#travelersInput"),
  monthInput: document.querySelector("#monthInput"),
  budgetInput: document.querySelector("#budgetInput"),
  hotelCta: document.querySelector("#hotelCta"),
  flightCta: document.querySelector("#flightCta"),
  shareBtn: document.querySelector("#shareBtn"),
  tripBrief: document.querySelector("#tripBrief"),
  sharePreview: document.querySelector("#sharePreview"),
  toast: document.querySelector("#toast"),
};

const trackEvent = (name, payload = {}) => {
  const event = {
    name,
    payload,
    at: new Date().toISOString(),
  };
  console.log("event", event);
};

const showToast = (text) => {
  dom.toast.textContent = text;
  dom.toast.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 1800);
};

const setScreen = (key) => {
  Object.values(dom.screens).forEach((screen) => screen.classList.remove("is-active"));
  dom.screens[key].classList.add("is-active");
};

const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
};

const magnitude = (vec) => {
  let s = 0;
  for (let i = 0; i < vec.length; i += 1) s += vec[i] * vec[i];
  return Math.sqrt(s);
};

const cosineSimilarity = (a, b) => {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (!ma || !mb) return 0;
  return dot(a, b) / (ma * mb);
};

const similarityScore = (a, b) => {
  // cosine 중심으로 magnitude bias를 줄이고, 약한 dot 신호를 보조로 사용
  const cos = cosineSimilarity(a, b);
  const raw = dot(a, b) / (a.length || 1);
  return cos * 0.85 + raw * 0.15;
};

const addVectorInPlace = (base, vec, sign) => {
  for (let i = 0; i < base.length; i += 1) {
    base[i] += sign * vec[i];
  }
};

const getCurrentPool = () => (state.stage === 1 ? state.stage1Pool : state.stage2Pool);

const getCurrentTarget = () => (state.stage === 1 ? state.stage1Target : state.stage2Target);

const getCurrentPlace = () => getCurrentPool()[state.cursor];

const topTagIdsFromVector = (vector, count = 3) => {
  return state.tags
    .map((tag, idx) => ({ id: tag.id, score: vector[idx] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.id);
};

const calcPersona = () => {
  const scoreFor = (persona) => {
    let score = 0;
    persona.high.forEach((id) => {
      score += state.userVector[state.tagIndexMap[id]] ?? 0;
    });
    persona.low.forEach((id) => {
      score -= state.userVector[state.tagIndexMap[id]] ?? 0;
    });
    return score;
  };

  return PERSONAS.map((p) => ({ ...p, _score: scoreFor(p) })).sort((a, b) => b._score - a._score)[0];
};

const placeReasons = (place) => {
  const weighted = place.tags_vector.map((v, idx) => v * Math.max(state.userVector[idx], 0));
  const top = topTagIdsFromVector(weighted, 3);
  return top.map((id) => `${TAG_LABELS_KO[id]} 성향이 높아 ${place.city} 동선과 잘 맞아요.`);
};

const countryName = (country) => country.country_name_en || country.country_code;

const setCardVisual = (place) => {
  const topTags = topTagIdsFromVector(place.tags_vector, 3);
  const colors = topTags.map((id) => VISUAL_COLORS[id] || "#6f8c8e");
  dom.cardVisual.style.background = `linear-gradient(140deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`;
};

const buildR2ImageKey = (place) => {
  return `images/placeholders/${place.country_code}/${place.place_id}.jpg`;
};

const pagesImageUrl = (place) =>
  `/img/${encodeURIComponent(place.country_code)}/${encodeURIComponent(place.place_id)}.jpg`;

const directR2ImageUrl = (place) => `${R2_IMAGE_BASE}/${buildR2ImageKey(place)}`;

const requestSignedImageUrl = async (place) => {
  try {
    const key = encodeURIComponent(buildR2ImageKey(place));
    const res = await fetch(`/api/r2/signed-url?key=${key}&expires=1800`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
};

const tryRenderImageUrl = (url, token) => {
  return new Promise((resolve) => {
    if (!url || token !== state.imageLoadToken) {
      resolve(false);
      return;
    }

    dom.placeImage.onload = () => {
      if (token !== state.imageLoadToken) {
        resolve(false);
        return;
      }
      dom.placeImage.classList.remove("is-hidden");
      resolve(true);
    };
    dom.placeImage.onerror = () => resolve(false);
    dom.placeImage.src = url;
  });
};

const buildGeneratedPlaceholderUrl = (place) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffd84d";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const title = place.city || place.name_en || "Destination";
  const subtitle = place.name_en || "";
  const country = `${countryName(place.__country)} (${place.country_code})`;

  ctx.font = "700 78px Arial";
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 90);
  ctx.font = "600 44px Arial";
  ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 10);
  ctx.font = "600 36px Arial";
  ctx.fillText(country, canvas.width / 2, canvas.height / 2 + 92);

  return canvas.toDataURL("image/jpeg", 0.9);
};

const loadPlaceImage = async (place) => {
  const token = ++state.imageLoadToken;
  const fallback = () => {
    if (token !== state.imageLoadToken) return;
    const generated = buildGeneratedPlaceholderUrl(place);
    if (!generated) {
      dom.placeImage.classList.add("is-hidden");
      dom.placeImage.removeAttribute("src");
      return;
    }
    dom.placeImage.onload = null;
    dom.placeImage.onerror = null;
    dom.placeImage.classList.remove("is-hidden");
    dom.placeImage.src = generated;
  };

  const candidates = [pagesImageUrl(place)];
  const signed = await requestSignedImageUrl(place);
  if (signed) candidates.push(signed);
  candidates.push(directR2ImageUrl(place));

  for (const url of candidates) {
    const ok = await tryRenderImageUrl(url, token);
    if (ok) return;
  }

  fallback();
};

const renderCurrentCard = () => {
  const place = getCurrentPlace();
  const target = getCurrentTarget();
  const globalDone = state.votes.length;
  const globalTarget = state.stage1Target + state.stage2Target;
  const progress = Math.round((globalDone / globalTarget) * 100);

  dom.stageLabel.textContent = state.stage === 1 ? "Stage 1 · 탐색 10장" : `Stage 2 · 정밀 ${state.stage2Target}장`;
  dom.counterLabel.textContent = `${state.cursor + 1} / ${target}`;
  dom.progressBar.style.width = `${progress}%`;

  if (!place) {
    dom.placeName.textContent = "추천 계산 중...";
    dom.placeCity.textContent = "";
    dom.placeCountry.textContent = "";
    dom.tagChips.innerHTML = "";
    return;
  }

  dom.placeName.textContent = place.name_en;
  dom.placeCity.textContent = place.city || "City";
  dom.placeCountry.textContent = `${countryName(place.__country)} (${place.country_code})`;

  const topTags = topTagIdsFromVector(place.tags_vector, 3);
  dom.tagChips.innerHTML = "";
  topTags.forEach((id) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = TAG_LABELS_KO[id];
    dom.tagChips.appendChild(chip);
  });
  setCardVisual(place);
  loadPlaceImage(place);
  dom.undoBtn.disabled = state.cursor === 0;
};

const pickDiverseStage1Pool = () => {
  const byRegion = {};
  state.countries.forEach((country) => {
    byRegion[country.region] ??= [];
    byRegion[country.region].push(country);
  });
  const regions = shuffle(Object.keys(byRegion));
  const picks = [];

  regions.forEach((region) => {
    if (picks.length >= state.stage1Target) return;
    const countries = shuffle(byRegion[region]);
    for (const country of countries) {
      if (picks.length >= state.stage1Target) break;
      const place = country.places[Math.floor(Math.random() * country.places.length)];
      picks.push(place);
      break;
    }
  });

  if (picks.length < state.stage1Target) {
    const remaining = shuffle(state.allPlaces).filter((p) => !picks.includes(p));
    picks.push(...remaining.slice(0, state.stage1Target - picks.length));
  }

  return picks.slice(0, state.stage1Target);
};

const buildStage2Pool = () => {
  const min = 26;
  const max = 30;
  state.stage2Target = min + Math.floor(Math.random() * (max - min + 1));

  const candidates = state.allPlaces
    .filter((p) => !state.seenPlaceIds.has(p.place_id))
    .map((p) => ({ place: p, score: similarityScore(state.userVector, p.tags_vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 500);

  const perCountryLimit = 3;
  const countryCounts = {};
  const selected = [];

  for (const row of candidates) {
    const code = row.place.country_code;
    const count = countryCounts[code] ?? 0;
    if (count >= perCountryLimit) continue;
    selected.push(row.place);
    countryCounts[code] = count + 1;
    if (selected.length >= state.stage2Target) break;
  }

  if (selected.length < state.stage2Target) {
    const fallback = shuffle(state.allPlaces).filter((p) => !state.seenPlaceIds.has(p.place_id));
    selected.push(...fallback.slice(0, state.stage2Target - selected.length));
  }

  return selected.slice(0, state.stage2Target);
};

const vote = (choice) => {
  const place = getCurrentPlace();
  if (!place) return;

  let sign = 0;
  if (choice === "like") sign = 1;
  if (choice === "dislike") sign = -1;

  addVectorInPlace(state.userVector, place.tags_vector, sign);
  state.votes.push({
    stage: state.stage,
    cursor: state.cursor,
    choice,
    place,
  });
  state.seenPlaceIds.add(place.place_id);
  trackEvent(`vote_${choice}`, { stage: state.stage, place_id: place.place_id });

  state.cursor += 1;
  const target = getCurrentTarget();

  if (state.cursor >= target) {
    if (state.stage === 1) {
      state.stage2Pool = buildStage2Pool();
      state.stage = 2;
      state.cursor = 0;
      trackEvent("stage1_complete", { stage2Target: state.stage2Target });
      showToast(`Stage 2 시작: ${state.stage2Target}장`);
      renderCurrentCard();
      return;
    }

    trackEvent("stage2_complete", { totalVotes: state.votes.length });
    showResult();
    return;
  }

  renderCurrentCard();
};

const undo = () => {
  if (state.cursor === 0) return;
  const currentStage = state.stage;
  const last = state.votes[state.votes.length - 1];
  if (!last || last.stage !== currentStage) return;

  state.votes.pop();
  state.cursor -= 1;
  state.seenPlaceIds.delete(last.place.place_id);

  let sign = 0;
  if (last.choice === "like") sign = -1;
  if (last.choice === "dislike") sign = 1;
  addVectorInPlace(state.userVector, last.place.tags_vector, sign);

  trackEvent("undo_vote", { stage: state.stage, place_id: last.place.place_id });
  renderCurrentCard();
};

const resolveCountryRecommendations = () => {
  const countryPref = {};
  const placePref = {};
  state.votes.forEach((vote) => {
    if (vote.choice === "neutral") return;
    const delta = vote.choice === "like" ? 1 : -1;
    const countryCode = vote.place.country_code;
    countryPref[countryCode] = (countryPref[countryCode] ?? 0) + delta;
    placePref[vote.place.place_id] = (placePref[vote.place.place_id] ?? 0) + delta;
  });

  const countryNorm = Math.max(1, ...Object.values(countryPref).map((value) => Math.abs(value)));
  const placeNorm = Math.max(1, ...Object.values(placePref).map((value) => Math.abs(value)));
  const weakVector = magnitude(state.userVector) < 0.15;
  const countryPrefWeight = weakVector ? 0.25 : 0.12;
  const placePrefWeight = weakVector ? 0.18 : 0.08;

  const rankedCountries = state.countries
    .map((country) => ({
      country,
      score:
        similarityScore(state.userVector, country.tags_vector) +
        ((countryPref[country.country_code] ?? 0) / countryNorm) * countryPrefWeight,
    }))
    .sort((a, b) => b.score - a.score);

  const topCountryPool = weakVector
    ? rankedCountries.slice(0, Math.min(12, rankedCountries.length))
    : rankedCountries.slice(0, 1);
  const primaryCountry =
    topCountryPool[Math.floor(Math.random() * topCountryPool.length)]?.country ||
    rankedCountries[0]?.country;
  const secondaryCountry =
    rankedCountries.find(
      (row) =>
        row.country.country_code !== primaryCountry?.country_code &&
        row.country.region !== primaryCountry?.region
    )?.country ||
    rankedCountries.find((row) => row.country.country_code !== primaryCountry?.country_code)
      ?.country ||
    rankedCountries[1]?.country ||
    rankedCountries[0]?.country;

  const bestPlaceFromCountry = (country, avoidPlaceId = "") => {
    if (!country || !country.places?.length) return null;

    const rankedPlaces = country.places
      .map((place) => ({
        place,
        score:
          similarityScore(state.userVector, place.tags_vector) +
          ((placePref[place.place_id] ?? 0) / placeNorm) * placePrefWeight,
      }))
      .sort((a, b) => b.score - a.score);

    const filtered = avoidPlaceId
      ? rankedPlaces.filter((row) => row.place.place_id !== avoidPlaceId)
      : rankedPlaces;

    const pool = weakVector
      ? filtered.slice(0, Math.min(3, filtered.length))
      : filtered.slice(0, 1);
    if (!pool.length) return filtered[0]?.place || country.places[0];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick.place;
  };

  const primaryPlace = bestPlaceFromCountry(primaryCountry);
  const secondaryPlace = bestPlaceFromCountry(secondaryCountry, primaryPlace?.place_id || "");

  return {
    primary: {
      country: primaryCountry,
      place: primaryPlace,
    },
    secondary: {
      country: secondaryCountry,
      place: secondaryPlace,
    },
  };
};

const renderResult = () => {
  dom.personaName.textContent = state.persona.name;
  dom.personaSummary.textContent = state.persona.summary;

  dom.primaryTitle.textContent = `${state.primary.place.city}, ${countryName(state.primary.country)}`;
  dom.secondaryTitle.textContent = `${state.secondary.place.city}, ${countryName(state.secondary.country)}`;

  dom.primaryReasons.innerHTML = "";
  placeReasons(state.primary.place).forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    dom.primaryReasons.appendChild(li);
  });

  dom.secondaryReasons.innerHTML = "";
  placeReasons(state.secondary.place).forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    dom.secondaryReasons.appendChild(li);
  });

  const share = `${state.persona.name} 타입 결과: ${state.primary.place.city} / ${state.secondary.place.city} 추천`;
  dom.sharePreview.textContent = share;
};

const formatTripDates = (monthValue) => {
  if (!monthValue) return { checkin: "", checkout: "" };
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) return { checkin: "", checkout: "" };
  const checkin = new Date(Date.UTC(year, month - 1, 1));
  const checkout = new Date(Date.UTC(year, month - 1, 4));
  const ymd = (d) => d.toISOString().slice(0, 10);
  return { checkin: ymd(checkin), checkout: ymd(checkout) };
};

const updateOtaLinks = () => {
  const travelers = Number(dom.travelersInput.value || 2);
  const month = dom.monthInput.value;
  const budget = dom.budgetInput.value;
  const city = state.primary.place.city;
  const country = countryName(state.primary.country);
  const { checkin, checkout } = formatTripDates(month);

  const booking = new URL("https://www.booking.com/searchresults.html");
  booking.searchParams.set("ss", `${city}, ${country}`);
  if (checkin) booking.searchParams.set("checkin", checkin);
  if (checkout) booking.searchParams.set("checkout", checkout);
  booking.searchParams.set("group_adults", String(travelers));
  booking.searchParams.set("no_rooms", "1");

  const flights = new URL("https://www.google.com/travel/flights");
  flights.searchParams.set("q", `Flights to ${city}`);

  dom.hotelCta.href = booking.toString();
  dom.flightCta.href = flights.toString();
  dom.hotelCta.classList.remove("is-disabled");
  dom.flightCta.classList.remove("is-disabled");

  const budgetText =
    budget === "low" ? "가성비 중심" : budget === "high" ? "프리미엄 중심" : "균형형";
  dom.tripBrief.textContent = `${travelers}명 · ${month || "시기 미정"} · ${budgetText} 기준으로 ${city} 우선 동선을 생성했습니다.`;
  trackEvent("context_submit", { travelers, month, budget, city });
};

const copyShareText = async () => {
  const text = `${state.persona.name} 결과! 1순위 ${state.primary.place.city}, 2순위 ${state.secondary.place.city}. #Wheretotravel`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("공유 문구를 복사했어요.");
    trackEvent("share_copy_click", { ok: true });
  } catch {
    showToast("복사 실패: 브라우저 권한을 확인해 주세요.");
    trackEvent("share_copy_click", { ok: false });
  }
};

const showResult = () => {
  const rec = resolveCountryRecommendations();
  state.primary = rec.primary;
  state.secondary = rec.secondary;
  state.persona = calcPersona();

  renderResult();
  setScreen("result");
  dom.statusPill.textContent = "결과 준비 완료";
  trackEvent("result_view", {
    primary: state.primary.place.place_id,
    secondary: state.secondary.place.place_id,
    persona: state.persona.id,
  });
};

const startJourney = () => {
  state.stage = 1;
  state.cursor = 0;
  state.votes = [];
  state.userVector = new Array(state.tags.length).fill(0);
  state.seenPlaceIds = new Set();
  state.stage1Pool = pickDiverseStage1Pool();
  state.stage2Pool = [];
  dom.statusPill.textContent = "Stage 1 진행중";
  setScreen("swipe");
  renderCurrentCard();
  trackEvent("start_click");
  trackEvent("swipe_view", { stage: 1 });
};

const attachCountryRef = (countries) => {
  const places = [];
  countries.forEach((country) => {
    country.places.forEach((place) => {
      place.__country = country;
      places.push(place);
    });
  });
  return places;
};

const bindActions = () => {
  dom.startBtn.addEventListener("click", startJourney);
  dom.likeBtn.addEventListener("click", () => vote("like"));
  dom.neutralBtn.addEventListener("click", () => vote("neutral"));
  dom.dislikeBtn.addEventListener("click", () => vote("dislike"));
  dom.undoBtn.addEventListener("click", undo);

  dom.contextForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateOtaLinks();
  });
  dom.shareBtn.addEventListener("click", copyShareText);

  document.addEventListener("keydown", (event) => {
    if (!dom.screens.swipe.classList.contains("is-active")) return;
    if (event.key === "ArrowRight") vote("like");
    if (event.key === "ArrowDown") vote("neutral");
    if (event.key === "ArrowLeft") vote("dislike");
    if (event.key.toLowerCase() === "z") undo();
  });
};

const bootstrap = async () => {
  try {
    trackEvent("landing_view");
    let source = "local";
    let tagsJson;
    let countriesJson;
    try {
      const apiRes = await fetch("/api/bootstrap?source=r2");
      if (!apiRes.ok) throw new Error("r2 bootstrap failed");
      const apiJson = await apiRes.json();
      tagsJson = apiJson.taxonomy;
      countriesJson = { countries: apiJson.countries };
      source = apiJson.source || "r2";
    } catch {
      const [tagRes, countryRes] = await Promise.all([
        fetch("./data/tag_taxonomy.v1.json"),
        fetch("./data/countries.v1.json"),
      ]);
      if (!tagRes.ok || !countryRes.ok) throw new Error("data load failed");
      tagsJson = await tagRes.json();
      countriesJson = await countryRes.json();
      source = "local";
    }

    state.tags = tagsJson.tags;
    state.countries = countriesJson.countries;
    state.tagIndexMap = Object.fromEntries(state.tags.map((tag, idx) => [tag.id, idx]));
    state.allPlaces = attachCountryRef(state.countries);

    dom.statusPill.textContent = `준비 완료(${source}) · ${state.countries.length}개국 / ${state.allPlaces.length}개 여행지`;
    dom.startBtn.disabled = false;
  } catch (error) {
    console.error(error);
    dom.statusPill.textContent = "데이터 로드 실패";
    dom.startBtn.disabled = true;
    showToast("데이터를 불러오지 못했습니다. 로컬 서버로 실행해 주세요.");
  }
};

bindActions();
bootstrap();
