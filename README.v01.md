# Wheretotravel

사진 Like/Dislike 기반 여행 취향 분석 및 도시 추천 엔진

[내 생각에 여행지 추천을 하더라도 그 사람의 Needs가 대충 맞아야하니 Like/Dislike 할 때 Like 쪽에 있는 벡터를 기반으로 다음 사진이 조금 보여지면 어떠할까 싶어... 그렇게 한 10장은 이 사람이 어느 벡터를 좋아할지 방향성을 잡은다음에 나머지 26장에서 30장은 비슷한 벡터끼리 Like/Dislike/Neutural을 하는거지....]

- Status: `MVP 준비중`
- URL: `https://whereto.travel`

## Overview

`Wheretotravel`은 사용자가 명소 사진에 `Like / Dislike / Neutral`만 선택하면 여행 취향 벡터를 계산해 국가와 도시를 추천하는 서비스입니다.  
핵심은 "재미 요소"가 아니라 "결정 지원"입니다. 스크랩만 쌓이고 결정하지 못하는 문제를, 짧은 입력으로 실제 선택 가능한 결과로 바꿉니다.

## Problem

여행지 선택 과정에는 반복되는 병목이 있습니다.

- 저장한 여행 사진은 많지만 최종 목적지 결정이 어렵다.
- 본인 취향을 언어로 설명하기 어렵다.
- 검색/블로그/숏폼을 많이 봐도 행동 가능한 결과가 부족하다.

## Solution

서비스는 다음 원칙으로 동작합니다.

- 입력은 단순화: 사진 기반 `Like / Dislike / Neutral` [사진 선택하는 좌 우 하단에 adsense 넣을 예정]
- 계산은 구조화: 태그 벡터 합산으로 취향 수치화
- 결과는 실행 가능: 국가 추천 후 도시 추천까지 연결
- 전환은 자연스럽게: 결과 화면에서 OTA 딥링크로 숙소/항공 탐색 [궁금사항 : 국가 / 도시가 선택이 되면 해당 도시를 바탕으로 자동으로 booking.com 이나 이런 곳에 해당 도시의 숙소가 추천되게 가능한지?]

## User Flow (6 Steps)

1. 글로벌 명소 사진 10장을 보고 `Like / Dislike / Neutral` 선택
2. 선택 결과로 여행 취향 벡터 생성 (`자연/도시/휴양/역사/이국적/야경/액티비티` 등)
3. 취향 벡터들과 유사한 국가 및 도시 추출
[1개 국가/도시만 추천, 이유 제시는 솔직히 할 게 없어보이고, 아래처럼 벡터들을 기반으로 mbti처럼 저런 페르소나를 하는게 어떤지?
개수 및 페르소나 및 벡터 조합은 나에게 제시 바람.
자연 힐링파 (광합성 요정)
자연 야생파 (베어그릴스)
도시 쇼핑파 (쇼퍼홀릭)
도시 예술파 (박물관 덕후)
럭셔리 휴양파 (호캉스족)
가성비 로컬파 (시장 탐험가)
계획적 관광파 (유적지/랜드마크)
즉흥적 낭만파 (골목길/야경)]
4. 3번 추출된 도시/소도시 26~30개에 대해 2차 `Like / Dislike / Neutral`
5. 최종 2개 국가/도시 추천 + 개인화된 설명 (이때 gpt api를 쓰는게 나을지? + 이떄 OTA 딥링크로 숙소/항공 탐색하는거를 gpt api를 통해 몇명이서 가세요? 언제쯤 예상하세요? 한다음에 사용자가 입력하면 6번으로 이동하는거 어떰)
6. OTA 위젯/딥링크에서 숙소/항공 정보 확인 

## Core Recommendation Logic

MVP는 설명 가능한 단순 벡터 로직을 기본으로 사용합니다.

### Scoring Rule

- `like -> +tags_vector`
- `dislike -> -tags_vector`
- `neutral -> 0`

```pseudo
initialize user_vector = [0 ... 0]

for vote in user_votes:
  place = place_map[vote.place_id]
  if vote.choice == "like":
    user_vector += place.tags_vector
  else if vote.choice == "dislike":
    user_vector -= place.tags_vector
  else:
    continue
```

### Ranking Rule

- MVP 기본: `weighted sum`
- 옵션: `cosine similarity` (실험 플래그로 병행 가능)

```pseudo
score(entity) = sum_i (weight_i * user_vector[i] * entity.tags_vector[i])
```

추천 단계: [위 USER FLOW에 맞게 재수정 바람]

1. 국가 단위 점수 계산 후 Top N 국가 추출
2. 선택된 국가 내부 도시 점수 계산
3. Top 3 도시 반환 + 설명 문구 생성

## Data Model / Interfaces

```ts
export interface Place {
  place_id: string;
  country: string;
  city: string;
  tags_vector: number[];
  image_url: string;
  desc: string;
}
```

```ts
export interface UserPreferenceVector {
  user_id: string;
  vector: number[];
  likes: string[];
  dislikes: string[];
  neutrals: string[];
}
```

```ts
export interface RecommendationResult {
  top_countries: { country: string; score: number }[];
  top_cities: { city: string; country: string; score: number; reason: string }[];
}
```

## GPT Usage Policy

GPT는 `의사결정 엔진`이 아니라 `설명 엔진`으로 사용합니다.

- 사용 범위
  - 여행 성향 이름 붙이기
  - 국가/도시 추천 이유 자연어 생성
  - 공유용 결과 문구 생성
  - 다국어 표현 변환
- 비사용 범위
  - 국가/도시 순위 계산
  - 점수 산출 및 랭킹 결정

즉, 랭킹은 규칙 기반 알고리즘이 담당하고 GPT는 결과 표현을 담당합니다.

## Monetization Model

수익 구조는 아래 3축을 기준으로 설계합니다.

1. OTA 제휴 (Primary)
   - 호텔 예약: 건당 대략 `$8 ~ $25`
   - 항공권: 건당 대략 `$3 ~ $10`
2. 광고 수익 (AdSense)
   - 트래픽 성장 시 보조 수익원으로 확장
3. CRM/Newsletter
   - 이메일 opt-in 기반 여행 딜 큐레이션

원칙:

- OTA 위젯은 광고 슬롯이 아니라 "다음 행동"을 위한 기능적 CTA로 배치
- 초기 단계는 전환 품질(클릭/예약)을 먼저 최적화

## Tech Stack & Infrastructure

- Frontend: `Next.js`
- Recommendation Engine: `TypeScript/JavaScript` 기반 벡터 계산
- Data Source: 초기 `JSON`, 확장 시 `DB` 전환
- Image Storage: `Cloudflare R2`
- Delivery: `CDN` 캐싱 전략
- LLM Layer: `ChatGPT API` (설명/카피 전용)

아키텍처 목표:

- 서버 비용 최소화
- 이미지 응답 속도 최적화
- 계산 로직의 결정 가능성/재현성 확보

## Image Licensing Policy

이미지 소스는 저작권 안전 기준을 준수합니다.

- 사용 가능 소스: `Unsplash`, `Pexels`, `Pixabay`
- `Pinterest`는 레퍼런스 확인용으로만 사용 (직접 호스팅/재배포 금지)
- 각 소스의 라이선스/attribution 요구사항을 릴리즈 전 점검

## MVP Scope / Out of Scope

### In Scope 
[위 USER FLOW에 맞게 재수정 바람]
- 10장 사진 기반 취향 입력 플로우
- 국가 추천 + 동일 국가 내 도시 2차 추천
- 상위 3개 도시 결과 화면
- GPT 기반 결과 설명 문구 생성
- OTA 딥링크 연결

### Out of Scope

- 복잡한 실시간 개인화 모델 학습 파이프라인
- 사용자 간 소셜 그래프/팔로우 기능
- 대규모 다변량 A/B 실험 자동화 플랫폼
- 복잡한 멀티도시 경로 자동 탐색 기능

## Roadmap

1. Phase 1 (MVP Core)
   - 장소 데이터셋 구축
   - 벡터 스코어링 엔진 구현
   - 결과 페이지와 설명 생성 연결
2. Phase 2 (Conversion)
   - OTA 위젯 배치 최적화
   - 클릭/전환 추적 이벤트 정교화
3. Phase 3 (Scale)
   - 국가/도시 데이터 확장
   - 다국어 UX 개선
   - SEO 랜딩 페이지 확장

## Success Metrics
[위 USER FLOW에 맞게 재수정 바람]
핵심 지표는 "추천 신뢰"와 "행동 전환"입니다.

- 입력 완료율: 20장 선택 완료 비율
- 추천 결과 클릭률: 국가/도시 카드 클릭률
- OTA 클릭률/전환률
- 결과 화면 공유율
- 재방문율 (7일/30일)

성패를 가르는 우선 지표:

- 결과 화면이 사용자가 "공유하고 싶다"고 느끼는 수준인지

## Contributing CTA

`Wheretotravel`은 현재 MVP 빌드 단계입니다.  
함께 만들고 싶은 개발자/빌더는 아래 주제부터 기여할 수 있습니다.

- 장소 데이터 스키마/품질 검수
- 벡터 스코어링 로직 고도화
- 결과 화면 UX 및 공유 경험 개선
- OTA 딥링크 트래킹 정교화

협업 목적은 단순 트래픽이 아니라, 사용자가 실제로 "어디 갈지 결정"하도록 만드는 제품 완성도입니다.
