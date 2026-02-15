import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "countries.v1.json"
BASE_URL = os.getenv("BACKEND_URL", "http://localhost:8787").rstrip("/")
START_SERVER = os.getenv("START_SERVER", "1") == "1"
SAMPLE_NAME = "Kharkhorin Safari Reserve"


def request_json(method, path, payload=None):
    url = f"{BASE_URL}{path}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8")
        if not body:
            return {}
        return json.loads(body)


def wait_for_health(timeout_sec=30):
    started = time.time()
    while time.time() - started < timeout_sec:
        try:
            health = request_json("GET", "/api/health")
            if health.get("ok"):
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def load_font(size, bold=False):
    candidates = []
    if os.name == "nt":
        if bold:
            candidates.extend(
                [
                    r"C:\Windows\Fonts\arialbd.ttf",
                    r"C:\Windows\Fonts\malgunbd.ttf",
                    r"C:\Windows\Fonts\gulim.ttc",
                ]
            )
        else:
            candidates.extend(
                [
                    r"C:\Windows\Fonts\arial.ttf",
                    r"C:\Windows\Fonts\malgun.ttf",
                    r"C:\Windows\Fonts\gulim.ttc",
                ]
            )

    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def text_wrap(draw, text, font, max_width):
    words = text.split()
    if not words:
        return [""]
    lines = []
    line = words[0]
    for word in words[1:]:
        test = f"{line} {word}"
        w = draw.textbbox((0, 0), test, font=font)[2]
        if w <= max_width:
            line = test
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def render_placeholder(place_name, city, country_name, code):
    width, height = 1280, 720
    img = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(img)

    yellow = (247, 214, 87)
    yellow_dim = (212, 176, 57)

    # decorative frame
    draw.rectangle((24, 24, width - 24, height - 24), outline=yellow_dim, width=4)
    draw.rectangle((46, 46, width - 46, height - 46), outline=(80, 70, 30), width=2)

    title_font = load_font(70, bold=True)
    sub_font = load_font(44, bold=True)
    meta_font = load_font(34, bold=False)

    left = 90
    top = 120
    max_width = width - 180

    city_line = city or "Unknown City"
    draw.text((left, top), city_line, fill=yellow_dim, font=meta_font)
    top += 72

    title_lines = text_wrap(draw, place_name, sub_font, max_width)
    for line in title_lines[:3]:
        draw.text((left, top), line, fill=yellow, font=sub_font)
        top += 58

    top += 14
    country_line = f"{country_name} ({code})"
    draw.text((left, top), country_line, fill=yellow_dim, font=title_font if len(country_line) < 20 else meta_font)

    footer = "wheretotravel.dev placeholder"
    footer_font = load_font(24, bold=False)
    fw = draw.textbbox((0, 0), footer, font=footer_font)[2]
    draw.text((width - fw - 88, height - 86), footer, fill=(120, 108, 58), font=footer_font)

    output = io.BytesIO()
    img.save(output, format="JPEG", quality=86, optimize=True)
    return output.getvalue()


def upload_placeholder(key, jpg_bytes):
    payload = {
        "key": key,
        "content_base64": base64.b64encode(jpg_bytes).decode("ascii"),
        "content_type": "image/jpeg",
    }
    return request_json("POST", "/api/r2/upload-base64", payload)


def main():
    if not DATA_FILE.exists():
        print(f"data file not found: {DATA_FILE}")
        return 1

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
            if not wait_for_health(35):
                print("backend health check failed")
                if server_proc and server_proc.stdout:
                    print(server_proc.stdout.read())
                return 2
        else:
            if not wait_for_health(10):
                print("backend not reachable")
                return 2

        r2_status = request_json("GET", "/api/r2/status")
        if not r2_status.get("configured"):
            print("r2 is not configured in backend")
            return 3

        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        countries = data["countries"]

        total = sum(len(c["places"]) for c in countries)
        print(f"upload start: countries={len(countries)}, places={total}")

        sample_key = None
        success = 0
        failed = 0

        t0 = time.time()
        for ci, country in enumerate(countries, start=1):
            code = country["country_code"]
            country_name = country["country_name_en"]
            for pi, place in enumerate(country["places"], start=1):
                key = f"images/placeholders/{code}/{place['place_id']}.jpg"
                jpg = render_placeholder(
                    place_name=place["name_en"],
                    city=place.get("city", ""),
                    country_name=country_name,
                    code=code,
                )
                try:
                    upload_placeholder(key, jpg)
                    success += 1
                except Exception as ex:
                    failed += 1
                    print(f"upload failed: {key} :: {ex}")

                if place["name_en"] == SAMPLE_NAME:
                    sample_key = key

            if ci % 10 == 0:
                elapsed = int(time.time() - t0)
                print(f"progress: {ci}/{len(countries)} countries, success={success}, failed={failed}, elapsed={elapsed}s")

        if not sample_key:
            print(f"sample place not found: {SAMPLE_NAME}")
            return 4

        list_resp = request_json(
            "GET",
            f"/api/r2/list?{urllib.parse.urlencode({'prefix': 'images/placeholders/', 'limit': 20})}",
        )
        pub = request_json("GET", f"/api/r2/public-url?{urllib.parse.urlencode({'key': sample_key})}")
        signed = request_json(
            "GET",
            f"/api/r2/signed-url?{urllib.parse.urlencode({'key': sample_key, 'expires': 600})}",
        )

        # Validate callable signed URL
        req = urllib.request.Request(signed["url"], method="GET")
        with urllib.request.urlopen(req, timeout=60) as resp:
            content_type = resp.headers.get("Content-Type")
            content_len = resp.headers.get("Content-Length")
            _ = resp.read(128)

        elapsed = int(time.time() - t0)
        print("----- result -----")
        print(f"uploaded_success={success}")
        print(f"uploaded_failed={failed}")
        print(f"sample_key={sample_key}")
        print(f"sample_public_url={pub.get('url')}")
        print(f"signed_url_ok={bool(signed.get('url'))}")
        print(f"signed_content_type={content_type}")
        print(f"signed_content_length={content_len}")
        print(f"list_preview_count={len(list_resp.get('objects', []))}")
        print(f"elapsed_sec={elapsed}")
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
