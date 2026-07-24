# 반복 사냥 감지와 사람 확인

단순 클라이언트 매크로가 사냥터를 장시간 순환하며 공격을 반복하는 행동을 서버 이벤트만으로 감지한다. 클라이언트가 보내는 이동·클릭 횟수를 신뢰하지 않고, 서버가 확정한 몬스터 처치의 시각·장소·대상 흐름만 관찰한다. 공식 `/자동이동` 자체는 의심 점수에 넣지 않는다.

## 감지 흐름

`server/src/modules/humanVerification.ts`가 `combat:entity_defeated`를 구독해 플레이어별 최근 사냥 표본을 메모리에 보관한다.

1. 충분히 오래 이어진 처치 기록에서 장소·대상 순환 반복도, 처치 간격의 규칙성, 연속 시간을 계산한다.
2. 한 가지 지표만으로 즉시 차단하지 않고 복합 점수가 기준을 넘은 경우에만 후보로 둔다.
3. 후보가 된 뒤에도 서버 난수로 정한 추가 처치 수를 기다려 검사 시점을 예측하기 어렵게 한다.
4. 장시간 이탈이 있거나 다양한 동선이면 연속 자동 사냥으로 판정하지 않는다.
5. 검사를 통과하면 표본을 비우고 서버 난수 길이의 유예 시간을 둬 정상 플레이어에게 검사가 연속해서 발생하지 않게 한다.

감지 표본과 유예 시간은 재시작 시 버려도 되는 런타임 상태다. 판정 기준은 운영 코드에만 두고 클라이언트 payload에는 포함하지 않는다.

## 검사 세션

검사가 시작되면 `security:human_verification_required` Progress FLAG를 먼저 기록한다. 스킬·아이템·명령·공격·필드 이동·회피·장소 이동을 source key로 제한하고 진행 중인 자동이동과 스킬을 정리한다. 확인 중 서버 피해 배율은 0으로 만들어 화면을 가린 동안 캐릭터가 사망하지 않게 한다. 일반 채팅은 고객 지원과 운영자 문의를 위해 허용한다.

서버는 매번 새 답과 session ID를 만들고, 답 문자를 노이즈가 포함된 PNG로 rasterize한 결과와 만료 시각만 클라이언트에 보낸다. 정답은 서버 메모리에만 있으며 `submitHumanVerification`에서 session ID와 함께 검사한다. 오답 횟수는 숨은 `security:human_verification_failures` counter에 누적된다.

클라이언트의 `components/security/HumanVerificationOverlay`는 공용 `Dialog`의 닫기·Escape·배경 닫기를 모두 비활성화하고 미니게임보다 높은 레이어에 문제를 표시한다. 만료·오답이면 새 문제를 요청할 수 있고, 정답 판정이 성공해야만 화면과 서버 행동 제한이 함께 해제된다.

## 재접속과 운영 도구

- 로그아웃 시 런타임 문제와 제한 source는 정리하지만 required FLAG는 유지한다.
- 재접속한 Player는 FLAG를 읽어 제한과 새 문제를 복원하므로 페이지 종료로 우회할 수 없다.
- 관리자 페이지 `테스트` 카테고리에서 온라인 플레이어에게 검사를 강제로 실행하거나, 오탐 대응을 위해 요구 상태를 해제할 수 있다.
- 운영 해제도 `clearHumanVerification()` 공개 API를 사용하며 Progress 원본이나 DB row를 직접 변경하지 않는다.

## 공개 API

| API | 역할 |
| --- | --- |
| `analyzeHuntingPattern(samples)` | 부작용 없이 반복도·규칙성·연속 시간과 판정 snapshot 계산 |
| `requireHumanVerification(player, reason?)` | required FLAG, 행동 제한, 보호와 문제 발급 시작 |
| `requestHumanVerification(player)` | 필요한 플레이어의 기존 문제 재전송 또는 단일 새 문제 생성 |
| `clearHumanVerification(player, grantGrace?)` | FLAG·문제·제한을 원자적으로 정리 |
| `initializeHumanVerification(player)` / `detachHumanVerification(player)` | Player load/unload 경계 복원과 런타임 정리 |

새 탐지 신호를 추가할 때는 정상적인 고효율 플레이·공식 자동이동·파티 사냥을 단일 조건으로 차단하지 않는다. 보상 확정 GameEvent를 우선 사용하고 순수 분석 테스트와 재접속 우회 테스트를 함께 보강한다.
