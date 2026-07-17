# Models Overview

서버가 권위를 갖는 게임 상태와 규칙을 표현한다.

- `Combat`, `TagEffect`, `Entity`, `Player`, `Monster`: 공격자/피격자 속도 비율 회피·치명타·공격/피격 문맥 태그·단방향 배율·방어/관통 계산, 회피 불가/고정 피해 `AttackOptions`, 속성 라벨·아이콘 registry와 공격/방어 관계 표시 snapshot, 치유 modifier를 통과하는 생명력 재생과 독립적인 정신력 재생, 최대 자원 감소 시 현재값을 보정하는 `clampVitals`, 공격 쿨다운, Lv.50까지 난도가 증가하는 경험치 곡선, 전투 생명주기와 AI. 직접 공격·회피 결과 메시지와 notification은 공격자와 피격 플레이어에게만 전송한다. Monster의 선택형 공격 프로필은 피해 타입과 적중 상태이상을 정의하고 `skills/skillPattern`은 Entity 공용 SkillData를 순환 발동한다. 설명·현재 능력치·행동·보상을 복제하는 `getInspectionSnapshot`을 제공한다. `attackOwner`로 실제 피해원과 드롭·골드 귀속 주체를 분리하고 몬스터 경험치는 PartyManager 목적형 API를 통해 같은 장소 파티원에게 공유한다.
- `StatusEffectType`/`StatusEffect`: 아이콘 key를 가진 클래스형 효과 정의와 Entity별 비영속 duration/level/metadata delta. 동일 타입은 기존 인스턴스를 유지해 레벨·시간만 병합하며 화염·화상·맹독·마비독과 Player 생존 자원 0에서 자동 적용되는 공복·갈증, start/early/update/remove callback, 설명 template과 UI용 표시 snapshot을 제공한다.
- `ActionType`: 스킬·채팅·명령·공격·이동·장소 이동 분류와 Entity의 source key 기반 지속/한 tick 제한 API. 한 source 해제가 다른 기절·속박 제한을 제거하지 않는다.
- `Resource`: 공격 AI가 없는 Entity 자원. `defeatLabel=파괴됨`, 공격 가능 여부, 주무기 태그 제한, key 기반 상호작용, 성공 시 고정/범위 쿨타임, 관리자용 `resetInteractionCooldown`, 단일 가중치 드롭, 범위 경험치와 리스폰을 제공한다.
- `Projectile`: `Entity`를 상속하는 비영속 투사체, 마스터 데이터/JSON 오버라이드 검증, owner·target·비행 시간·적중 수명주기와 정적 레지스트리 API. 발사 순간 owner의 치명타 확률·피해를 스냅샷으로 동기화하고 명시적 `attributeOverrides`를 마지막에 적용한다. 상성은 owner 장비가 아닌 투사체 본체 태그만 사용하며 전체 Entity lifecycle로 상태효과도 갱신한다.
- `AttributeType`/`Attribute`, `StatType`/`Stat`: 대표색 아이콘과 `{{icon.attributeKey}}`용 markup, 생명력/정신력 재생·배고픔/수분 감소·행운·입질 속도·채집 영역 성능을 포함한 클래스형 enum 메타데이터, 기본 능력치와 Entity 기반 source modifier 계산.
- `Item`, `Inventory`, `EquipSlotType`/`Equipment`: `baseMetadata`+인스턴스 delta와 내구도의 조회·설정·증가·차감·dirty callback, 내구도 0 소유 아이템 파괴와 장비 modifier 제거, 기본 공격 오버라이드 key와 피해 성공 후 `onBasicAttackHit`, 이미지 API, 마스터/인스턴스 태그, 손실 없는 snapshot 이동, 무게·스택·슬롯·영속성. 감정·관리자 UI는 `Item.getInspectionSnapshot`, `Inventory.getIndexedItems`, 신규 item ID도 안전한 index metadata API로 내부 저장 배열 없이 읽고 변경한다. `findFirstItem/countMatching/subscribeChanges`가 raw 배열 없는 자동 장착·현재 보유 조건 갱신을 제공하고 `selectItems/replaceSelectedItems`는 겹치는 predicate 재료를 중복 없이 선택해 선검증 교환한다. 스택형 장비는 묶음 전체를 슬롯으로 옮기고 `Equipment.count`와 부분 소비 API로 남은 수량을 저장한다. 신규 장비 슬롯은 복합키 upsert로 저장한다.
- `Location`: 장소 태그, 선택적 지도 랜드마크·검증된 `#RRGGBB` 대표색, Monster/Resource 통합 오브젝트 API, ID 기반 `getNpcs/getNpc/hasNpc`, raw 배열을 숨긴 태그 포함 드롭 조회·동일 상태 maxStack 병합·단일/전체 회수, 공개 가능한 잠금 사유가 포함된 연결 조건, hidden을 제외하고 `visible | locked`만 반환하는 `getAvailableConnections`, 1부터 시작하는 연결 순번·구분 기호를 무시한 이름·ID·유일한 부분 이름을 찾는 `findAvailableConnection`, 월드 레지스트리.
- `NPC`/`NpcDialogue`: 정적 NPC 정의와 generator 기반 조건부 시나리오, 대사·이벤트·플래그·전이·선택·종료 액션, player별 비영속 대화 세션. 이동·사망·logout/연결 이탈은 공통 종료 API로 정리한다.
- `Quest`/`QuestBook`: 코드 QuestData 레지스트리, 단계형 이벤트·현재 상태 목표, 제출 조건과 보상, NPC marker/수락/보고, 상태·반복·metadata delta·영속 태그를 가진 플레이어별 versioned dirty 인스턴스. Inventory/Progress 변경과 GameEvent를 공개 API로 받아 진행을 갱신한다.
- `Shop`: 상점 태그, 구매/판매 정의와 재고 timer.
- `GameEvent`: 동기식 내부 이벤트 발행/구독과 원시 Entity를 제거한 최근 500개 trace 스냅샷.
- `ProgressType`/`PlayerProgress`: 통계 counter, NPC/퀘스트 flag, 짧은 state의 목적형 조회·변경·구독과 versioned dirty 저장. `defineProgress/defineStatistic`이 정적 정의와 이벤트 counter를 등록한다.
- `WorldMap`: `PlayerProgress`의 `world:visited/{locationId}` flag를 숨기는 방문 기록·관리자용 전체 방문 처리 API와 방문지·한 단계 인접 미방문지만 반환하는 지도 snapshot. 방문 장소의 대표색만 클라이언트 바이옴 레이어에 전달하고, `location:hidden`은 일반 지도에서 제외하며 관리자용 전체 snapshot은 hidden과 고립 장소를 포함한다.
- `Job`/`CareerProfile`: 1차·엘리트 직업 정적 레지스트리, 메인→서브 순서 조합, Progress STATE 영속, 동일 직업 이중 선택 금지, 계보 호환·능력치 source modifier·스킬 지급과 Lv.200 자동 전직.
- `Metadata`: Item과 Skill이 공유하는 JSON-safe clone 및 버전형 top-level delta codec.
- `Skill`/`SkillBook`: 아이콘을 가진 코드 SkillData 레지스트리, Entity 공용 owner/player context, 직업·무기 조건과 공개 채팅으로 전달하지 않는 메시지 시전어, 본인 전용 시전 메시지 및 성공 후 상세 메시지·notification을 함께 보내는 `activationFeedback`, base metadata+인스턴스 delta, 계산/색상/능력치 아이콘 템플릿과 lifecycle. 플레이어 스킬은 성공 발동 시 경험치를 얻어 잔여값을 이월하며 레벨업하고, 획득량·요구량 계산은 SkillData에서 재정의한다. `setLevel/revoke`는 내부 Map 노출 없이 보유 스킬 레벨 변경·영속 회수를 제공하며 `getHudSnapshots`은 표시 가능한 스킬의 이름·아이콘·레벨·활성 상태·남은/최대 쿨다운만 반환한다.
- `Crafting`: predicate와 필요 수량을 가진 재료 클래스, `namespace:path` 제작법 레지스트리, 실제 선택된 재료를 받는 결과 factory, Progress flag 발견·관리자용 전체 발견 처리와 coroutine 제작 수명주기.
- `Fishing`: 클래스형 일반~신화 6등급, 물고기 registry, 추첨과 `/낚시등급표`가 공유하는 행운별 가중치·확률 snapshot, 등급별 보상/경험치 추첨, 45~65초 기본 범위를 입질 속도로 나누는 대기 계산 API.

공개 메서드나 모델 관계, 계산식, 저장 경계가 바뀌면 이 문서와 [`docs/api/server-internal.md`](../../../docs/api/server-internal.md), 관련 시스템 문서를 갱신한다.
