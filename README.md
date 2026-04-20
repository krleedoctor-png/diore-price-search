# 디오레 CS 가격 검색

디오레의원 CS 상담 시 고객 가격 질문에 빠르게 답변하기 위한 사내 검색 도구.

## 접속

- **사내 공유 URL**: https://krleedoctor-png.github.io/diore-price-search/

## 기능

- 이벤트가 + 정상가 통합 검색
- 시술명·용량 기반 다중 키워드 매칭 (예: "리쥬란 2cc")
- 항목별 / 그룹별 / 선택항목 / 전체 복사 (CS 답변 포맷)
- 검색어 하이라이트

## 데이터 출처

[dioreclinic.com](https://dioreclinic.com/) 의 [이벤트]·[시술안내/가격] 페이지를 크롤링한 데이터 (`prices.json`).

## 가격 업데이트

현재는 수동 갱신. 업데이트 필요 시 크롤러 재실행 후 `prices.json` + `index.html` 커밋/푸시.
