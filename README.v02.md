# Wheretotravel

사진 Like/Dislike 기반 여행 취향 분석 및 도시 추천 엔진

- Status: `MVP 준비중`
- URL: `https://whereto.travel`

## Overview

`Wheretotravel`은 사용자가 사진에 `Like / Dislike / Neutral`만 선택하면 여행 취향 벡터를 계산해,  
최종적으로 "지금 예약 가능한" 국가/도시를 제안하는 서비스입니다.

핵심 컨셉은 2단계입니다.

- 1단계(탐색): 다양한 사진 10장으로 취향 방향성 파악
- 2단계(수렴): 1단계 결과와 유사한 사진 26~30장으로 정밀 취향 수집

결과 화면은 단순 추천 리스트보다, 페르소나 + 추천 근거 + OTA 실행 버튼까지 한 번에 제공합니다.

## Problem

여행 준비에서 가장 자주 생기는 문제는 아래와 같습니다.

- 저장한 여행 사진은 많은데 목적지 결정을 못 한다.
- 본인 취향을 말로 설명하기 어렵다.
- 콘텐츠 소비(블로그/숏폼)는 많은데 실제 예약까지 이어지지 않는다.

## Solution

서비스는 다음 원칙으로 설계합니다.

- 입력 단순화: 사진 스와이프 기반 `Like / Dislike / Neutral`
- 추천 정밀화: `10장 탐색 + 26~30장 개인화 수렴`
- 결과 가독화: 벡터 기반 `Travel Persona`를 먼저 보여주고 추천 제시
- 실행 연결: 결과 직후 OTA 딥링크로 숙소/항공 검색 연결
- 광고 최소 간섭: 사진 선택 UI 하단에 제한된 AdSense 슬롯 운영

## Phase 1 Data Scope Update

이번 1차에서 국가/여행지 시드 데이터를 먼저 고정합니다.

- 국가: `100개`
- 여행지 시드: 국가별 가능한 만큼 추출(현재 v1 스냅샷 `1740개`)
- source: `manual_review` (2차에서 이미지 API 메타 결합 예정)
- 관광지 수 버킷:
  - `30_plus`
  - `20_29`
  - `10_19`
  - `6_9`
  - `0_5`
- 태그 체계(12D):
  - `forest_nature`
  - `water`
  - `urban`
  - `relaxation`
  - `heritage_culture`
  - `food`
  - `nightlife`
  - `activity`
  - `shopping`
  - `luxury`
  - `exoticness`
  - `landmark_architecture`

## User Flow (6 Steps)

1. 글로벌 명소 사진 10장 선택 (`Like / Dislike / Neutral`)
2. 초기 취향 벡터 생성 및 1차 페르소나 추정
3. 유사 벡터 중심 사진 26~30장 재노출 후 2차 선택
4. 최종 페르소나 확정 + 대표 추천 1개(국가/도시) 제시
5. 대안 옵션 1개(총 2안)과 함께 여행 컨텍스트 입력  
   입력 항목: 인원, 예상 시기, 대략 예산
6. OTA 위젯/딥링크에서 숙소/항공 정보 확인

## Core Recommendation Logic

MVP는 규칙 기반 벡터 엔진을 사용합니다. GPT는 랭킹 결정에 참여하지 않습니다.

### Scoring Rule

- `like -> +tags_vector`
- `dislike -> -tags_vector`
- `neutral -> 0`

```pseudo
initialize user_vector = [0 ... 0]

for vote in stage1_votes + stage2_votes:
  place = place_map[vote.place_id]
  if vote.choice == "like":
    user_vector += place.tags_vector
  else if vote.choice == "dislike":
    user_vector -= place.tags_vector
```

### Adaptive Feed Rule

```pseudo
stage1_pool = diverse_global_places
show 10 from stage1_pool

seed_vector = vector_from(stage1_votes)
candidate_pool = nearest_neighbors(seed_vector, all_places)
candidate_pool = apply_diversity_constraint(candidate_pool)

show 26~30 from candidate_pool
final_vector = vector_from(stage1_votes + stage2_votes)
```

### Ranking Rule

- MVP 기본: `weighted sum`
- 옵션: `cosine similarity` (실험 플래그)

```pseudo
score(entity) = sum_i (weight_i * final_vector[i] * entity.tags_vector[i])
```

추천 결과 정책:

- `primary_result`: 상위 1개 국가/도시 페어
- `secondary_result`: 대안 1개 (사용자 선택 폭 확보)

## Travel Persona Mapping (MVP)

아래는 초기 페르소나 8종과 권장 벡터 조합입니다.

| persona_id | persona_name | high_tags | low_tags |
| --- | --- | --- | --- |
| P01 | 자연 힐링파 (광합성 요정) | forest_nature, relaxation | urban, nightlife |
| P02 | 자연 야생파 (베어그릴스) | forest_nature, activity, exoticness | luxury |
| P03 | 도시 쇼핑파 (쇼퍼홀릭) | urban, shopping, luxury | forest_nature |
| P04 | 도시 예술파 (박물관 덕후) | urban, heritage_culture, landmark_architecture | activity |
| P05 | 럭셔리 휴양파 (호캉스족) | relaxation, luxury, water | activity |
| P06 | 로컬 미식파 (시장 탐험가) | food, heritage_culture, exoticness | luxury |
| P07 | 계획적 관광파 (랜드마크 콜렉터) | heritage_culture, landmark_architecture | nightlife |
| P08 | 즉흥적 낭만파 (골목길/야경) | nightlife, water, urban | landmark_architecture |

페르소나 수(8개)는 MVP 기준이며, 데이터 누적 후 12~16개로 확장 가능합니다.

## Data Model / Interfaces

```ts
export type TagId =
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
export interface Place {
  place_id: string;
  country: string;
  city: string;
  tags_vector: number[];
  image_url: string;
  desc: string;
  ota_destination_id?: string;
}
```

```ts
export interface UserPreferenceVector {
  user_id: string;
  vector: number[];
  stage1_vector: number[];
  stage2_vector: number[];
  likes: string[];
  dislikes: string[];
  neutrals: string[];
  persona_id?: string;
}
```

```ts
export interface RecommendationResult {
  primary_result: {
    country: string;
    city: string;
    score: number;
    reason: string;
  };
  secondary_result?: {
    country: string;
    city: string;
    score: number;
    reason: string;
  };
  persona: {
    id: string;
    name: string;
  };
}
```

```ts
export interface PlaceSeedRecord {
  place_id: string;
  name_en: string;
  country_code: string;
  city?: string;
  tags_vector: number[]; // length 12
  source: "wikidata" | "manual_review";
}
```

```ts
export interface CountrySeedRecord {
  country_code: string;
  country_name_ko: string;
  country_name_en: string;
  region: "asia" | "europe" | "middle_east" | "africa" | "north_america" | "south_america" | "oceania";
  seed_place_count: number;
  place_count_bucket: "30_plus" | "20_29" | "10_19" | "6_9" | "0_5";
  tags_vector: number[]; // length 12
  places: PlaceSeedRecord[]; // Phase 1: 상한 없음
}
```

## GPT Usage Policy

GPT는 `설명/카피 레이어`로만 사용합니다.

- 사용 범위
  - 페르소나 이름/설명 문구 생성
  - 추천 이유 요약 문장 생성
  - 공유용 문구 생성
  - 다국어 번역/로컬라이징
- 비사용 범위
  - 벡터 계산
  - 국가/도시 랭킹 결정
  - 1차/2차 후보 필터링

인원/여행시기/예산 질문은 GPT 없이 폼 입력으로 처리하고, 결과 문장만 GPT로 다듬습니다.

### Hackathon Priority Use Cases (for 2026-02-21)

해커톤 제출에서 GPT API 사용 근거를 명확히 보여주기 위해, 아래 4개를 필수 적용합니다.

1. Persona Narrative Generator (Step 4)
- 입력: `persona_id`, 상위 태그, 하위 태그, 최종 추천 도시
- 출력: 페르소나 타이틀, 1문장 요약, 추천 근거 3줄
- 목적: 규칙 기반 점수를 사람이 이해하는 스토리로 변환

2. Recommendation Reason Writer (Step 4~5)
- 입력: `primary_result`, `secondary_result`, 핵심 벡터 태그
- 출력: 각 추천지별 설명 문구(짧은 버전/긴 버전)
- 목적: 결과 카드의 클릭률과 신뢰도 개선

3. Trip Brief Composer (Step 5 입력 이후)
- 입력: 인원, 예상 시기, 예산, 선택 도시
- 출력: 숙소 지역 추천, 1일 예산 가이드, 체크리스트
- 목적: OTA 클릭 전 의사결정 불확실성 감소

4. Share Copy Generator (결과 화면)
- 입력: 페르소나, 추천 도시, 여행 분위기 키워드
- 출력: 공유 문구(KR/EN), 해시태그 세트
- 목적: 결과 공유율 향상

### GPT I/O Contract (MVP)

```ts
export interface GptNarrativeInput {
  persona_id: string;
  top_tags: string[];
  low_tags: string[];
  primary_city: string;
  secondary_city?: string;
  travelers?: number;
  month?: string;
  budget_level?: "low" | "mid" | "high";
}

export interface GptNarrativeOutput {
  persona_title: string;
  one_liner: string;
  reasons_primary: string[];
  reasons_secondary?: string[];
  trip_brief?: string[];
  share_copy_ko?: string;
  share_copy_en?: string;
  hashtags?: string[];
}
```

운영 원칙:

- GPT 응답 실패 시, 템플릿 기반 기본 문구로 즉시 fallback
- GPT는 항상 `structured output(JSON)`으로 요청해 프론트 렌더링 안정성 확보
- 개인정보는 프롬프트에 포함하지 않음

## OTA Integration Policy

도시가 결정되면 OTA 검색 파라미터를 사전 채워 딥링크로 보낼 수 있습니다.

- 가능 항목
  - 목적지(`city`)
  - 체크인/체크아웃(`checkin`, `checkout`)
  - 인원(`adults`, `rooms`)
- 구현 방식
  - 제휴사별 딥링크 포맷 템플릿 관리
  - `ota_destination_id` 또는 `city` 매핑 테이블 사용

예시(설명용):

```text
booking.com/searchresults?...&ss={city}&checkin={date}&checkout={date}&group_adults={n}
```

## Monetization Model

수익 구조는 3축입니다.

1. OTA 제휴 (Primary)
   - 호텔 예약: `$8 ~ $25` / booking
   - 항공권: `$3 ~ $10` / booking
2. AdSense (Secondary)
   - 사진 선택 화면 하단 고정 영역 중심
   - 추천 결과 CTA 클릭 흐름 방해 최소화
3. CRM/Newsletter (Later)
   - 이메일 opt-in 기반 딜 큐레이션

## Tech Stack & Infrastructure

- Frontend: `Next.js`
- Recommendation Engine: `TypeScript/JavaScript`
- Data Source: 초기 `JSON`, 확장 시 `DB`
- Image Storage: `Cloudflare R2`
- Delivery: `CDN`
- LLM Layer: `ChatGPT API` (페르소나 내러티브, 추천 이유, 트립 브리프, 공유 카피)
- Analytics: 이벤트 트래킹(`vote`, `persona`, `ota_click`)

## Image Licensing Policy

- 사용 가능 소스: `Unsplash`, `Pexels`, `Pixabay`
- `Pinterest`는 레퍼런스 확인용만 사용
- 릴리즈 전 라이선스/표기 의무 점검

## MVP Scope / Out of Scope

### In Scope

- 국가 100 + 여행지 시드 데이터셋 구축
- 10장 탐색 + 26~30장 수렴의 2단계 사진 입력
- 최종 페르소나 1개 산출
- 대표 추천 1개 + 대안 1개 결과 제공
- 여행 컨텍스트(인원/시기/예산) 수집
- OTA 딥링크 연결

### Out of Scope

- 실시간 모델 재학습 파이프라인
- 소셜 그래프/팔로우 기능
- 대규모 자동 실험 플랫폼
- 복잡한 멀티도시 경로 최적화

## Roadmap

1. Phase 1 (MVP Core)
   - 국가 100 + 여행지 시드(상한 없음) 구축
   - 12D 태그 taxonomy 고정 (`forest_nature`, `water`, `heritage_culture` 포함)
   - 2단계 입력 플로우 구현
   - 페르소나 매핑 규칙 탑재
2. Phase 2 (Conversion)
   - OTA 딥링크 파라미터 자동화
   - 컨텍스트 입력 폼 + 전환 추적
3. Phase 3 (Scale)
   - 국가/도시 풀 확장
   - 페르소나 체계 고도화
   - SEO 랜딩 확장

## Success Metrics

유저 플로우와 직접 연결된 지표만 추적합니다.

- Step1 완료율: 10장 선택 완료율
- Step3 완료율: 26~30장 선택 완료율
- 페르소나 수용률: "내 취향과 맞다" 응답 비율
- 1순위 추천 클릭률 vs 2순위 추천 클릭률
- OTA 클릭률/전환률
- 결과 공유율, 7일/30일 재방문율

## Contributing CTA

`Wheretotravel`은 MVP 빌드 단계입니다. 아래 영역에서 바로 기여할 수 있습니다.

- 태그 벡터 설계/검증
- 페르소나 룰셋 튜닝
- OTA 딥링크 매핑 구현
- 결과 화면 UX 및 공유 경험 개선

목표는 추천 정확도 자체보다, 사용자가 실제로 "여행 결정을 끝내고 예약까지 가는 경험"을 완성하는 것입니다.
