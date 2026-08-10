# World Models

Location, WorldMap, 지역 위험 정책과 던전 퍼즐·인스턴스 던전 정의를 소유한다. 정적 장소 registry와 지도에 노출되지 않는 일회성 runtime Location registry를 분리하며, 연결·방 정리 판정은 월드 기능의 공개 경계다. 인스턴스 방은 살아 있는 참가자를 모아 몬스터마다 순환 교전 대상으로 배정하므로 솔로는 무리 전체의 압박을 받고 다인 참가자는 최초 전선을 나눌 수 있다. 외부에서 장소 내부 object 배열을 직접 수정하지 않는다.

`Location`은 바닥 아이템 생성 시각을 소유하고 5분이 지난 묶음을 tick과 조회·줍기 직전에 제거한다. 같은 상태의 새 수량이 기존 묶음에 합쳐지면 묶음 전체의 생성 시각을 갱신한다. `TravelHub.ts`는 퀘스트·Gold 기반 영구 해금, 목적지 사용료, 거주점 지정과 Player 부활 위치 fallback을 Progress 공개 API로 조립한다.

배치와 콘텐츠 원본은 `data/world`에 둔다.
