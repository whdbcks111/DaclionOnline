# Profession Models

연금술·제작·낚시·단조의 registry, 계산 규칙, 세션 상태와 불변 snapshot을 소유한다. 재료 변경은 Inventory 공개 API에 위임하고 master data는 `data/professions`에서 등록한다.

각 profession 테스트는 구현 파일과 같은 폴더에 둔다.
