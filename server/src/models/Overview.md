# Models Overview

`Player.getAttackDeniedReason()`은 지역 PVP·같은 파티·동일 장소 제한을 모든 직접/투사체 공격에 공통 적용한다. `RegionRiskPolicy` 클래스형 enum은 안전·중립·적대 장소의 PVP 허용, 사망 경험치/골드 손실, 부활 시간 배율을 소유한다.

서버가 권위를 갖는 게임 상태와 규칙을 표현한다.

- `Combat`, `CombatPipeline`, `Threat`, `TagEffect`, `Entity`, `Player`, `Monster`: 공격자/피격자 속도 비율 회피·치명타·공격/피격 문맥 태그·단방향 배율·방어/관통 계산과 준비/회피/피해 전후/완료 key hook, 회피 불가/고정 피해 `AttackOptions`, 치유 modifier와 source 기반 지원 위협, 최대 자원 보정·공격 쿨다운·경험치 곡선을 담당한다. Monster는 마스터 속도 성향에 레벨 성장 배율을 적용하고 `ai`의 클래스형 성향·지능·행동 가중치·도발 저항·전환 임계값으로 자기 ThreatTable에서 대상을 선택한다. 슬라임은 마지막 공격자를, 지능형 보스는 피해·치유·보호막·제어·도발 위협을 비교한다. `challengePattern`은 registry handler가 대상 플레이어에게 서버 검증 미니게임을 실행하는 동안 일반 행동을 멈추고 이탈·사망·리스폰 시 취소한다. `DamageResult`의 생명력/보호막 피해와 지원량을 기여도로 누적해 최고 플레이어 기여자를 드롭·골드·파티 경험치 기준으로 삼고 사망/리스폰 시 초기화한다.
- `ShieldType`/`Shield`: 흰색 일반·주황색 물리·보라색 마법 타입 클래스형 enum과 key별 비영속 보호막. 모든 Entity가 공개 등록/조회/제거/합계/UI snapshot API를 제공하고, 피해 타입이 맞는 보호막을 남은 시간이 짧은 순으로 흡수하며 만료·제압 시 제거한다.
- `StatusEffectType`/`StatusEffect`/`StatusEffectInteraction`: 아이콘 key를 가진 클래스형 효과 정의와 Entity별 비영속 duration/level/metadata delta. 상태효과 레벨은 공통 최대값 없이 1 이상의 정수를 유지하고 효과별 계산 함수가 필요한 강도 포화를 소유한다. 동일 타입은 기존 인스턴스를 유지해 레벨·시간만 병합하고, 단방향 차단/제거 또는 `레벨 × 남은 시간` 중화 표를 먼저 적용한다. 재생은 최대 생명력·레벨 비례 직접 치유를 제공하며 화염·화상·맹독·마비독과 Player 생존 자원 0에서 자동 적용되는 공복·갈증, start/early/update/remove callback, 설명 template과 UI용 표시 snapshot을 제공한다.
- `ActionType`: 스킬·아이템·채팅·명령·공격·필드 이동·회피·장소 이동 분류와 Entity의 source key 기반 지속/한 tick 제한 API. 필드 이동과 자동 회피를 독립 제한하며 한 source 해제가 다른 기절·속박 제한을 제거하지 않는다.
- `Resource`: 공격 AI가 없는 Entity 자원. `defeatLabel=파괴됨`, 공격 가능 여부, 주무기 태그 제한, key 기반 상호작용, 성공 시 고정/범위 쿨타임, 관리자용 `resetInteractionCooldown`, 단일 가중치 드롭, 범위 경험치와 리스폰을 제공한다.
- `Projectile`: `Entity`를 상속하는 비영속 투사체, 마스터 데이터/JSON 오버라이드 검증, owner·target·비행 시간·적중 수명주기와 정적 레지스트리 API. 발사 순간 owner의 치명타 확률·피해와 `projectileAcceleration`을 스냅샷하고 데이터 반영 계수·발사원 배율로 실제 비행 시간을 계산한다. 상성은 owner 장비가 아닌 투사체 본체 태그만 사용하며 전체 Entity lifecycle로 상태효과도 갱신한다.
- `AttributeType`/`Attribute`, `StatType`/`Stat`: 대표색 아이콘과 `{{icon.attributeKey}}`용 markup, 생명력/정신력 재생·배고픔/수분 감소·투사체 가속·행운·입질 속도·채집 영역 성능·감각 기반 제련 정밀도를 포함한 클래스형 enum 메타데이터, 기본 능력치와 Entity 기반 source modifier 계산.
- `Item`, `Inventory`, `EquipSlotType`/`Equipment`: `baseMetadata`+인스턴스 delta와 내구도의 조회·설정·증가·차감·dirty callback, 내구도 0 소유 아이템 파괴와 장비 modifier 제거, 기본 공격 오버라이드 key와 피해 성공 후 `onBasicAttackHit`, 이미지 API, 마스터/인스턴스 태그, 손실 없는 snapshot 이동, 무게·스택·슬롯·영속성. 조합형 제작 장비는 검증된 `customName/customDescription/maxDurability/instanceModifiers` 유효값을 사용하며 장착 중 delta 변경도 source modifier를 재적용한다. 클래스형 `ItemBalanceRole`과 선택적 profile은 실제 modifier/onUse 데이터를 재사용하는 장비·버프 분석 범위를 선언한다. 감정·관리자 UI는 `Item.getInspectionSnapshot`, `Inventory.getIndexedItems`, 신규 item ID도 안전한 index metadata API로 내부 저장 배열 없이 읽고 변경한다. `findFirstItem/countMatching/subscribeChanges`가 raw 배열 없는 자동 장착·현재 보유 조건 갱신을 제공하고 `selectItems/replaceSelectedItems`는 겹치는 predicate 재료를 중복 없이 선택해 선검증 교환한다. 스택형 장비는 묶음 전체를 슬롯으로 옮기고 `Equipment.count`와 부분 소비 API로 남은 수량을 저장한다. 신규 장비 슬롯은 복합키 upsert로 저장한다.
- `Location`: 장소 태그, 선택적 지도 랜드마크·검증된 `#RRGGBB` 대표색, Monster/Resource 통합 오브젝트 API, ID 기반 `getNpcs/getNpc/hasNpc`, raw 배열을 숨긴 태그 포함 드롭 조회·동일 상태 maxStack 병합·단일/전체 회수, 공개 가능한 잠금 사유가 포함된 연결 조건, hidden을 제외하고 `visible | locked`만 반환하는 `getAvailableConnections`, 1부터 시작하는 연결 순번·구분 기호를 무시한 이름·ID·유일한 부분 이름을 찾는 `findAvailableConnection`, 월드 레지스트리.
- `DungeonPuzzle`: userId별 만료 질문 세션, 정규화된 복수 정답·선택지, 영속 Progress 해답 flag, 현재 장소별 목적지를 검증하는 순간이동 유물 registry. 파괴문·보스 수정 조건은 `Location.isResourceDefeated()` 목적형 API로 raw 오브젝트 없이 판정한다.
- `NPC`/`NpcDialogue`: 정적 NPC 정의와 generator 기반 조건부 시나리오, 대사·이벤트·플래그·전이·선택·종료 액션, player별 비영속 대화 세션. 이동·사망·logout/연결 이탈은 공통 종료 API로 정리한다.
- `Quest`/`QuestBook`: 코드 QuestData 레지스트리, 단계형 이벤트·현재 상태 목표, 제출 조건과 보상, NPC marker/수락/보고, 상태·반복·metadata delta·영속 태그를 가진 플레이어별 versioned dirty 인스턴스. Inventory/Progress 변경과 GameEvent를 공개 API로 받아 진행을 갱신한다.
- `Shop`: 상점 태그, 구매/판매 정의와 재고 timer.
- `GameEvent`: 동기식 내부 이벤트 발행/구독과 원시 Entity를 제거한 최근 500개 trace 스냅샷. `combat:attack_hit`은 최종 피해·피해 타입·장착 무기 분류를 primitive data로 제공한다.
- `GameAction`: 모든 조건을 먼저 검증하고 메모리 변경을 순차 적용하며 예외 시 등록된 rollback을 역순 실행하는 작은 동기식 트랜잭션 빌더.
- `ProgressType`/`PlayerProgress`: 통계 counter, NPC/퀘스트 flag, 짧은 state의 목적형 조회·변경·구독과 versioned dirty 저장. `defineProgress/defineStatistic`이 정적 정의와 이벤트 counter를 등록하며 숨김 무기별 적중 counter가 숙련 자동 획득을 구동한다.
- `RankingCategory`/`RankingVisibility`: 레벨·골드와 모든 StatType/AttributeType을 자동 등록하는 순위 클래스형 enum, 계산 지표 snapshot과 기본 공개 여부에 대한 카테고리별 예외 dirty 상태. Player는 raw 내부 상태 대신 온라인 `getRankingMetricSnapshot`과 DB row를 가공한 `getPersistedRankingSnapshots` DTO를 제공하고 마지막 계산 지표·공개 설정을 함께 저장한다.
- `WorldMap`: `PlayerProgress`의 `world:visited/{locationId}` flag를 숨기는 방문 기록·관리자용 전체 방문 처리 API와 방문지·한 단계 인접 미방문지만 반환하는 지도 snapshot. 방문 장소의 대표색만 클라이언트 바이옴 레이어에 전달하고, `location:hidden`은 일반 지도에서 제외하며 관리자용 전체 snapshot은 hidden과 고립 장소를 포함한다.
- `Job`/`CareerProfile`: 대장장이를 포함한 1차·엘리트 직업 정적 레지스트리, 메인→서브 순서 조합, Progress STATE 영속, 동일 직업 이중 선택 금지, 현재 조건의 가용 슬롯 조회·배정과 구형 독립 직업의 비파괴 빈 슬롯 이전, 계보 호환·능력치 source modifier·스킬 지급과 Lv.200 자동 전직. `Forging`은 형태별 RPG 명칭 후보와 정확도·trait별 접두어 어휘군을 조합해 단조 장비의 영속 이름과 능력치 delta를 만든다.
- `Metadata`: Item과 Skill이 공유하는 JSON-safe clone 및 버전형 top-level delta codec.
- `Skill`/`SkillBook`: 아이콘을 가진 코드 SkillData 레지스트리, Entity 공용 owner/player context, 직업·무기 조건과 공개 채팅으로 전달하지 않는 메시지 시전어, 솔로 본인 또는 현재 파티에게 시전 메시지와 성공 상세 메시지·notification을 함께 보내는 `activationFeedback`, base metadata+인스턴스 delta, 계산/색상/능력치 아이콘 템플릿과 lifecycle. `skill:passive`는 `onPassiveUpdate/onPassiveInactive`로 조건 유효 시 source modifier를 유지하고 조건 상실·회수 시 정리하며 사용형 HUD에서는 제외한다. `autoAcquire.alwaysEvaluate`는 Progress key가 없는 스탯 같은 조건만 주기 검사한다. 플레이어 액티브 스킬은 성공 발동 시 경험치를 얻어 잔여값을 이월하며 레벨업하고, 획득량·요구량 계산은 SkillData에서 재정의한다. `setLevel/revoke/reduceCooldowns`는 내부 Map 노출 없이 보유 스킬 레벨 변경·영속 회수·전체 쿨다운 감소를 제공한다.
- `Balance`: 레벨별 실제 스탯·직업 배분·추천 장비·패시브와 가장 가까운 실제 일반/보스 마스터를 동레벨로 정규화한 대상을 만든다. 개별 스킬/아이템 지표 외에 한 전투의 행동 시간·정신력·쿨다운을 공유하며 평타와 모든 성장 스킬을 순환하고 실제 지속 버프 modifier·직접 피해 속성·회피를 반영한 60초 로테이션 DPS, 예상 처치 시간, 스킬별 사용량, 90% 회피 요구 민첩을 계산한다. 제어·지속 피해 같은 상황 의존 효과는 임의 점수로 합산하지 않는다.
- `Crafting`: predicate와 필요 수량을 가진 재료 클래스, `namespace:path` 제작법 레지스트리, 실제 선택된 재료를 받는 결과 factory, Progress flag 발견·관리자용 전체 발견 처리와 coroutine 제작 수명주기.
- `Fishing`: 클래스형 일반~신화 6등급, 물고기 registry, 추첨과 `/낚시등급표`가 공유하는 행운별 가중치·확률 snapshot, 등급별 보상/경험치 추첨, 45~65초 기본 범위를 입질 속도로 나누는 대기 계산 API.
- `Forging`: 클래스형 장비 형태·제련 재료, 리듬 정확도 효율과 서버 난수 trait를 조합해 이름·설명·내구도·인스턴스 modifier·재료 속성 태그가 담긴 장비 snapshot을 생성한다.
- 스킬 시전 아트: `SkillData.activationHeader`는 기본적으로 시전 메시지가 있는 스킬 ID를 사용하며, `SkillBook`은 해당 256×64 이미지를 시전어와 같은 구조화 플레이어 메시지로 솔로 본인 또는 파티에 전송한다.

공개 메서드나 모델 관계, 계산식, 저장 경계가 바뀌면 이 문서와 [`docs/api/server-internal.md`](../../../docs/api/server-internal.md), 관련 시스템 문서를 갱신한다.
