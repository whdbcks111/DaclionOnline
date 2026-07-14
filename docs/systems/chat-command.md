# 채팅·채널·명령어 시스템

## 데이터 흐름

```text
Home/QuickSlot/ButtonNode
        │ sendMessage / chatButtonClick
        v
modules/chat.ts ── 일반문장 ──> modules/message.ts ──> Socket room
        │                              │
        │ '/'                          └─ modules/channel.ts history
        v
modules/bot.ts ──> commands/*.ts ──> models/modules ──> bot/notification output
```

`ChatMessage.content`는 사용자 일반 입력에서는 text node 배열이고, 시스템 메시지는 `chat()` 빌더 또는 `parseChatMessage()`로 만든 `ChatNode[]`다. 클라이언트 `ChatMessage.tsx`가 노드 트리를 재귀 렌더링한다.

## 채널과 히스토리

- 기본 채널: 메인(`null`), 공지, 잡담, 거래, 파티.
- 개인 채널: `private_{userId}`. 서버는 본인 ID만 참가를 허용한다.
- 공개 히스토리: 채널별 최대 100개.
- 필터 히스토리: 채널별 최대 200개이며 사용자 filter 함수와 함께 메모리에 저장된다.
- 모든 히스토리는 프로세스 재시작 시 사라진다.
- 메시지에는 서버 생성 ID가 붙으며 `editMessage`/`deleteMessage`로 히스토리와 클라이언트 목록을 바꿀 수 있다.

## 등록된 명령어

`권한 10` 표시는 관리자 전용이다. 실제 인자 및 자동완성 정의는 각 명령 파일의 `registerCommand()`가 기준이다.

| 분류 | 명령(별칭) | 역할 |
| --- | --- | --- |
| 일반 | `/도움말` (`help`) | 권한별 명령 목록 |
| 일반 | `/랜덤` (`random`) | 두 정수 사이 난수 |
| 일반 | `/실행` (`eval`) | JS eval, 권한 10 |
| 일반 | `/공지` | 전체 채널 공지, 권한 10 |
| 플레이어 | `/상태창` (`status`, `s`) | 레벨·자원·능력치·스탯과 이름 앞 아이콘을 포함한 장비 표시 |
| 플레이어 | `/인벤토리` (`inv`, `i`) | 무게와 이름 앞의 작은 아이콘을 포함한 아이템 목록 표시 |
| 플레이어 | `/사용` (`use`) | 아이템 효과 실행 |
| 플레이어 | `/버리기` (`drop`) | 현재 Location에 아이템 드롭 |
| 플레이어 | `/장착` (`equip`) | 인벤토리 아이템 장착/교체 |
| 플레이어 | `/장착해제` (`unequip`) | 장비를 인벤토리로 이동 |
| 플레이어 | `/공격` (`attack`, `a`) | 위치 내 몬스터 타게팅/공격 |
| 플레이어 | `/스탯분배` (`stat`) | 가용 포인트 분배 |
| 위치 | `/이동` (`move`, `go`) | 연결된 위치로 coroutine 이동 |
| 위치 | `/줍기` (`pickup`) | 번호로 바닥 스택을 줍거나 `전체`로 모두 줍기 |
| 위치 | `/위치` (`where`, `location`) | 몬스터·플레이어·드롭·연결 표시 |
| 상점 | `/상점` (`shop`) | 현재 상점 재고와 매입 목록 |
| 상점 | `/구매` (`buy`) | 골드/무게/재고 검사 후 구매 |
| 상점 | `/판매` (`sell`) | 항목별 판매 |
| 상점 | `/전체판매` (`sellall`) | 판매 가능한 아이템 일괄 판매 |
| 관리자 | `/레벨설정` | 대상 레벨/경험치 설정, 권한 10 |
| 관리자 | `/상태변경` | life/mentality/thirsty/hungry 설정, 권한 10 |
| 관리자 | `/아이템추가` | 대상 인벤토리에 아이템 추가, 권한 10 |
| 관리자 | `/스탯설정` | 대상 스탯 값 설정, 권한 10 |
| 관리자 | `/스탯포인트설정` | 가용 포인트 설정, 권한 10 |
| 관리자 | `/골드설정` | 골드 설정, 권한 10 |
| 관리자 | `/순간이동` (`tp`, `teleport`) | 지정 위치로 이동, 권한 10 |

## 자동완성

1. `requestCommandList`가 명령 이름, 별칭, 설명, 인자 메타데이터를 보낸다.
2. 정적 `completions`는 클라이언트가 즉시 필터링한다.
3. 함수형 completion은 `dynamicCompletions: true`로 표시된다.
4. `Home.tsx`가 입력 중 `requestCompletions(raw)`을 보내고 서버가 현재 사용자 상태를 이용해 `argCompletions`를 응답한다.

명령 목록 자체는 자동완성을 위해 전체가 전송되지만 실제 실행 권한은 서버에서 다시 검사한다.

## ChatNode 확장 지점

현재 노드는 text, color, bg, deco, weight, size, tooltip, hide, icon, button, progress, tab이다. 문자열 태그는 color/icon/button/closebutton/bg/deco/size/weight/tooltip/hide/tab/progress를 지원한다. icon의 name은 `/icons/{name}.png`로 해석되며 없는 에셋은 숨긴다. progress length는 기존 숫자 px와 `em` 같은 CSS 문자열을 모두 지원해 아이템 내구도처럼 짧고 반응형인 표시를 만들 수 있다. tooltip은 hover와 touch에서 설명 ChatNode overlay를 표시하며 상태창의 능력치·스탯·내구도 설명에 사용된다. `$primary`, `$life` 같은 테마 토큰은 빌더가 직접 만든 노드에서 클라이언트 `resolveColor()`로 해석한다.

새 노드는 공유 union, 서버 parser/builder, 클라이언트 node renderer 세 곳을 함께 변경한다.
