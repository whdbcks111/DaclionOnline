# 채팅·채널·명령어 시스템

## 데이터 흐름

```text
Home/QuickSlot/ButtonNode
        │ sendMessage / chatButtonClick
        v
modules/chat.ts ── 일반문장 ──> Skill message trigger 또는 modules/message.ts ──> Socket room
        │                              │
        │ '/' 또는 첫 단어=별칭         └─ modules/channel.ts history
        v
modules/bot.ts ──> commands/*.ts ──> models/modules ──> bot/notification output
```

`ChatMessage.content`는 사용자 일반 입력에서는 text node 배열이고, 시스템 메시지는 `chat()` 빌더 또는 `parseChatMessage()`로 만든 `ChatNode[]`다. 클라이언트 `ChatMessage.tsx`가 노드 트리를 재귀 렌더링한다.

`Home.tsx`는 메시지 전송 후 입력 내용만 비우고 contenteditable의 포커스와 커서를 유지한다. 전송 버튼의 pointer down도 입력 포커스를 빼앗지 않으므로 모바일 가상 키보드가 매 전송마다 닫히거나 다시 열리며 깜빡이지 않는다.

서버는 일반 메시지에서 `ActionType.CHAT`, 명령 입력과 버튼에서 `ActionType.COMMAND`를 검사한다. 상태효과 등 source key 제한이 남아 있으면 메시지/명령을 실행하지 않고 notification으로 안내한다. 스킬 메시지 트리거는 추가로 `ActionType.SKILL`을 SkillBook에서 검사한다.

정식 명령 이름은 기존처럼 `/상태창` 형태로 실행한다. `registerCommand.aliases`에 등록된 값은 `/s`뿐 아니라 `s`, `s 공개`처럼 슬래시 없이 첫 단어로 입력해도 실행된다. 슬래시 없는 입력은 첫 단어 전체가 별칭과 정확히 일치할 때만 명령이며 `상태창`처럼 정식 이름만 쓰거나 별칭의 일부만 쓴 입력은 일반 채팅으로 남는다. 따라서 새 별칭은 일상 대화의 흔한 첫 단어와 충돌하지 않도록 정한다.

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
| 플레이어 | `/상태창` (`status`, `s`) | 레벨·자원·생명력/정신력 초당 재생을 포함한 능력치·스탯·장비와 맨 아래 상태이상 아이콘/레벨/남은 시간/hover 설명 표시 |
| 플레이어 | `/인벤토리` (`inv`, `i`) | 무게와 이름 앞의 작은 아이콘을 포함한 아이템 목록 표시 |
| 플레이어 | `/사용` (`use`) | 아이템 효과 실행 |
| 플레이어 | `/버리기` (`drop`) | 현재 Location에 아이템 드롭 |
| 플레이어 | `/장착` (`equip`) | 인벤토리 아이템 장착/교체 |
| 플레이어 | `/장착해제` (`unequip`) | 장비를 인벤토리로 이동 |
| 플레이어 | `/대상지정` (`target`, `t`) | 공격 없이 위치 오브젝트를 현재 스킬/공격 대상으로 지정 |
| 플레이어 | `/공격` (`attack`, `a`) | 위치 내 Monster/Resource 타게팅/공격; 자동완성은 생존 대상 뒤에 원래 번호의 사망·파괴 대상을 배치 |
| 플레이어 | `/스탯분배` (`stat`) | 가용 포인트 분배 |
| 진행 | `/통계` (`statistics`, `stats`) | 공개 통계 counter 표시 |
| 스킬 | `/스킬목록` (`skilllist`, `sl`) | 표시 가능한 보유 스킬의 아이콘·레벨·발동/쿨다운 상태와 정보/사용 버튼 표시 |
| 스킬 | `/스킬` (`skill`, `su`) | 보유 스킬을 이름으로 발동; 입력 메시지는 숨김 |
| 스킬 | `/스킬정보` (`skillinfo`, `si`) | 스킬 아이콘과 계산된 설명·소모값·재사용 대기시간·발동 조건 표시 |
| 제작 | `/제작법목록` (`recipes`) | 발견한 제작법의 재료·시간·제작 가능 여부와 버튼 표시 |
| 제작 | `/제작 <제작법이름> [개수]` (`craft`) | 제작법 이름과 선택 개수를 두 인자로 표시. 마지막 숫자는 1~99의 개수, 생략 시 1 |
| 위치 | `/이동` (`move`, `go`) | 연결된 위치로 coroutine 이동; 잠긴 길을 실제 시도하면 공개 가능한 잠금 조건 표시 |
| 위치 | `/줍기` (`pickup`) | 번호로 바닥 스택을 줍거나 `전체`로 모두 줍기 |
| 위치 | `/상호작용` (`interact`) | 번호로 상호작용 가능한 월드 오브젝트 기능 실행 |
| 위치 | `/위치` (`where`, `loc`) | 통합 오브젝트·플레이어·드롭·연결 표시; 사망·파괴 오브젝트는 progress 대신 붉은 상태 표시 |
| NPC | `/대화 번호` (`talk`) | 현재 장소의 NPC 대화 진입점 실행 |
| NPC | `/대화종료` (`endtalk`) | 진행 중인 NPC 대화를 직접 종료 |
| NPC 내부 | `/대화선택 <세션> <번호>` | 현재 세션의 선택지 버튼 처리; 오래된 세션 ID 거부 |
| 퀘스트 | `/퀘스트목록` (`questlist`, `ql`) | 수락·완료한 퀘스트와 진행도 표시 |
| 퀘스트 | `/퀘스트정보 이름` (`questinfo`, `qi`) | 현재 단계 목표·보상·상태와 포기 버튼 표시 |
| 퀘스트 | `/퀘스트포기 이름` (`questabandon`, `qa`) | 포기 가능한 진행 중 퀘스트 포기 |
| 상점 | `/상점` (`shop`) | 현재 상점 재고와 매입 목록 |
| 상점 | `/구매` (`buy`) | 골드/무게/재고 검사 후 구매 |
| 상점 | `/판매` (`sell`) | 항목별 판매 |
| 상점 | `/전체판매` (`sellall`) | 판매 가능한 아이템 일괄 판매 |
| 관리자 | `/레벨설정` | 대상 레벨/경험치 설정, 권한 10 |
| 관리자 | `/상태변경` | life/mentality/thirsty/hungry 설정, 권한 10 |
| 관리자 | `/상태이상부여 대상 코드 레벨 시간` (`effectgive`) | 온라인 Player에게 초 단위 런타임 상태이상 적용, 권한 10 |
| 관리자 | `/아이템추가` | 대상 인벤토리에 아이템 추가, 권한 10 |
| 관리자 | `/스탯설정` | 대상 스탯 값 설정, 권한 10 |
| 관리자 | `/스탯포인트설정` | 가용 포인트 설정, 권한 10 |
| 관리자 | `/골드설정` | 골드 설정, 권한 10 |
| 관리자 | `/순간이동` (`tp`, `teleport`) | 지정 위치로 이동, 권한 10 |

## 자동완성

1. `requestCommandList`가 명령 이름, 별칭, 설명, 인자 메타데이터를 보낸다.
2. `/`로 시작한 입력은 명령 이름과 별칭 prefix를 필터링한다. 슬래시 없는 입력은 첫 단어가 정확한 별칭일 때 해당 명령과 인자 자동완성을 연다.
3. 정적 `completions`는 클라이언트가 즉시 필터링한다.
4. 함수형 completion은 `dynamicCompletions: true`로 표시된다.
5. `Home.tsx`가 입력 중 `requestCompletions(raw)`을 보내고 서버가 현재 사용자 상태를 이용해 `argCompletions`를 응답한다. 서버도 같은 `parseCommandInput` 규칙으로 슬래시 없는 별칭을 해석한다.

명령 목록 자체는 자동완성을 위해 전체가 전송되지만 실제 실행 권한은 서버에서 다시 검사한다.

명령으로 처리되지 않은 일반 문장은 전송 전에 `SkillBook.activateFromMessage()`를 통과한다. 보유하고 표시 가능한 스킬의 `activateOnMessage`가 일치하면 일반 원문은 전송하지 않고 명령과 같은 발동 검사·쿨다운 경로를 사용한다. 강타는 `강타!`에 반응하며 성공한 경우 `activationMessage`를 플레이어 메시지로 새로 전송한다.

## ChatNode 확장 지점

현재 노드는 text, color, bg, deco, weight, size, tooltip, hide, icon, button, progress, tab이다. 문자열 태그는 color/icon/button/closebutton/bg/deco/size/weight/tooltip/hide/tab/progress를 지원한다. icon의 name은 `/icons/{name}.png`로 해석되며 없는 에셋은 숨긴다. progress length는 기존 숫자 px와 `em` 같은 CSS 문자열을 모두 지원해 아이템 내구도처럼 짧고 반응형인 표시를 만들 수 있다. tooltip은 hover와 touch에서 설명 ChatNode overlay를 표시하며 상태창의 능력치·스탯·내구도 설명에 사용된다. `$primary`, `$life`, `$magic` 같은 테마 토큰은 빌더와 `[color=$magic]...[/color]` 문자열 태그에서 클라이언트 `resolveColor()`로 해석한다. 스킬 설명·소모·발동 조건 템플릿도 최종적으로 `parseChatMessage()`를 사용하므로 `[color=orange]{{damage}}[/color]` 같은 계산값 색상 표현을 재사용한다.

새 노드는 공유 union, 서버 parser/builder, 클라이언트 node renderer 세 곳을 함께 변경한다.
