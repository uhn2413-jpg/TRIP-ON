# TRIP:ON v0.13.1

## 이번 수정

- 페이지 전환 애니메이션을 더 느리고 부드럽게 조정
- 일정/기록 탭은 비동기 로딩 때문에 화면이 두 번 튀지 않도록 이동 거리를 최소화
- 모든 bottom sheet를 document.body Portal로 렌더링해 긴 화면 아래쪽에서 열 때 위치가 밀리는 모바일 브라우저 문제 수정
- Timeline 실제 방문의 actual_start_at / actual_end_at을 일정표 시간으로 사용
- 계획 시간이 없는 실제 방문은 `실제` 칩으로 표시
- 계획/실제 시간이 모두 있는 일정은 계획 시간을 메인으로, 실제 시간을 보조 정보로 표시
- Timeline의 10초 미만 짧은 감지는 메인 일정표에서 분리해 접을 수 있는 `짧은 방문 감지` 영역에 보존
- 묵호여행 PDF 계획표 데이터는 Supabase에 별도 반영 완료 (코드 ZIP에는 데이터 재삽입 SQL을 포함하지 않음)

## 교체 파일

업데이트 ZIP 기준:

- `src/App.jsx`
- `src/styles.css`
- `src/components/SheetBackdrop.jsx`
- `src/components/RecordTab.jsx`
- `src/lib/schedule.js`
- `package.json`

