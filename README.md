# Wheretotravel

사진 Like/Dislike 기반 여행 취향 분석 및 여행지 추천 엔진

- Status: `MVP 준비중`
- URL: `https://whereto.travel`
- Phase 1 Goal: `국가 100개 + 여행지 시드 + 12D 태그 체계 + UI 스펙 고정`
- Phase 2 Goal: `Unsplash/Pexels/Pixabay API 기반 이미지 연결`

## What Is Fixed In Phase 1

- 국가 수: `100`
- 여행지 시드: `1740` (현재 스냅샷)
- 태그 차원: `12D`
  - `forest_nature`, `water`, `urban`, `relaxation`, `heritage_culture`, `food`,
    `nightlife`, `activity`, `shopping`, `luxury`, `exoticness`, `landmark_architecture`
- 관광지 버킷: `30_plus`, `20_29`, `10_19`, `6_9`, `0_5`
- 벡터 범위: `0.00 ~ 1.00`

## MVP Product Direction

- 추천 계산은 규칙 기반 벡터 엔진이 수행
- GPT API는 설명/카피/공유 문구 생성에 사용
- UI 품질은 MVP 필수 요구사항으로 관리
  - Landing / Swipe / Result 3화면 상세 스펙 고정

## Data Artifacts

- `data/tag_taxonomy.v1.json`
- `data/countries.v1.json`

## Docs

- Data spec: `docs/DATA_SPEC.v1.md`
- UI spec: `docs/UI_MVP_SPEC.v1.md`
- Validation rules: `docs/DATA_VALIDATION_RULES.v1.md`
- Backend API: `docs/BACKEND_API.v1.md`
- Image pipeline plan: `docs/IMAGE_PIPELINE_PLAN.v1.md`
- Working product spec: `README.v02.md`

## Run Web MVP

1. 백엔드 포함 통합 실행 (권장)
   - `npm.cmd install`
   - `.env.example` -> `.env` 복사 후 R2 값 입력
   - `node backend/server.js`
2. 브라우저에서 열기
   - `http://localhost:8787/index.html`

## Deploy to Cloudflare Pages (Static Front)

1. 배포 아티팩트 생성
   - `npm.cmd run build:pages`
2. Pages 배포
   - `npm.cmd run deploy:pages`

## Run Backend (Local Storage)

1. 백엔드 실행
   - `node backend/server.js`
2. API 확인
   - `http://localhost:8787/api/health`
   - `http://localhost:8787/api/r2/status`
3. 로컬 저장 경로
   - 세션 파일: `data/runtime/sessions/*.json`
   - 이벤트 로그: `data/runtime/events.jsonl`

## Batch Placeholder Test (All Places -> R2)

1. 백엔드 실행 상태에서 스크립트 실행
   - `python scripts/generate_placeholders_and_upload.py`
2. 수행 내용
   - `data/countries.v1.json`의 모든 place(현재 1740개) JPG 생성
   - R2 `images/placeholders/{country_code}/{place_id}.jpg` 업로드
   - 샘플(`Kharkhorin Safari Reserve`) signed URL 호출 검증

## Phase 2 Preview

- 이미지 소스 정책: `Unsplash`, `Pexels`, `Pixabay` API only
- Place 단위 이미지 메타 연결
- 라이선스/출처 추적 필드 확장

## Real Image Replace Batch

1. Set at least one provider key in `.env`
   - `PIXABAY_API_KEY` or `PEXELS_API_KEY` or `UNSPLASH_ACCESS_KEY`
2. Run full replace (1740 places)
   - `python scripts/fetch_real_images_and_upload.py`
3. Optional smoke test first
   - `set MAX_PLACES=20 && python scripts/fetch_real_images_and_upload.py`

The script overwrites current placeholder keys:
`images/placeholders/{country_code}/{place_id}.jpg`
