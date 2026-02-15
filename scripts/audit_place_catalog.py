import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "countries.v1.json"
OUT_FILE = ROOT / "data" / "runtime" / "place_catalog_audit.v1.json"

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


def is_synthetic(name, city):
    n = (name or "").strip().lower()
    c = (city or "").strip().lower()
    if not n:
        return True, "empty_name"
    for suffix in SYNTHETIC_SUFFIXES:
        if n.endswith(suffix):
            return True, f"synthetic_suffix:{suffix}"
    if c and n.startswith(c + " "):
        words = re.findall(r"[a-z0-9]+", n)
        if len(words) <= 4:
            return True, "city_prefix_short_generic"
    return False, ""


def main():
    if not DATA_FILE.exists():
        raise SystemExit(f"missing data file: {DATA_FILE}")

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    countries = data.get("countries", [])
    total_places = 0
    flagged = []
    reason_counter = Counter()
    suffix_counter = Counter()
    country_stats = defaultdict(lambda: {"total": 0, "flagged": 0})

    for country in countries:
        code = country.get("country_code")
        cname = country.get("country_name_en")
        for place in country.get("places", []):
            total_places += 1
            name = place.get("name_en", "")
            city = place.get("city", "")
            country_stats[code]["total"] += 1
            bad, reason = is_synthetic(name, city)
            if bad:
                country_stats[code]["flagged"] += 1
                reason_counter[reason] += 1
                words = name.lower().split()
                suffix2 = " ".join(words[-2:]) if len(words) >= 2 else name.lower()
                suffix_counter[suffix2] += 1
                flagged.append(
                    {
                        "country_code": code,
                        "country_name_en": cname,
                        "city": city,
                        "place_id": place.get("place_id"),
                        "name_en": name,
                        "reason": reason,
                    }
                )

    country_rows = []
    for c in countries:
        code = c.get("country_code")
        row = country_stats[code]
        total = row["total"] or 1
        ratio = row["flagged"] / total
        country_rows.append(
            {
                "country_code": code,
                "country_name_en": c.get("country_name_en"),
                "total_places": row["total"],
                "flagged_places": row["flagged"],
                "flagged_ratio": round(ratio, 4),
            }
        )
    country_rows.sort(key=lambda x: x["flagged_ratio"], reverse=True)

    report = {
        "summary": {
            "countries": len(countries),
            "places": total_places,
            "flagged_places": len(flagged),
            "flagged_ratio": round((len(flagged) / total_places) if total_places else 0, 4),
        },
        "top_reasons": reason_counter.most_common(20),
        "top_suffixes": suffix_counter.most_common(30),
        "countries_by_flagged_ratio": country_rows[:100],
        "flagged_samples": flagged[:400],
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"audit written: {OUT_FILE}")
    print(
        f"summary: countries={report['summary']['countries']} places={report['summary']['places']} "
        f"flagged={report['summary']['flagged_places']} ratio={report['summary']['flagged_ratio']}"
    )


if __name__ == "__main__":
    main()
