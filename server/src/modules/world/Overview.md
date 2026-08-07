# World Modules

장소 runtime 초기화·이동, 자동 길찾기, 튜토리얼과 전문 도감 이벤트 추적을 소유한다. 배치 원본은 `data/world`, 장소와 지도 규칙은 `models/world`에 두고 이 폴더는 Socket 연결과 애플리케이션 흐름을 조립한다.

Location 내부 상태를 외부로 노출하지 않고 공개 이동·조회 API를 사용한다.

`instanceDungeon.ts`는 10초 게이트, 참가자·절대 제한시간, 마녀의 주시/저주 동기화, 방 잠금, 귀환 균열과 동적 Location 폐기를 소유한다. DB에 원정 상태를 저장하지 않는다.

`ascension.ts`는 Lv.1000 `originboundary_sovereign` 제압 이벤트를 구독해 양수 기여 참가자의 PlayerProgress에 잔재 NPC 노출 자격을 기록한다. 대화·환생 데이터는 직접 소유하지 않는다.
