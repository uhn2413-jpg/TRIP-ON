# TRIP:ON v0.2

여행 전 준비 → 여행 중 기록 → 여행 후 아카이브까지 이어지는 개인 여행 웹앱 프로토타입입니다.

## v0.2에서 달라진 점

- 여행 커버를 어두운 그라데이션 대신 **밝은 단색**으로 변경
- 10개 기본 색상 + **직접 색상 지정(color picker)** 지원
- 기존 여행 상세 우측 상단 `···`에서 여행 정보/색상 수정 가능
- Supabase 연결 준비 완료
- Supabase가 연결되지 않은 상태에서는 기존처럼 localStorage로 작동
- Supabase가 연결되면 Google 로그인 후 계정별 여행 저장
- v0.1 로컬 여행을 Supabase로 가져오는 버튼 제공
- 향후 일정/준비/기록/지출까지 확장할 전체 DB 스키마 포함

## 1. 로컬 UI만 먼저 확인

환경변수를 넣지 않으면 별도 설정 없이 localStorage 모드로 실행됩니다.

```bash
npm install
npm run dev
```

## 2. Supabase 연결

### A. Supabase에서 새 프로젝트 생성

Supabase Dashboard에서 TRIP:ON용 프로젝트를 하나 생성합니다.

### B. 테이블 생성

Supabase > SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.

### C. Google 로그인 설정

Supabase > Authentication > Providers > Google을 활성화합니다.
Google OAuth Client ID / Secret을 연결합니다.

Authentication > URL Configuration에서 다음을 설정합니다.

- Site URL: 실제 Vercel 배포 주소
- Redirect URLs: 실제 Vercel 배포 주소 및 필요 시 로컬 개발 주소

예: `https://trip-on.vercel.app`

### D. 환경변수 추가

`.env.example`을 참고해 로컬에서는 `.env.local`을 만들고, Vercel에서는 Project Settings > Environment Variables에 아래를 추가합니다.

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

환경변수를 추가한 뒤 Vercel에서 Redeploy 하면 Supabase 모드로 전환됩니다.

## 기존 v0.1 여행

v0.2를 환경변수 없이 배포하면 v0.1 localStorage 여행을 자동으로 읽습니다.
Supabase 연결 후 로그인하면 `MY > 데이터 > 로컬 여행 가져오기`에서 기존 여행을 DB로 옮길 수 있습니다.

## 현재 실제로 저장되는 항목

- 여행 이름
- 복수 여행지
- 날짜 / 날짜 미정
- 동행인
- 여행 커버 색상
- 한줄 설명

일정·준비·기록·지출 UI는 아직 구조 확인용이며 다음 단계부터 실제 CRUD를 붙입니다.
