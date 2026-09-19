# TRIP:ON v0.11.1 — Kakao + Google hybrid maps

기준: GitHub `uhn2413-jpg/TRIP-ON`의 현재 v0.11 코드에 맞춘 후속 업데이트.

## 이번 변경

- 국내 지도: 카카오맵 우선
- 해외 / 여러 국가가 섞인 지도: Google Maps
- 국내 지도에서 Google Maps와 카카오맵 둘 다 연결돼 있으면 지도 위에서 서비스 전환 가능
- 장소 검색에 `자동 / 카카오 / Google` 선택 추가
- 자동 검색은 국내 지역 단서가 있으면 카카오, 그 외에는 Google을 우선 사용
- 검색 결과가 없으면 자동 모드에서 다른 지도 서비스로 한 번 fallback
- 검색은 기존처럼 **검색 버튼을 눌렀을 때만** API 요청
- Kakao 검색 결과도 기존 `trip_on_places`에 `provider='kakao'`와 Place ID/좌표로 저장
- 기존 Google 장소 데이터 및 Google Timeline 기능 유지
- 국내 장소의 외부 지도 링크는 카카오맵, 해외는 Google 지도로 열림
- Supabase 마이그레이션 없음

## GitHub에서 교체

- `src/components/PlaceSearchField.jsx`
- `src/components/TravelMap.jsx`
- `src/lib/googleMaps.js`

## GitHub에 새로 추가

- `src/lib/kakaoMaps.js`
- `src/lib/mapProviders.js`
- `src/kakao-maps.css`

## 선택적으로 교체

- `.env.example` — 환경변수 예시 추가
- `package.json` — 버전만 0.11.1로 변경, 새 npm 패키지는 없음

## Vercel 환경변수

기존:

- `VITE_GOOGLE_MAPS_API_KEY`

추가:

- `VITE_KAKAO_MAPS_JAVASCRIPT_KEY`

카카오에서는 **REST API 키가 아니라 JavaScript 키**를 사용한다.

## Kakao Developers 설정

1. Kakao Developers에서 앱 생성
2. 앱 관리 → Kakao Map → 사용 설정 → ON
3. 앱 → 플랫폼 키 → JavaScript 키 확인
4. JavaScript 키의 JavaScript SDK 도메인에 TRIP:ON 배포 도메인 등록
   - `https://trip-on-khaki.vercel.app`
5. JavaScript 키를 Vercel의 `VITE_KAKAO_MAPS_JAVASCRIPT_KEY`에 저장
6. Redeploy

## 동작 규칙

- 한국 좌표만 있는 지도 → 카카오맵 우선
- 해외 좌표가 하나라도 섞인 지도 → Google Maps
- 국내 지도 + 두 API 모두 사용 가능 → 카카오/Google 전환 버튼 표시
- 장소 검색의 자동 모드는 국내 도시/지역명이 검색 문맥에 있으면 카카오 우선
- 애매한 경우 사용자가 `카카오` 또는 `Google`을 직접 선택 가능

## 체크

JS/JSX parser syntax check 완료.
실제 Kakao SDK 호출은 사용자 JavaScript 키와 허용 도메인이 있어야 브라우저에서 확인 가능.
