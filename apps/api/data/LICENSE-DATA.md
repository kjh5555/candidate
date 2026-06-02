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
