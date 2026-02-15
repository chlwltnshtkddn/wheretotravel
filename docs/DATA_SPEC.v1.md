# DATA_SPEC.v1

## Purpose

Phase 1에서 국가/여행지 시드 데이터를 일관된 구조로 고정하기 위한 명세다.  
이 문서는 `data/tag_taxonomy.v1.json`와 `data/countries.v1.json`의 소스 오브 트루스다.

## Scope

- 국가 100개 고정
- 국가별 여행지 시드(places) 수집
- 12차원 벡터 태그 체계 고정
- 관광지 수 기반 버킷 자동 분류
- 2차 이미지 수집 전 단계용 데이터 구조

## Tag Taxonomy (12D)

순서와 인덱스는 고정이다.

1. `forest_nature`
2. `water`
3. `urban`
4. `relaxation`
5. `heritage_culture`
6. `food`
7. `nightlife`
8. `activity`
9. `shopping`
10. `luxury`
11. `exoticness`
12. `landmark_architecture`

## Type Definitions

```ts
type TagId =
  | "forest_nature"
  | "water"
  | "urban"
  | "relaxation"
  | "heritage_culture"
  | "food"
  | "nightlife"
  | "activity"
  | "shopping"
  | "luxury"
  | "exoticness"
  | "landmark_architecture";
```

```ts
type PlaceSeedRecord = {
  place_id: string;
  name_en: string;
  name_ko?: string;
  country_code: string; // ISO alpha-2
  city?: string;
  lat?: number;
  lng?: number;
  tags_vector: number[]; // length 12
  source: "wikidata" | "manual_review";
};
```

```ts
type CountrySeedRecord = {
  country_code: string; // ISO alpha-2
  country_name_ko: string;
  country_name_en: string;
  region:
    | "asia"
    | "europe"
    | "middle_east"
    | "africa"
    | "north_america"
    | "south_america"
    | "oceania";
  tourism_demand_tier: "high" | "mid" | "emerging";
  seed_place_count: number; // places.length
  place_count_bucket: "30_plus" | "20_29" | "10_19" | "6_9" | "0_5";
  tags_vector: number[]; // length 12, 0.00~1.00
  top_seed_cities: string[]; // 1~5
  data_quality_flag?: "ok" | "needs_review";
  places: PlaceSeedRecord[]; // Phase 1에서는 상한 없이 수집
};
```

## Bucket Rules

- `seed_place_count >= 30` -> `30_plus`
- `20 <= seed_place_count <= 29` -> `20_29`
- `10 <= seed_place_count <= 19` -> `10_19`
- `6 <= seed_place_count <= 9` -> `6_9`
- `seed_place_count <= 5` -> `0_5`

## Vector Rules

- 차원 수: 12
- 값 범위: `0.00 <= value <= 1.00`
- 소수 자리: 권장 3자리
- 국가 벡터는 place 벡터 집계(평균)로 계산

## Dataset Snapshot (v1)

- countries: 100
- places: 1740
- region split:
  - asia 24
  - europe 24
  - middle_east 12
  - africa 16
  - north_america 8
  - south_america 10
  - oceania 6

## Phase 1 Notes

- 이번 버전의 place source는 `manual_review` 중심 시드 데이터다.
- 2차에서 `Unsplash/Pexels/Pixabay API` 이미지 메타를 place 단위로 연결한다.
- `history`/`culture`는 `heritage_culture`로 통합했다.
- `budget_local`은 태그에서 제거했다.
- `nature`는 `forest_nature`로 명확화했고 `water`를 독립 축으로 유지한다.
