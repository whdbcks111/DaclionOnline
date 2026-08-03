# Adaptive audio

`AdaptiveMusicEngine.ts`는 Tone.js 15.1.22의 합성기만 사용해 현재 장소 악보를 반복 재생한다. 외부 음원 파일은 사용하지 않는다. 장소 전환은 Transport의 다음 마디 경계에서 두 voice bank를 3.5초 equal-power crossfade하고 BPM도 함께 ramp한다. 동일 `locationId/mapColor` snapshot은 악보를 다시 만들지 않고 탐험·전투·보스 layer gain만 바꾼다.

기본 음량 35의 사용자 gain은 약 `-12.05dB`이며 최대 gain도 `0.88(-1.11dB)`로 제한한다. 탐험 레이어는 `0.58`, 전투 중 `0.36`, 보스전 중 `0.30`을 사용한다. 일반 탐험 mix는 180Hz high-pass, 저/중/고역 `-4.5/+1.5/+1dB`, pad/lead `-17/-11dB`이고 밝은 탐험 mix는 260Hz, `-7/+2/+3dB`, `-16/-9dB`다. pad는 `4n`, release `0.22~0.25초`, 최대 6성으로 화음 사이의 겹침과 note drop을 막는다. 전투·보스 레이어는 합산 headroom을 위해 각각 최대 `0.29/0.27`로 낮춰 두며 최종 `-4dB` limiter는 유지한다.

탐험 lead는 `G4~C7`, pad는 `C4~C6` 범위에 두고 bass는 전투 레이어에만 연결한다. 루미나르·물빛 연못·바람결 초원·은빛그물 숲·여명의 성소는 밝은 profile을 사용하며 lead 최저음을 pad보다 최소 한 옥타브 위에 둔다. locationId seed는 4-step 구절 회전·쉼·강세·박자 변주만 만들고 원래 조성과 화음 순서는 바꾸지 않는다.

엔진 하나는 Home route 하나에만 귀속된다. 자신이 만든 Part, Transport 예약 ID, synth/effect/gain node와 timeout만 추적해 로그아웃·route unmount 때 모두 정리한다. 숨김·비활성·연결 끊김 탭은 별도 audibility gain으로 fade out한 뒤 Transport를 일시 정지하고, 사용자 저장 음량은 변경하지 않는다.

35개 권역 악보, 장소별 결정론적 변주, 전투 상태 및 음량 정규화는 WebAudio와 분리된 `shared/adaptiveMusic.ts`가 소유한다. 엔진은 HUD의 가공된 `mapColor/musicCombatState`만 소비하며 raw 월드 데이터나 대상 객체를 직접 읽지 않는다.
