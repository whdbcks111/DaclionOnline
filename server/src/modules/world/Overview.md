# World Modules

장소 runtime 초기화·이동, 자동 길찾기, 튜토리얼과 전문 도감 이벤트 추적을 소유한다. 배치 원본은 `data/world`, 장소와 지도 규칙은 `models/world`에 두고 이 폴더는 Socket 연결과 애플리케이션 흐름을 조립한다.

Location 내부 상태를 외부로 노출하지 않고 공개 이동·조회 API를 사용한다.
