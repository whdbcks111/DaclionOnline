# Client Utils Overview

브라우저 측 순수 지원 함수를 둔다. `validators.ts`가 회원가입·비밀번호 재설정 입력에 즉시 피드백을 주는 ID/PW/email/nickname validator를 제공하며, 닉네임은 서버와 동일하게 12자 이하의 한글 완성형·초성 `ㄱ-ㅎ`·영문·숫자·언더스코어를 허용한다. `focus.ts`는 모바일 가상 키보드를 뒤로가기로 닫은 뒤 남은 input/contenteditable 포커스를 명시적으로 해제한다. `commandAutocomplete.ts`는 슬래시 명령과 슬래시 없는 정확한 별칭의 명령 해석·후보 필터를 제공한다. `displayPreferences.ts`는 60~200% UI 확대율 정규화·저장·CSS 적용과 배율의 역수로 확장한 논리 viewport 크기를 소유한다. 배율·화면 크기 변경 시 CSS viewport 변수와 `UI_SCALE_CHANGE_EVENT`를 갱신해 body portal, 전체 화면 레이어와 HUD가 동일한 좌표계를 사용하게 한다. 보안 검증과 명령 실행의 최종 권위는 서버다.

`focus.ts`의 `preserveActiveEditableFocus()`는 현재 input/textarea/contenteditable에 실제 focus가 있고 pointer 대상이 버튼인 경우에만 기본 focus 이동을 막는다. 편집기를 직접 focus하지 않으므로 사용자가 뒤로가기로 화상 키보드를 닫은 후 버튼을 누르더라도 키보드를 재개방하지 않는다. `displayPreferences.ts`는 CSS 변수와 HUD가 공유하는 stable logical viewport의 단일 소유자다. 실화면 크기는 `visualViewport.width/height × visualViewport.scale`로 계산해 Safari가 회전 중 직전 가로 layout viewport와 축소 page scale을 유지해도 CSS `zoom` 역보정이 누적되지 않게 한다. 회전은 double-rAF과 400ms trailing 재측정으로 안정화하고, 실제 편집 focus·같은 방향·거의 같은 폭에서 높이만 줄어든 변경만 키보드로 무시한다. 안정 snapshot이 바뀌면 `UI_VIEWPORT_CHANGE_EVENT`를 보내며, `displayPreferences.test.ts`가 세로→가로→세로 회전 시 page scale 누적 방지를 검증한다.

검증 규칙이 바뀌면 서버와 클라이언트 구현의 의도된 차이를 확인하고 이 문서를 갱신한다.
