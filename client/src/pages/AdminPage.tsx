import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  AdminOptionData,
  AdminPanelAction,
  AdminPanelBootstrapData,
  AdminPanelResult,
  AdminPlayerDetailData,
  AdminPlayerListItem,
} from '@shared/types'
import { useSocket } from '../context/SocketContext'
import FormDialog from '../components/dialog/FormDialog'
import Dialog from '../components/dialog/Dialog'
import type { FormDialogField, FormDialogValues } from '../components/dialog/FormDialog'
import styles from './AdminPage.module.scss'

type PlayerCategory = 'travel' | 'growth' | 'inventory' | 'skills' | 'testing' | 'communication'

interface ActionDefinition {
  action: AdminPanelAction
  label: string
  description: string
  category: PlayerCategory | 'world' | 'notice' | 'balance'
  fields: FormDialogField[]
  danger?: boolean
  targetless?: boolean
}

const emptyBootstrap: AdminPanelBootstrapData = {
  items: [], balanceItems: [], skills: [], jobs: [], locations: [], monsters: [], resources: [], statusEffects: [], stats: [], miniGamePresets: [],
}

function option(value: string, label: string): AdminOptionData { return { value, label } }

function buildActions(data: AdminPanelBootstrapData, detail: AdminPlayerDetailData | null): ActionDefinition[] {
  const inventory = detail?.inventory.map(item => option(String(item.index), `${item.index + 1}. ${item.name} x${item.count}`)) ?? []
  const ownedSkills = detail?.skills.map(skill => option(skill.id, `${skill.name} Lv.${skill.level}`)) ?? []
  const locationField = (): FormDialogField => ({ name: 'locationId', label: '장소', type: 'select', options: data.locations, required: true })
  return [
    { action: 'broadcast_chat_notice', label: '전체 채팅 공지', description: '모든 채널의 채팅창에 시스템 공지를 발송하고 채널 기록에 남깁니다.', category: 'notice', targetless: true, fields: [
      { name: 'message', label: '공지 내용', type: 'textarea', placeholder: '전체 채팅에 표시할 내용을 입력하세요.', required: true },
    ] },
    { action: 'broadcast_notification', label: '전체 알림 공지', description: '현재 접속 중인 모든 플레이어 화면에 알림을 표시합니다.', category: 'notice', targetless: true, fields: [
      { name: 'message', label: '공지 내용', type: 'textarea', placeholder: '전체 알림 내용을 입력하세요.', required: true },
      { name: 'duration', label: '표시 시간 (초)', type: 'number', min: 1, max: 60, defaultValue: 5, required: true },
    ] },
    { action: 'analyze_skill_balance', label: '스킬 밸런스 분석', description: '실제 스킬 계산식으로 60초 피해·회복·보호막과 자원 한계를 확인합니다.', category: 'balance', targetless: true, fields: [
      { name: 'skillDataId', label: '스킬', type: 'select', options: data.skills, required: true },
      { name: 'skillLevel', label: '스킬 레벨', type: 'number', min: 1, max: 100, defaultValue: 1, required: true },
      { name: 'level', label: '캐릭터 레벨', type: 'number', min: 1, max: 10000, defaultValue: 50, required: true },
      { name: 'mainJobId', label: '기준 직업', type: 'select', options: data.jobs, required: true },
    ] },
    { action: 'analyze_job_balance', label: '직업 밸런스 분석', description: '동일 총 스탯·무장비 조건에서 직업 능력치와 스킬 전투 지표를 확인합니다.', category: 'balance', targetless: true, fields: [
      { name: 'level', label: '캐릭터 레벨', type: 'number', min: 1, max: 10000, defaultValue: 50, required: true },
      { name: 'mainJobId', label: '메인 직업', type: 'select', options: data.jobs, required: true },
      { name: 'subJobId', label: '서브 직업 (Lv.200 분석용)', type: 'select', options: data.jobs },
    ] },
    { action: 'analyze_balance_profile', label: '전투 로테이션 프로파일', description: '추천 장비로 평타와 모든 성장 스킬을 섞어 동레벨 일반·보스전 60초 로테이션을 비교합니다.', category: 'balance', targetless: true, fields: [
      { name: 'level', label: '캐릭터 레벨', type: 'number', min: 1, max: 10000, defaultValue: 50, required: true },
      { name: 'mainJobId', label: '메인 직업', type: 'select', options: data.jobs, required: true },
      { name: 'subJobId', label: '서브 직업 (Lv.200 분석용)', type: 'select', options: data.jobs },
    ] },
    { action: 'analyze_item_balance', label: '장비·버프 아이템 분석', description: '실제 장비 modifier 또는 버프 상태효과를 적용해 전후 DPS·생존 차이를 확인합니다.', category: 'balance', targetless: true, fields: [
      { name: 'itemDataId', label: '아이템', type: 'select', options: data.balanceItems, required: true },
      { name: 'level', label: '캐릭터 레벨', type: 'number', min: 1, max: 10000, defaultValue: 50, required: true },
      { name: 'mainJobId', label: '기준 직업', type: 'select', options: data.jobs, required: true },
    ] },
    { action: 'teleport_admin_to_player', label: '대상에게 순간이동', description: '내 캐릭터를 선택한 플레이어 위치로 이동합니다.', category: 'travel', fields: [] },
    { action: 'teleport_player_to_admin', label: '대상을 내게 소환', description: '선택한 플레이어를 내 캐릭터 위치로 이동합니다.', category: 'travel', fields: [] },
    { action: 'teleport_player_location', label: '대상을 지역으로 이동', description: '이동 조건을 무시하고 지정 장소로 이동합니다.', category: 'travel', fields: [locationField()] },
    { action: 'unlock_all_locations', label: '모든 지역 지도 잠금 해제', description: '선택한 플레이어의 모든 장소를 방문 처리합니다. hidden 장소는 일반 지도에서 계속 숨겨집니다.', category: 'travel', fields: [] },
    { action: 'set_level', label: '레벨 설정', description: '레벨과 해당 레벨 경험치 비율을 설정합니다.', category: 'growth', fields: [
      { name: 'level', label: '레벨', type: 'number', min: 1, max: 10000, defaultValue: detail?.level ?? 1, required: true },
      { name: 'expPercent', label: '경험치 비율 (%)', type: 'number', min: 0, max: 99.999, step: .1, defaultValue: 0, required: true },
    ] },
    { action: 'adjust_level', label: '레벨 조정', description: '상승 시 기존 분배를 유지하고 레벨마다 모든 스탯 +1과 가용 포인트 +3만 지급합니다.', category: 'growth', fields: [
      { name: 'level', label: '조정할 레벨', type: 'number', min: 1, max: 10000, defaultValue: detail?.level ?? 1, required: true },
      { name: 'expPercent', label: '경험치 비율 (%)', type: 'number', min: 0, max: 99.999, step: .1, defaultValue: 0, required: true },
    ] },
    { action: 'set_stat_points', label: '스탯 포인트 설정', description: '사용 가능한 스탯 포인트를 덮어씁니다.', category: 'growth', fields: [{ name: 'value', label: '스탯 포인트', type: 'number', min: 0, defaultValue: detail?.statPoint ?? 0, required: true }] },
    { action: 'set_stat', label: '기본 스탯 설정', description: '선택한 기본 스탯의 값을 덮어씁니다.', category: 'growth', fields: [
      { name: 'statKey', label: '스탯', type: 'select', options: data.stats, required: true },
      { name: 'value', label: '값', type: 'number', min: 0, required: true },
    ] },
    { action: 'set_gold', label: '골드 설정', description: '보유 골드를 덮어씁니다.', category: 'growth', fields: [{ name: 'value', label: '골드', type: 'number', min: 0, defaultValue: detail?.gold ?? 0, required: true }] },
    { action: 'set_vital', label: '상태 자원 설정', description: '현재 생명력·정신력·배고픔·수분을 최대값 범위 안에서 설정합니다.', category: 'growth', fields: [
      { name: 'vitalKey', label: '자원', type: 'select', required: true, options: [option('life', '생명력'), option('mentality', '정신력'), option('hungry', '배고픔'), option('thirsty', '수분')] },
      { name: 'value', label: '현재값', type: 'number', min: 0, required: true },
    ] },
    { action: 'set_jobs', label: '직업 설정', description: '1차 메인·서브 직업을 설정합니다. 같은 직업은 중복할 수 없습니다.', category: 'growth', fields: [
      { name: 'mainJobId', label: '메인 직업', type: 'select', options: data.jobs },
      { name: 'subJobId', label: '서브 직업', type: 'select', options: data.jobs },
    ] },
    { action: 'revive_player', label: '즉시 부활', description: '온라인 플레이어를 즉시 부활시킵니다.', category: 'growth', fields: [] },
    { action: 'grant_item', label: '아이템 지급', description: '마스터 아이템을 지정 수량 지급합니다.', category: 'inventory', fields: [
      { name: 'itemDataId', label: '아이템', type: 'select', options: data.items, required: true },
      { name: 'count', label: '수량', type: 'number', min: 1, max: 9999, defaultValue: 1, required: true },
    ] },
    { action: 'remove_item', label: '아이템 삭제', description: '인벤토리의 특정 아이템 인스턴스에서 수량을 삭제합니다.', category: 'inventory', danger: true, fields: [
      { name: 'itemIndex', label: '아이템', type: 'select', options: inventory, required: true },
      { name: 'count', label: '수량', type: 'number', min: 1, defaultValue: 1, required: true },
    ] },
    { action: 'set_item_metadata', label: '아이템 메타데이터 수정', description: '인스턴스 델타 메타데이터를 JSON 값으로 설정하거나 기본값으로 되돌립니다.', category: 'inventory', fields: [
      { name: 'itemIndex', label: '아이템', type: 'select', options: inventory, required: true },
      { name: 'metadataKey', label: '메타데이터 키', placeholder: '예: icon', required: true },
      { name: 'metadataJson', label: 'JSON 값', type: 'textarea', defaultValue: 'null', help: '문자열은 따옴표를 포함해 입력합니다. 예: "custom.png"' },
      { name: 'reset', label: '델타값을 제거하고 마스터 기본값 사용', type: 'checkbox' },
    ] },
    { action: 'clear_inventory', label: '인벤토리 초기화', description: '선택한 플레이어의 모든 인벤토리 아이템을 삭제합니다. 장비는 유지됩니다.', category: 'inventory', danger: true, fields: [] },
    { action: 'unlock_all_crafting_recipes', label: '모든 제작법 잠금 해제', description: '현재 등록된 모든 제작법을 발견 처리합니다.', category: 'inventory', fields: [] },
    { action: 'grant_skill', label: '스킬 지급', description: '스킬을 획득시키고 레벨을 설정합니다.', category: 'skills', fields: [
      { name: 'skillDataId', label: '스킬', type: 'select', options: data.skills, required: true },
      { name: 'level', label: '레벨', type: 'number', min: 1, defaultValue: 1, required: true },
    ] },
    { action: 'set_skill_level', label: '스킬 레벨 설정', description: '선택한 보유 스킬의 레벨을 정의된 최대 레벨 안에서 변경합니다.', category: 'skills', fields: [
      { name: 'skillDataId', label: '보유 스킬', type: 'select', options: ownedSkills, required: true },
      { name: 'level', label: '변경할 레벨', type: 'number', min: 1, defaultValue: detail?.skills[0]?.level ?? 1, required: true },
    ] },
    { action: 'remove_skill', label: '스킬 삭제', description: '보유 스킬 인스턴스를 영구 삭제합니다.', category: 'skills', danger: true, fields: [{ name: 'skillDataId', label: '보유 스킬', type: 'select', options: ownedSkills, required: true }] },
    { action: 'apply_status_effect', label: '상태이상 부여', description: '온라인 플레이어에게 상태이상을 적용합니다.', category: 'skills', fields: [
      { name: 'statusEffectId', label: '상태이상', type: 'select', options: data.statusEffects, required: true },
      { name: 'level', label: '레벨', type: 'number', min: 1, defaultValue: 1, required: true },
      { name: 'duration', label: '지속시간 (초)', type: 'number', min: .1, max: 86400, step: .1, defaultValue: 30, required: true },
    ] },
    { action: 'clear_status_effects', label: '상태이상 모두 해제', description: '온라인 플레이어의 모든 상태이상을 제거합니다.', category: 'skills', danger: true, fields: [] },
    { action: 'start_minigame', label: '미니게임 실행', description: '선택한 온라인 플레이어에게 보상 없는 테스트 미니게임을 실행합니다. 회피 게임의 조작 속도는 대상의 현재 이동속도와 동기화됩니다.', category: 'testing', fields: [
      { name: 'presetId', label: '미니게임 프리셋', type: 'select', options: data.miniGamePresets, required: true },
    ] },
    { action: 'notify_player', label: '개별 알림 발송', description: '선택한 온라인 플레이어 화면에 관리자 알림을 표시합니다.', category: 'communication', fields: [
      { name: 'message', label: '알림 내용', type: 'textarea', placeholder: '선택한 플레이어에게 보낼 내용을 입력하세요.', required: true },
      { name: 'duration', label: '표시 시간 (초)', type: 'number', min: 1, max: 60, defaultValue: 5, required: true },
    ] },
    { action: 'spawn_monster', label: '몬스터 소환', description: '지정 장소에 새 몬스터 인스턴스를 생성합니다.', category: 'world', targetless: true, fields: [locationField(), { name: 'monsterDataId', label: '몬스터', type: 'select', options: data.monsters, required: true }, { name: 'count', label: '수량', type: 'number', min: 1, max: 50, defaultValue: 1, required: true }] },
    { action: 'respawn_monsters', label: '몬스터 리스폰', description: '지정 장소의 죽은 몬스터를 즉시 리스폰합니다. 종류를 비우면 전체를 처리합니다.', category: 'world', targetless: true, fields: [locationField(), { name: 'monsterDataId', label: '몬스터 종류', type: 'select', options: data.monsters }] },
    { action: 'reset_resource_cooldown', label: '오브젝트 쿨타임 초기화', description: './위치에 표시되는 1부터 시작하는 오브젝트 번호로 자원의 상호작용 쿨타임을 초기화합니다.', category: 'world', targetless: true, fields: [locationField(), { name: 'objectNumber', label: '오브젝트 번호', type: 'number', min: 1, required: true }] },
  ]
}

function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'life' | 'mentality' | 'hunger' | 'thirst' }) {
  const ratio = Math.min(100, Math.max(0, value / Math.max(1, max) * 100))
  return <div className={`${styles.meter} ${styles[`meter${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
    <span>{label}</span>
    <div className={styles.meterTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${ratio}%` }} />
    </div>
    <b>{value.toFixed(1)} / {max.toFixed(1)}</b>
  </div>
}

export default function AdminPage() {
  const { socket, sessionInfo } = useSocket()
  const navigate = useNavigate()
  const [bootstrap, setBootstrap] = useState(emptyBootstrap)
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminPlayerDetailData | null>(null)
  const [search, setSearch] = useState('')
  const [section, setSection] = useState<'players' | 'world' | 'notice' | 'balance'>('players')
  const [category, setCategory] = useState<PlayerCategory>('travel')
  const [activeAction, setActiveAction] = useState<ActionDefinition | null>(null)
  const [report, setReport] = useState<AdminPanelResult | null>(null)

  useEffect(() => {
    if (!socket || (sessionInfo?.permission ?? 0) < 10) return
    const onBootstrap = (value: AdminPanelBootstrapData) => setBootstrap(value)
    const onPlayers = (value: AdminPlayerListItem[]) => {
      setPlayers(value)
      setSelectedId(current => current ?? value[0]?.userId ?? null)
    }
    const onPlayer = (value: AdminPlayerDetailData | null) => setDetail(value)
    const onResult = (value: AdminPanelResult) => {
      if (value.details) setReport(value)
    }
    socket.on('adminPanelBootstrap', onBootstrap)
    socket.on('adminPanelPlayers', onPlayers)
    socket.on('adminPanelPlayer', onPlayer)
    socket.on('adminPanelResult', onResult)
    socket.emit('adminPanelRequestBootstrap')
    socket.emit('adminPanelRequestPlayers')
    return () => {
      socket.off('adminPanelBootstrap', onBootstrap)
      socket.off('adminPanelPlayers', onPlayers)
      socket.off('adminPanelPlayer', onPlayer)
      socket.off('adminPanelResult', onResult)
    }
  }, [socket, sessionInfo?.permission])

  useEffect(() => {
    if (socket && selectedId != null) socket.emit('adminPanelRequestPlayer', selectedId)
  }, [socket, selectedId])

  const actions = useMemo(() => buildActions(bootstrap, detail), [bootstrap, detail])
  const filteredPlayers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase()
    return !keyword ? players : players.filter(player => `${player.nickname} ${player.username} ${player.userId}`.toLocaleLowerCase().includes(keyword))
  }, [players, search])

  const closeDialog = useCallback(() => setActiveAction(null), [])
  const execute = (values: FormDialogValues) => {
    if (!socket || !activeAction) return '서버에 연결되어 있지 않습니다.'
    if (!activeAction.targetless && selectedId == null) return '대상 플레이어를 선택해주세요.'
    socket.emit('adminPanelExecute', {
      action: activeAction.action,
      ...(!activeAction.targetless && selectedId != null ? { targetUserId: selectedId } : {}),
      values,
    })
  }

  if (!sessionInfo) {
    return <main className={styles.denied}><h1>관리자 세션 확인 중…</h1></main>
  }

  if (sessionInfo.permission < 10) {
    return <main className={styles.denied}><h1>접근 권한 없음</h1><p>관리자 권한이 필요한 페이지입니다.</p><button onClick={() => navigate('/home')}>게임으로 돌아가기</button></main>
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p>운영 도구</p><h1>DaclionOnline 관리자</h1></div>
        <nav><button onClick={() => navigate('/home')}>게임으로</button><button onClick={() => navigate('/admin/locations')}>위치 편집기</button></nav>
      </header>
      <div className={styles.sectionTabs}>
        <button className={section === 'players' ? styles.activeTab : ''} onClick={() => setSection('players')}>플레이어 관리</button>
        <button className={section === 'world' ? styles.activeTab : ''} onClick={() => setSection('world')}>월드 관리</button>
        <button className={section === 'notice' ? styles.activeTab : ''} onClick={() => setSection('notice')}>공지 발송</button>
        <button className={section === 'balance' ? styles.activeTab : ''} onClick={() => setSection('balance')}>밸런스 분석</button>
      </div>

      {section === 'world' ? (
        <section className={styles.worldGrid}>
          {actions.filter(action => action.category === 'world').map(action => <button key={action.action} className={styles.actionCard} onClick={() => setActiveAction(action)}><b>{action.label}</b><span>{action.description}</span></button>)}
        </section>
      ) : section === 'notice' ? (
        <section className={styles.worldGrid}>
          {actions.filter(action => action.category === 'notice').map(action => <button key={action.action} className={styles.actionCard} onClick={() => setActiveAction(action)}><b>{action.label}</b><span>{action.description}</span></button>)}
        </section>
      ) : section === 'balance' ? (
        <section className={styles.worldGrid}>
          {actions.filter(action => action.category === 'balance').map(action => <button key={action.action} className={styles.actionCard} onClick={() => setActiveAction(action)}><b>{action.label}</b><span>{action.description}</span></button>)}
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.playerList}>
            <div className={styles.panelHeading}><h2>플레이어</h2><span>{players.filter(player => player.online).length}명 접속</span></div>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="닉네임, 계정, UID 검색" aria-label="플레이어 검색" />
            <div className={styles.playerScroll}>{filteredPlayers.map(player => (
              <button key={player.userId} className={selectedId === player.userId ? styles.selectedPlayer : ''} onClick={() => setSelectedId(player.userId)}>
                <span className={`${styles.onlineDot} ${player.online ? styles.online : ''}`} /><span><b>{player.nickname}</b><small>UID {player.userId} · Lv.{player.level}<br />{player.locationName}</small></span>
              </button>
            ))}</div>
          </aside>

          <section className={styles.detailPanel}>
            {!detail ? <div className={styles.empty}>플레이어를 선택해주세요.</div> : <>
              <header className={styles.playerHeader}><div><span className={`${styles.statusBadge} ${detail.online ? styles.onlineBadge : ''}`}>{detail.online ? '온라인' : '오프라인'}</span><h2>{detail.nickname}</h2><p>@{detail.username} · UID {detail.userId} · 권한 {detail.permission}</p></div><div><b>Lv.{detail.level}</b><span>{detail.exp.toLocaleString()} / {detail.maxExp.toLocaleString()} EXP</span></div></header>
              <div className={styles.detailScroll}>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}><h3>현재 상태</h3><Meter tone="life" label="생명력" value={detail.life} max={detail.maxLife} /><Meter tone="mentality" label="정신력" value={detail.mentality} max={detail.maxMentality} /><Meter tone="hunger" label="배고픔" value={detail.hungry} max={detail.maxHungry} /><Meter tone="thirst" label="수분" value={detail.thirsty} max={detail.maxThirsty} /></div>
                  <div className={`${styles.summaryCard} ${styles.overviewCard}`}>
                    <section><h3>진행 정보</h3><dl><dt>위치</dt><dd>{detail.locationName}</dd><dt>골드</dt><dd>{detail.gold.toLocaleString()}</dd><dt>스탯 포인트</dt><dd>{detail.statPoint}</dd><dt>직업</dt><dd>{detail.mainJobName} / {detail.subJobName}</dd><dt>엘리트</dt><dd>{detail.eliteJobName}</dd></dl></section>
                    <section><h3>보유 현황</h3><dl><dt>인벤토리</dt><dd>{detail.inventory.length}종</dd><dt>장비</dt><dd>{detail.equipment.length}개</dd><dt>스킬</dt><dd>{detail.skills.length}개</dd><dt>상태이상</dt><dd>{detail.statusEffects.length}개</dd></dl></section>
                  </div>
                </div>
                <details className={styles.inspect}><summary>인벤토리·장비 검사</summary><div className={`${styles.inspectGrid} ${styles.inspectBody}`}><div><h4>인벤토리</h4>{detail.inventory.length ? detail.inventory.map(item => <div key={item.index}><b>{item.index + 1}. {item.name} x{item.count}</b><code>{JSON.stringify(item.metadataDelta ?? {})}</code></div>) : <p>비어 있음</p>}</div><div><h4>장비</h4>{detail.equipment.map(item => <p key={`${item.slot}-${item.index}`}>{item.slotLabel}: {item.name}</p>)}</div></div></details>
                <details className={styles.inspect}><summary>스탯·스킬·상태이상 검사</summary><div className={`${styles.inspectGrid} ${styles.inspectBody}`}><div><h4>스탯</h4>{detail.stats.map(stat => <p key={stat.key}>{stat.label}: {stat.value}</p>)}</div><div><h4>스킬</h4>{detail.skills.map(skill => <p key={skill.id}>{skill.name} Lv.{skill.level} · EXP {skill.experience}</p>)}<h4>상태이상</h4>{detail.statusEffects.map(effect => <p key={effect.id}>{effect.label} Lv.{effect.level} · {effect.duration.toFixed(1)}초</p>)}</div></div></details>
              </div>
            </>}
          </section>

          <aside className={styles.actionsPanel}>
            <div className={styles.categoryTabs}>{(['travel', 'growth', 'inventory', 'skills', 'testing', 'communication'] as const).map(key => <button key={key} className={category === key ? styles.activeTab : ''} onClick={() => setCategory(key)}>{{ travel: '이동', growth: '성장', inventory: '인벤토리', skills: '스킬·효과', testing: '테스트', communication: '메시지' }[key]}</button>)}</div>
            <div className={styles.actionList}>{actions.filter(action => action.category === category).map(action => <button key={action.action} className={styles.actionCard} disabled={!detail} onClick={() => setActiveAction(action)}><b>{action.label}</b><span>{action.description}</span></button>)}</div>
          </aside>
        </div>
      )}

      {activeAction && <FormDialog open title={activeAction.label} description={activeAction.description} fields={activeAction.fields} danger={activeAction.danger} submitLabel={activeAction.danger ? '확인 후 실행' : '실행'} onClose={closeDialog} onSubmit={execute} />}
      <Dialog
        open={Boolean(report?.details)}
        title={report?.message ?? '밸런스 분석 결과'}
        onClose={() => setReport(null)}
        className={styles.reportDialog}
        footer={<button className={styles.reportClose} type="button" onClick={() => setReport(null)}>확인</button>}
      >
        <pre className={styles.balanceReport}>{report?.details}</pre>
      </Dialog>
    </main>
  )
}
