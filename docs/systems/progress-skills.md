# 이벤트·진행 상태·스킬 시스템

## 구성과 데이터 흐름

```text
Entity/Resource/SkillBook
  └─ emitGameEvent(id, actor, subject, data)
       ├─ 최근 500개 GameEventTrace (메모리, 원시 Entity 미포함)
       └─ defineStatistic subscriber
            └─ PlayerProgress counter/flag/state (메모리 + dirty)
                 └─ SkillBook 자동 획득 검사

일반 채팅 / 명령어 / 자동 조건
  └─ SkillBook.activate*
       └─ canUse/canActivate → onStart → onUpdate → onFinish
```

`GameEvent`는 도메인 동작을 직접 DB나 스킬에 결합하지 않는 동기식 내부 이벤트다. handler에서는 DB I/O를 하지 않고 Player가 소유한 메모리 상태만 변경한다. 운영 진단용 trace는 최근 500개만 유지하며 `getRecentGameEvents()`가 ID·사용자 ID·이름·primitive data 스냅샷만 반환한다. 프로세스를 재시작하면 trace는 사라진다.

현재 표준 이벤트 ID는 치명타, 공격 적중, 공격 회피, Entity 제압, Resource 파괴, 스킬 획득·시작·종료, 제작법 발견·아이템 제작, NPC 대화, 상태효과, 퀘스트, 직업 배정·엘리트 전직이다. 새 이벤트는 `GameEventIds`에 넣고 실제 상태가 확정되는 모델 API에서 `emitGameEvent()`를 호출한다. 퀘스트 목표 추적은 [퀘스트 시스템](quests.md)을 참고한다.

## 진행 상태와 통계

`PlayerProgress`는 다른 기능과 NPC 대화 조건에서도 재사용하는 플레이어별 범용 상태 저장소다. 값의 종류는 클래스형 enum `ProgressType`으로 구분한다.

| 종류 | 공개 API | 용도 |
| --- | --- | --- |
| `COUNTER` | `getCounter/setCounter/increment` | 처치·치명타·수집 누적값 |
| `FLAG` | `getFlag/setFlag` | NPC 첫 대화, 퀘스트 완료 같은 영속 bool |
| `STATE` | `getState/setState` | NPC 관계 단계, 분기 상태 같은 짧은 문자열 |

모든 key는 `namespace:path` 형식이고 사용 전에 `defineProgress()` 또는 `defineStatistic()`으로 등록한다. 다른 기능은 내부 Map이나 Prisma row를 참조하지 않고 위 목적형 API와 `getSnapshots()`, `subscribeChanges()`만 사용한다. 기본값인 `0/false/빈 문자열`은 DB row를 만들지 않는다.

`defineStatistic()`은 하나의 게임 이벤트를 구독하고 최종 `attackOwner`가 Player일 때 해당 counter를 증가시킨다. 현재 `combat:critical_hits`가 공개 통계로 등록되어 `/통계`에 표시된다.

성공한 공격은 `combat:attack_hit` 이벤트에 직렬화 가능한 `weaponType`과 최종 피해량을 담는다. 검·도끼·활·단검·지팡이 적중 통계는 숨김 counter로 누적되며 각 200회에 해당 무기 숙련 패시브를 자동 획득한다. 숙련 효과는 올바른 주무기를 장착한 동안에만 적용되고, 투사체 공격은 최종 `attackOwner`의 장착 무기를 기준으로 분류한다.

제작법 발견은 새 테이블을 추가하지 않고 `crafting:recipe/{namespace}/{path}` 형식의 숨김 FLAG를 사용한다. 정의와 자동 발견 흐름은 [crafting.md](crafting.md)를 참고한다.

`profession:blacksmith` 공개 FLAG는 전투 직업과 독립된 대장장이 생산 전문 직업을 나타낸다. 퀘스트 보상 API가 flag와 전용 스킬 세 개를 함께 지급하고, 마력 제련·단조 명령은 이 flag를 공개 API로 확인한다.

NPC 조건부 진입과 대화 결과도 같은 flag/state API를 사용한다. 현재 `npc:monster-hunt-question` 숨김 FLAG가 안내인 대화 분기에 쓰이며 자세한 흐름은 [NPC·대화 시스템](npc-dialogue.md)을 참고한다.

## 스킬 정의와 인스턴스

`data/skills.ts`의 `defineSkill()`이 코드 마스터 데이터를 등록하고, Player별 `Skill`은 레벨·경험치·쿨다운 종료 시각·획득 정보·영속 태그·metadata delta만 가진다. `SkillBook`이 보유 목록과 수명주기, 자동 획득·자동 발동, dirty 저장을 소유한다. `SkillContext.owner`는 실제 시전자 Entity이며 `player`는 플레이어 시전자일 때만 존재하므로 같은 `SkillData`를 Monster도 실행할 수 있다. `SkillBook.createRuntime()`은 몬스터 수명 동안만 유지되는 비영속 스킬북을 만든다.

`SkillData`의 확장 지점은 다음과 같다.

- 표시: `icon`, `descriptionTemplate`, `costTemplate`, `activationConditionTemplate`, `isVisible`.
- 계산: `baseMetadata`, `calculatedFields`, `calculateMaxCooldown`, `calculateExperienceGain`, `calculateRequiredExperience`.
- 밸런스 진단: `balance.role`, 실제 발동식과 공유하는 피해·소모·회복·보호막 callback, 치명타 방식·타격/대상 수.
- 획득/발동: `autoAcquire`, `autoActivate`, `activateOnMessage`, `canUse`, `canActivate`.
- 수명주기: `onAcquire`, `onStart`, `onUpdate`, `onFinish`, `onPassiveUpdate`, `onPassiveInactive`.
- 분류: `tags`, `maxLevel`, `aliases`, `activationMessage`.
- 직업/장비: `jobRequirement`, `weaponRequirement`, 공통 메시지 시전어 `activationPhrase`.

`activationPhrase`가 없으면 `activationMessage`를 일반 채팅의 정확 일치 시전어로도 사용한다. 직업 요구 조건은 [직업·전직 시스템](careers.md)의 `CareerProfile.hasJob`을 사용해 엘리트 하위 계보를 자동 호환한다.

스킬 템플릿은 `{{icon.atk}}`, `{{icon.magicForce}}`, `{{icon.maxMentality}}`처럼 `icon.{AttributeKey}`를 사용하면 해당 `AttributeType.iconMarkup`으로 치환된다. 공격력·마법력 계수, 관통, 방어, 속도, 치명타와 정신력 소모 표기는 이 문법을 사용해 상태창과 같은 대표색 아이콘을 재사용한다.

계산 필드는 `[tooltip=산식]현재값[/tooltip]`을 반환할 수 있다. 스킬 정보 본문은 현재 적용될 결과 숫자만 보여주고 hover에서 능력치 계수·기본값·레벨당 증가량을 설명한다. 실제 발동과 표시 계산은 같은 함수와 상수를 사용해 밸런스 변경 시 서로 어긋나지 않게 한다.

### 밸런스 진단

권한 10 관리자용 `/스킬밸런스 <스킬> [스킬레벨] [캐릭터레벨] [직업]`, `/직업밸런스 [레벨] [메인직업] [서브직업]`, `/아이템밸런스 <아이템> [캐릭터레벨] [직업]`은 `models/Balance.ts`의 같은 공개 분석 API를 사용한다. CLI에서는 `cd server && npm run balance:report -- 50`처럼 레벨을 지정해 같은 직업 기준선을 출력한다. 아이템 분석은 장비 modifier 또는 버프 아이템 metadata가 가리키는 실제 StatusEffect를 적용해 기본 공격 DPS·물리/마법 생존·능력치의 전후 차이를 표시한다.

분석 조건은 동일 레벨, 레벨업으로 실제 지급되는 총 스탯 포인트, 직업별 공개 배분 프리셋, 무장비, 동레벨 균형형 표준 대상, 중립 속성, 60초 전투다. 직업이 지급하는 패시브는 실제 `onPassiveUpdate` callback으로 기준 능력치에 먼저 적용한다. 기본 공격은 실제 고정 차감 방어·관통·치명타 기대값·공격속도·속도차 회피율을 적용한다. 액티브 스킬은 `SkillData.balance` callback으로 실제 발동 계수와 정신력 소모를 공유하며 쿨다운 제한 횟수와 시작 정신력+60초 재생으로 가능한 횟수 중 작은 값을 사용한다.

제어·은신·확정 회피·광역 상황·대상 생명력 비례 지속 피해는 임의 가중치를 부여해 단일 전투력에 섞지 않는다. 직접 피해, 생존 시간, 회복·보호막, 계산에서 분리한 효과를 별도 표시하며 balance callback이 없는 스킬은 추정하지 않고 `미지원`으로 표시한다. 이 명령의 출력 기준선을 먼저 기록한 다음 계수나 직업 modifier를 바꾸고 다시 측정한다.

직업 귀속처럼 현재 사용할 수 없는 스킬은 DB에서 제거하지 않는다. `isVisible`과 `canUse`로 표시/사용만 비활성화한다. `SkillBook.grant()`는 신규 획득일 때 채팅과 notification에 `스킬 [ 이름 ] 를 획득했습니다!`를 보내며 이미 보유한 스킬은 중복 생성하지 않는다.

### Metadata와 계산 필드

`SkillData.baseMetadata`는 코드 기본값이고 인스턴스는 top-level delta만 `player_skills.metadata`에 저장한다. `getMetadata/setMetadata/resetMetadata`를 사용하며 raw JSON을 직접 수정하지 않는다. delta가 없는 필드는 코드 기본 metadata를 바꾸면 기존 스킬에도 즉시 새 값이 적용된다.

템플릿은 다음 값을 치환한다.

- `{{calc.damage}}` 또는 `{{damage}}`: `calculatedFields.damage({ player, skill })` 결과.
- `{{meta.baseManaCost}}`: metadata 유효값.
- `{{skill.level}}`, `{{skill.maxLevel}}`, `{{skill.name}}`.
- `{{skill.experience}}`, `{{skill.requiredExperience}}`: 현재 경험치와 다음 레벨 요구량.
- `{{maxCooldown}}`, `{{remainingCooldown}}`: 내장 계산값.

설명·소모·발동 조건은 모두 같은 포맷터를 사용한다. 결과 문자열은 `parseChatMessage()`를 거치므로 `[color=orange]{{damage}}[/color]`처럼 기존 채팅 전용 문법을 사용할 수 있다. 공격력/물리 피해는 주황색, 정신력은 상태창과 같은 `$magic` 보라색, 치명타·쿨다운 강조는 금색을 기본 표현으로 사용한다.

## 발동 경로와 수명주기

- `/스킬목록` 또는 `sl`: 현재 표시 가능한 보유 스킬의 아이콘·레벨·사용 상태와 정보 버튼을 표시한다. 패시브는 `패시브` 상태로 구분하며 사용 버튼을 만들지 않는다.
- `/스킬 스킬이름` 또는 `su 스킬이름`: 명령 입력은 숨기고 `SkillBook.activateByInput()`을 호출한다.
- `/스킬정보 스킬이름` 또는 `si 스킬이름`: 계산된 상세 정보, 현재 레벨과 경험치 진행도를 표시한다.
- 일반 채팅: 명령이 아닌 메시지를 각 스킬의 `activateOnMessage`로 검사하고 일치하면 원문 전송 대신 같은 발동 API를 호출한다.
- 자동 조건: 0.25초마다 현재 표시 가능한 스킬의 `autoActivate`를 검사한다.
- 자동 획득: 첫 update와 관련 progress 변경 후 `autoAcquire.watchedProgress`만 다시 검사한다. Progress key가 없는 현재 상태 조건은 `alwaysEvaluate`를 명시한 정의만 0.5초 주기로 검사하며, 근력·민첩·체력·감각·정신력 100 달성형 히든 패시브가 이 경로를 사용한다.

발동은 사망·활성 중·쿨다운·`canUse/canActivate`를 먼저 검사한다. 조건을 통과하면 선택적 `activationMessage`를 시전자 본인에게만 보이는 플레이어 메시지로 전송한 뒤 `onStart`를 실행하므로 공격·회복 같은 즉시 효과보다 발동 메시지가 먼저 표시된다. 원래 입력한 일반 채팅 발동어도 공개 채팅으로 전달하지 않는다. `onStart`가 성공하면 활성 상태와 쿨다운을 확정하며, `activationFeedback`이 있으면 계산된 효과를 본인 전용 봇 메시지와 notification으로 함께 보낸다. 이 성공 확정 시점에 영속 플레이어 스킬은 기본 10 경험치를 얻고, 몬스터 런타임 스킬은 경험치를 얻지 않는다. 기본 다음 레벨 요구량은 `100 + (현재 레벨 - 1) × 50`이며 두 값 모두 SkillData 계산 함수로 재정의하거나 획득량을 0으로 끌 수 있다. 요구량을 넘긴 잔여 경험치는 다음 레벨에 이월되고 최대 레벨에서는 더 이상 누적하지 않으며, 레벨업 시 본인 메시지와 notification을 보낸다. 지속시간이 있으면 `onUpdate`, 종료 시 `onFinish`를 호출한다. 로그인 중 표시·사용 조건을 만족하는 패시브에는 `onPassiveUpdate`, 조건을 잃거나 회수될 때는 `onPassiveInactive`를 호출해 runtime modifier를 source 단위로 정리한다. 로그아웃 시 활성 스킬을 `UNLOADED` 사유로 종료한 다음 저장한다.

## 스킬 퀵 HUD

`skill:passive` 태그가 있는 패시브는 스킬 목록과 정보창에는 노출하지만 직접 누를 수 있는 퀵 HUD payload와 사용 자동완성에서는 제외한다.

`SkillBook.getHudSnapshots()`은 `isVisible`을 만족하는 보유 스킬의 ID, 표시명, 아이콘, 레벨, 발동 상태, 남은/최대 쿨다운만 0.5초 `playerStats.skills`에 싣는다. 클라이언트 HUD 설정의 `전투 퀵 버튼`에서 기본 공격과 각 스킬 버튼을 개별 On/Off할 수 있으며 선택과 viewport `%` 좌표는 `hud-skill-buttons` localStorage에 저장된다. 설정 목록은 기본 접힘 상태이고 활성/전체 개수를 요약하며, 펼친 목록은 제한된 높이 안에서 별도로 스크롤한다. 제목 옆 톱니 설정은 전투 퀵 버튼에만 적용되는 50~200% 크기를 별도로 저장한다. 새 전투 버튼은 PC 8열·모바일 4열 기본 격자에 놓이고 위치 편집 모드에서 각각 독립적으로 이동하거나 초기화할 수 있다. 공격 버튼은 `playerStats.attackCooldown/maxAttackCooldown`을 같은 시계 방향 overlay로 표시하고 기존 `/공격` 명령을 숨김 실행해 현재 지정 대상과 서버 공격 규칙을 그대로 재사용한다.

활성화된 버튼은 큰 스킬 아이콘과 아래의 작은 표시명을 가진다. 클릭은 공개 채팅을 만들지 않는 `chatButtonClick`의 `/스킬 이름` 동작을 사용하므로 모든 실제 조건 검사는 기존 `SkillBook.activateByInput()` 경로를 그대로 따른다. 쿨다운 중에는 서버 남은 시간을 payload 수신 시각부터 0.1초 단위로 보간하고, 완전히 어두운 상태에서 투명 영역이 시계 방향으로 늘어나는 overlay와 남은 초를 표시한다.

## 강타

첫 스킬 `power_strike`(강타)는 치명타 누적 5회에 자동 획득한다.

- `/대상지정 번호`로 선택한 같은 위치의 살아 있는 오브젝트를 공격한다.
- `/스킬 강타` 또는 일반 채팅 `강타!`로 발동하고, 조건 통과 시 플레이어가 보낸 `강타!` 메시지를 공격 결과보다 먼저 채널에 남긴다.
- 정신력을 소모하고 현재 공격력·레벨 배율로 물리 공격을 수행한다.
- 해당 공격의 치명타율만 100%로 override한다.
- 공격 전 `armorPen +10`과 `armorPen ×1.05` modifier를 추가하고 공격 확정 직후 `source` 단위로 제거한다.
- 일반 `Entity.attack()`을 사용하므로 방어·상성·자원 도구 제한·공격 쿨다운·주무기 내구도 규칙을 그대로 따른다.

`/스킬정보 강타`는 레벨, 계산된 설명, 소모값, 재사용 대기시간, 포맷된 발동 조건을 각각 구분해 표시한다.

## 지각 붕괴와 몬스터 스킬

`seismic_crush`(지각 붕괴)는 1.8초 시전 예고 후 현재 대상에게 마법 피해를 주고 확률적으로 마비독을 부여한다. 플레이어는 정신력을 소모하지만 Monster 런타임 시전에는 플레이어 자원 비용이 없다. `SkillBook.activateById()`가 몬스터 패턴의 공개 발동 경계이며, `MonsterData.skills`가 보유 ID·레벨을, `skillPattern`이 순환 순서·첫 지연·반복 간격을 정의한다. 시전 중에는 일반 공격을 수행하지 않는다.

피버릭 갱도 수정 왕좌의 보스 `수정맥의 군주`는 지각 붕괴 3레벨을 5초 뒤 처음 사용하고 이후 10~13초마다 반복한다. 낮은 확률로 `지각 붕괴 스킬북`을 드롭하며, 사용 시 `SkillBook.grant()`를 통해 영속 플레이어 스킬로 교환된다. 이미 보유한 경우 아이템을 소비하지 않는다.

스킬 정의에는 `/icons/{SkillData.icon}.png` 에셋이 필수다. 스킬 목록과 정보창은 아이콘을 이름 앞에 표시하며, 스킬 아이콘은 아이템과 달리 속성색을 담은 불투명 카드형 배경을 사용할 수 있다.

현재 스탯 100 달성 시 각각 `거인의 힘`, `바람걸음`, `불굴의 육체`, `심안`, `마력의 샘`을 자동 획득한다. 모두 항상 적용되는 숨김 패시브이며, 전용 아트 제작 전까지 관련 능력치 아이콘을 카테고리 fallback으로 사용한다.

## 영속성

로그인 시 `Player.loadByUserId()`가 `PlayerProgress`와 `SkillBook`을 Inventory/Equipment와 함께 로드한다. 경험치 획득과 레벨업을 포함한 모든 변경은 메모리에 적용하고 versioned dirty key를 남긴다. `Player.save()`가 30초 주기, unload, 종료 시 `player_progress`와 `player_skills`를 upsert/delete한다. 저장 도중 같은 값이 다시 바뀌면 이전 snapshot 완료가 새 dirty version을 지우지 않는다.
