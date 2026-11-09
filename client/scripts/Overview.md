# Client Publication

`publish.mjs`는 검증된 `.build`를 운영 `dist`에 반영한다. 진입 HTML의 assets 존재를 먼저 검사하고 파일별 임시 복사/rename으로 완성된 파일만 교체한다. 이전 해시 assets를 지우지 않고 index.html을 마지막에 atomic rename하므로 기존 서버가 캐시한 HTML과 이미 열린 브라우저의 lazy chunk를 보존한다. `publish.test.mjs`는 누락 파일 반영 거절과 이전 파일 보존을 검증한다.
