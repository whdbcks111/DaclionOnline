# 적응형 지역 음악

클라이언트는 외부 음원 sample 없이 Tone.js 15.1.22 합성기만 사용해 현재 장소의 반복 배경음악을 만든다. 서버는 음악을 직접 재생하지 않고 현재 장소 `mapColor`와 최근 실제 교전의 `exploration | combat | boss` 상태만 HUD snapshot으로 보낸다.

## 악보와 장소 변주

`shared/adaptiveMusic.ts`의 `LocationMusicTheme` 클래스형 enum이 현재 월드의 기본 대표색 25개와 승천 권역 10개, 총 35개 악보를 소유한다. 각 테마는 권역명, BPM, root MIDI, `MusicScale`, 네 화음, 음역, 음색과 함께 정확히 두 마디 길이인 `motifA`, `responseA`, `motifB`, `cadence` 악구를 직접 보유한다. 각 악구의 음정·쉼·시작점·길이는 고정 데이터이며 장소 seed가 핵심 훅을 임의로 다시 쓰지 않는다. 35개 `motifA`는 곡 전체 높이를 제거한 음정 간격과 onset 간격·길이까지 비교해도 서로 다르다.

`composeLocationScore(locationId, mapColor)`가 WebAudio와 무관한 유일한 작곡 진입점이다. 네 악구를 `A 8마디 → A′ 8마디 → B 8마디 → A″ 8마디`의 32마디 형식으로 배치한다. A″는 A의 음정과 리듬을 75% 이상 회수하고 마지막 종지는 2~4박 동안 울리는 으뜸음으로 반복 끝에 정확히 닿는다. 등록되지 않은 색은 루미나르 악보로 안전하게 폴백한다.

FNV-1a seed는 표시명·좌표가 아니라 안정적인 장소 ID와 theme key만 사용한다. 같은 권역의 장소는 `motifA` 음정·리듬을 그대로 공유하며, seed는 B구간의 악구 순서·제한된 전조와 화음 voicing, BPM ±1, 타악 위상 같은 편곡에만 관여한다. 따라서 장소별 편곡은 구별되지만 권역을 알아보게 하는 훅은 훼손되지 않는다.

기본 화음 밀도는 한 마디당 한 번이다. A·A′·B·A″가 서로 다른 진행표를 사용하고, 현재 마디 선율과 가장 잘 맞는 원 테마 화음을 선택한 뒤 강박 선율이 빠진 경우에만 한 개의 color tone을 더한다. 모든 강박 선율의 70% 이상이 현재 화음 구성음에 정착하며 cadence 마지막 마디는 반드시 으뜸화음이다. 전투 bass는 별도 임의 배열이 아니라 이 화음 schedule의 `bassNote`와 길이를 그대로 따라간다.

`waltz` 테마인 물빛 연못·안개조류·태초뿌리는 실제 `3/4`이고 나머지는 `4/4`다. 두 경우 모두 32마디지만 반복 길이는 각각 384·512개의 16분음표다. `steady·waltz·syncopated·march·pulse·broken·swing`의 accent와 타악 배치, `timbre` 8종의 Tone Omni oscillator·lead/pad envelope가 권역 성격을 나눈다.

탐험 lead와 보스 counter 구절은 자연스러운 `G4~C7(MIDI 67~96)` 음역에 둔다. pad 화음은 원 악보보다 한 옥타브 높인 `C5~C7(MIDI 72~96)`, 전투 bass의 안전 범위도 한 옥타브 높인 `C2~G4(MIDI 36~67)`다. 타격감을 만드는 kick의 38/42Hz는 음표가 아닌 실제 주파수이므로 조옮김하지 않는다. 연속 발음음은 65~82%를 3반음 이내 계단 진행으로 두고, 7반음 이상 도약은 전체 5% 이하로 절제한다. 회귀 테스트는 35개 고유 훅, 병합된 623개 장소와 35개 색의 양방향 일치, 같은 권역의 훅 보존과 장소별 편곡 signature 고유성을 함께 검사한다.

### 작곡 참고

형식과 밀도의 기준을 잡기 위해 CC0로 공개된 OpenGameArt의 [15 Melodic RPG Chiptunes](https://opengameart.org/content/15-melodic-rpg-chiptunes), [Castle Town](https://opengameart.org/content/castle-town), [Prepare your swords](https://opengameart.org/content/prepare-your-swords)의 MIDI·MuseScore 자료에서 구간 길이, 훅 회귀 시점, 구간별 음표 밀도 변화만 분석했다. 원곡의 선율·화성 진행·리듬을 복제하거나 게임 asset으로 포함하지 않았으며, 35개 테마의 네 악구는 프로젝트용 데이터로 별도 작성했다.

## 실제 교전 상태

수동 대상 지정만으로 전투 음악을 켜지 않는다. 유효한 공격이 준비 단계를 통과하거나 공격 source가 있는 피해가 확정되면 `Entity.recordCombatEngagement()`가 양쪽의 최종 `attackOwner`에 교전을 알린다. 광맥·일반 오브젝트는 제외하고 Player는 이 비영속 상태를 마지막 교전부터 9초간 유지한다. 상대가 보스면 같은 시간 동안 `boss`가 `combat`보다 우선한다. 장소 이동, 사망, 부활은 즉시 탐험 상태로 되돌린다.

`PlayerStatsData.musicCombatState`가 서버 판정의 직렬화 key를 전달한다. 클라이언트의 생존 `target` 추론은 구버전 snapshot 호환용 폴백일 뿐, 명시 상태가 있으면 사용하지 않는다. 이 상태는 저장할 게임 진행도가 아니므로 DB에 기록하지 않는다.

## 재생과 전환

`client/src/audio/AdaptiveMusicEngine.ts`는 Home route 하나가 소유한다. 탐험 bank는 저밀도 lead/pluck와 pad를 항상 재생한다. `combat`은 bass와 가벼운 percussion을 gain ramp로 더하고, `boss`는 counter melody, harmony와 무거운 percussion을 추가한다. 상태 snapshot 변화는 Part를 다시 만들지 않고 layer gain만 변경한다. 공용 악보의 숫자는 MIDI note이므로 모든 음정 악기는 `Tone.Frequency(midi, 'midi')`로 Hz에 명시 변환한 뒤 연주한다. 숫자를 Tone.js의 기본 숫자 단위인 Hz로 직접 전달하지 않는다.

Transport의 PPQ는 192로 고정하고 Part의 event·duration·loop·start를 모두 정수 tick(`i`)으로 예약한다. `4/4`와 `3/4`의 반복 길이를 각 arrangement의 `loopTicks`에서 읽으므로 전역 Transport 박자표에 기대지 않는다. 새 bank의 모든 Part는 다음 4분음표 tick에서 offset `0i`, 즉 A구간 첫 음부터 함께 시작하며 교차 전환 예약도 같은 tick을 사용한다.

장소 이동 때 비활성 voice bank에 다음 score를 준비하고 다음 4분음표 경계부터 1.9초 equal-power crossfade한다. BPM도 같은 시간에 ramp한다. 빠른 연속 이동은 진행 중 전환을 끊지 않고 마지막 요청 하나로 합쳐 다음 전환으로 잇는다. compressor와 -4dB limiter 뒤에 사용자 gain을 두며 bank당 pad 6성, boss harmony 4성 이내로 제한한다. 두 bank가 각각 잔향기를 만들지 않고 공용 synchronous `Freeverb` send 하나를 공유해 전환 중 이펙트 중첩을 막는다.

기본 음량 50은 사용자 gain 약 `0.472(-6.53dB)`로 변환한다. 기존에 저장된 35도 값 자체는 유지하면서 새 완만한 곡선에서 약 `0.342(-9.32dB)`로 재생한다. 탐험 레이어는 평시 `0.64`, 일반 전투 중 `0.44`, 보스전 중 `0.38`이고, 전투·보스 추가 레이어는 각각 최대 `0.31/0.30`이다. 일반 탐험 mix는 180Hz high-pass와 저/중/고역 `-4.5/+1.5/0dB`, pad/lead `-15/-8dB`를 사용한다. 밝은 탐험 mix는 높아진 화음이 날카롭지 않도록 260Hz high-pass와 `-5/+1/-1dB`, pad/lead `-15/-9dB`를 사용한다. 전투 kick/noise는 `-8/-18dB`, 보스 kick/noise는 `-5/-15dB`로 두어 저음 선율과 별개로 박자가 분명히 들리게 한다. pad는 악보의 tick 길이와 timbre별 envelope, 최대 6성으로 연주해 음색을 구분하면서 과도한 저음 drone과 voice drop을 막는다. 사용자 최대 gain은 여전히 0.88 이하이고 마지막 -4dB limiter를 통과하므로 합산 peak가 출력 clipping으로 이어지지 않는다.

루미나르, 물빛 연못, 바람결 초원, 은빛그물 숲, 여명의 성소는 밝은 탐험 테마로 분류한다. 각각 I-IV-V-I, 장조 pentatonic 개방화음, I-vi-IV-V, I-♭VII-IV-I, I-II-V-I 진행을 사용하며 seed가 이를 회전하거나 감화음화하지 않는다. lead는 G4~C7 안에서 화음과 겹치는 자연스러운 중·고음역을 사용한다. 저음 bass와 긴장성 counter·추가 화성·강한 타악은 탐험 출력에 연결하지 않고 전투 또는 보스 레이어에서만 연주한다.

## 사용자 입력과 수명주기

브라우저 autoplay 정책 때문에 `Tone.start()`는 Home에서 받은 첫 실제 pointer, keyboard 또는 touch 이벤트 안에서만 호출한다. 저장 음량이 0이면 시작하지 않으며, 햄버거 메뉴에서 0~100 배경음악 음량과 음소거·이전 음량 복원을 조작한다. 미저장 기본값은 50이고 기기 localStorage에 저장한다.

숨김·focus를 잃은 탭과 socket 연결이 끊긴 화면은 별도 audibility gain으로 fade out한 뒤 Transport를 일시 정지한다. 이 정책은 같은 브라우저의 여러 탭에서 비활성 화면이 함께 소리 나는 것을 막으며 사용자 저장 음량을 바꾸지 않는다. 로그아웃, 계정 key 변경 또는 Home unmount 때 엔진은 자신이 만든 Part, Transport 예약 ID, timeout, synth, effect와 gain node를 모두 정리한다.

## 검증

- `server/src/data/adaptiveMusic.test.ts`: 35개 고정 2마디 악구와 전조 정규화 훅 고유성, 623 장소 coverage·동일 권역 훅 보존·편곡 고유성, 32마디 A/A′/B/A″ 형식, 선율 진행·도약·파트별 음역·종지, 강박 chord-tone·화음 coverage·chord-linked bass, MIDI→Hz 경계, 실제 3/4, PPQ 192 tick engine, 전투 resolver, 음량 곡선·storage.
- `server/src/models/AdaptiveMusicCombat.test.ts`: 실제 공격·회피·피격·보스 우선순위·9초 만료·이동/사망 초기화·자원 제외.
- 클라이언트는 TypeScript/Vite build와 ESLint로 Tone node·React lifecycle 계약을 검증하고, 첫 gesture·모바일 autoplay·두 탭·숨김/복귀·빠른 연속 이동은 실제 브라우저에서 확인한다.
