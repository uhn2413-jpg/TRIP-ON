# TRIP:ON v0.7

## 이번 버전
- 기록 탭 실제 저장: 사진 / 티켓 / 영수증 / 메모
- DAY 연결 선택, 일정 연결 선택, 둘 다 연결하지 않는 여행 전체 기록 지원
- 날짜 / 시간 / 시간대 / 장소 / 도시 / 메모 저장
- 0.5 단위 드래그 별점
- 사진 여러 장 및 PDF 첨부
- 기록 유형 필터와 DAY별 목록
- 기록 상세 / 수정 / 삭제 / 첨부파일 삭제
- Supabase Storage의 기존 `trip-on-files` 비공개 버킷 사용

## GitHub에서 반영할 파일
교체:
- `src/App.jsx`
- `src/styles.css`

추가:
- `src/components/RecordTab.jsx`
- `src/lib/records.js`

기존 `PrepTab.jsx`, `RatingSlider.jsx`, `schedule.js`, `prep.js`, `trips.js`, `supabase.js`는 그대로 사용합니다.

DB 마이그레이션은 현재 연결된 Supabase 프로젝트에 이미 적용되어 있습니다.
