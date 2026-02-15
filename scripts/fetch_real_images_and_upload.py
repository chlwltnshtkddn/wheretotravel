import base64
import json
import os
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
BASE_URL = os.getenv("BACKEND_URL", "http://localhost:8787").rstrip("/")
START_SERVER = os.getenv("START_SERVER", "1") == "1"
MAX_PLACES = int(os.getenv("MAX_PLACES", "0") or "0")
REQUEST_DELAY_MS = int(os.getenv("REQUEST_DELAY_MS", "120") or "120")
PROVIDER_PRIORITY = [
    x.strip().lower()
    for x in os.getenv("PROVIDER_PRIORITY", "pixabay,pexels,unsplash").split(",")
    if x.strip()
]

PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "").strip()
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "").strip()
UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "").strip()


def http_json(method, url, payload=None, headers=None, timeout=45):
    data = None
    req_headers = dict(headers or {})
    req_headers.setdefault("User-Agent", "wheretotravel-image-ingest/1.0")
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def http_bytes(url, headers=None, timeout=45):
    req_headers = dict(headers or {})
    req_headers.setdefault("User-Agent", "wheretotravel-image-ingest/1.0")
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


def build_queries(place, country_name):
    city = (place.get("city") or "").strip()
    name = (place.get("name_en") or "").strip()
    queries = []
    if city and name:
        queries.append(f"{city} {name} {country_name}")
    if city:
        queries.append(f"{city} {country_name} travel")
    if name:
        queries.append(f"{name} {country_name} travel")
    queries.append(f"{country_name} travel destination")
    # de-dup while preserving order
    out = []
    seen = set()
    for q in queries:
        qq = " ".join(q.split())
        if not qq or qq in seen:
            continue
        seen.add(qq)
        out.append(qq)
    return out


def query_pixabay(query):
    if not PIXABAY_API_KEY:
        return None
    params = urllib.parse.urlencode(
        {
            "key": PIXABAY_API_KEY,
            "q": query,
            "image_type": "photo",
            "orientation": "horizontal",
            "safesearch": "true",
            "per_page": 5,
        }
    )
    url = f"https://pixabay.com/api/?{params}"
    data = http_json("GET", url)
    hits = data.get("hits") or []
    if not hits:
        return None

    best = max(hits, key=lambda x: (x.get("imageWidth", 0) * x.get("imageHeight", 0)))
    image_url = best.get("largeImageURL") or best.get("webformatURL")
    if not image_url:
        return None
    return {
        "provider": "pixabay",
        "provider_asset_id": str(best.get("id", "")),
        "image_url": image_url,
        "photographer_name": best.get("user"),
        "attribution_url": best.get("pageURL"),
        "license_label": "Pixabay License",
    }


def query_pexels(query):
    if not PEXELS_API_KEY:
        return None
    params = urllib.parse.urlencode(
        {
            "query": query,
            "per_page": 5,
            "orientation": "landscape",
        }
    )
    url = f"https://api.pexels.com/v1/search?{params}"
    data = http_json("GET", url, headers={"Authorization": PEXELS_API_KEY})
    photos = data.get("photos") or []
    if not photos:
        return None

    best = max(photos, key=lambda x: (x.get("width", 0) * x.get("height", 0)))
    src = best.get("src") or {}
    image_url = src.get("large2x") or src.get("large") or src.get("original")
    if not image_url:
        return None
    return {
        "provider": "pexels",
        "provider_asset_id": str(best.get("id", "")),
        "image_url": image_url,
        "photographer_name": best.get("photographer"),
        "attribution_url": best.get("url"),
        "license_label": "Pexels License",
    }


def query_unsplash(query):
    if not UNSPLASH_ACCESS_KEY:
        return None
    params = urllib.parse.urlencode(
        {
            "query": query,
            "per_page": 5,
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

    def area(item):
        return (item.get("width", 0) or 0) * (item.get("height", 0) or 0)

    best = max(results, key=area)
    urls = best.get("urls") or {}
    user = best.get("user") or {}
    links = best.get("links") or {}
    image_url = urls.get("regular") or urls.get("full")
    if not image_url:
        return None
    return {
        "provider": "unsplash",
        "provider_asset_id": str(best.get("id", "")),
        "image_url": image_url,
        "photographer_name": user.get("name"),
        "attribution_url": links.get("html"),
        "license_label": "Unsplash License",
    }


def provider_search(provider, query):
    if provider == "pixabay":
        return query_pixabay(query)
    if provider == "pexels":
        return query_pexels(query)
    if provider == "unsplash":
        return query_unsplash(query)
    return None


def resolve_image_meta(place, country_name):
    queries = build_queries(place, country_name)
    errors = []
    for provider in PROVIDER_PRIORITY:
        for query in queries:
            try:
                meta = provider_search(provider, query)
                if meta:
                    meta["query"] = query
                    return meta, errors
            except urllib.error.HTTPError as ex:
                errors.append(f"{provider}:{query}:HTTP{ex.code}")
            except Exception as ex:
                errors.append(f"{provider}:{query}:{type(ex).__name__}")
            time.sleep(REQUEST_DELAY_MS / 1000.0)
    return None, errors


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

    countries = json.loads(DATA_FILE.read_text(encoding="utf-8")).get("countries", [])
    all_rows = flatten_places(countries)
    if MAX_PLACES > 0:
        all_rows = all_rows[:MAX_PLACES]

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
        started = time.time()

        for idx, (country, place) in enumerate(all_rows, start=1):
            country_code = country.get("country_code")
            country_name = country.get("country_name_en") or country_code
            place_id = place.get("place_id")
            key = f"images/placeholders/{country_code}/{place_id}.jpg"

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
                print(f"progress: {idx}/{total} success={success} failed={failed} elapsed={elapsed}s")

            time.sleep(REQUEST_DELAY_MS / 1000.0)

        print("----- result -----")
        print(f"success={success}")
        print(f"failed={failed}")
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
