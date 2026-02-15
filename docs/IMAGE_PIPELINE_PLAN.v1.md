# IMAGE_PIPELINE_PLAN.v1

## Objective

Phase 2에서 `data/countries.v1.json`의 place 레코드에 이미지 메타를 안전하게 연결한다.

## Allowed Providers

- Unsplash API
- Pexels API
- Pixabay API

`Pinterest` 및 비공식 웹 스크래핑은 사용하지 않는다.

## Input

- `data/countries.v1.json`
  - `countries[].places[]`
  - key fields: `place_id`, `name_en`, `country_code`, `city`, `tags_vector`

## Output (Target Fields)

각 place에 아래 필드 확장(Phase 2):

```ts
type PlaceImageMeta = {
  image_url: string;
  thumb_url?: string;
  provider: "unsplash" | "pexels" | "pixabay";
  provider_asset_id: string;
  photographer_name?: string;
  attribution_url?: string;
  license_label?: string;
  fetched_at: string; // ISO date
  image_quality_score?: number; // 0~1
};
```

## Pipeline Steps

1. Query build
- 기본 쿼리: `{city} {country} travel`
- 보조 쿼리: 상위 태그 기반 보강 (`water`, `forest_nature`, `landmark_architecture` 등)

2. Provider fetch
- Provider별 API 호출 후 상위 N개(예: 10개) 후보 확보

3. Filtering
- 최소 해상도 기준
- 중복 URL 제거
- 성인/부적합 콘텐츠 제외

4. Scoring
- 쿼리-태그 적합도 점수
- 이미지 품질(해상도/구도) 점수
- 최종 `image_quality_score` 계산

5. Attribution pack
- provider 정책에 맞는 저작자/출처 필드 저장

6. Persist
- place 단위로 image 메타 저장
- 실패 항목은 재시도 큐로 이동

## Error Handling

- API limit 초과: exponential backoff + provider fallback
- 무결성 실패: `image_url` 미기입 상태로 유지 후 재처리
- 라이선스 필드 누락: publish 대상에서 제외

## Success Criteria

- `places` 대비 이미지 연결률 95% 이상
- license/attribution 누락 0건
- provider 호출 실패 시 재시도 후 누락률 5% 이하
