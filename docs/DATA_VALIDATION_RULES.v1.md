# DATA_VALIDATION_RULES.v1

## Purpose

`data/tag_taxonomy.v1.json`와 `data/countries.v1.json`의 무결성을 자동 점검한다.

## Validation Rules

1. Dataset size
- 국가 수는 정확히 100

2. Identity uniqueness
- `country_code` 중복 없음
- `place_id` 중복 없음

3. Tag taxonomy
- 태그 차원은 정확히 12
- 태그 인덱스 0..11 연속
- 태그 id 중복 없음

4. Vector integrity
- 모든 `tags_vector.length === 12`
- 모든 벡터 값이 `0.00 <= value <= 1.00`

5. Bucket integrity
- `seed_place_count === places.length`
- `place_count_bucket`가 규칙과 일치

6. Coverage
- 모든 국가의 `places` 배열이 비어있지 않음
- 모든 place에 `country_code`, `name_en`, `source` 존재

7. Region integrity
- region 값이 허용된 enum 안에 존재

## Reference Check Script (Python)

```python
import json
from pathlib import Path

root = Path(\"data\")
tax = json.loads((root / \"tag_taxonomy.v1.json\").read_text(encoding=\"utf-8\"))
obj = json.loads((root / \"countries.v1.json\").read_text(encoding=\"utf-8\"))

tags = tax[\"tags\"]
assert len(tags) == 12
assert [t[\"index\"] for t in tags] == list(range(12))
assert len({t[\"id\"] for t in tags}) == 12

countries = obj[\"countries\"]
assert len(countries) == 100
assert len({c[\"country_code\"] for c in countries}) == 100

seen_places = set()
for c in countries:
    places = c[\"places\"]
    assert c[\"seed_place_count\"] == len(places)
    assert len(c[\"tags_vector\"]) == 12
    assert all(0.0 <= v <= 1.0 for v in c[\"tags_vector\"])

    n = c[\"seed_place_count\"]
    if n >= 30:
        expected = \"30_plus\"
    elif n >= 20:
        expected = \"20_29\"
    elif n >= 10:
        expected = \"10_19\"
    elif n >= 6:
        expected = \"6_9\"
    else:
        expected = \"0_5\"
    assert c[\"place_count_bucket\"] == expected

    for p in places:
        assert p[\"place_id\"] not in seen_places
        seen_places.add(p[\"place_id\"])
        assert p[\"country_code\"] == c[\"country_code\"]
        assert p[\"name_en\"]
        assert p[\"source\"] in {\"manual_review\", \"wikidata\"}
        assert len(p[\"tags_vector\"]) == 12
        assert all(0.0 <= v <= 1.0 for v in p[\"tags_vector\"])
```

## Acceptance Criteria

- 위 검증을 통과해야 Phase 2 이미지 수집으로 진행 가능
- 검증 실패 시 `data_quality_flag = needs_review` 항목 우선 수정
