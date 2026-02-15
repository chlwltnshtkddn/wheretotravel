# UI_MVP_SPEC.v1

## Objective

MVP라도 결과 신뢰와 전환을 만들 수 있는 UI 품질을 확보한다.  
범위는 핵심 3화면(Landing, Swipe, Result)이다.

## Global UX Rules

- Mobile-first 기준
- 터치 타겟 최소 `44px`
- 주요 CTA는 화면 하단 고정 또는 thumb zone에 위치
- 네트워크 지연 시 skeleton/loading 상태 명시
- 다크모드/라이트모드 모두 텍스트 대비 WCAG AA 수준 유지

## Screen 1: Landing

### Goal

서비스 가치와 진행 시간을 즉시 이해시키고 시작 전환을 만든다.

### Required Components

- Hero title: 한 줄 가치 제안
- Sub-copy: 10장 + 26~30장 2단계 안내
- Primary CTA: `여행 취향 찾기 시작`
- Secondary link: `이미지 출처/라이선스`
- ETA badge: `약 2~3분`

### States

- default
- loading (세션 생성 중)
- error (세션 생성 실패 + 재시도)

### Events

- `landing_view`
- `start_click`

## Screen 2: Swipe

### Goal

최소 피로도로 선호 입력을 수집한다.

### Required Components

- 이미지 카드
- 선택 버튼 3개: `Like`, `Neutral`, `Dislike`
- 진행 표시: Stage 1(10장), Stage 2(26~30장)
- 현재 진행률 바
- 이전 카드 되돌리기 (1스텝)
- 하단 정책 영역: 제한적 AdSense 슬롯 (입력 방해 금지)

### Interaction Rules

- 버튼 클릭 + 스와이프 제스처 모두 지원
- 선택 즉시 다음 카드로 전환 (지연 < 150ms 목표)
- Stage 전환 시 미니 안내 모달 1회

### States

- loading_card
- ready
- transitioning_stage
- completed
- error_card_fetch

### Events

- `swipe_view`
- `vote_like`
- `vote_neutral`
- `vote_dislike`
- `stage1_complete`
- `stage2_complete`

## Screen 3: Result

### Goal

추천 신뢰를 만들고 OTA 클릭으로 연결한다.

### Required Components

- Persona card (이름 + 1줄 요약)
- 대표 추천 1개 + 대안 1개 카드
- 추천 이유 3줄
- 컨텍스트 입력: 인원/예상 시기/예산
- CTA 2개:
  - `숙소 보기`
  - `항공 보기`
- 공유 버튼 + GPT 공유 문구

### States

- loading_recommendation
- loading_gpt_copy
- ready
- gpt_fallback_copy
- ota_link_error

### Events

- `result_view`
- `context_submit`
- `cta_accommodation_click`
- `cta_flight_click`
- `share_copy_click`

## Copy Guidelines

- 과장보다 설명 가능성 우선
- 추천 이유는 벡터 태그 기반 문장으로 고정
- GPT 출력 실패 시 템플릿 카피로 즉시 fallback

## QA Checklist

- 3화면 모두 모바일에서 레이아웃 깨짐 없음
- Stage/진행률 표시가 항상 정확함
- CTA 클릭 시 추적 이벤트 누락 없음
- 결과 화면에서 페르소나/추천/CTA가 fold 위에 보임
