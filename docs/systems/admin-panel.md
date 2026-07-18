# 관리자 패널

권한 10 이상의 운영자가 햄버거 메뉴의 `관리자 페이지` 버튼으로 `/admin`을 새 탭에서 연다. 클라이언트에서 버튼을 감추는 것은 편의 기능이며, 모든 조회와 변경은 `server/src/modules/adminPanel.ts`가 세션 권한을 다시 검사한다.

## 화면 구성

- 플레이어 관리: 전체 캐릭터를 조회하되 현재 접속자를 먼저 정렬한다. 닉네임·계정·UID 검색과 상세 상태, 인벤토리/장비, 스탯/스킬/상태이상 검사를 제공한다.
- 플레이어 작업: 순간이동, 레벨·스탯·직업·자원 설정, 아이템 지급·삭제, 보유 스킬 레벨 설정·삭제, 상태이상 관리, 부활, 전체 지도와 제작법 발견 처리, 선택한 온라인 플레이어 알림을 카테고리별로 실행한다. 테스트 카테고리에서는 낚시와 이동속도 동기화 폭탄/레이저 회피, 심장수호자의 10초·레이저 연사·난이도 10 공명 폭주 미니게임 프리셋을 보상 없이 실행한다.
- 월드 관리: 장소별 몬스터 소환/리스폰과 자원 오브젝트 상호작용 쿨타임 초기화를 제공한다.
- 공지 발송: 모든 채널 기록에 남는 시스템 채팅 공지와 현재 접속자 전체에게 표시되는 화면 알림 공지를 분리해 제공한다. 알림 표시 시간은 1~60초, 내용은 최대 1000자로 서버가 다시 검증한다.
- 밸런스 분석: 검색 가능한 스킬·직업·장비/버프 아이템 선택창으로 `Balance` 공개 API를 실행한다. 결과는 스크롤 가능한 읽기 전용 다이얼로그에 실제 피해·자원·DPS·생존 시간과 계산에서 분리한 효과를 표시한다.
- 작업 카테고리 탭은 라벨을 한 줄로 유지하며 패널 너비가 부족하면 가로 스크롤해 `인벤토리`, `스킬·효과` 같은 이름이 잘리지 않는다.
- 위치 편집기: 상단 `위치 편집기` 버튼으로 기존 `/admin/locations` 화면에 접근한다.

PC에서는 목록·상세·작업 패널을 다열로 배치한다. 상세 패널은 viewport 안에 고정된 내부 스크롤을 사용하고, 각 검사 영역도 펼쳤을 때 최대 높이와 독립 스크롤을 가져 긴 인벤토리·스킬 목록이 화면 밖으로 밀리지 않는다. 현재 상태는 자원별 색상의 전용 fill bar를 사용하며 진행 정보와 보유 현황은 한 카드에 묶어 높이를 줄인다. 좁은 화면에서는 플레이어 목록을 가로 스크롤로 축약하고 상세와 작업을 세로 배치하며, 공용 FormDialog는 모바일 하단 시트로 전환한다.

## 서버 흐름

1. `adminPanelRequestBootstrap`으로 아이템·밸런스 분석 대상 아이템·스킬·직업·장소·몬스터·상태이상·스탯·미니게임 프리셋의 표시용 option 목록을 받는다.
2. `adminPanelRequestPlayers`와 `adminPanelRequestPlayer`로 목록 및 선택 캐릭터 snapshot을 받는다. 오프라인 캐릭터도 `fetchPlayerByUserId()`를 통해 공개 Player API로 로드할 수 있다.
3. `adminPanelExecute`는 action union과 입력값을 서버에서 다시 검증하고 도메인 목적형 API를 호출한다. 공지는 `broadcastBotMessageAll/broadcastNotification`, 개별 알림은 온라인 여부를 확인한 뒤 `sendNotificationToUser`를 사용한다.
4. 처리 후 호환용 `adminPanelResult`, 갱신된 플레이어 목록과 대상 상세가 요청 소켓에만 돌아온다. 일반 작업 피드백은 기존 `notification`으로 자동 소멸하며, 긴 밸런스 보고서만 `details`를 공용 Dialog로 연다.

관리자 UI가 Inventory/SkillBook/Progress 내부 컬렉션이나 DB row를 직접 수정하지 않도록 `Inventory.clear`, `SkillBook.revoke`, `CareerProfile.setByAdmin`, `Resource.resetInteractionCooldown`, `markAllLocationsVisited`, `discoverAllCraftingRecipes`를 사용한다. 고빈도 플레이어 상태는 기존 Player dirty save 경계를 그대로 통과한다.

## 공용 다이얼로그

`client/src/components/dialog`의 `Dialog`는 portal, Escape/배경 닫기, 포커스 복원과 body 스크롤 잠금을 제공한다. `FormDialog`는 필드 정의 배열로 text, number, select, textarea, checkbox 입력과 비동기 제출 상태를 만들며 필수 select는 첫 option을 기본값으로 선택한다. 모든 select는 label·내부 코드·설명을 검색할 수 있는 공용 `SearchableSelect`를 사용한다. 이후 관리자 작업이나 화면 오버레이 입력은 별도 모달을 만들기보다 이 API를 우선 재사용한다.
