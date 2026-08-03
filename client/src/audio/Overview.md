# Adaptive audio

`AdaptiveMusicEngine.ts`는 Tone.js 15.1.22의 합성기만 사용해 현재 장소의 32마디 `A8–A′8–B8–A″8` 악보를 반복 재생한다. 외부 음원 파일은 사용하지 않는다. 장소 전환은 Transport의 다음 4분음표 tick에서 두 voice bank를 1.9초 equal-power crossfade하고 BPM도 함께 ramp한다. 동일 `locationId/mapColor` snapshot은 악보를 다시 만들지 않고 탐험·전투·보스 layer gain만 바꾼다.

기본 음량 50의 사용자 gain은 약 `0.472(-6.53dB)`이며 최대 gain은 `0.88(-1.11dB)`로 제한한다. 저장값 35도 새 곡선에서 약 `0.342(-9.32dB)`로 이전보다 크게 들린다. 탐험 레이어는 평시 `0.64`, 전투 중 `0.44`, 보스전 중 `0.38`을 사용하고 전투·보스 추가 레이어는 각각 최대 `0.31/0.30`이다. 일반 탐험 mix는 180Hz high-pass, 저/중/고역 `-4.5/+1.5/0dB`, pad/lead `-15/-8dB`이고 밝은 탐험 mix는 260Hz, `-5/+1/-1dB`, `-15/-9dB`다. 전투 kick/noise는 `-8/-18dB`, 보스 kick/noise는 `-5/-15dB`로 분리해 박자를 선명하게 유지한다. pad는 악보의 tick onset·길이와 timbre별 envelope, 최대 6성으로 화음 사이의 겹침과 note drop을 막는다. 두 voice bank는 공용 synchronous `Freeverb` send를 거치며 최종 `-4dB` limiter를 유지한다.

탐험 lead와 보스 counter는 `G4~C7(MIDI 67~96)`로 두고, pad는 한 옥타브 높은 `C5~C7(MIDI 72~96)`, 전투 bass 안전 범위도 한 옥타브 높인 `C2~G4(MIDI 36~67)`로 둔다. 공용 MIDI 정수는 `Tone.Frequency(midi, 'midi')`로 명시 변환한 Hz만 synth에 전달하며 kick의 38/42Hz는 그대로 사용한다. 35개 권역은 각각 고정된 두 마디 `motifA·responseA·motifB·cadence`를 가지며 locationId seed는 핵심 훅을 바꾸지 않고 B 악구 배열과 화음 voicing·BPM·타악 위상만 편곡한다. 화음은 한 마디에 한 번 바뀌고 강박 lead를 구성음으로 받아들이며, 전투 bass는 같은 화음 event의 root와 길이를 사용한다. 7개 rhythm profile과 8개 timbre profile이 타악 배치와 서로 다른 Omni oscillator·envelope를 제공한다.

Transport는 PPQ 192를 사용한다. Part event·duration·loop·start는 전부 `${ticks}i` 정수 tick이고, arrangement가 실제 `4/4` 또는 `3/4` meter에 맞춘 32마디 `loopTicks`를 제공한다. 새 bank의 모든 Part는 같은 다음 4분음표 tick에서 offset `0i`로 시작해 항상 A 첫 마디에 정렬된다. 전역 Transport의 마디 문자열이나 `@4n` 양자화에 의존하지 않는다.

엔진 하나는 Home route 하나에만 귀속된다. 자신이 만든 Part, Transport 예약 ID, synth/effect/gain node와 timeout만 추적해 로그아웃·route unmount 때 모두 정리한다. 숨김·비활성·연결 끊김 탭은 별도 audibility gain으로 fade out한 뒤 Transport를 일시 정지하고, 사용자 저장 음량은 변경하지 않는다.

35개 권역 악보, 32마디 form·meter·tick schedule, 같은 권역의 고정 훅과 623개 장소마다 다른 결정론적 편곡, 탐험 schedule/timbre, 전투 상태 및 음량 정규화는 WebAudio와 분리된 `shared/adaptiveMusic.ts`가 소유한다. 엔진은 HUD의 가공된 `mapColor/musicCombatState`만 소비하며 raw 월드 데이터나 대상 객체를 직접 읽지 않는다.
