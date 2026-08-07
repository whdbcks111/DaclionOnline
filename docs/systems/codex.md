# 전문 도감 시스템

## 범위와 분리 원칙

전문 도감은 일반 몬스터·보스·광물·지역 탐험·음식/요리를 종별로 기록한다. 엔트리 단계는 개별 능력치 보상, 분류 전체 단계는 물리·마법 관통력 보상을 제공한다. 기존 `FishingCollection`과 `/낚시도감`은 데이터·보상·명령을 그대로 유지하며 전문 도감에 합치지 않는다.

별도 DB 모델이나 migration을 만들지 않는다. 엔트리 횟수와 분류 rank는 `PlayerProgress`의 메모리 상태를 변경하고 dirty 표시한 뒤 기존 30초 주기·unload·종료 저장 경계에서 flush한다.

## 마스터 데이터와 초기화

`data/world/codex.ts::initializeCodexData()`는 다른 마스터 데이터를 직접 보관하지 않고 각 소유 모델의 공개 snapshot API를 사용해 도감 registry 전체를 원자적으로 교체한다. 서버 시작 시 몬스터·자원·아이템·제작법과 장소 JSON/승천 권역이 모두 등록된 뒤, Player 로드를 시작하기 전에 호출한다. 관리자 장소 저장으로 Location registry가 바뀐 경우에도 다시 호출한다.

| 분류 | 엔트리 원본 | 현재 수 | 동/은/금 목표 | 백금 조건 |
| --- | --- | ---: | --- |
| 일반 몬스터 | `entity:boss`가 없는 모든 `MonsterData` | 210 | 10 / 50 / 200회 처치 | 금 달성 후 무피격 처치 |
| 보스 | `entity:boss`가 있는 모든 `MonsterData` | 64 | 1 / 5 / 20회 처치 | 금 달성 후 무피격 처치 |
| 광물 | `resource:ore`가 있는 `ResourceData` 광맥 종류 | 18 | 5 / 25 / 100회 파괴 | 금 달성 후 맨손 채굴 성공 |
| 지역 탐험 | 숨김을 포함한 모든 `LocationData` | 632 | 최초 방문 즉시 금 | 없음 |
| 음식·요리 | 결과 ItemData 종류가 `음식` 또는 `생선 요리`인 성공 제작 가능 recipe | 22 | 1 / 5 / 20회 제작 | 금 목표의 10배인 200회 제작 |

요리는 결과 아이템이 같더라도 recipe ID가 다르면 별도 엔트리다. `createCodexEntryId(category, sourceId)`가 recipe의 `namespace:path`를 도감 ID의 안전한 `namespace/path`로 바꿔 데이터 생성과 이벤트 기록이 같은 ID를 사용하게 한다.

## 모델과 영속 상태

`CodexCategory`와 `CodexRank`는 `values/fromKey/fromInput`과 표시 메타데이터를 가진 클래스형 enum이다. `CodexRank`는 동 1점, 은 2점, 금 3점, 백금 4점과 분류 해금 비율 10%·35%·70%·100%를 소유한다. 백금이 없는 탐험 엔트리의 최대점수는 금 3점이다.

`CodexBook`은 registry 원본 Map을 노출하지 않고 다음 공개 경계를 제공한다.

- `record(entryId, amount?)` / `recordPlatinum(entryId)`: 확정 횟수와 특수 조건형 백금 기록, 새 엔트리·분류 단계 계산
- `recordBossTimeAttack(entryId, elapsedSeconds)`: 보스별 더 빠른 밀리초 기록만 교체
- `getEntrySnapshot/getEntrySnapshots`: 현재 횟수·동/은/금/선택적 백금 목표·달성 상태의 불변 DTO
- `getBossTimeAttackSnapshots`: 보스별 최고 기록·달성 구간·관통력 보상 DTO
- `getCategorySnapshot/getCategorySnapshots`: 점수·최대점수·진척 비율·영구 해금 rank의 불변 DTO
- `isRankUnlocked`: 신규 엔트리 추가 뒤 현재 비율이 낮아져도 유지되는 해금 flag 조회
- `defineCodexEntry/reloadCodexRegistry/getCodexEntry/getAllCodexEntries`: ID 유일성과 threshold를 검증하는 registry API

엔트리 counter는 `codex-entry:*`, 특수 백금은 같은 엔트리 아래 rank flag, 분류 해금은 `codex-rank:*`, 보스 최고 기록은 `codex-time:*` STATE에 저장한다. 표시명이 같은 recipe는 허용하되 ID는 유일해야 한다. 탐험 엔트리는 재방문과 로그인 소급이 겹쳐도 counter를 1로 고정한다.

분류 진척은 엔트리별 현재 점수 합을 각 엔트리가 지원하는 최대점수 합으로 나눈다. 10%·35%·70%·100%에서 동·은·금·백금 flag를 자동 해금하며 탐험은 백금 단계를 만들지 않는다. 해금 flag는 이후 마스터 엔트리가 추가돼 분모가 커져도 강등되지 않는다.

## 권위적 기록 흐름

```text
확정 GameEvent
  └─ actor.attackOwner가 Player인지 검사
       └─ 이벤트 subject/data와 등록된 entry를 정확히 대응
            └─ Player.codex.record()
                 ├─ PlayerProgress counter + dirty
                 ├─ 새 rank flag + dirty
                 └─ source별 영구 modifier 즉시 갱신
```

| 이벤트 | 추가 검증 | 기록 |
| --- | --- | --- |
| `combat:entity_defeated` | subject가 실제 `Monster`; 마지막 공격의 최종 `attackOwner`가 Player | 일반 몬스터 또는 보스 1회 |
| `resource:destroyed` | subject가 실제 `Resource`이며 `resource:ore` | 해당 광맥 1회 |
| `world:location_changed` | 최종 owner가 Player이고 도착 Location entry가 존재 | 최초 방문 1회 |
| `crafting:item_crafted` | 등록된 음식/생선 요리 recipe entry | 확정 제작 `quantity`회 |

몬스터 교전은 최초 공격부터 처치까지 경과 시간과 해당 플레이어의 실제 피격 여부를 메모리에 기록한다. 금을 이미 달성한 상태에서 무피격으로 처치해야 백금이 되며, 금에 도달한 바로 그 처치는 인정하지 않는다. 보스 처치는 240초·120초·60초 이내 최고 기록에 따라 보스별 물리·마법 관통력 +0.1·+0.2·+0.4 중 최고 한 단계를 적용한다. 교전 이탈로 대상이 초기화되면 도전도 초기화된다.

명령 실행, 일반 Resource의 공용 제압 이벤트, 비광맥 파괴, 비요리 제작, 최종 owner가 플레이어가 아닌 처치는 집계하지 않는다. Resource 파괴는 공용 `entity_defeated`도 발생하지만 몬스터 handler가 실제 `Monster`만 받으므로 광맥이 중복 집계되지 않는다.

로그인 시 `getVisitedLocationIds(player)`가 반환한 기존 `world:visited/*` flag만 탐험 counter 0→1로 정확히 소급한다. 기존 속성별 처치나 총합 통계에서 종별 기록을 추측하지 않는다.

## 영구 보너스

기존 분류 전체 능력치 보상은 엔트리 개별 보상으로 이전했다. 한 엔트리의 단계 보너스를 해당 분류 엔트리 수로 나눠 누적하므로 모든 엔트리가 같은 단계에 도달했을 때 이전 분류 보상과 같은 총량이 된다. 백금은 금보다 25% 높은 개별 보상을 제공한다. 탐험은 백금이 없다.

| 분류 | 전체가 동 | 전체가 은 | 전체가 금 | 전체가 백금 |
| --- | --- | --- | --- | --- |
| 일반 몬스터 | 공격력·마법력 +0.25% | +0.5% | +1% | +1.25% |
| 보스 | 공격력·마법력 +0.25% | +0.5% | +1% | +1.25% |
| 광물 | 방어력·마법 방어력 +0.25% | +0.5% | +1% | +1.25% |
| 지역 탐험 | 이동속도 +0.5% | +1% | +2% | 없음 |
| 음식·요리 | 최대 생명력·최대 정신력 +0.25% | +0.5% | +1% | +1.25% |

분류 전체 단계 보상은 동·은·금·백금에서 물리 관통력과 마법 관통력을 각각 +1·+2·+4·+6 제공한다. `codex:{category}:entries`, `codex:{category}:completion`, `codex:boss-time` source를 각각 제거 후 재계산해 로그인·연속 해금·progress 변경에도 중복되지 않는다. 이전 `codex:{category}` source도 제거해 메모리 내 구형 보너스와 겹치지 않게 한다.

랭크가 새로 해금된 기록에서만 한 번 알림을 보내며, 한 번의 기록으로 여러 rank를 건너뛰면 가장 높은 신규 rank를 대표 notification key로 사용하고 해금된 단계들을 한 메시지에 합친다. 로그인 복원은 알림을 다시 보내지 않는다.

## `/도감` 표시

`/도감`은 다섯 분류의 진척률·점수·영구 해금 rank·개별 누적/전체 관통 보너스를 요약한다. 상세 화면은 엔트리별 동·은·금과 선택적 백금 조건을 표시하며 보스 화면에는 최고 타임어택과 누적 관통력을 함께 표시한다.

횟수가 0인 엔트리는 이름을 `미발견`으로 숨긴다. 긴 목록은 40개 단위 접이식 ChatNode로 나눠 한 메시지의 node 수와 화면 길이를 제한한다. 이 명령은 `information: true`이며 정보 공개/비공개 모드를 따른다.

## 확장 규칙

새 마스터 콘텐츠는 소유 registry에 정상 등록하면 다음 `initializeCodexData()`에서 자동 포함된다. 분류나 rank를 추가할 때는 문자열 배열을 별도로 만들지 말고 `CodexCategory`/`CodexRank` 메타데이터와 modifier·명령·테스트를 함께 갱신한다. 이벤트 연결은 성공이 확정된 기존 `GameEvent`만 사용하고 DB I/O를 handler에 추가하지 않는다.
