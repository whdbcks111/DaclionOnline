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

현재 표준 이벤트 ID는 치명타, Entity 제압, Resource 파괴, 스킬 획득·시작·종료, 제작법 발견·아이템 제작이다. 새 이벤트는 `GameEventIds`에 넣고 실제 상태가 확정되는 모델 API에서 `emitGameEvent()`를 호출한다.

## 진행 상태와 통계

`PlayerProgress`는 다른 기능과 NPC 대화 조건에서도 재사용하는 플레이어별 범용 상태 저장소다. 값의 종류는 클래스형 enum `ProgressType`으로 구분한다.

| 종류 | 공개 API | 용도 |
| --- | --- | --- |
| `COUNTER` | `getCounter/setCounter/increment` | 처치·치명타·수집 누적값 |
| `FLAG` | `getFlag/setFlag` | NPC 첫 대화, 퀘스트 완료 같은 영속 bool |
| `STATE` | `getState/setState` | NPC 관계 단계, 분기 상태 같은 짧은 문자열 |

모든 key는 `namespace:path` 형식이고 사용 전에 `defineProgress()` 또는 `defineStatistic()`으로 등록한다. 다른 기능은 내부 Map이나 Prisma row를 참조하지 않고 위 목적형 API와 `getSnapshots()`, `subscribeChanges()`만 사용한다. 기본값인 `0/false/빈 문자열`은 DB row를 만들지 않는다.

`defineStatistic()`은 하나의 게임 이벤트를 구독하고 최종 `attackOwner`가 Player일 때 해당 counter를 증가시킨다. 현재 `combat:critical_hits`가 공개 통계로 등록되어 `/통계`에 표시된다.

제작법 발견은 새 테이블을 추가하지 않고 `crafting:recipe/{namespace}/{path}` 형식의 숨김 FLAG를 사용한다. 정의와 자동 발견 흐름은 [crafting.md](crafting.md)를 참고한다.

## 스킬 정의와 인스턴스

`data/skills.ts`의 `defineSkill()`이 코드 마스터 데이터를 등록하고, Player별 `Skill`은 레벨·쿨다운 종료 시각·획득 정보·영속 태그·metadata delta만 가진다. `SkillBook`이 보유 목록과 수명주기, 자동 획득·자동 발동, dirty 저장을 소유한다.

`SkillData`의 확장 지점은 다음과 같다.

- 표시: `descriptionTemplate`, `costTemplate`, `activationConditionTemplate`, `isVisible`.
- 계산: `baseMetadata`, `calculatedFields`, `calculateMaxCooldown`.
- 획득/발동: `autoAcquire`, `autoActivate`, `activateOnMessage`, `canUse`, `canActivate`.
- 수명주기: `onAcquire`, `onStart`, `onUpdate`, `onFinish`, `onPassiveUpdate`.
- 분류: `tags`, `maxLevel`, `aliases`, `activationMessage`.

직업 귀속처럼 현재 사용할 수 없는 스킬은 DB에서 제거하지 않는다. `isVisible`과 `canUse`로 표시/사용만 비활성화한다. `SkillBook.grant()`는 신규 획득일 때 채팅과 notification에 `스킬 [ 이름 ] 를 획득했습니다!`를 보내며 이미 보유한 스킬은 중복 생성하지 않는다.

### Metadata와 계산 필드

`SkillData.baseMetadata`는 코드 기본값이고 인스턴스는 top-level delta만 `player_skills.metadata`에 저장한다. `getMetadata/setMetadata/resetMetadata`를 사용하며 raw JSON을 직접 수정하지 않는다. delta가 없는 필드는 코드 기본 metadata를 바꾸면 기존 스킬에도 즉시 새 값이 적용된다.

템플릿은 다음 값을 치환한다.

- `{{calc.damage}}` 또는 `{{damage}}`: `calculatedFields.damage({ player, skill })` 결과.
- `{{meta.baseManaCost}}`: metadata 유효값.
- `{{skill.level}}`, `{{skill.maxLevel}}`, `{{skill.name}}`.
- `{{maxCooldown}}`, `{{remainingCooldown}}`: 내장 계산값.

설명·소모·발동 조건은 모두 같은 포맷터를 사용한다. 결과 문자열은 `parseChatMessage()`를 거치므로 `[color=orange]{{damage}}[/color]`처럼 기존 채팅 전용 문법을 사용할 수 있다. 공격력/물리 피해는 주황색, 정신력은 상태창과 같은 `$magic` 보라색, 치명타·쿨다운 강조는 금색을 기본 표현으로 사용한다.

## 발동 경로와 수명주기

- `/스킬목록` 또는 `sl`: 현재 표시 가능한 보유 스킬의 레벨·사용 상태와 정보/사용 버튼을 표시한다.
- `/스킬 스킬이름` 또는 `su 스킬이름`: 명령 입력은 숨기고 `SkillBook.activateByInput()`을 호출한다.
- `/스킬정보 스킬이름` 또는 `si 스킬이름`: 계산된 상세 정보와 현재 발동 상태를 표시한다.
- 일반 채팅: 명령이 아닌 메시지를 각 스킬의 `activateOnMessage`로 검사하고 일치하면 원문 전송 대신 같은 발동 API를 호출한다.
- 자동 조건: 0.25초마다 현재 표시 가능한 스킬의 `autoActivate`를 검사한다.
- 자동 획득: 첫 update와 관련 progress 변경 후 `autoAcquire.watchedProgress`만 다시 검사한다.

발동은 사망·활성 중·쿨다운·`canUse/canActivate`를 먼저 검사한다. 조건을 통과하면 선택적 `activationMessage`를 플레이어 메시지로 전송한 뒤 `onStart`를 실행하므로 공격·회복 같은 즉시 효과보다 발동 메시지가 먼저 표시된다. `onStart`가 성공하면 활성 상태와 쿨다운을 확정한다. 지속시간이 있으면 `onUpdate`, 종료 시 `onFinish`, 로그인 중 사용 가능한 패시브에는 `onPassiveUpdate`가 호출된다. 로그아웃 시 활성 스킬을 `UNLOADED` 사유로 종료한 다음 저장한다.

## 강타

첫 스킬 `power_strike`(강타)는 치명타 누적 5회에 자동 획득한다.

- `/대상지정 번호`로 선택한 같은 위치의 살아 있는 오브젝트를 공격한다.
- `/스킬 강타` 또는 일반 채팅 `강타!`로 발동하고, 조건 통과 시 플레이어가 보낸 `강타!` 메시지를 공격 결과보다 먼저 채널에 남긴다.
- 정신력을 소모하고 현재 공격력·레벨 배율로 물리 공격을 수행한다.
- 해당 공격의 치명타율만 100%로 override한다.
- 공격 전 `armorPen +10`과 `armorPen ×1.05` modifier를 추가하고 공격 확정 직후 `source` 단위로 제거한다.
- 일반 `Entity.attack()`을 사용하므로 방어·상성·자원 도구 제한·공격 쿨다운·주무기 내구도 규칙을 그대로 따른다.

`/스킬정보 강타`는 레벨, 계산된 설명, 소모값, 재사용 대기시간, 포맷된 발동 조건을 각각 구분해 표시한다.

## 영속성

로그인 시 `Player.loadByUserId()`가 `PlayerProgress`와 `SkillBook`을 Inventory/Equipment와 함께 로드한다. 모든 변경은 메모리에 적용하고 versioned dirty key를 남긴다. `Player.save()`가 30초 주기, unload, 종료 시 `player_progress`와 `player_skills`를 upsert/delete한다. 저장 도중 같은 값이 다시 바뀌면 이전 snapshot 완료가 새 dirty version을 지우지 않는다.
