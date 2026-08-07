# World Models

Location, WorldMap, 지역 위험 정책과 던전 퍼즐·인스턴스 던전 정의를 소유한다. 정적 장소 registry와 지도에 노출되지 않는 일회성 runtime Location registry를 분리하며, 연결·방 정리 판정은 월드 기능의 공개 경계다. 외부에서 장소 내부 object 배열을 직접 수정하지 않는다.

배치와 콘텐츠 원본은 `data/world`에 둔다.
