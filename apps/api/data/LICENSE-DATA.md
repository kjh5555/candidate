# Data Licenses

이 디렉토리의 데이터는 **코드 라이선스와 별개**로 각 원본 소스의 라이선스를 따릅니다.

## `legislator-assets-202603.tsv` — 26.3 국회의원 정기재산변동 신고

- **원자료**: 공직자윤리위원회 정기재산변동신고 (관보 / 국회공보, 2026년 3월 공개)
- **정제·구조화**: [OpenWatch](https://www.openwatch.kr/)
- **라이선스**: [CC BY-SA 4.0 (Creative Commons 저작자표시-동일조건변경허락 4.0 국제)](https://creativecommons.org/licenses/by-sa/4.0/deed.ko)

### CC BY-SA 4.0 의무사항

본 프로젝트는 OpenWatch의 정제 데이터를 가공·재구조화하여 사용합니다.

- **저작자표시 (BY)**: 데이터를 노출하는 모든 화면에 OpenWatch 출처 및 라이선스 링크를 표기합니다. (의원 상세페이지 재산 상세 섹션 푸터 참조)
- **동일조건변경허락 (SA)**: 본 가공본(`legislator-assets-202603.tsv` 및 `LegislatorAsset` 테이블 export)도 **동일하게 CC BY-SA 4.0**으로 재배포됩니다.

### 적용 범위

- `legislator-assets-202603.tsv` 파일
- Railway PostgreSQL `LegislatorAsset` 테이블에서 export 한 데이터
- `GET /legislators/:id/assets` API 응답

> 코드(`apps/api/src/ingest/legislatorAssetItems.ts` 등)는 본 프로젝트의 코드 라이선스를 따릅니다.

---

다른 데이터 소스 라이선스는 다음과 같습니다:

| 데이터 | 출처 | 라이선스 / 이용조건 |
|---|---|---|
| 의안/표결/의원 | 국회 OpenAPI | 공공데이터포털 약관 |
| 후보자/선거 | 중앙선거관리위원회 OpenAPI | 공공데이터포털 약관 |
| 예산(LOFIN) | 행정안전부 지방재정통합공개시스템 | 공공데이터포털 약관 |
| 자치법규/법령 | 국가법령정보 OPEN API | 공공누리 (KOGL) |
| CLIK 회의록/사진 | 광역의회 회의록정보시스템 | 각 의회 공개정보 약관 |
| 토론회 영상 | YouTube | YouTube 약관 + 임베드 |

---

## 재산 데이터 — 다른 레벨 ingestion 가이드

`LegislatorAsset` 테이블은 `reportYm` + `legislatorName` 키로 동작하므로, **국회의원 외에 광역·기초의원·후보자**의 재산 데이터도 같은 형식의 TSV만 있으면 동일 파이프라인으로 적재됩니다.

### 데이터 입수 경로

| 대상 | 출처 후보 | 비고 |
|---|---|---|
| 국회의원 (NATIONAL) | OpenWatch / 국회공보 PDF | ✅ 2026.3 적재 완료 |
| 광역의원 (PROVINCIAL) | OpenWatch 지방의회 데이터 / 각 시·도 의회 공보 | 공보가 PDF 형태로 시·도별 산재 |
| 기초의원 (BASIC) | OpenWatch 기초의회 / 각 시·군·구 의회 공보 | 일부 의회만 정기공개 PDF 게재 |
| 6·3 지방선거 후보자 | 중앙선관위 후보자 정보 PDF / OpenWatch 후보 추적본 | 후보자 등록 시점의 재산 신고 (정기변동신고와 다름) |

### TSV 포맷 (필수)

헤더: `연월 NO monaCode 구분 소속 직위 이름 재산구분 본인과의관계 재산의종류 명세 종전가액 증가액 증가액실거래가격 감소액 감소액실거래가격 현재가액 변동사유`

- 필드 구분자: 탭 또는 2개 이상 공백 (파서가 둘 다 처리)
- `monaCode`는 국회의원만 가짐. 광역·기초·후보자는 비워두면 됨 (이름 매칭으로 충분).
- 가액 단위: 천원 (UI에서 만원/억원으로 자동 변환)
- 빈 셀은 그대로 빈 칸으로 두면 됨

### 적재 명령

```bash
# 파일 저장: apps/api/data/legislator-assets-{REPORT_YM}.tsv
# 예시 — 광역의원 2026.3 데이터를 적재:
REPORT_YM=202603-prov pnpm --filter @repo/api exec tsx src/ingest/legislatorAssetItems.ts

# 또는 임의 경로 지정:
DATA_FILE=/path/to/file.tsv REPORT_YM=202603-prov pnpm --filter @repo/api exec tsx src/ingest/legislatorAssetItems.ts
```

`REPORT_YM`은 같은 보고기간(같은 키)로 ingest 시 기존 데이터를 모두 지우고 재적재(idempotent). 국회/광역/기초/후보자를 같은 reportYm으로 합쳐도 무방하며, 분리 관리하려면 suffix(`-prov`, `-basic`, `-cand`)를 붙이세요. UI는 query string `?reportYm=` 으로 선택 가능합니다.

### 후보자 매칭

`/candidates/:id/assets`는 `Candidate.name` 으로 `LegislatorAsset.legislatorName`을 매칭합니다. 동명이인 충돌 위험이 있는 데이터(특히 기초의원·후보자)는 향후 `monaCode` 외에 `electionId` / `district` 같은 추가 키 매칭을 도입할 수 있습니다.

