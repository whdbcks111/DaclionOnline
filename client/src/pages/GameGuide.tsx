import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './GameGuide.module.scss'

interface GuideArticle {
  id: string
  title: string
  summary: string
  paragraphs?: readonly string[]
  commands?: readonly string[]
  tips?: readonly string[]
}

interface GuideChapter {
  id: string
  title: string
  description: string
  articles: readonly GuideArticle[]
}

const chapters: readonly GuideChapter[] = [
  {
    id: 'start',
    title: '처음 시작하기',
    description: '텍스트 MUD의 기본 흐름과 첫 모험에서 해야 할 일을 설명합니다.',
    articles: [
      {
        id: 'what-is-mud',
        title: '텍스트 MUD란?',
        summary: '여러 플레이어가 같은 세계를 공유하고 글과 버튼으로 탐험하는 온라인 RPG입니다.',
        paragraphs: [
          'DaclionOnline에서는 채팅창이 대화창인 동시에 게임 화면입니다. 장소를 살펴보고, 버튼이나 명령어로 이동하고, 다른 플레이어와 파티를 이루어 같은 몬스터와 상호작용합니다.',
          '전투와 보상은 서버에서 판정됩니다. 빠르게 입력하는 것보다 현재 장소, 대상, 장비, 상태효과와 스킬 재사용 대기시간을 읽고 다음 행동을 고르는 것이 중요합니다.',
        ],
        tips: ['처음에는 메시지 안의 버튼을 눌러 흐름을 익힌 뒤 같은 동작의 명령어와 단축어를 사용해 보세요.'],
      },
      {
        id: 'first-ten-minutes',
        title: '첫 10분',
        summary: '상태와 위치를 확인하고 안내인 리아의 첫 의뢰를 따라가세요.',
        commands: ['/상태창 (s)', '/위치 (l, m)', '/인벤토리 (i)', '/대화 번호 (tk 번호)'],
        tips: [
          '루미나르 개척촌에서 안내인 리아와 대화하면 초원의 첫 의뢰를 받을 수 있습니다.',
          '위치 메시지의 이동·대화·공격 버튼을 먼저 사용해도 되고, 괄호 안 단축어를 슬래시 없이 입력해도 됩니다.',
        ],
      },
      {
        id: 'commands',
        title: '버튼·명령어·단축어',
        summary: '같은 행동을 상황에 맞는 세 가지 입력 방식으로 실행할 수 있습니다.',
        paragraphs: [
          '메시지와 HUD의 버튼은 가장 안전한 입력 방법입니다. 명령어는 채팅창에 `/명령 인자`로 입력하고, 등록된 단축어는 슬래시 없이 사용할 수 있습니다.',
          '자동완성은 명령어 이름과 단축어, 대상·장소·아이템 같은 인자를 안내합니다. 장소 검색은 띄어쓰기와 일부 구분 기호를 무시합니다.',
        ],
        commands: ['/도움말', '/단축키목록', '/자동이동 장소검색어 (nav)', '/이동취소 (vc)'],
      },
    ],
  },
  {
    id: 'character',
    title: '캐릭터와 성장',
    description: '레벨, 자원, 스탯, 장비와 스킬 성장의 관계를 확인합니다.',
    articles: [
      {
        id: 'status',
        title: '상태와 자원',
        summary: '생명력·정신력·배고픔·수분과 현재 장비, 능력치, 상태효과를 확인합니다.',
        commands: ['/상태창 (s)', '/인벤토리 (i)', '/감정 아이템번호 또는 장착칸'],
        tips: ['배고픔이나 수분이 0이면 공복·갈증 상태효과가 생깁니다. 음식과 음료를 미리 준비하세요.'],
      },
      {
        id: 'level-and-stats',
        title: '레벨·경험치·스탯',
        summary: '전투와 생활 콘텐츠로 경험치를 얻고 성장 포인트를 분배합니다.',
        paragraphs: [
          '레벨이 오르면 모든 기본 스탯이 1씩 오르고 자유 스탯 포인트 3을 얻습니다. 같은 레벨의 일반 몬스터가 주는 경험치 비율은 고레벨로 갈수록 완만해집니다.',
          '근력은 물리 공격, 민첩은 속도와 회피, 체력은 생존, 정신은 마법과 정신력, 감각은 치명타와 제작 정밀도에 주로 영향을 줍니다.',
        ],
        commands: ['/스탯분배 스탯이름 수치 (R)', '/순위 레벨 (rk 레벨)'],
      },
      {
        id: 'equipment',
        title: '아이템 사용과 장비',
        summary: '인벤토리 메시지의 버튼이나 명령어로 아이템을 사용하고 장착합니다.',
        commands: ['/사용 번호 (u)', '/장착 번호 (eq)', '/버리기 번호 [개수] (q)', '/줍기 번호 또는 전체 (p)'],
        tips: [
          '내구도가 있는 장비는 공격과 사용으로 닳고 0이 되면 파괴됩니다.',
          '아이템의 커스텀 이름·메타데이터·내구도는 개별 인스턴스에 보존됩니다.',
        ],
      },
      {
        id: 'skills',
        title: '스킬',
        summary: '스킬은 명령어, 시전어, 전투 퀵 HUD로 사용할 수 있습니다.',
        commands: ['/스킬목록 (sl)', '/스킬 스킬이름 (k)', '/스킬정보 스킬이름 (si)', '/대상지정 번호 (t)'],
        tips: ['일부 스킬은 같은 계열과 짧은 공유 쿨다운을 가집니다. 스킬 정보에서 비용·재사용 대기시간·발동 조건을 확인하세요.'],
      },
    ],
  },
  {
    id: 'world',
    title: '탐험과 전투',
    description: '장소, 지도, 위험도, 대상 지정과 파티 전투를 다룹니다.',
    articles: [
      {
        id: 'travel',
        title: '장소와 이동',
        summary: '현재 장소의 연결을 확인하고 한 칸 또는 방문 장소까지 자동으로 이동합니다.',
        commands: ['/위치 (l, m)', '/이동 장소명 또는 번호 (v, mv)', '/지도', '/자동이동 검색어 (nav)', '/이동취소 (vc)'],
        tips: ['안전 지역은 PVP와 사망 손실이 없고, 중립·적대 지역은 서로 다른 PVP·사망 규칙을 적용합니다.'],
      },
      {
        id: 'combat',
        title: '대상과 전투',
        summary: '대상을 지정하고 평타와 스킬을 섞어 공격합니다.',
        commands: ['/대상지정 번호 (t)', '/공격 번호', '/몬스터정보 번호'],
        tips: [
          '대상이 없을 때 공격받으면 공격자를 자동으로 대상으로 지정합니다.',
          '속도 차이, 방어·관통, 치명타, 공격 속성, 상태효과와 보호막이 실제 피해에 반영됩니다.',
        ],
      },
      {
        id: 'affinity',
        title: '속성과 상태효과',
        summary: '공격 속성과 대상 속성의 단방향 상성, 버프와 디버프를 확인합니다.',
        commands: ['/속성표'],
        tips: ['화염과 빙결처럼 서로 상쇄되는 상태효과가 있습니다. 독 계열은 무생물에게 적용되지 않습니다.'],
      },
      {
        id: 'party',
        title: '파티와 협동',
        summary: '같은 장소의 파티원과 처치 경험치와 전투 피드를 공유합니다.',
        commands: ['/파티초대 닉네임 (pi)', '/파티수락 (pa)', '/파티정보 (pt)', '/파티나가기 (pl)'],
        tips: ['최고 레벨 파티원과 레벨 차이가 크면 경험치에 감쇠와 상한이 적용됩니다.'],
      },
    ],
  },
  {
    id: 'content',
    title: '콘텐츠',
    description: '퀘스트와 NPC부터 상점, 제작, 광질, 낚시까지 주요 플레이 동선을 설명합니다.',
    articles: [
      {
        id: 'quests-and-npcs',
        title: 'NPC와 퀘스트',
        summary: '장소의 대화 버튼으로 NPC를 만나고 목표를 완료한 뒤 다시 보고합니다.',
        commands: ['/대화 번호 (tk)', '/퀘스트목록', '/퀘스트정보 퀘스트이름'],
        tips: ['장소 이동·사망·로그아웃 시 진행 중인 대화는 자동으로 종료됩니다.'],
      },
      {
        id: 'shops',
        title: '상점',
        summary: '지역 상점은 해당 구간의 생존품과 장비를 판매하고 지역 소재를 매입합니다.',
        commands: ['/상점 (sh)', '/구매 번호 [개수] (bu)', '/판매 번호 [개수]'],
        tips: ['상점 재고는 시간이 지나면 재입고됩니다. 낚시 품목은 물빛 연못의 낚시상점처럼 전용 상점에서 찾을 수 있습니다.'],
      },
      {
        id: 'mining-crafting',
        title: '광질·제작·단조',
        summary: '채굴 도구로 광맥을 파괴하고 발견한 제작법 또는 대장장이 단조로 장비를 만듭니다.',
        commands: ['/공격 광맥번호', '/제작법목록 (cl)', '/제작 제작법이름 [개수] (c)', '/단조'],
        tips: ['광맥은 `tool:mining` 도구가 필요합니다. 단조 결과는 재료, 형태, 제작자 능력치, 리듬 정확도와 랜덤 성향에 따라 달라집니다.'],
      },
      {
        id: 'fishing',
        title: '낚시',
        summary: '낚시터에서 낚싯대와 보조칸 미끼를 사용해 미니게임을 시작합니다.',
        commands: ['/낚시', '/낚시등급표'],
        tips: ['행운은 희귀 물고기 가중치에, 입질 속도는 대기 시간에, 채집 크기·속도는 미니게임 조작 난이도에 영향을 줍니다.'],
      },
      {
        id: 'social-and-economy',
        title: '거래·순위·채팅',
        summary: '다른 플레이어와 안전하게 거래하고 공개 범위를 조절합니다.',
        commands: ['/거래 닉네임', '/순위 [카테고리] (rk)', '/공개모드', '/비공개모드', '@닉네임 메시지'],
        tips: ['정보 공개 모드는 상태·인벤토리·스킬·지도 같은 정보성 명령의 공개 여부만 바꿉니다.'],
      },
    ],
  },
  {
    id: 'interface',
    title: '화면과 편의 기능',
    description: 'HUD, 채널, 이미지 전송과 모바일 조작을 설정합니다.',
    articles: [
      {
        id: 'hud',
        title: 'HUD 설정',
        summary: '상태·파티·위치·미니맵·퀵 버튼을 켜고 크기와 위치를 조절합니다.',
        paragraphs: [
          '햄버거 메뉴의 HUD 설정에서 표시할 HUD와 세부 버튼을 선택합니다. 위치 이동 모드에서는 스킬 버튼을 각각 원하는 위치로 옮길 수 있습니다.',
          '모바일에서는 화면을 가리지 않도록 크기와 투명도를 낮추고, 위치 HUD의 공격·대상 버튼과 미니맵 이동 목록을 필요할 때만 켜는 것을 권장합니다.',
        ],
      },
      {
        id: 'chat',
        title: '채팅·채널·이미지',
        summary: '공개 채널, 개인 채널, 귓속말과 이미지 묶음 전송을 지원합니다.',
        tips: [
          '컴퓨터에서는 파일 선택과 클립보드 붙여넣기, 모바일에서는 미디어 선택으로 이미지를 첨부할 수 있습니다.',
          '이미지는 전송 전 입력창 위에서 미리 보고 개별 삭제할 수 있습니다.',
        ],
      },
      {
        id: 'help',
        title: '막혔을 때',
        summary: '명령어 목록, 자동완성, 현재 위치와 퀘스트 목표를 차례로 확인하세요.',
        commands: ['/도움말', '/단축키목록', '/위치', '/퀘스트목록'],
        tips: ['오류가 반복되면 당시 장소·대상 번호·사용한 명령과 화면에 나온 메시지를 함께 알려주세요.'],
      },
    ],
  },
]

function firstArticle(chapter: GuideChapter): GuideArticle {
  return chapter.articles[0]
}

export default function GameGuide() {
  const navigate = useNavigate()
  const [chapterId, setChapterId] = useState(chapters[0].id)
  const chapter = useMemo(
    () => chapters.find(candidate => candidate.id === chapterId) ?? chapters[0],
    [chapterId],
  )
  const [articleId, setArticleId] = useState(firstArticle(chapters[0]).id)
  const article = chapter.articles.find(candidate => candidate.id === articleId) ?? firstArticle(chapter)

  const selectChapter = (next: GuideChapter) => {
    setChapterId(next.id)
    setArticleId(firstArticle(next).id)
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p>DaclionOnline</p>
          <h1>게임 안내</h1>
        </div>
        <button type="button" onClick={() => navigate('/home')}>게임으로 돌아가기</button>
      </header>

      <div className={styles.layout}>
        <nav className={styles.chapterNav} aria-label="게임 안내 목차">
          <h2>목차</h2>
          {chapters.map(candidate => (
            <section key={candidate.id}>
              <button
                type="button"
                className={candidate.id === chapter.id ? styles.activeChapter : ''}
                onClick={() => selectChapter(candidate)}
              >
                {candidate.title}
              </button>
              {candidate.id === chapter.id && (
                <div className={styles.articleNav}>
                  {candidate.articles.map(entry => (
                    <button
                      type="button"
                      key={entry.id}
                      className={entry.id === article.id ? styles.activeArticle : ''}
                      onClick={() => setArticleId(entry.id)}
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </nav>

        <article className={styles.content}>
          <div className={styles.breadcrumb}>{chapter.title} / {article.title}</div>
          <h2>{article.title}</h2>
          <p className={styles.lead}>{article.summary}</p>

          {article.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}

          {article.commands && (
            <section className={styles.block}>
              <h3>바로 쓰는 명령어</h3>
              <div className={styles.commandList}>
                {article.commands.map(command => <code key={command}>{command}</code>)}
              </div>
            </section>
          )}

          {article.tips && (
            <section className={styles.block}>
              <h3>알아두기</h3>
              <ul>
                {article.tips.map(tip => <li key={tip}>{tip}</li>)}
              </ul>
            </section>
          )}

          <footer className={styles.articlePager}>
            {chapter.articles.map((entry, index) => entry.id === article.id && (
              <span key={entry.id}>
                {index > 0 && (
                  <button type="button" onClick={() => setArticleId(chapter.articles[index - 1].id)}>
                    ← {chapter.articles[index - 1].title}
                  </button>
                )}
                {index < chapter.articles.length - 1 && (
                  <button type="button" onClick={() => setArticleId(chapter.articles[index + 1].id)}>
                    {chapter.articles[index + 1].title} →
                  </button>
                )}
              </span>
            ))}
          </footer>
        </article>
      </div>
    </main>
  )
}
