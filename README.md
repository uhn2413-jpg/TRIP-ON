# TRIP:ON v0.15.7

개인 여행의 **준비 → 일정 → 실제 기록 → 지출 → 여행 후 아카이브**를 한 여행 안에서 이어 관리하는 TRIP:ON의 현재 기준 버전입니다.

## v0.15.7 핵심 변경
- 새 여행 1단계 전체 폼 간격/배치 정돈
- 국내 여행지 `시·도 / 시·군·구 / 읍·면·동` compact row UI
- 읍·면·동 자동 로드
- 날짜 정확도 4버튼 → `날짜 입력 방식` 선택필드
- `duration_nights` 추가로 `3박 5일` 같은 숙박 수/총 일수 분리 지원
- 기존 여행은 자동으로 기존 `총 일수 - 1박` 규칙을 유지

상세 변경사항: `README-v0.15.7.md`
적용 순서: `APPLY-v0.15.6-to-v0.15.7.md`

## 적용 전 DB 작업
`supabase/migrations/trip_on_v0_15_7_duration_nights.sql`을 Supabase SQL Editor에서 먼저 실행하세요.
