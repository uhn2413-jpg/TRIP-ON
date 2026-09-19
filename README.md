# TRIP:ON v0.11

v0.10의 지도/장소 연결 위에 **여행 완료·아카이브 + Google Maps Timeline 실제 동선 가져오기 + 일정 상세 미니 지도**를 추가한 버전입니다.

## 이번 버전 핵심

### 1) 여행 완료 / 아카이브
- 종료된 여행의 개요 탭이 아카이브 화면으로 전환됩니다.
- `여행 완료하기`에서 여행 전체 별점(0.5 단위)과 한줄평을 저장할 수 있습니다.
- 완료 일정 / 방문 장소 / 기록 수 / 총 지출 요약을 표시합니다.
- 완료 상태를 다시 해제할 수도 있습니다.

### 2) Google Maps Timeline 가져오기
- Google Maps Timeline에서 내보낸 `.zip` 또는 `.json`을 선택합니다.
- ZIP/JSON 전체를 Supabase Storage에 올리지 않습니다. 브라우저에서 먼저 읽고 `semanticSegments`만 해석합니다.
- 현재 여행의 시작일/종료일이 가져오기 기간의 기본값입니다.
- 날짜를 직접 바꿔 원하는 기간만 추출할 수 있습니다.
- 저장 항목: 방문/이동/path 세그먼트, 시간, UTC offset, 이동수단, 거리, Google Place ID, 시작/종료 좌표, timelinePath 경로점.
- `rawSignals`는 저장하지 않습니다.
- 이미 TRIP:ON에 Google Place ID가 같은 장소가 있으면 Timeline 방문과 연결합니다.

### 3) 지도에서 계획/실제 비교
- 여행 지도: `함께 보기 / 계획 동선 / 실제 동선`
- DAY 지도: `계획 / 실제 / 함께`
- 실제 동선은 저장한 Timeline path를 지도 위에 그립니다.

### 4) 일정 상세 미니 지도
- 일정 상세의 장소 카드에서 `지도 보기`를 누르면 그 자리에서 작은 Google 지도가 펼쳐집니다.
- 필요할 때만 지도 컴포넌트를 렌더링합니다.
- `Google 지도에서 열기` 버튼도 유지했습니다.

## GitHub에서 교체/추가할 파일

### 교체
- `package.json`
- `src/App.jsx`
- `src/styles.css`
- `src/lib/trips.js`
- `src/components/TravelMap.jsx`

### 추가
- `src/lib/archive.js`
- `src/components/ArchiveOverview.jsx`

### 참고용 SQL
- `supabase/v0.11-migration.sql`

Supabase production에는 `trip_on_v011_archive_timeline` migration이 이미 적용되어 있으므로 **사용자가 SQL을 다시 실행할 필요는 없습니다.**

## 새 dependency

Timeline ZIP을 브라우저에서 읽기 위해 `fflate`를 추가했습니다. Vercel이 새 배포에서 `package.json`을 보고 자동 설치합니다.

## 환경변수
기존과 동일합니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

## 확인 권장 순서
1. 과거 날짜 여행을 열어 개요 탭 → 아카이브가 보이는지 확인
2. 여행 완료하기 → 별점/한줄평 저장
3. Timeline ZIP/JSON 선택 → 원본 범위/선택 기간 미리보기 확인
4. 짧은 기간으로 먼저 가져오기
5. 여행 지도 → `실제 동선` 확인
6. DAY 지도 → `계획/실제/함께` 비교
7. 일정 상세 → `지도 보기`로 미니 지도 펼치기

## 검증
- 프로젝트 내 `.js` / `.jsx` 전 파일 TypeScript parser syntax check 통과.
- 현재 작업 환경의 `npm install`은 네트워크 제한으로 timeout되어 실제 Vite production build는 실행하지 못했습니다.
