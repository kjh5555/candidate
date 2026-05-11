# 내 지역구 의원 보기

국회의원과 광역의회 의원의 프로필, 발의 법안, 표결 이력을 지역별로 조회하는 웹 서비스입니다.

## 주요 기능

- 지역구별 현직 국회의원 및 광역의회 의원 검색
- 의원 프로필 및 상세 정보 조회
- 발의 법안 목록 및 현황 확인
- 표결 이력 조회

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 15 (App Router), TypeScript, Tailwind CSS v4 |
| 백엔드 | Fastify v5, TypeScript, Prisma v6, PostgreSQL |
| 모노레포 | pnpm workspaces, Turborepo |
| 배포 | Vercel (web), Railway (api) |

## 프로젝트 구조

```
candidate/
├── apps/
│   ├── web/        # Next.js 프론트엔드
│   └── api/        # Fastify 백엔드
└── packages/
    └── shared/     # 공유 TypeScript 타입
```

## 로컬 개발

### 사전 요구사항

- Node.js 20+
- pnpm 9+
- PostgreSQL 데이터베이스

### 설치 및 실행

```bash
# 의존성 설치
pnpm install

# 환경 변수 설정
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
# 각 파일을 열어 필요한 값을 입력하세요

# DB 마이그레이션
pnpm --filter @repo/api exec prisma migrate dev

# 개발 서버 실행
pnpm dev
```

- 웹: http://localhost:3000
- API: http://localhost:3001

### 빌드

```bash
pnpm build
```

## 배포

### Railway (백엔드)

1. [Railway](https://railway.app)에서 새 프로젝트 생성
2. **PostgreSQL plugin 추가** — `DATABASE_URL`이 자동으로 주입됩니다
3. GitHub 저장소 연결 (새 서비스 생성)
4. Service Settings에서 **Root Directory**를 `apps/api`로 설정
5. **Config Path**를 `/apps/api/railway.toml`로 설정
6. **Watch Paths**에 `apps/api/**`, `packages/shared/**` 추가
7. 환경변수 설정 (아래 [환경변수](#환경변수) 표 참고)
8. 첫 배포 완료 후 초기 데이터 수집 1회 실행:
   ```bash
   pnpm --filter @repo/api ingest:all
   ```

> ⚠️ **필수**: `CORS_ORIGIN` 환경변수를 반드시 Vercel 배포 URL로 설정하세요 (예: `https://my-app.vercel.app`). 기본값인 localhost로 두면 프론트엔드에서 API 요청이 모두 차단됩니다.

### Vercel (프론트엔드)

1. [Vercel](https://vercel.com)에서 GitHub 저장소 import
2. **Root Directory**를 `apps/web`으로 설정
3. 환경변수 `NEXT_PUBLIC_API_URL`에 Railway API URL 입력
   - 예: `https://your-api.up.railway.app`
4. Deploy

> ⚠️ **필수**: `NEXT_PUBLIC_API_URL` 환경변수를 반드시 Railway API URL로 설정하세요 (예: `https://my-api.up.railway.app`). 이 값이 없으면 웹앱이 API에 연결되지 않습니다.

### Cron (데이터 갱신)

Railway에서 **두 번째 서비스**를 생성하여 매일 자동 갱신:

1. Railway 대시보드 → "+ New" → "Empty Service"
2. 같은 GitHub 저장소 연결, Root Directory = `apps/api`
3. Deploy Command: `pnpm --filter @repo/api ingest:all`
4. Settings → **Cron Schedule**: `0 17 * * *` (매일 02:00 KST)
5. 동일한 환경변수 추가

수동 실행:
```bash
pnpm --filter @repo/api ingest:all
```

## 환경변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 (Railway 자동 주입) | 필수 |
| `ASSEMBLY_API_KEY` | 열린국회정보 OpenAPI 키 | 필수 |
| `KAKAO_REST_API_KEY` | Kakao Local REST API 키 | 필수 |
| `CLIK_API_KEY` | 국회도서관 지방의정포털 키 | 필수 |
| `PROVINCIAL_CSV_PATH` | 광역의회 의원 CSV 경로 (로컬 시딩용) | 선택 |
| `PORT` | API 서버 포트 (기본값: 3001) | 선택 |
| `NODE_ENV` | 실행 환경 (`development` / `production`) | 선택 |
| `CORS_ORIGIN` | 허용할 프론트엔드 Origin | 선택 |
| `NEXT_PUBLIC_API_URL` | API 서버 URL (웹 앱용) | 필수 |

## API 데이터 소스

| 소스 | 내용 | 링크 |
|------|------|------|
| 열린국회정보 | 국회의원 정보, 법안, 표결 | https://open.assembly.go.kr |
| Kakao Local API | 주소 → 지역구 변환 | https://developers.kakao.com |
| 국회도서관 지방의정포털 (CLIK) | 광역의회 의원 정보 | https://clik.nanet.go.kr |
