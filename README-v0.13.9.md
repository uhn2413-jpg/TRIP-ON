# TRIP:ON v0.13.9

MY 설정 화면과 탭 전환 모션을 실제 동작하도록 정리한 패치입니다.

## 변경 내용

### 1. MY 메뉴 실제 화면 추가
- `앱 설정` → `환경설정`
- `데이터 관리` → `데이터·백업`
- MY 내부 화면에 뒤로가기와 모바일/태블릿/데스크톱 대응 레이아웃 추가

### 2. 환경설정
- 지도 기본값: 자동 / 카카오 우선 / Google 우선
- 장소 검색과 지도 화면의 최초 지도 선택에 기본값 반영
- 페이지 전환 효과 켜기/끄기

### 3. 데이터·백업
- 현재 Supabase 계정의 TRIP:ON 테이블을 JSON으로 내보내기
- 같은 계정에서 만든 JSON 백업을 현재 데이터와 합쳐서 복원
- Google Timeline 가져오기 내역 확인
- JSON에는 첨부파일의 DB 경로는 포함되지만 이미지/PDF 파일 바이트 자체는 포함되지 않음

### 4. 탭 전환 효과
- 홈 / 여행 / 스크랩 / MY 전환 시 페이지가 살짝 위로 올라오며 페이드인
- 여행 상세의 개요 / 일정 / 준비 / 기록 / 지출 전환도 같은 구조로 재적용
- 기존에는 DOM이 유지된 채 같은 animation-name만 사용해 일부 탭 전환에서 애니메이션이 재시작되지 않던 문제를 수정
- `prefers-reduced-motion` 및 환경설정의 전환효과 OFF를 존중

## 변경 파일
- `src/App.jsx`
- `src/styles.css`
- `src/components/TravelMap.jsx`
- `src/components/PlaceSearchField.jsx`
- `src/lib/preferences.js` (신규)
- `src/lib/dataBackup.js` (신규)
- `package.json`

Supabase SQL 추가 작업은 없습니다.
