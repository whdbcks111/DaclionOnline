// 서버-클라이언트 공통 타입 정의
import type { TagId } from './tags.js'
import type {
    MiniGameCancelledData,
    MiniGameResolvedData,
    MiniGameResultRequest,
    MiniGameStartData,
} from './minigames.js'

// -- 위치 데이터 (서버-클라이언트 공유) --

export type ZoneType = 'safe' | 'neutral' | 'hostile'

export type LocationObjectType = 'monster' | 'resource'

export interface LocationObjectSpawnInfo {
    type: LocationObjectType
    dataId: string
    maxCount: number
    respawnTime: number
}

export interface ConnectionInfo {
    locationId: string
    condition?: string
}

export interface LocationData {
    id: string
    name: string
    zoneType: ZoneType
    x: number
    y: number
    z: number
    isRespawnLocation?: boolean
    shopId?: string
    npcIds: string[]
    objects: LocationObjectSpawnInfo[]
    connections: ConnectionInfo[]
    tags: TagId[]
    /** 지도에서 점 대신 표시할 /icons/map/{key}.png 랜드마크 아이콘 */
    mapIcon?: string
    /** 지도 배경에서 방문 장소와 연결 경로를 하나의 영역으로 묶는 대표 바이옴 색상 (#RRGGBB) */
    mapColor?: string
}

export interface WorldMapLocationData {
    id: string
    name: string
    zoneType: ZoneType
    zoneLabel: string
    x: number
    y: number
    z: number
    visited: boolean
    current: boolean
    mapIcon?: string
    mapColor?: string
}

export interface WorldMapConnectionData {
    from: string
    to: string
    discovered: boolean
}

/** 지도 ChatNode가 담는 플레이어별 공개 범위 스냅샷 */
export interface WorldMapData {
    locations: WorldMapLocationData[]
    connections: WorldMapConnectionData[]
}

// 소켓 이벤트 데이터 타입
export interface SessionRestoreData {
    userId: number
    username: string
    nickname: string
    profileImage?: string
    permission?: number
}

export interface LoginRequest {
    id: string
    pw: string
}

export interface LoginResult {
    ok?: boolean
    userId?: number
    sessionToken?: string
    nickname?: string
    profileImage?: string
    permission?: number
    error?: string
}

export interface RegisterRequest {
    id: string
    pw: string
    email: string
    nickname: string
}

export interface RegisterResult {
    ok?: boolean
    sessionToken?: string
    error?: string
    needVerify?: boolean
}

export interface LogoutResult {
    ok: boolean
}

export interface SimpleResult {
    ok?: boolean
    error?: string
}

// 채팅 노드 타입 (커스텀 문법 파싱 결과)
export type ChatNode =
    | { type: 'text'; text: string }
    | { type: 'color'; color: string; children: ChatNode[] }
    | { type: 'bg'; color: string; children: ChatNode[] }
    | { type: 'deco'; decoration: string; children: ChatNode[] }
    | { type: 'weight'; weight: string; children: ChatNode[] }
    | { type: 'size'; size: string; children: ChatNode[] }
    | { type: 'hide'; title: string; children: ChatNode[] }
    | { type: 'icon'; name: string }
    | { type: 'button'; action: string; children: ChatNode[]; closeOnClick?: boolean; showCommand?: boolean }
    | { type: 'progress'; value: number; length: number | string; color: string; thickness: number; shape: 'rounded' | 'square' }
    | { type: 'health'; life: number; maxLife: number; shields: ShieldBarSegment[]; length: number | string; color: string; thickness: number; shape: 'rounded' | 'square' }
    | { type: 'image'; src: string; alt: string; maxHeight: number | string; width?: number; height?: number }
    | { type: 'divider'; title?: string }
    | { type: 'tab'; width: number; children: ChatNode[] }
    | { type: 'tooltip'; description: ChatNode[]; children: ChatNode[] }
    | { type: 'worldMap'; data: WorldMapData }

// 채팅 플래그 (닉네임 옆 배지)
export interface ChatFlag {
    text: string
    color: string
}

// 채팅 메시지
export interface ChatMessage {
    id?: string
    userId: number
    nickname: string
    profileImage?: string
    flags?: ChatFlag[]
    content: string | ChatNode[]
    timestamp: number
    private?: boolean
}

/** 자동완성 항목 (값만 또는 값+설명) */
export type CompletionItem = string | { value: string; description?: string }

// 명령어 정보 (자동완성용)
export interface CommandArgInfo {
    name: string
    description: string
    required?: boolean
    /** 띄어쓰기를 포함하는 긴 텍스트 파라미터 (명령어당 최대 1개) */
    isText?: boolean
    /** 자동완성 후보 목록 (정적) */
    completions?: CompletionItem[]
    /** true이면 자동완성이 서버에서 동적으로 계산됨 (requestCompletions 이벤트 사용) */
    dynamicCompletions?: boolean
}

export interface CommandInfo {
    name: string
    aliases?: string[]
    description: string
    args?: CommandArgInfo[]
}

// 채널 정보
export interface ChannelInfo {
    id: string | null
    name: string
    description?: string
}

// 온라인 유저 수 데이터
export interface UserCountData {
    total: number
    channelCounts: Record<string, number>  // room key (e.g. 'channel:main') → 중복 없는 사용자 수
}

// 엔티티 HP 바 정보 (위치 HUD용)
export interface EntityBarInfo {
    name: string
    level: number
    life: number
    maxLife: number
    shields: ShieldBarSegment[]
    userId?: number  // 플레이어만 존재
}

// 인접 위치 데이터 (미니맵용)
export interface AdjacentLocationData {
    locationId: string
    name: string
    x: number
    y: number
    z: number
    status: 'visible' | 'locked'
    lockReason?: string
}

// 위치 정보 HUD 데이터
export interface SnapshotRevision {
    /** 같은 syncId 안에서 내용이 바뀔 때만 증가한다. */
    revision: number
    /** 서버 stream 재생성·재시작 시 바뀌어 낮은 revision도 새 snapshot으로 인정하게 한다. */
    syncId: string
}

export interface LocationInfoData extends SnapshotRevision {
    locationId: string
    name: string
    zoneType: ZoneType
    zoneLabel: string
    pvpAllowed: boolean
    x: number
    y: number
    z: number
    objects: EntityBarInfo[]
    players: EntityBarInfo[]
    adjacentLocations: AdjacentLocationData[]
}

// 플레이어 HUD 데이터
export interface StatusEffectHudData {
    id: string
    label: string
    icon: string
    level: number
    duration: number
    maxDuration: number
    durationRatio: number
    description: ChatNode[]
}

export interface PartyMemberHudData {
    userId: number
    nickname: string
    level: number
    life: number
    maxLife: number
    shields: ShieldBarSegment[]
    mentality: number
    maxMentality: number
    isLeader: boolean
    sameLocation: boolean
}

export interface PartyHudData {
    partyId: string
    leaderUserId: number
    members: PartyMemberHudData[]
}

export type ShieldTypeKey = 'general' | 'physical' | 'magic'

export interface ShieldBarSegment {
    type: ShieldTypeKey
    amount: number
    color: string
}

export interface SkillHudData {
    id: string
    name: string
    icon: string
    level: number
    isActive: boolean
    remainingCooldown: number
    maxCooldown: number
}

export interface PlayerStatsData extends SnapshotRevision {
    userId: number
    nickname: string
    level: number
    life: number
    maxLife: number
    shields: ShieldBarSegment[]
    mentality: number
    maxMentality: number
    thirsty: number
    maxThirsty: number
    hungry: number
    maxHungry: number
    attackCooldown: number
    maxAttackCooldown: number
    skills: SkillHudData[]
    statusEffects: StatusEffectHudData[]
    party: PartyHudData | null
}

// 알림
export interface NotificationData {
    key: string
    message: string | ChatNode[]
    length?: number
    showProgress?: boolean
    editExists?: boolean
}

export interface AdminOptionData {
    value: string
    label: string
    description?: string
}

export interface AdminPanelBootstrapData {
    items: AdminOptionData[]
    balanceItems: AdminOptionData[]
    skills: AdminOptionData[]
    jobs: AdminOptionData[]
    locations: AdminOptionData[]
    monsters: AdminOptionData[]
    resources: AdminOptionData[]
    statusEffects: AdminOptionData[]
    stats: AdminOptionData[]
    miniGamePresets: AdminOptionData[]
}

export interface AdminPlayerListItem {
    userId: number
    username: string
    nickname: string
    permission: number
    online: boolean
    level: number
    locationId: string
    locationName: string
}

export interface AdminInventoryItemData {
    index: number
    id: number
    itemDataId: string
    name: string
    count: number
    durability: number | null
    maxDurability: number | null
    metadataDelta: Record<string, unknown> | null
}

export interface AdminPlayerDetailData extends AdminPlayerListItem {
    exp: number
    maxExp: number
    gold: number
    statPoint: number
    life: number
    maxLife: number
    mentality: number
    maxMentality: number
    thirsty: number
    maxThirsty: number
    hungry: number
    maxHungry: number
    mainJobId: string
    mainJobName: string
    subJobId: string
    subJobName: string
    eliteJobName: string
    stats: Array<{ key: string; label: string; value: number }>
    inventory: AdminInventoryItemData[]
    equipment: Array<{ slot: string; slotLabel: string; index: number; itemDataId: string; name: string }>
    skills: Array<{ id: string; name: string; level: number; experience: number }>
    statusEffects: Array<{ id: string; label: string; level: number; duration: number }>
}

export type AdminPanelAction =
    | 'broadcast_chat_notice' | 'broadcast_notification' | 'notify_player'
    | 'teleport_admin_to_player' | 'teleport_player_to_admin' | 'teleport_player_location'
    | 'grant_item' | 'remove_item' | 'clear_inventory' | 'set_item_metadata'
    | 'grant_skill' | 'set_skill_level' | 'remove_skill' | 'set_jobs'
    | 'set_level' | 'set_stat_points' | 'set_stat' | 'set_gold' | 'set_vital'
    | 'unlock_all_locations' | 'unlock_all_crafting_recipes'
    | 'apply_status_effect' | 'clear_status_effects' | 'revive_player'
    | 'start_minigame'
    | 'analyze_skill_balance' | 'analyze_job_balance' | 'analyze_item_balance'
    | 'spawn_monster' | 'respawn_monsters' | 'reset_resource_cooldown'

export interface AdminPanelActionRequest {
    action: AdminPanelAction
    targetUserId?: number
    values?: Record<string, string | number | boolean | null>
}

export interface AdminPanelResult extends SimpleResult {
    action: AdminPanelAction
    targetUserId?: number
    message?: string
    /** 별도 결과 다이얼로그로 표시할 긴 읽기 전용 보고서. */
    details?: string
}

// 소켓 이벤트 맵
export interface ServerToClientEvents {
    sessionRestore: (data: SessionRestoreData) => void
    sessionInvalid: () => void
    loginResult: (result: LoginResult) => void
    registerResult: (result: RegisterResult) => void
    logoutResult: (result: LogoutResult) => void
    verifyCodeSendResult: (result: SimpleResult) => void
    verifyCodeResult: (result: SimpleResult) => void
    chatHistory: (messages: ChatMessage[]) => void
    chatMessage: (msg: ChatMessage) => void
    notification: (data: NotificationData) => void
    commandList: (commands: CommandInfo[]) => void
    argCompletions: (items: CompletionItem[]) => void
    mentionCompletions: (items: CompletionItem[]) => void
    playerStats: (data: PlayerStatsData) => void
    informationMode: (isPublic: boolean) => void
    locationInfo: (data: LocationInfoData) => void
    userCount: (data: UserCountData) => void
    channelChanged: (channel: string | null, history: ChatMessage[]) => void
    channelList: (channels: ChannelInfo[]) => void
    nicknameResult: (result: SimpleResult & { nickname?: string }) => void
    editMessage: (id: string, content: ChatMessage['content']) => void
    deleteMessage: (id: string) => void
    adminLocations: (data: LocationData[]) => void
    adminSaveResult: (result: SimpleResult) => void
    adminPanelBootstrap: (data: AdminPanelBootstrapData) => void
    adminPanelPlayers: (data: AdminPlayerListItem[]) => void
    adminPanelPlayer: (data: AdminPlayerDetailData | null) => void
    adminPanelResult: (result: AdminPanelResult) => void
    miniGameStart: (data: MiniGameStartData) => void
    miniGameResolved: (data: MiniGameResolvedData) => void
    miniGameCancelled: (data: MiniGameCancelledData) => void
}

export interface ClientToServerEvents {
    login: (data: LoginRequest) => void
    register: (data: RegisterRequest) => void
    logout: (token: string) => void
    sendVerifyCode: (email: string) => void
    verifyCode: (code: string) => void
    sendMessage: (content: string) => void
    sendImageMessage: (payload: { filename: string }) => void
    chatButtonClick: (payload: { action: string; showCommand?: boolean }) => void
    requestChatHistory: () => void
    requestCommandList: () => void
    requestUserCount: () => void
    joinChannel: (channel: string | null) => void
    requestChannelList: () => void
    changeNickname: (nickname: string) => void
    requestLocationInfo: () => void
    requestCompletions: (raw: string) => void
    requestMentionCompletions: (query: string) => void
    requestInformationMode: () => void
    setInformationMode: (isPublic: boolean) => void
    adminRequestLocations: () => void
    adminSaveLocations: (locations: LocationData[]) => void
    adminPanelRequestBootstrap: () => void
    adminPanelRequestPlayers: () => void
    adminPanelRequestPlayer: (userId: number) => void
    adminPanelExecute: (request: AdminPanelActionRequest) => void
    miniGameResult: (request: MiniGameResultRequest) => void
}
