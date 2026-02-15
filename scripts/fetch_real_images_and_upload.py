import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "countries.v1.json"
RUNTIME_DIR = ROOT / "data" / "runtime"
MANIFEST_FILE = RUNTIME_DIR / "image_ingest_manifest.v1.jsonl"


def load_env_file(path):
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(ROOT / ".env")
load_env_file(ROOT / ".env.example")

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:8787").rstrip("/")
START_SERVER = os.getenv("START_SERVER", "1") == "1"
MAX_PLACES = int(os.getenv("MAX_PLACES", "0") or "0")
REQUEST_DELAY_MS = int(os.getenv("REQUEST_DELAY_MS", "180") or "180")
PROVIDER_PRIORITY = [
    x.strip().lower()
    for x in os.getenv("PROVIDER_PRIORITY", "unsplash,pexels,pixabay").split(",")
    if x.strip()
]
RESUME_FROM_MANIFEST = os.getenv("RESUME_FROM_MANIFEST", "1") == "1"

PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "").strip()
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "").strip()
UNSPLASH_ACCESS_KEY = (
    os.getenv("UNSPLASH_ACCESS_KEY", "").strip()
    or os.getenv("UNSPLASH_APPLICATION_ID", "").strip()
    or os.getenv("UNSPLASH_APP_ID", "").strip()
)
UNSPLASH_SECRET_KEY = os.getenv("UNSPLASH_SECRET_KEY", "").strip()

SYNTHETIC_SUFFIXES = {
    "old town quarter",
    "national museum",
    "art district",
    "historic fortress",
    "royal palace",
    "temple complex",
    "riverside walk",
    "seaside promenade",
    "city beach",
    "island bay",
    "mountain trail",
    "national park",
    "botanic garden",
    "food street",
    "street food alley",
    "shopping avenue",
    "designer mall",
    "skyline observatory",
    "modern marina",
    "adventure park",
    "diving point",
    "surf beach",
    "cultural village",
    "heritage site",
    "landmark plaza",
    "old port",
    "wine region",
    "spa resort",
    "desert camp",
    "snow peak",
}

NAME_SUFFIX_HINTS = {
    "old town quarter": ["old town", "historic center"],
    "national museum": ["museum", "heritage"],
    "art district": ["art", "gallery"],
    "historic fortress": ["fortress", "castle"],
    "royal palace": ["palace", "historic"],
    "temple complex": ["temple", "shrine"],
    "riverside walk": ["river", "waterfront"],
    "seaside promenade": ["seaside", "coast"],
    "city beach": ["beach", "coast"],
    "island bay": ["bay", "island"],
    "mountain trail": ["mountain", "hiking"],
    "national park": ["national park", "nature"],
    "botanic garden": ["garden", "nature"],
    "food street": ["food market", "street food"],
    "street food alley": ["street food", "market"],
    "shopping avenue": ["shopping street", "market"],
    "designer mall": ["shopping mall", "shopping"],
    "skyline observatory": ["skyline", "city view"],
    "modern marina": ["marina", "waterfront"],
    "adventure park": ["adventure", "outdoor"],
    "diving point": ["diving", "sea"],
    "surf beach": ["surf", "beach"],
    "cultural village": ["cultural village", "heritage"],
    "heritage site": ["heritage", "historical"],
    "landmark plaza": ["landmark", "architecture"],
    "old port": ["port", "harbor"],
    "wine region": ["vineyard", "countryside"],
    "spa resort": ["resort", "spa"],
    "desert camp": ["desert", "camp"],
    "snow peak": ["snow mountain", "peak"],
}

STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "near",
    "city",
    "town",
    "district",
    "travel",
    "destination",
    "tourism",
}

TAG_HINTS = {
    0: ["forest", "nature", "mountain"],
    1: ["beach", "coast", "sea", "river"],
    2: ["city", "downtown", "skyline"],
    3: ["relax", "resort", "scenic"],
    4: ["historical", "heritage", "temple", "museum"],
    5: ["food", "market", "street food"],
    6: ["night", "neon", "nightlife"],
    7: ["hiking", "adventure", "outdoor"],
    8: ["shopping", "mall", "market"],
    9: ["luxury", "hotel"],
    10: ["exotic", "tropical"],
    11: ["landmark", "architecture", "monument"],
}

BAD_IMAGE_TERMS = {
    "map",
    "illustration",
    "drawing",
    "vector",
    "logo",
    "poster",
    "advertisement",
    "diagram",
    "chart",
    "icon",
}


def http_json(method, url, payload=None, headers=None, timeout=45):
    data = None
    req_headers = dict(headers or {})
    req_headers.setdefault("User-Agent", "wheretotravel-image-ingest/2.0")
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def http_bytes(url, headers=None, timeout=45):
    req_headers = dict(headers or {})
    req_headers.setdefault("User-Agent", "wheretotravel-image-ingest/2.0")
    req = urllib.request.Request(url, method="GET", headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content_type = resp.headers.get("Content-Type", "")
        body = resp.read()
        return content_type, body


def request_api_json(method, path, payload=None):
    return http_json(method, f"{BASE_URL}{path}", payload=payload)


def wait_for_health(timeout_sec=40):
    started = time.time()
    while time.time() - started < timeout_sec:
        try:
            health = request_api_json("GET", "/api/health")
            if health.get("ok"):
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def ensure_runtime_dir():
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def append_manifest(row):
    ensure_runtime_dir()
    with MANIFEST_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_uploaded_keys_from_manifest():
    if not RESUME_FROM_MANIFEST or not MANIFEST_FILE.exists():
        return set()
    uploaded = set()
    for raw in MANIFEST_FILE.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        try:
            row = json.loads(raw)
        except Exception:
            continue
        if row.get("status") == "uploaded" and row.get("key"):
            uploaded.add(row["key"])
    return uploaded


def tokenize(text):
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    out = []
    for t in tokens:
        if len(t) <= 2:
            continue
        if t in STOPWORDS:
            continue
        out.append(t)
    return out


def unique_keep_order(items):
    out = []
    seen = set()
    for x in items:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def is_synthetic_name(place):
    name = (place.get("name_en") or "").strip().lower()
    city = (place.get("city") or "").strip().lower()
    if not name:
        return True

    for suffix in SYNTHETIC_SUFFIXES:
        if name.endswith(suffix):
            return True

    # very short "City + generic noun" shape is often synthetic in current seed
    words = name.split()
    if city and name.startswith(city + " ") and len(words) <= 4:
        generic_terms = {"park", "beach", "mall", "walk", "museum", "palace", "port", "bay"}
        if any(w in generic_terms for w in words):
            return True

    return False


def top_tag_keywords(place, limit=2):
    vec = place.get("tags_vector") or []
    if not vec:
        return []
    indexed = list(enumerate(vec))
    indexed.sort(key=lambda x: x[1], reverse=True)
    kws = []
    for idx, _score in indexed[:limit]:
        kws.extend(TAG_HINTS.get(idx, []))
    return unique_keep_order(kws)


def name_suffix_keywords(place_name):
    n = (place_name or "").strip().lower()
    if not n:
        return []
    kws = []
    for suffix, hints in NAME_SUFFIX_HINTS.items():
        if n.endswith(suffix):
            kws.extend(hints)
    return unique_keep_order(kws)


def build_query_profiles(place, country_name):
    city = (place.get("city") or "").strip()
    place_name = (place.get("name_en") or "").strip()
    base = " ".join(x for x in [city, country_name] if x).strip()
    if not base:
        base = country_name.strip()

    required_tokens = unique_keep_order(tokenize(f"{city} {country_name}"))
    keyword_tokens = unique_keep_order(top_tag_keywords(place, limit=2) + name_suffix_keywords(place_name))

    candidates = []
    for kw in keyword_tokens[:2]:
        candidates.append({"query": f"{base} {kw}", "strategy": f"city_country_semantic_{kw}"})
    candidates.extend(
        [
            {"query": f"{base} travel", "strategy": "city_country_travel"},
            {"query": f"{base} landmarks", "strategy": "city_country_landmarks"},
            {"query": f"{base} tourism", "strategy": "city_country_tourism"},
        ]
    )
    for kw in keyword_tokens[2:5]:
        candidates.append({"query": f"{base} {kw}", "strategy": f"city_country_tag_{kw}"})

    if place_name and not is_synthetic_name(place):
        candidates.insert(0, {"query": f"{place_name} {country_name}".strip(), "strategy": "trusted_place_name"})

    out = []
    seen = set()
    for row in candidates:
        q = " ".join(row["query"].split())
        if not q:
            continue
        qk = q.lower()
        if qk in seen:
            continue
        seen.add(qk)
        out.append(
            {
                "query": q,
                "strategy": row["strategy"],
                "required_tokens": required_tokens,
                "optional_tokens": keyword_tokens,
            }
        )
    return out


def text_match_score(text, required_tokens, optional_tokens):
    t = " " + " ".join(tokenize(text)) + " "
    req = sum(1 for token in required_tokens if f" {token} " in t)
    opt = sum(1 for token in optional_tokens if f" {token} " in t)
    return req, opt


def score_candidate(index, area, text, required_tokens, optional_tokens):
    t_tokens = tokenize(text)
    req, opt = text_match_score(text, required_tokens, optional_tokens)
    area_m = max(0.0, float(area) / 1_000_000.0)
    rank_bonus = max(0, 5 - index)
    score = req * 6.0 + opt * 2.0 + rank_bonus + min(area_m, 6.0)
    if required_tokens and req == 0:
        score -= 2.5
    if any(term in t_tokens for term in BAD_IMAGE_TERMS):
        score -= 4.0
    return score, req, opt


def query_pixabay(profile):
    if not PIXABAY_API_KEY:
        return None
    params = urllib.parse.urlencode(
        {
            "key": PIXABAY_API_KEY,
            "q": profile["query"],
            "image_type": "photo",
            "orientation": "horizontal",
            "safesearch": "true",
            "per_page": 8,
        }
    )
    url = f"https://pixabay.com/api/?{params}"
    data = http_json("GET", url)
    hits = data.get("hits") or []
    if not hits:
        return None

    best = None
    for idx, hit in enumerate(hits):
        image_url = hit.get("largeImageURL") or hit.get("webformatURL")
        if not image_url:
            continue
        area = (hit.get("imageWidth", 0) or 0) * (hit.get("imageHeight", 0) or 0)
        text = " ".join([str(hit.get("tags", "")), str(hit.get("type", "")), str(hit.get("user", ""))])
        score, req, opt = score_candidate(
            idx, area, text, profile["required_tokens"], profile["optional_tokens"]
        )
        cand = {
            "provider": "pixabay",
            "provider_asset_id": str(hit.get("id", "")),
            "image_url": image_url,
            "photographer_name": hit.get("user"),
            "attribution_url": hit.get("pageURL"),
            "license_label": "Pixabay License",
            "match_score": round(score, 3),
            "required_token_hits": req,
            "optional_token_hits": opt,
            "query": profile["query"],
            "query_strategy": profile["strategy"],
        }
        if not best or cand["match_score"] > best["match_score"]:
            best = cand
    return best


def query_pexels(profile):
    if not PEXELS_API_KEY:
        return None
    params = urllib.parse.urlencode(
        {
            "query": profile["query"],
            "per_page": 8,
            "orientation": "landscape",
        }
    )
    url = f"https://api.pexels.com/v1/search?{params}"
    data = http_json("GET", url, headers={"Authorization": PEXELS_API_KEY})
    photos = data.get("photos") or []
    if not photos:
        return None

    best = None
    for idx, photo in enumerate(photos):
        src = photo.get("src") or {}
        image_url = src.get("large2x") or src.get("large") or src.get("original")
        if not image_url:
            continue
        area = (photo.get("width", 0) or 0) * (photo.get("height", 0) or 0)
        text = " ".join([str(photo.get("alt", "")), str(photo.get("photographer", ""))])
        score, req, opt = score_candidate(
            idx, area, text, profile["required_tokens"], profile["optional_tokens"]
        )
        cand = {
            "provider": "pexels",
            "provider_asset_id": str(photo.get("id", "")),
            "image_url": image_url,
            "photographer_name": photo.get("photographer"),
            "attribution_url": photo.get("url"),
            "license_label": "Pexels License",
            "match_score": round(score, 3),
            "required_token_hits": req,
            "optional_token_hits": opt,
            "query": profile["query"],
            "query_strategy": profile["strategy"],
        }
        if not best or cand["match_score"] > best["match_score"]:
            best = cand
    return best


def query_unsplash(profile):
    if not UNSPLASH_ACCESS_KEY:
        return None
    params = urllib.parse.urlencode(
        {
            "query": profile["query"],
            "per_page": 8,
            "orientation": "landscape",
            "content_filter": "high",
            "client_id": UNSPLASH_ACCESS_KEY,
        }
    )
    url = f"https://api.unsplash.com/search/photos?{params}"
    data = http_json("GET", url)
    results = data.get("results") or []
    if not results:
        return None

    best = None
    for idx, item in enumerate(results):
        urls = item.get("urls") or {}
        image_url = urls.get("regular") or urls.get("full")
        if not image_url:
            continue
        user = item.get("user") or {}
        links = item.get("links") or {}
        area = (item.get("width", 0) or 0) * (item.get("height", 0) or 0)
        tag_titles = " ".join(str((tag.get("title") if isinstance(tag, dict) else tag) or "") for tag in (item.get("tags") or []))
        location = item.get("location") or {}
        text = " ".join(
            [
                str(item.get("alt_description", "")),
                str(item.get("description", "")),
                str(location.get("city", "")),
                str(location.get("country", "")),
                tag_titles,
            ]
        )
        score, req, opt = score_candidate(
            idx, area, text, profile["required_tokens"], profile["optional_tokens"]
        )
        cand = {
            "provider": "unsplash",
            "provider_asset_id": str(item.get("id", "")),
            "image_url": image_url,
            "photographer_name": user.get("name"),
            "attribution_url": links.get("html"),
            "license_label": "Unsplash License",
            "match_score": round(score, 3),
            "required_token_hits": req,
            "optional_token_hits": opt,
            "query": profile["query"],
            "query_strategy": profile["strategy"],
        }
        if not best or cand["match_score"] > best["match_score"]:
            best = cand
    return best


def provider_search(provider, profile):
    if provider == "pixabay":
        return query_pixabay(profile)
    if provider == "pexels":
        return query_pexels(profile)
    if provider == "unsplash":
        return query_unsplash(profile)
    return None


def resolve_image_meta(place, country_name):
    profiles = build_query_profiles(place, country_name)
    errors = []
    best = None

    for provider in PROVIDER_PRIORITY:
        for profile in profiles:
            try:
                meta = provider_search(provider, profile)
                if not meta:
                    continue
                if not best or meta["match_score"] > best["match_score"]:
                    best = meta
                # enough confidence, stop early
                if meta["match_score"] >= 12:
                    return meta, errors
            except urllib.error.HTTPError as ex:
                errors.append(f"{provider}:{profile['query']}:HTTP{ex.code}")
            except Exception as ex:
                errors.append(f"{provider}:{profile['query']}:{type(ex).__name__}")
            time.sleep(REQUEST_DELAY_MS / 1000.0)
    return best, errors


def upload_binary(key, content_type, raw_bytes):
    payload = {
        "key": key,
        "content_base64": base64.b64encode(raw_bytes).decode("ascii"),
        "content_type": content_type or "application/octet-stream",
    }
    return request_api_json("POST", "/api/r2/upload-base64", payload)


def flatten_places(countries):
    out = []
    for country in countries:
        for place in country.get("places", []):
            out.append((country, place))
    return out


def main():
    if not DATA_FILE.exists():
        print(f"data file not found: {DATA_FILE}")
        return 1

    if not any([PIXABAY_API_KEY, PEXELS_API_KEY, UNSPLASH_ACCESS_KEY]):
        print("missing provider keys. set PIXABAY_API_KEY and/or PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY")
        return 2

    enabled = []
    if PIXABAY_API_KEY:
        enabled.append("pixabay")
    if PEXELS_API_KEY:
        enabled.append("pexels")
    if UNSPLASH_ACCESS_KEY:
        enabled.append("unsplash")
    print(f"enabled providers: {','.join(enabled)}")
    if UNSPLASH_SECRET_KEY:
        print("unsplash secret key detected (not required for current search API flow)")

    countries = json.loads(DATA_FILE.read_text(encoding="utf-8")).get("countries", [])
    all_rows = flatten_places(countries)
    if MAX_PLACES > 0:
        all_rows = all_rows[:MAX_PLACES]

    already_uploaded = load_uploaded_keys_from_manifest()
    if already_uploaded:
        print(f"resume mode: skip already uploaded keys from manifest ({len(already_uploaded)})")

    server_proc = None
    try:
        if START_SERVER:
            server_proc = subprocess.Popen(
                ["node", "server.js"],
                cwd=str(ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            if not wait_for_health():
                print("backend health check failed")
                return 3
        else:
            if not wait_for_health(10):
                print("backend not reachable")
                return 3

        r2_status = request_api_json("GET", "/api/r2/status")
        if not r2_status.get("configured"):
            print("r2 is not configured in backend")
            return 4

        total = len(all_rows)
        print(f"start ingest: places={total}, providers={','.join(PROVIDER_PRIORITY)}")

        success = 0
        failed = 0
        skipped = 0
        started = time.time()

        for idx, (country, place) in enumerate(all_rows, start=1):
            country_code = country.get("country_code")
            country_name = country.get("country_name_en") or country_code
            place_id = place.get("place_id")
            key = f"images/placeholders/{country_code}/{place_id}.jpg"

            if key in already_uploaded:
                skipped += 1
                continue

            row = {
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "index": idx,
                "total": total,
                "country_code": country_code,
                "place_id": place_id,
                "place_name_en": place.get("name_en"),
                "key": key,
                "status": "failed",
            }

            try:
                meta, errors = resolve_image_meta(place, country_name)
                if not meta:
                    row["errors"] = errors[:10]
                    append_manifest(row)
                    failed += 1
                    continue

                ctype, raw = http_bytes(meta["image_url"])
                if not ctype.startswith("image/"):
                    row["errors"] = [f"downloaded non-image content-type: {ctype}"]
                    append_manifest(row)
                    failed += 1
                    continue

                upload_binary(key, ctype, raw)
                row["status"] = "uploaded"
                row["bytes"] = len(raw)
                row["content_type"] = ctype
                row["provider"] = meta.get("provider")
                row["provider_asset_id"] = meta.get("provider_asset_id")
                row["provider_query"] = meta.get("query")
                row["query_strategy"] = meta.get("query_strategy")
                row["match_score"] = meta.get("match_score")
                row["required_token_hits"] = meta.get("required_token_hits")
                row["optional_token_hits"] = meta.get("optional_token_hits")
                row["attribution_url"] = meta.get("attribution_url")
                row["photographer_name"] = meta.get("photographer_name")
                append_manifest(row)
                success += 1
            except urllib.error.HTTPError as ex:
                row["errors"] = [f"HTTPError {ex.code}"]
                append_manifest(row)
                failed += 1
            except Exception as ex:
                row["errors"] = [f"{type(ex).__name__}: {ex}"]
                append_manifest(row)
                failed += 1

            if idx % 25 == 0 or idx == total:
                elapsed = int(time.time() - started)
                print(
                    f"progress: {idx}/{total} success={success} failed={failed} skipped={skipped} elapsed={elapsed}s"
                )

            time.sleep(REQUEST_DELAY_MS / 1000.0)

        print("----- result -----")
        print(f"success={success}")
        print(f"failed={failed}")
        print(f"skipped={skipped}")
        print(f"manifest={MANIFEST_FILE}")
        return 0 if failed == 0 else 5
    finally:
        if server_proc is not None:
            server_proc.terminate()
            try:
                server_proc.wait(timeout=5)
            except Exception:
                server_proc.kill()


if __name__ == "__main__":
    sys.exit(main())
