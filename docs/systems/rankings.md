# 플레이어 순위와 공개 설정

## 구성

- `models/Ranking.ts`: `RankingCategory` 클래스형 enum, 계산 지표 snapshot, `RankingVisibility` dirty 상태를 소유한다.
- `modules/ranking.ts`: 10초간 캐시한 DB의 마지막 저장 snapshot에 온라인 Player의 현재 메모리 snapshot을 덮어쓰고 값 내림차순 공동 순위를 계산한다.
- `commands/ranking.ts`: 순위 조회와 전체·카테고리별 공개 설정 UI를 제공한다.

## 카테고리

`RankingCategory.values()`는 레벨·골드, 모든 `StatType`, 모든 `AttributeType`을 반환한다. 입력은 표시명과 key를 지원하고 공격력에는 `물리공격력`, 마법력에는 `마법공격력` 별칭도 제공한다. 새 스탯이나 능력치가 클래스형 enum에 추가되면 별도 순위 배열을 수정하지 않아도 카테고리가 자동 등록된다.

## 조회 흐름

1. `/순위 [카테고리]`는 생략 시 레벨을 사용하며 `rank`, `ranking`, `rk` 별칭을 지원한다.
2. DB의 `ranking_metrics`는 플레이어가 마지막으로 저장될 때 계산된 능력치 snapshot이다. 기존 레코드처럼 snapshot이 없으면 Player scalar와 stats JSON으로 장비를 제외한 fallback을 계산한다.
3. 현재 접속한 플레이어는 DB snapshot 대신 `Player.getRankingMetricSnapshot()`의 최신 메모리 값을 쓰며, DB 캐시 생성 뒤 가입한 온라인 플레이어도 즉시 목록에 합친다.
4. 값 내림차순으로 정렬하고 같은 값은 공동 순위를 부여한다. 기본 화면은 상위 20명이며 본인이 밖에 있으면 자신의 행을 추가한다.
5. 1~5위는 서로 다른 강조색, 1위는 왕관 표시를 사용한다. 순위·닉네임·수치는 고정 `tab` 너비로 정렬한다.

`/순위`와 `/순위공개정보`는 `information: true`라서 채팅 입력창 또는 `/공개모드`, `/비공개모드`의 정보 열람 모드를 따른다.

## 수치 공개 설정

기본값은 전체 공개다. `RankingVisibility`는 `defaultPublic`과 이 값에 반대되는 카테고리별 `overrides`만 저장한다.

- `/순위비공개`, `/순위공개`: 전체 기본값을 바꾸고 기존 예외를 초기화한다.
- `/순위비공개 카테고리`, `/순위공개 카테고리`: 지정 카테고리만 예외로 바꾼다.
- `/순위공개정보`: 전체 기본값과 현재 카테고리별 예외를 표시한다.

비공개 플레이어도 닉네임과 실제 순위는 목록에 남고 수치 열만 `?`로 표시된다. 공개 설정 변경은 온라인 Player 메모리에서 dirty 표시되고 기존 30초·unload 저장 경로로 flush된다.
