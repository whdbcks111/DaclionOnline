import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, RefObject, MouseEvent as RMouseEvent, WheelEvent as RWheelEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LocationData, ZoneType, SpawnInfo } from '@shared/types'
import { useSocket } from '../context/SocketContext'
import styles from './LocationEditor.module.scss'

// ---------- 상수 ----------

const NODE_RADIUS = 8
const ZOOM_MIN = 0.05
const ZOOM_MAX = 20

// ---------- 유틸 ----------

function uid(): string {
  return `loc_${Date.now()}_${Math.floor(Math.random() * 1000)}`
}

function getConnectionKey(a: string, b: string): string {
  return [a, b].sort().join('--')
}

// ---------- 타입 ----------

interface ContextMenu {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

// ---------- 컴포넌트 ----------

export default function LocationEditor() {
  const { socket, sessionInfo } = useSocket()
  const navigate = useNavigate()

  // --- 상태 ---
  const [locations, setLocations] = useState<LocationData[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [saveMsg, setSaveMsg] = useState('')

  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    startX: number; startY: number
    panX: number; panY: number
    moved: boolean
    nodeId?: string
    nodeStartX?: number; nodeStartY?: number
  } | null>(null)
  const fitDoneRef = useRef(false)

  // --- 권한 체크 ---
  useEffect(() => {
    if (sessionInfo && sessionInfo.permission < 10) {
      navigate('/home', { replace: true })
    }
  }, [sessionInfo, navigate])

  // --- 소켓 이벤트 ---
  useEffect(() => {
    if (!socket) return

    const onLocations = (data: LocationData[]) => {
      setLocations(data)
    }

    const onSaveResult = (result: { ok?: boolean; error?: string }) => {
      if (result.ok) {
        setSaveStatus('ok')
        setSaveMsg('저장 완료')
      } else {
        setSaveStatus('error')
        setSaveMsg(result.error ?? '저장 실패')
      }
      setTimeout(() => setSaveStatus('idle'), 2500)
    }

    socket.on('adminLocations', onLocations)
    socket.on('adminSaveResult', onSaveResult)
    socket.emit('adminRequestLocations')

    return () => {
      socket.off('adminLocations', onLocations)
      socket.off('adminSaveResult', onSaveResult)
    }
  }, [socket])

  // --- 로드 후 자동 fit ---
  useEffect(() => {
    if (locations.length === 0 || fitDoneRef.current) return
    fitDoneRef.current = true
    fitView(locations)
  }, [locations]) // eslint-disable-line

  // --- 좌표 변환 ---
  const getSVGPoint = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const toWorld = useCallback((screenX: number, screenY: number) => ({
    x: Math.round((screenX - pan.x) / zoom),
    y: -Math.round((screenY - pan.y) / zoom),
  }), [pan, zoom])

  // --- fit view ---
  function fitView(locs: LocationData[]) {
    if (locs.length === 0 || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (!rect.width) return

    const xs = locs.map(l => l.x)
    const ys = locs.map(l => l.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)

    const pad = 100
    const rangeX = maxX - minX || 200
    const rangeY = maxY - minY || 200

    const newZoom = Math.min(
      (rect.width - pad * 2) / rangeX,
      (rect.height - pad * 2) / rangeY,
      3,
    )
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    setZoom(newZoom)
    setPan({
      x: rect.width / 2 - cx * newZoom,
      y: rect.height / 2 + cy * newZoom, // y 반전
    })
  }

  // --- 마우스 이벤트 (팬) ---
  const onMouseDown = useCallback((e: RMouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const p = getSVGPoint(e)
    dragRef.current = { startX: p.x, startY: p.y, panX: pan.x, panY: pan.y, moved: false }
  }, [getSVGPoint, pan])

  const onMouseMove = useCallback((e: RMouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const p = getSVGPoint(e)
    const dx = p.x - drag.startX
    const dy = p.y - drag.startY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
    if (!drag.moved) return

    if (drag.nodeId) {
      // 노드 드래그 → 게임 좌표 갱신
      const newX = Math.round((drag.nodeStartX ?? 0) + dx / zoom)
      const newY = Math.round((drag.nodeStartY ?? 0) - dy / zoom) // y 반전
      setLocations(prev => prev.map(l => l.id === drag.nodeId ? { ...l, x: newX, y: newY } : l))
    } else {
      // 배경 드래그 → 팬
      setPan({ x: drag.panX + dx, y: drag.panY + dy })
    }
  }, [getSVGPoint, zoom])

  const onMouseUp = useCallback((e: RMouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.moved) {
      // 배경 클릭 → 선택 해제
      if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'rect') {
        setSelectedId(null)
        setContextMenu(null)
      }
    }
  }, [])

  // --- 휠 줌 ---
  const onWheel = useCallback((e: RWheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const p = getSVGPoint(e)
    setZoom(prev => {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * factor))
      setPan(pp => ({
        x: p.x - (p.x - pp.x) * (next / prev),
        y: p.y - (p.y - pp.y) * (next / prev),
      }))
      return next
    })
  }, [getSVGPoint])

  // --- 우클릭 컨텍스트 메뉴 ---
  const onContextMenu = useCallback((e: RMouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const p = getSVGPoint(e)
    const w = toWorld(p.x, p.y)
    setContextMenu({ screenX: p.x, screenY: p.y, worldX: w.x, worldY: w.y })
  }, [getSVGPoint, toWorld])

  // --- 위치 추가 ---
  const addLocation = useCallback(() => {
    if (!contextMenu) return
    const newLoc: LocationData = {
      id: uid(),
      name: '새 위치',
      zoneType: 'safe',
      x: contextMenu.worldX,
      y: contextMenu.worldY,
      z: 0,
      spawns: [],
      connections: [],
    }
    setLocations(prev => [...prev, newLoc])
    setSelectedId(newLoc.id)
    setContextMenu(null)
  }, [contextMenu])

  // --- 위치 선택 ---
  const selectLocation = useCallback((e: RMouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedId(id)
    setContextMenu(null)
  }, [])

  // --- 노드 드래그 시작 ---
  const onNodeMouseDown = useCallback((e: RMouseEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation() // 배경 팬 방지
    const p = getSVGPoint(e)
    const loc = locations.find(l => l.id === id)
    if (!loc) return
    dragRef.current = {
      startX: p.x, startY: p.y,
      panX: pan.x, panY: pan.y,
      moved: false,
      nodeId: id,
      nodeStartX: loc.x,
      nodeStartY: loc.y,
    }
    setSelectedId(id)
    setContextMenu(null)
  }, [getSVGPoint, pan, locations])

  // --- 선택된 위치 수정 헬퍼 ---
  const updateSelected = useCallback((patch: Partial<LocationData>) => {
    setLocations(prev => prev.map(l => l.id === selectedId ? { ...l, ...patch } : l))
    if (patch.id !== undefined) setSelectedId(patch.id)
  }, [selectedId])

  // --- 연결 관리 ---
  const addConnection = useCallback((targetId: string) => {
    setLocations(prev => prev.map(l => {
      if (l.id !== selectedId) return l
      if (l.connections.some(c => c.locationId === targetId)) return l
      return { ...l, connections: [...l.connections, { locationId: targetId }] }
    }))
  }, [selectedId])

  const removeConnection = useCallback((targetId: string) => {
    setLocations(prev => prev.map(l => {
      if (l.id !== selectedId) return l
      return { ...l, connections: l.connections.filter(c => c.locationId !== targetId) }
    }))
  }, [selectedId])

  // --- 스폰 관리 ---
  const addSpawn = useCallback(() => {
    updateSelected({
      spawns: [...(locations.find(l => l.id === selectedId)?.spawns ?? []), { monsterDataId: '', maxCount: 1, respawnTime: 30 }],
    })
  }, [updateSelected, locations, selectedId])

  const updateSpawn = useCallback((index: number, patch: Partial<SpawnInfo>) => {
    setLocations(prev => prev.map(l => {
      if (l.id !== selectedId) return l
      const spawns = l.spawns.map((s, i) => i === index ? { ...s, ...patch } : s)
      return { ...l, spawns }
    }))
  }, [selectedId])

  const removeSpawn = useCallback((index: number) => {
    setLocations(prev => prev.map(l => {
      if (l.id !== selectedId) return l
      return { ...l, spawns: l.spawns.filter((_, i) => i !== index) }
    }))
  }, [selectedId])

  // --- 위치 삭제 ---
  const deleteSelected = useCallback(() => {
    setLocations(prev => prev.filter(l => l.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  // --- 저장 ---
  const save = useCallback(() => {
    if (!socket) return
    setSaveStatus('saving')
    socket.emit('adminSaveLocations', locations)
  }, [socket, locations])

  // --- 연결선 중복 제거용 Set ---
  const drawnConnections = new Set<string>()

  const selectedLoc = locations.find(l => l.id === selectedId)
  const otherLocations = locations.filter(l => l.id !== selectedId)

  return (
    <div className={styles.root}>
      {/* 상단 툴바 */}
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate('/home')}>← 홈</button>
        <span className={styles.title}>위치 편집기</span>
        <div className={styles.toolbarRight}>
          {saveStatus !== 'idle' && (
            <span className={`${styles.saveMsg} ${styles[saveStatus]}`}>{saveMsg}</span>
          )}
          <button
            className={styles.saveBtn}
            onClick={save}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {/* SVG 지도 */}
        <svg
          ref={svgRef}
          className={styles.map}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { dragRef.current = null }}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        >
          {/* 배경 클릭 영역 */}
          <rect x="-100000" y="-100000" width="200000" height="200000" fill="transparent" />

          {/* 격자 */}
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <GridLines pan={pan} zoom={zoom} svgRef={svgRef} />

            {/* 연결선 */}
            {locations.map(loc =>
              loc.connections.map(conn => {
                const key = getConnectionKey(loc.id, conn.locationId)
                if (drawnConnections.has(key)) return null
                drawnConnections.add(key)
                const target = locations.find(l => l.id === conn.locationId)
                if (!target) return null
                return (
                  <line
                    key={key}
                    x1={loc.x} y1={-loc.y}
                    x2={target.x} y2={-target.y}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={1.5 / zoom}
                  />
                )
              })
            )}

            {/* 선택된 노드의 연결선 강조 */}
            {selectedLoc && selectedLoc.connections.map(conn => {
              const target = locations.find(l => l.id === conn.locationId)
              if (!target) return null
              return (
                <line
                  key={`sel-${conn.locationId}`}
                  x1={selectedLoc.x} y1={-selectedLoc.y}
                  x2={target.x} y2={-target.y}
                  stroke="var(--color-primary)"
                  strokeWidth={2 / zoom}
                  strokeOpacity={0.8}
                />
              )
            })}

            {/* 노드 */}
            {locations.map(loc => {
              const isSelected = loc.id === selectedId
              const isSafe = loc.zoneType === 'safe'
              return (
                <g key={loc.id} onMouseDown={e => onNodeMouseDown(e, loc.id)} onClick={e => selectLocation(e, loc.id)} style={{ cursor: 'grab' }}>
                  {/* 선택 헤일로 */}
                  {isSelected && (
                    <circle
                      cx={loc.x} cy={-loc.y}
                      r={(NODE_RADIUS + 5) / zoom}
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth={2 / zoom}
                    />
                  )}
                  {/* 노드 원 */}
                  <circle
                    cx={loc.x} cy={-loc.y}
                    r={NODE_RADIUS / zoom}
                    fill={isSelected ? 'var(--color-primary)' : isSafe ? '#4ab8ae99' : '#e74c3c99'}
                    stroke={isSelected ? 'white' : isSafe ? 'var(--color-primary)' : '#e74c3c'}
                    strokeWidth={1.5 / zoom}
                  />
                  {/* 레이블 */}
                  <text
                    x={loc.x} y={-loc.y - (NODE_RADIUS + 4) / zoom}
                    textAnchor="middle"
                    fill="white"
                    fontSize={11 / zoom}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {loc.name}
                  </text>
                  {/* 좌표 */}
                  <text
                    x={loc.x} y={-loc.y + (NODE_RADIUS + 11) / zoom}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.45)"
                    fontSize={8 / zoom}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    ({loc.x}, {loc.y})
                  </text>
                </g>
              )
            })}
          </g>

          {/* 우클릭 컨텍스트 메뉴 (SVG 오버레이) */}
          {contextMenu && (
            <foreignObject
              x={contextMenu.screenX}
              y={contextMenu.screenY}
              width={160}
              height={60}
              style={{ overflow: 'visible' }}
            >
              <div className={styles.ctxMenu}>
                <button
                  className={styles.ctxItem}
                  onClick={addLocation}
                  onMouseDown={e => e.stopPropagation()}
                >
                  새 위치 추가<br />
                  <small>({contextMenu.worldX}, {contextMenu.worldY})</small>
                </button>
              </div>
            </foreignObject>
          )}
        </svg>

        {/* 우측 속성 패널 */}
        {selectedLoc && (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>위치 속성</span>
              <button className={styles.closeBtn} onClick={() => setSelectedId(null)}>✕</button>
            </div>

            <div className={styles.panelBody}>
              <label className={styles.field}>
                <span>ID</span>
                <input
                  className={styles.input}
                  value={selectedLoc.id}
                  onChange={e => updateSelected({ id: e.target.value })}
                />
              </label>

              <label className={styles.field}>
                <span>이름</span>
                <input
                  className={styles.input}
                  value={selectedLoc.name}
                  onChange={e => updateSelected({ name: e.target.value })}
                />
              </label>

              <label className={styles.field}>
                <span>구역 타입</span>
                <select
                  className={styles.input}
                  value={selectedLoc.zoneType}
                  onChange={e => updateSelected({ zoneType: e.target.value as ZoneType })}
                >
                  <option value="safe">safe (안전 구역)</option>
                  <option value="normal">normal (일반 구역)</option>
                </select>
              </label>

              <label className={styles.fieldRow}>
                <input
                  type="checkbox"
                  checked={!!selectedLoc.isRespawnLocation}
                  onChange={e => updateSelected({ isRespawnLocation: e.target.checked })}
                />
                <span>리스폰 위치</span>
              </label>

              <div className={styles.coordRow}>
                <label className={styles.fieldSmall}>
                  <span>X</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={selectedLoc.x}
                    onChange={e => updateSelected({ x: Number(e.target.value) })}
                  />
                </label>
                <label className={styles.fieldSmall}>
                  <span>Y</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={selectedLoc.y}
                    onChange={e => updateSelected({ y: Number(e.target.value) })}
                  />
                </label>
                <label className={styles.fieldSmall}>
                  <span>Z</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={selectedLoc.z}
                    onChange={e => updateSelected({ z: Number(e.target.value) })}
                  />
                </label>
              </div>

              {/* 연결 */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>연결된 위치</div>
                {selectedLoc.connections.map(conn => {
                  const target = locations.find(l => l.id === conn.locationId)
                  return (
                    <div key={conn.locationId} className={styles.listRow}>
                      <span className={styles.connName}>
                        {target ? target.name : <em className={styles.missing}>{conn.locationId} (없음)</em>}
                      </span>
                      <span className={styles.connId}>{conn.locationId}</span>
                      <button
                        className={styles.removeBtn}
                        onClick={() => removeConnection(conn.locationId)}
                      >✕</button>
                    </div>
                  )
                })}
                <select
                  className={`${styles.input} ${styles.addSelect}`}
                  value=""
                  onChange={e => { if (e.target.value) addConnection(e.target.value) }}
                >
                  <option value="">+ 연결 추가...</option>
                  {otherLocations
                    .filter(l => !selectedLoc.connections.some(c => c.locationId === l.id))
                    .map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
                    ))
                  }
                </select>
              </div>

              {/* 스폰 */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>몬스터 스폰</div>
                {selectedLoc.spawns.map((spawn, i) => (
                  <div key={i} className={styles.spawnRow}>
                    <input
                      className={styles.input}
                      placeholder="monster ID"
                      value={spawn.monsterDataId}
                      onChange={e => updateSpawn(i, { monsterDataId: e.target.value })}
                    />
                    <input
                      className={styles.inputSmall}
                      type="number"
                      min={1}
                      title="최대 수"
                      value={spawn.maxCount}
                      onChange={e => updateSpawn(i, { maxCount: Number(e.target.value) })}
                    />
                    <input
                      className={styles.inputSmall}
                      type="number"
                      min={1}
                      title="리스폰(초)"
                      value={spawn.respawnTime}
                      onChange={e => updateSpawn(i, { respawnTime: Number(e.target.value) })}
                    />
                    <button className={styles.removeBtn} onClick={() => removeSpawn(i)}>✕</button>
                  </div>
                ))}
                <button className={styles.addBtn} onClick={addSpawn}>+ 스폰 추가</button>
              </div>

              <button className={styles.deleteBtn} onClick={deleteSelected}>위치 삭제</button>
            </div>
          </div>
        )}
      </div>

      {/* 줌 표시 */}
      <div className={styles.zoomBadge}>{Math.round(zoom * 100)}%</div>
    </div>
  )
}

// ---------- 격자 ----------

function GridLines({
  pan,
  zoom,
  svgRef,
}: {
  pan: { x: number; y: number }
  zoom: number
  svgRef: RefObject<SVGSVGElement | null>
}) {
  const rect = svgRef.current?.getBoundingClientRect()
  if (!rect) return null

  const W = rect.width
  const H = rect.height

  // 격자 간격: 월드 좌표 기준 자동 조정
  let gridSize = 50
  if (zoom < 0.3) gridSize = 500
  else if (zoom < 0.7) gridSize = 200
  else if (zoom < 1.5) gridSize = 100
  else if (zoom > 4) gridSize = 20

  // 화면에 보이는 월드 범위
  const left = (-pan.x) / zoom
  const top = (-pan.y) / zoom
  const right = (W - pan.x) / zoom
  const bottom = (H - pan.y) / zoom

  const startX = Math.floor(left / gridSize) * gridSize
  const endX = Math.ceil(right / gridSize) * gridSize
  const startY = Math.floor(top / gridSize) * gridSize
  const endY = Math.ceil(bottom / gridSize) * gridSize

  const lines: JSX.Element[] = []

  for (let x = startX; x <= endX; x += gridSize) {
    const isAxis = x === 0
    lines.push(
      <line
        key={`vx${x}`}
        x1={x} y1={top} x2={x} y2={bottom}
        stroke={isAxis ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}
        strokeWidth={isAxis ? 1.5 / zoom : 0.8 / zoom}
      />
    )
  }

  for (let y = startY; y <= endY; y += gridSize) {
    const isAxis = y === 0
    lines.push(
      <line
        key={`hy${y}`}
        x1={left} y1={-y} x2={right} y2={-y}
        stroke={isAxis ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}
        strokeWidth={isAxis ? 1.5 / zoom : 0.8 / zoom}
      />
    )
  }

  return <>{lines}</>
}
