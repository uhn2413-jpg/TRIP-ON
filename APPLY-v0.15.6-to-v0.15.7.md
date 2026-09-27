# TRIP:ON v0.15.6 → v0.15.7 적용 순서

이번 버전은 DB 컬럼이 하나 추가되므로 **SQL을 먼저 적용한 뒤 GitHub 파일을 교체**하는 순서를 권장합니다.

## 1. Supabase migration 실행
Supabase Dashboard → SQL Editor에서 다음 파일 내용을 실행합니다.

`supabase/migrations/trip_on_v0_15_7_duration_nights.sql`

실행 결과 오류가 없어야 합니다.

## 2. GitHub 파일 교체
업데이트 묶음을 사용하는 경우 아래 파일을 동일 경로에 덮어씁니다.

- `src/App.jsx`
- `src/styles.css`
- `src/lib/trips.js`
- `src/components/OfflineTravel.jsx`
- `package.json`
- `README.md`
- `README-v0.15.7.md`
- `APPLY-v0.15.6-to-v0.15.7.md`
- `supabase/migrations/trip_on_v0_15_7_duration_nights.sql`

전체 묶음을 사용하는 경우 저장소 파일을 v0.15.7 전체 묶음 기준으로 교체하면 됩니다. `.env` 실제 값은 포함되어 있지 않으며 기존 Vercel 환경변수는 그대로 유지합니다.

## 3. 배포 후 확인
- 새 여행 만들기 1단계의 국내 여행지 선택 간격
- 긴 시·군·구/읍·면·동 이름이 잘리지 않는지
- 날짜 입력 방식 선택필드 4종
- 날짜 미정 상태에서 `3박 5일` 입력/저장/재수정
- 정확한 날짜 선택 후 전체 일수 자동 계산 + 숙박 수 수동 변경
- 홈/여행 목록/상세 및 오프라인 여행함의 기간 표기
- 기존 여행이 예전과 동일한 `n박 n일`로 보이는지
