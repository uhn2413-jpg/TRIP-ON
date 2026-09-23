# TRIP:ON v0.13.10

스크랩 다중 태그, 화면 테마, 느리고 부드러운 탭 전환을 추가한 업데이트입니다.

## 주요 변경
- 상위 탭과 여행 상세 탭 전환을 약 0.43~0.46초로 조정
- 스크랩 형식을 `장소 / 링크 / 메모`로 단순화
- 스크랩에 `맛집 / 카페 / 숙소 / 교통 / 관광·체험 / 쇼핑 / 여행루트 / 여행팁` 등 여러 태그 동시 선택
- 직접 태그 추가 지원
- 태그 필터와 형식 필터를 분리
- 기존 스크랩의 맛집/숙소/교통 타입을 새 태그로 자동 이전
- 환경설정에 `라이트 / 시스템 / 다크` 테마 추가

## DB 변경
`trip_on_scraps`에 다음 필드가 추가됩니다.
- `format text`: place / link / memo
- `tags text[]`: 다중 주제 태그

마이그레이션 파일:
`supabase/migrations/20260922_trip_on_v0_13_10_scrap_tags.sql`

## v0.13.11
- Dark theme surfaces and contrast were rebuilt across overview, schedule, prep, record, expense and settings screens.
- Page/tab transitions now use a longer 600–620ms rise-and-settle motion closer to Culture Index.



## v0.13.12
- Dark-mode audit completed for Timeline, grouped visits, settlement, map/editor helper surfaces and nested cards.
- Scrap filters now appear in format → tag → trip order.
- JSON backup v2 includes app preferences while remaining compatible with v1 backups.
- No database migration required.
