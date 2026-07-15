# Models Overview

서버가 권위를 갖는 게임 상태와 규칙을 표현한다.

- `Combat`, `TagEffect`, `Entity`, `Player`, `Monster`: 공격자/피격자 속도 비율 회피·치명타·공격/피격 문맥 태그·단방향 배율·방어/관통 계산, 회피 불가/고정 피해 `AttackOptions`, 치유 modifier를 통과하는 생명력 재생과 독립적인 정신력 재생, 최대 자원 감소 시 현재값을 보정하는 `clampVitals`, 공격 쿨다운, Lv.50까지 난도가 증가하는 경험치 곡선, 전투 생명주기와 AI. Monster의 선택형 공격 프로필은 피해 타입과 적중 상태이상을 정의하고 `skills/skillPattern`은 Entity 공용 SkillData를 순환 발동한다. `attackOwner`로 실제 피해원과 보상·어그로 귀속 주체를 분리하고 `isDefeated/defeatLabel`, `getAttackDeniedReason/isInteractable/interact`로 대상별 상태와 동작을 확장한다.
- `StatusEffectType`/`StatusEffect`: 아이콘 key를 가진 클래스형 효과 정의와 Entity별 비영속 duration/level/metadata delta. 동일 타입은 기존 인스턴스를 유지해 레벨·시간만 병합하며 화염·화상·맹독·마비독, start/early/update/remove callback, 설명 template과 UI용 표시 snapshot을 제공한다.
- `ActionType`: 스킬·채팅·명령·공격·이동·장소 이동 분류와 Entity의 source key 기반 지속/한 tick 제한 API. 한 source 해제가 다른 기절·속박 제한을 제거하지 않는다.
- `Resource`: 공격 AI가 없는 Entity 자원. `defeatLabel=파괴됨`, 공격 가능 여부, 주무기 태그 제한, key 기반 상호작용, 성공 시 고정/범위 쿨타임, 단일 가중치 드롭, 범위 경험치와 리스폰을 제공한다.
- `Projectile`: `Entity`를 상속하는 비영속 투사체, 마스터 데이터/JSON 오버라이드 검증, owner·target·비행 시간·적중 수명주기와 정적 레지스트리 API. 상성은 owner 장비가 아닌 투사체 본체 태그만 사용하며 전체 Entity lifecycle로 상태효과도 갱신한다.
- `AttributeType`/`Attribute`, `StatType`/`Stat`: 생명력/정신력 초당 재생을 포함한 클래스형 enum 메타데이터, 기본 능력치와 Entity 기반 source modifier 계산.
- `Item`, `Inventory`, `EquipSlotType`/`Equipment`: `baseMetadata`+인스턴스 delta와 내구도의 조회·설정·증가·차감·dirty callback, 기본 공격 오버라이드 key, 이미지 API, 마스터/인스턴스 태그, 손실 없는 snapshot 이동, 무게·스택·슬롯·영속성. `selectItems/replaceSelectedItems`는 겹치는 predicate 재료를 중복 없이 선택하고 선검증 교환한다.
- `Location`: 장소 태그, Monster/Resource 통합 오브젝트 API, ID 기반 `getNpcs/getNpc/hasNpc`, raw 배열을 숨긴 태그 포함 드롭 조회·단일/전체 회수, 공개 가능한 잠금 사유가 포함된 연결 조건, 구분 기호를 무시하고 ID·유일한 부분 이름도 찾는 `findAvailableConnection`, 월드 레지스트리.
- `NPC`/`NpcDialogue`: 정적 NPC 정의와 generator 기반 조건부 시나리오, 대사·이벤트·플래그·전이·선택·종료 액션, player별 비영속 대화 세션. 이동·사망·logout/연결 이탈은 공통 종료 API로 정리한다.
- `Shop`: 상점 태그, 구매/판매 정의와 재고 timer.
- `GameEvent`: 동기식 내부 이벤트 발행/구독과 원시 Entity를 제거한 최근 500개 trace 스냅샷.
- `ProgressType`/`PlayerProgress`: 통계 counter, NPC/퀘스트 flag, 짧은 state의 목적형 조회·변경·구독과 versioned dirty 저장. `defineProgress/defineStatistic`이 정적 정의와 이벤트 counter를 등록한다.
- `Metadata`: Item과 Skill이 공유하는 JSON-safe clone 및 버전형 top-level delta codec.
- `Skill`/`SkillBook`: 아이콘을 가진 코드 SkillData 레지스트리, Entity 공용 owner/player context, base metadata+인스턴스 delta, 계산/색상 템플릿, 획득·발동·지속·패시브 callback. 플레이어는 dirty 영속/자동 획득을, Monster는 `createRuntime/activateById` 비영속 실행을 사용한다. 플레이어 발동은 조건 통과 후 `activationMessage`를 먼저 전송하고 `onStart` 효과를 실행한다.
- `Crafting`: predicate와 필요 수량을 가진 재료 클래스, `namespace:path` 제작법 레지스트리, 실제 선택된 재료를 받는 결과 factory, Progress flag 발견과 coroutine 제작 수명주기.

공개 메서드나 모델 관계, 계산식, 저장 경계가 바뀌면 이 문서와 [`docs/api/server-internal.md`](../../../docs/api/server-internal.md), 관련 시스템 문서를 갱신한다.
