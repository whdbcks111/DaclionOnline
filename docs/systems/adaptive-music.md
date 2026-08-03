# 적응형 지역 음악

클라이언트는 외부 음원 sample 없이 Tone.js 15.1.22 합성기만 사용해 현재 장소의 반복 배경음악을 만든다. 서버는 음악을 직접 재생하지 않고 현재 장소 `mapColor`와 최근 실제 교전의 `exploration | combat | boss` 상태만 HUD snapshot으로 보낸다.

## 악보와 장소 변주

`shared/adaptiveMusic.ts`의 `LocationMusicTheme` 클래스형 enum이 현재 월드의 기본 대표색 25개와 승천 권역 10개, 총 35개 악보를 소유한다. 각 악보에는 권역명, BPM, root MIDI, `MusicScale`, 16 step leitmotif, 네 chord, bass/pad/lead 음역, timbre와 rhythm character가 명시되어 있다. 35개 원형 leitmotif는 같은 짧은 문법을 옮겨 쓴 형태가 되지 않도록 음정 간격과 쉼 배치를 각각 다시 구성했다.

`composeLocationScore(locationId, mapColor)`가 WebAudio와 무관한 유일한 작곡 진입점이다. FNV-1a seed는 표시명·좌표가 아니라 안정적인 장소 ID와 theme key만 사용한다. 같은 권역의 root·scale·기본 motif와 네 화음의 기능·순서를 유지하면서 4-step 구절의 첫 음은 고정하고 약박만 원 motif 음역 안에서 scale degree ornament한다. 첫 두 마디 A에 이어지는 두 마디 B는 A를 회전 복사하지 않고 별도 seed로 음 진행·쉼·박자를 만든 독립 응답구이며, 마지막은 으뜸음으로 종지한다. 등록되지 않은 색은 루미나르 악보로 안전하게 폴백한다.

각 `rhythm`은 32개 16분음표 grid 안의 서로 다른 16개 onset, 음 길이, 네 pad onset·길이·velocity를 소유한다. A는 이 기본 박자를 사용하고 B는 두 번째 grid에서 장소 seed로 onset과 음 길이까지 변주한다. 따라서 탐험 lead와 pad부터 steady·waltz·syncopated·march·pulse·broken·swing의 박자감이 실제로 달라진다. `timbre` 8종도 bright 여부와 관계없이 고유한 Tone Omni oscillator와 lead/pad envelope를 사용한다. 밝은 테마를 모두 triangle로 덮어쓰는 예외는 없다.

탐험 lead와 보스 counter 구절은 `G4~C7(MIDI 67~96)`, pad 화음은 `C4~C6(MIDI 60~84)`에 둔다. 회귀 테스트는 병합된 623개 장소와 35개 색의 양방향 완전 일치뿐 아니라 강세·BPM·보스 counter를 제외한 실제 pitch/rest motif의 전 지역 고유성을 검사한다. 반복 시작점을 32칸 모두 회전하고 중앙 전조 차이를 제거해 같은 곡으로 비교해도 pitch·duration·onset loop가 623개 모두 달라야 한다. 같은 권역의 장소끼리도 정규화한 32칸 음정·쉼 중 최소 10칸, 음 길이와 onset 간격을 합산하면 최소 24칸 이상 달라야 한다.

## 실제 교전 상태

수동 대상 지정만으로 전투 음악을 켜지 않는다. 유효한 공격이 준비 단계를 통과하거나 공격 source가 있는 피해가 확정되면 `Entity.recordCombatEngagement()`가 양쪽의 최종 `attackOwner`에 교전을 알린다. 광맥·일반 오브젝트는 제외하고 Player는 이 비영속 상태를 마지막 교전부터 9초간 유지한다. 상대가 보스면 같은 시간 동안 `boss`가 `combat`보다 우선한다. 장소 이동, 사망, 부활은 즉시 탐험 상태로 되돌린다.

`PlayerStatsData.musicCombatState`가 서버 판정의 직렬화 key를 전달한다. 클라이언트의 생존 `target` 추론은 구버전 snapshot 호환용 폴백일 뿐, 명시 상태가 있으면 사용하지 않는다. 이 상태는 저장할 게임 진행도가 아니므로 DB에 기록하지 않는다.

## 재생과 전환

`client/src/audio/AdaptiveMusicEngine.ts`는 Home route 하나가 소유한다. 탐험 bank는 저밀도 lead/pluck와 pad를 항상 재생한다. `combat`은 bass와 가벼운 percussion을 gain ramp로 더하고, `boss`는 counter melody, harmony와 무거운 percussion을 추가한다. 상태 snapshot 변화는 Part를 다시 만들지 않고 layer gain만 변경한다.

장소 이동 때 비활성 voice bank에 다음 score를 준비하고 Tone Transport의 다음 4분음표 경계부터 1.9초 equal-power crossfade한다. BPM도 같은 시간에 ramp한다. 빠른 연속 이동은 진행 중 전환을 끊지 않고 마지막 요청 하나로 합쳐 다음 전환으로 잇는다. 이전처럼 최대 한 마디를 기다린 뒤 기존 곡이 오래 남는 현상을 피하면서도 abrupt cut은 만들지 않는다. compressor와 -4dB limiter 뒤에 사용자 gain을 두며 bank당 pad 6성, boss harmony 3성 이내로 제한한다.

기본 음량 35는 사용자 gain 약 -12.05dB로 변환한다. 탐험 레이어는 평시 0.58로 유지한다. 일반 탐험 mix는 180Hz high-pass와 저/중/고역 `-4.5/+1.5/+1dB`, pad/lead `-17/-11dB`를 사용한다. 밝은 탐험 mix는 260Hz high-pass와 `-7/+2/+3dB`, pad/lead `-16/-9dB`로 선율을 더 앞세운다. pad는 rhythm별 `16n~4n.` 길이와 timbre별 envelope, 최대 6성으로 연주해 음색을 구분하면서 과도한 저음 drone과 voice drop을 막는다. 전투·보스에서는 탐험·저음·타악·대선율이 합쳐지므로 각 레이어 gain을 별도로 낮춘다. 사용자 최대 gain도 0.88 이하이고 마지막 -4dB limiter를 통과하므로 합산 peak가 출력 clipping으로 이어지지 않는다.

루미나르, 물빛 연못, 바람결 초원, 은빛그물 숲, 여명의 성소는 밝은 탐험 테마로 분류한다. 각각 I-IV-V-I, 장조 pentatonic 개방화음, I-vi-IV-V, I-♭VII-IV-I, I-II-V-I 진행을 사용하며 seed가 이를 회전하거나 감화음화하지 않는다. 실제 lead 최저음은 pad 최저음보다 최소 한 옥타브 높다. 저음 bass와 긴장성 counter·추가 화성·강한 타악은 탐험 출력에 연결하지 않고 전투 또는 보스 레이어에서만 연주한다.

## 사용자 입력과 수명주기

브라우저 autoplay 정책 때문에 `Tone.start()`는 Home에서 받은 첫 실제 pointer, keyboard 또는 touch 이벤트 안에서만 호출한다. 저장 음량이 0이면 시작하지 않으며, 햄버거 메뉴에서 0~100 배경음악 음량과 음소거·이전 음량 복원을 조작한다. 기본값은 35이고 기기 localStorage에 저장한다.

숨김·focus를 잃은 탭과 socket 연결이 끊긴 화면은 별도 audibility gain으로 fade out한 뒤 Transport를 일시 정지한다. 이 정책은 같은 브라우저의 여러 탭에서 비활성 화면이 함께 소리 나는 것을 막으며 사용자 저장 음량을 바꾸지 않는다. 로그아웃, 계정 key 변경 또는 Home unmount 때 엔진은 자신이 만든 Part, Transport 예약 ID, timeout, synth, effect와 gain node를 모두 정리한다.

## 검증

- `server/src/data/adaptiveMusic.test.ts`: 35 원형 leitmotif 최소 거리·623 장소 coverage, 전조·시작점 정규화 뒤에도 고유한 실제 loop, 같은 권역 장소 간 최소 pitch/rest·연주 차이, 독립 A/B schedule, rhythm/timbre profile, 밝은 화성, scale/MIDI, 전투 resolver, 음량·storage.
- `server/src/models/AdaptiveMusicCombat.test.ts`: 실제 공격·회피·피격·보스 우선순위·9초 만료·이동/사망 초기화·자원 제외.
- 클라이언트는 TypeScript/Vite build와 ESLint로 Tone node·React lifecycle 계약을 검증하고, 첫 gesture·모바일 autoplay·두 탭·숨김/복귀·빠른 연속 이동은 실제 브라우저에서 확인한다.
