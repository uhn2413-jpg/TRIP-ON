# TRIP:ON v0.11.2 — Timeline actual-route visualization

기준: 사용자가 다시 보내준 **v0.11 전체본 + v0.11.1 카카오/Google 하이브리드 지도 업데이트**를 합친 뒤 수정했습니다.

## 이번 변경

- Google Timeline 가져오기 성공 후, 아카이브의 `실제 동선`에 **지도에서 실제 동선 보기** 카드 표시
- 전체 / 날짜별 실제 동선 필터
- 방문 지점 핀 + 시간순 이동 목록
- `timelinePath` 경로점이 있는 경우 그대로 표시
- 이번 사용자 파일처럼 `경로점 0개`인 Timeline export도 표시 가능하도록 보강
  - 이동 세그먼트의 시작/종료 좌표가 있으면 그 좌표로 선 생성
  - 이동 좌표도 없는 날은 시간순 방문 지점을 이어 **보조 동선** 생성
  - 화면에 “방문 순서 기준 재구성”임을 명시
- Timeline에서 가져온 방문 기록이 있으면 아카이브 상단 `방문 장소` 통계도 실제 방문 데이터 기준으로 표시
- 국내 좌표만 있는 실제 동선은 v0.11.1의 규칙대로 **카카오맵 우선**, 해외/혼합은 Google Maps 사용

## GitHub에서 교체

- `src/lib/archive.js`
- `src/components/ArchiveOverview.jsx`
- `src/components/TravelMap.jsx`
- `src/components/PlaceSearchField.jsx`
- `src/lib/googleMaps.js`
- `package.json`

## GitHub에 추가 / 기존 v0.11.1에서 아직 없다면 추가

- `src/lib/kakaoMaps.js`
- `src/lib/mapProviders.js`
- `src/kakao-maps.css`

## 환경변수

- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_KAKAO_MAPS_JAVASCRIPT_KEY`

Supabase 추가 migration은 없습니다.
