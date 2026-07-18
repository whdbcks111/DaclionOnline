# 보호막 시스템

보호막은 모든 `Entity`가 공통으로 가지는 비영속 런타임 전투 상태다. 기능 구현부는 `server/src/models/Shield.ts`와 `Entity`의 공개 API이며, 다른 기능은 내부 Map을 읽지 않고 아래 메서드만 사용한다.

## 타입과 중첩

`ShieldType`은 `values/fromKey/fromInput`을 제공하는 클래스형 enum이다.

| 타입 | 표시색 | 흡수 피해 |
| --- | --- | --- |
| `GENERAL` | 흰색 | 물리·마법·절대 피해 |
| `PHYSICAL` | 주황색 | 물리 피해 |
| `MAGIC` | 보라색 | 마법 피해 |

`Entity.setShield(key, amount, type, duration, source?)`은 source key 하나에 보호막 하나를 등록한다. 같은 key를 다시 쓰면 기존 보호막의 양·타입·시간을 새 값으로 교체하고, 다른 key는 제한 없이 중첩한다. 교전 중인 아군에게 보호막을 주는 기능은 source Entity를 넘겨 관련 몬스터의 지원 위협도에 반영한다. 현재 보호막은 DB에 저장하지 않으며 사망·파괴, 지속시간 만료 또는 전량 소모 시 제거된다.

## 피해 처리

방어력·관통·치명타·속성 상성으로 `finalDamage`를 확정한 뒤 그 피해 타입을 흡수할 수 있는 보호막만 사용한다. 해당 보호막은 남은 지속시간이 짧은 순, 시간이 같으면 key 순으로 소모한다. 남은 피해만 생명력에서 차감한다.

`DamageResult`에서 `finalDamage`는 보호막 적용 전 확정 피해, `absorbedDamage`는 보호막 흡수량, `lifeDamage`는 실제 생명력 감소량이다. `remainingShield`는 처리 후 전체 보호막량이다. 고정 피해 옵션은 기존 계산 단계만 건너뛰며 피해 타입에 맞는 보호막 흡수는 그대로 적용된다.

주요 공개 API는 `setShield`, `getShield`, `hasShield`, `removeShield`, `clearShields`, `getTotalShield`, `getShieldDisplaySnapshots`, `getShieldBarSegments`다. 스킬·아이템·상태효과는 고유하고 안정적인 source key를 사용해야 한다. 예를 들어 마법사 `마력 보호막`은 `skill:mana_barrier` key의 `MAGIC` 보호막을 갱신한다.

## 표시 계약

공유 `ShieldBarSegment`는 타입·양·색만 노출한다. `PlayerStatsData`, 위치 오브젝트/플레이어, 파티원 HUD DTO와 `health` ChatNode가 이 배열을 전달하고 클라이언트 `HealthBarNode`가 렌더링한다.

보호막 구간은 현재 생명력 끝에서 시작해 비어 있는 체력 구간을 먼저 채운다. 생명력과 보호막 합계가 최대 생명력을 넘으면 초과분은 체력바 위쪽의 얇은 별도 띠로 다시 왼쪽부터 표시한다. 구간 순서는 실제 피해 흡수 순서와 같고, 색은 서버 `ShieldType` 메타데이터를 그대로 사용한다.
