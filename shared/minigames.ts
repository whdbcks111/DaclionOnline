export type MiniGameType = 'fishing_capture' | 'hazard_dodge' | 'forge_rhythm'
export type FishingCaptureShape = 'circle' | 'square' | 'rectangle'
export type HazardDodgeMode = 'bombs' | 'lasers' | 'mixed' | 'chain_bombs' | 'resonance' | 'crossfire'
export type HazardDodgeTheme = 'neutral' | 'crystal' | 'ironroot' | 'astral'

export interface MiniGameInputSample {
    /** 미니게임 시작 후 경과 시간(ms) */
    at: number
    /** -1~1 수평 입력 */
    x: number
    /** -1~1 수직 입력 */
    y: number
}

export interface MiniGameActionSample {
    /** 미니게임 시작 후 경과 시간(ms) */
    at: number
    action: 'strike'
}

/** 서버 20ms 재생 해상도에 맞춰 같은 구간의 연속 입력을 하나로 합친다. */
export const MINIGAME_INPUT_SAMPLE_INTERVAL_MS = 20
/** 현재 최장 낚시 미니게임(30초)의 모든 20ms 구간을 충분히 담는 상한이다. */
export const MAX_MINIGAME_INPUT_SAMPLES = 2_048
/** 보스 위험 회피가 사용하는 공용 난이도 상한. 7~10은 후반 보스 전용 밀도다. */
export const MAX_HAZARD_DODGE_DIFFICULTY = 10
/** 저사양 터치 화면에서 마지막으로 그려진 note와 입력 시각 차이를 허용하는 최대 보정값. */
export const MAX_FORGE_TOUCH_VISUAL_LAG_MS = 140

export function appendMiniGameInputSample(
    inputs: MiniGameInputSample[],
    sample: MiniGameInputSample,
): void {
    const lastIndex = inputs.length - 1
    const previous = inputs[lastIndex]
    if (previous && Math.floor(previous.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS)
        === Math.floor(sample.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS)) {
        inputs[lastIndex] = sample
        return
    }
    if (inputs.length < MAX_MINIGAME_INPUT_SAMPLES) inputs.push(sample)
    else inputs[lastIndex] = sample
}

/** 전송 이후 UI 입력이 원본 배열을 변경해도 payload가 변하지 않는 결과 snapshot. */
export function snapshotMiniGameInputs(
    inputs: readonly MiniGameInputSample[],
    elapsedMs: number,
): MiniGameInputSample[] {
    return inputs
        .filter(input => input.at <= elapsedMs)
        .map(input => ({ ...input }))
}

export interface FishingCaptureConfig {
    seed: number
    durationMs: number
    rarityLabel: string
    rarityColor: string
    fishIcon: string
    difficulty: number
    netShape: FishingCaptureShape
    netWidth: number
    netHeight: number
    netSpeed: number
    initialGauge: number
    fillPerSecond: number
    drainPerSecond: number
}

export interface HazardDodgeConfig {
    seed: number
    durationMs: number
    /** 실제 보스 패턴명 또는 관리자 테스트 프리셋명. */
    label: string
    mode: HazardDodgeMode
    theme: HazardDodgeTheme
    difficulty: number
    playerLabel: string
    /** 보드 너비 대비 초당 이동 비율. 실제 이동속도 능력치에서 계산한다. */
    playerSpeed: number
    playerSize: number
    telegraphMs: number
}

export interface ForgeRhythmConfig {
    durationMs: number
    label: string
    /** 1~10. 엇박·연속박자 밀도와 UI 표시에 사용한다. */
    difficulty: number
    /** 어려운 패턴을 완료했을 때 최종 단조 품질에 더하는 보정값. */
    qualityBonus: number
    /** 망치를 내려쳐야 하는 서버 기준 시각 목록. */
    beatTimesMs: number[]
    hitWindowMs: number
    perfectWindowMs: number
    requiredAccuracy: number
}

/** 난이도에 따라 정박, 엇박, 연속 타격을 섞은 확정 beat 목록을 만든다. */
export function createForgeBeatTimesMs(
    intervalMs: number,
    difficulty: number,
    count = 16,
    firstBeatMs = 1_200,
): number[] {
    const level = clamp(Math.round(difficulty), 1, 10)
    const patterns = level >= 7
        ? [1, 0.5, 0.5, 1.25, 0.75, 1, 0.5, 0.5, 1.5, 0.75]
        : level >= 5
            ? [1, 0.75, 1.25, 0.5, 0.5, 1, 1.5, 0.75]
            : level >= 3
                ? [1, 1, 0.75, 1.25, 1, 0.75, 1.25]
                : [1, 1, 1, 1]
    const beats = [Math.max(0, Math.round(firstBeatMs))]
    const safeInterval = Math.max(260, intervalMs)
    while (beats.length < Math.max(1, Math.floor(count))) {
        const multiplier = patterns[(beats.length - 1) % patterns.length]
        beats.push(beats.at(-1)! + Math.round(safeInterval * multiplier))
    }
    return beats
}

export function calculateForgeQualityScore(config: ForgeRhythmConfig, accuracy: number): number {
    return clamp(accuracy + Math.max(0, config.qualityBonus), 0, 1)
}

/**
 * 터치 사용자는 마지막으로 화면에 그려진 note를 보고 누르므로 한두 frame의 표시 지연을 보정한다.
 * 오래 멈춘 화면이나 비정상 입력은 현재 시각을 사용해 action trace를 과도하게 되감지 않는다.
 */
export function resolveForgeStrikeTime(
    currentElapsedMs: number,
    displayedElapsedMs: number,
    compensateVisualLag: boolean,
): number {
    const current = Math.max(0, currentElapsedMs)
    if (!compensateVisualLag || !Number.isFinite(displayedElapsedMs)) return current
    const displayed = Math.max(0, Math.min(current, displayedElapsedMs))
    const lag = current - displayed
    return lag <= MAX_FORGE_TOUCH_VISUAL_LAG_MS ? displayed : current
}

export interface MiniGameConfigMap {
    fishing_capture: FishingCaptureConfig
    hazard_dodge: HazardDodgeConfig
    forge_rhythm: ForgeRhythmConfig
}

interface MiniGameStartBase<T extends MiniGameType> {
    sessionId: string
    token: string
    type: T
    expiresAt: number
    config: MiniGameConfigMap[T]
}

export type MiniGameStartData = {
    [T in MiniGameType]: MiniGameStartBase<T>
}[MiniGameType]

export interface MiniGameResultRequest {
    sessionId: string
    token: string
    elapsedMs: number
    inputs: MiniGameInputSample[]
    actions?: MiniGameActionSample[]
}

export interface MiniGameResolvedData {
    sessionId: string
    success: boolean
    message?: string
}

export interface MiniGameCancelledData {
    sessionId: string
    reason: string
}

export interface FishingSimulationState {
    gauge: number
    netX: number
    netY: number
    fishX: number
    fishY: number
    caught: boolean
    finished: boolean
    success: boolean
}

export interface HazardDodgeHazard {
    id: string
    type: 'bomb' | 'laser'
    x: number
    y: number
    width: number
    height: number
    active: boolean
    progress: number
}

export interface HazardDodgeSimulationState {
    playerX: number
    playerY: number
    hazards: HazardDodgeHazard[]
    hit: boolean
    finished: boolean
    success: boolean
}

export interface ForgeRhythmSimulationState {
    hitCount: number
    perfectCount: number
    missCount: number
    maxCombo: number
    accuracy: number
    finished: boolean
    success: boolean
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

/** seed와 경과 시간만으로 결정되는 물고기 위치. 서버 검증과 클라이언트 표시가 공유한다. */
export function getFishingFishPosition(seed: number, difficulty: number, elapsedMs: number): { x: number; y: number } {
    const time = elapsedMs / 1000
    const level = clamp(difficulty, 1, 6)
    const phaseX = (seed % 997) / 997 * Math.PI * 2
    const phaseY = (seed % 619) / 619 * Math.PI * 2
    const speed = 0.55 + level * 0.16
    const jitter = 0.12 + level * 0.045
    const x = 50
        + Math.sin(time * speed * 1.71 + phaseX) * (19 + level * 2.4)
        + Math.sin(time * (speed * 3.1 + jitter) + phaseY) * (3 + level)
    const y = 50
        + Math.cos(time * speed * 1.37 + phaseY) * (18 + level * 2.1)
        + Math.sin(time * (speed * 2.73 + jitter) + phaseX) * (4 + level * 0.8)
    return { x: clamp(x, 5, 95), y: clamp(y, 5, 95) }
}

function isCaught(config: FishingCaptureConfig, netX: number, netY: number, fishX: number, fishY: number): boolean {
    const dx = Math.abs(fishX - netX)
    const dy = Math.abs(fishY - netY)
    if (config.netShape === 'circle') {
        const rx = Math.max(1, config.netWidth / 2)
        const ry = Math.max(1, config.netHeight / 2)
        return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1
    }
    return dx <= config.netWidth / 2 && dy <= config.netHeight / 2
}

/** 입력 trace를 고정 간격으로 재생한다. 클라이언트 결과는 이 함수의 서버 재실행으로 확정한다. */
export function simulateFishingCapture(
    config: FishingCaptureConfig,
    inputs: readonly MiniGameInputSample[],
    elapsedMs: number,
): FishingSimulationState {
    const end = clamp(elapsedMs, 0, config.durationMs)
    let gauge = clamp(config.initialGauge, 0, 1)
    let netX = 50
    let netY = 50
    let inputIndex = 0
    let axisX = 0
    let axisY = 0
    let caught = false
    let fish = getFishingFishPosition(config.seed, config.difficulty, 0)
    const stepMs = 20

    for (let at = 0; at < end; at += stepMs) {
        while (inputIndex < inputs.length && inputs[inputIndex].at <= at) {
            axisX = inputs[inputIndex].x
            axisY = inputs[inputIndex].y
            inputIndex++
        }
        const magnitude = Math.hypot(axisX, axisY)
        const normalizedX = magnitude > 1 ? axisX / magnitude : axisX
        const normalizedY = magnitude > 1 ? axisY / magnitude : axisY
        const dt = Math.min(stepMs, end - at) / 1000
        netX = clamp(netX + normalizedX * config.netSpeed * dt, config.netWidth / 2, 100 - config.netWidth / 2)
        netY = clamp(netY + normalizedY * config.netSpeed * dt, config.netHeight / 2, 100 - config.netHeight / 2)
        fish = getFishingFishPosition(config.seed, config.difficulty, at + dt * 1000)
        caught = isCaught(config, netX, netY, fish.x, fish.y)
        gauge = clamp(gauge + (caught ? config.fillPerSecond : -config.drainPerSecond) * dt, 0, 1)
        if (gauge >= 1 || gauge <= 0) {
            return { gauge, netX, netY, fishX: fish.x, fishY: fish.y, caught, finished: true, success: gauge >= 1 }
        }
    }

    const timedOut = elapsedMs >= config.durationMs
    return {
        gauge,
        netX,
        netY,
        fishX: fish.x,
        fishY: fish.y,
        caught,
        finished: timedOut,
        success: timedOut && gauge >= 1,
    }
}

function randomUnit(seed: number, index: number, salt: number): number {
    let value = (seed ^ Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x119de1f3)) | 0
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000
}

function hazardInterval(config: HazardDodgeConfig): number {
    const difficulty = clamp(config.difficulty, 1, MAX_HAZARD_DODGE_DIFFICULTY)
    // 기존 1~6 구간의 체감은 유지하고, 후반 보스 구간만 더 촘촘하게 확장한다.
    return difficulty <= 6
        ? clamp(1_100 - difficulty * 105, 470, 995)
        : Math.max(260, 470 - (difficulty - 6) * 52.5)
}

/** 현재 시각에 표시할 예고/활성 위험 구역을 seed로 재생성한다. */
export function getHazardDodgeHazards(config: HazardDodgeConfig, elapsedMs: number): HazardDodgeHazard[] {
    const interval = hazardInterval(config)
    const telegraphMs = clamp(config.telegraphMs, 300, 1_800)
    const firstAt = 250
    const maximum = Math.ceil(config.durationMs / interval) + 2
    const hazards: HazardDodgeHazard[] = []
    for (let index = 0; index < maximum; index++) {
        const startAt = firstAt + index * interval
        const laserBarrage = config.mode === 'resonance' && index % 5 === 3
        const chainBomb = config.mode === 'chain_bombs'
        const crossfire = config.mode === 'crossfire'
        const type = chainBomb ? 'bomb' : crossfire ? 'laser' : config.mode === 'mixed' || config.mode === 'resonance'
            ? (randomUnit(config.seed, index, 0) < 0.52 ? 'bomb' : 'laser')
            : config.mode === 'bombs' ? 'bomb' : 'laser'
        const activeMs = laserBarrage ? 300 : crossfire ? 350 : chainBomb ? 350 : type === 'bomb' ? 280 : 380
        const activeAt = startAt + telegraphMs
        const barrageStepMs = 110
        const crossfireStepMs = 140
        const endAt = activeAt + activeMs
            + (laserBarrage ? barrageStepMs * 2 : crossfire ? crossfireStepMs : 0)
        if (elapsedMs < startAt || elapsedMs > endAt) continue
        const difficulty = clamp(config.difficulty, 1, MAX_HAZARD_DODGE_DIFFICULTY)
        if (crossfire) {
            const thickness = 6 + difficulty * 1.2
            for (let shot = 0; shot < 2; shot++) {
                const vertical = shot === 0
                const shotActiveAt = activeAt + shot * crossfireStepMs
                const shotEndAt = shotActiveAt + activeMs
                if (elapsedMs > shotEndAt) continue
                const active = elapsedMs >= shotActiveAt
                const progress = active
                    ? clamp((elapsedMs - shotActiveAt) / activeMs, 0, 1)
                    : clamp((elapsedMs - startAt) / Math.max(1, shotActiveAt - startAt), 0, 1)
                const position = 12 + randomUnit(config.seed, index, 4 + shot) * 76
                hazards.push({
                    id: `crossfire:${index}:${shot}`,
                    type: 'laser',
                    x: vertical ? position : 50,
                    y: vertical ? 50 : position,
                    width: vertical ? thickness : 100,
                    height: vertical ? 100 : thickness,
                    active,
                    progress,
                })
            }
            continue
        }
        if (laserBarrage) {
            const vertical = randomUnit(config.seed, index, 3) < 0.5
            const thickness = 6 + difficulty * 1.2
            const center = 30 + randomUnit(config.seed, index, 4) * 40
            for (let shot = 0; shot < 3; shot++) {
                const shotActiveAt = activeAt + shot * barrageStepMs
                const shotEndAt = shotActiveAt + activeMs
                if (elapsedMs > shotEndAt) continue
                const active = elapsedMs >= shotActiveAt
                const progress = active
                    ? clamp((elapsedMs - shotActiveAt) / activeMs, 0, 1)
                    : clamp((elapsedMs - startAt) / Math.max(1, shotActiveAt - startAt), 0, 1)
                const position = clamp(center + (shot - 1) * 26, 7, 93)
                hazards.push({
                    id: `laser-barrage:${index}:${shot}`,
                    type: 'laser',
                    x: vertical ? position : 50,
                    y: vertical ? 50 : position,
                    width: vertical ? thickness : 100,
                    height: vertical ? 100 : thickness,
                    active,
                    progress,
                })
            }
            continue
        }
        const active = elapsedMs >= activeAt
        const progress = active
            ? clamp((elapsedMs - activeAt) / activeMs, 0, 1)
            : clamp((elapsedMs - startAt) / telegraphMs, 0, 1)
        if (chainBomb) {
            const phase = index % 5
            const group = Math.floor(index / 5)
            const offset = 24 + randomUnit(config.seed, group, 8) * 12
            const horizontalFirst = randomUnit(config.seed, group, 9) < 0.5
            const positions = horizontalFirst
                ? [[50, 50], [50 - offset, 50], [50 + offset, 50], [50, 50 - offset], [50, 50 + offset]]
                : [[50, 50], [50, 50 - offset], [50, 50 + offset], [50 - offset, 50], [50 + offset, 50]]
            const [x, y] = positions[phase]
            const finalSize = 14 + difficulty * 2.2
            const size = finalSize * (active ? 1 : 0.3 + progress * 0.7)
            hazards.push({
                id: `chain-bomb:${index}`,
                type: 'bomb',
                x,
                y,
                width: size,
                height: size,
                active,
                progress,
            })
            continue
        }
        if (type === 'bomb') {
            const size = 14 + difficulty * 2.2
            hazards.push({
                id: `bomb:${index}`,
                type,
                x: 10 + randomUnit(config.seed, index, 1) * 80,
                y: 10 + randomUnit(config.seed, index, 2) * 80,
                width: size,
                height: size,
                active,
                progress,
            })
        } else {
            const vertical = randomUnit(config.seed, index, 3) < 0.5
            const thickness = 6 + difficulty * 1.2
            hazards.push({
                id: `laser:${index}`,
                type,
                x: vertical ? 8 + randomUnit(config.seed, index, 4) * 84 : 50,
                y: vertical ? 50 : 8 + randomUnit(config.seed, index, 5) * 84,
                width: vertical ? thickness : 100,
                height: vertical ? 100 : thickness,
                active,
                progress,
            })
        }
    }
    return hazards
}

function collidesWithHazard(
    config: HazardDodgeConfig,
    playerX: number,
    playerY: number,
    hazard: HazardDodgeHazard,
): boolean {
    if (!hazard.active) return false
    const radius = Math.max(1, config.playerSize / 2)
    if (hazard.type === 'bomb') {
        return Math.hypot(playerX - hazard.x, playerY - hazard.y) <= radius + hazard.width / 2
    }
    return Math.abs(playerX - hazard.x) <= radius + hazard.width / 2
        && Math.abs(playerY - hazard.y) <= radius + hazard.height / 2
}

/** 입력 trace로 위험 회피를 재생한다. 피격 여부와 성공 판정은 서버도 같은 함수로 계산한다. */
export function simulateHazardDodge(
    config: HazardDodgeConfig,
    inputs: readonly MiniGameInputSample[],
    elapsedMs: number,
): HazardDodgeSimulationState {
    const end = clamp(elapsedMs, 0, config.durationMs)
    const playerRadius = Math.max(1, config.playerSize / 2)
    let playerX = 50
    let playerY = 50
    let inputIndex = 0
    let axisX = 0
    let axisY = 0
    const stepMs = MINIGAME_INPUT_SAMPLE_INTERVAL_MS

    for (let at = 0; at < end; at += stepMs) {
        while (inputIndex < inputs.length && inputs[inputIndex].at <= at) {
            axisX = inputs[inputIndex].x
            axisY = inputs[inputIndex].y
            inputIndex++
        }
        const magnitude = Math.hypot(axisX, axisY)
        const normalizedX = magnitude > 1 ? axisX / magnitude : axisX
        const normalizedY = magnitude > 1 ? axisY / magnitude : axisY
        const dt = Math.min(stepMs, end - at) / 1000
        playerX = clamp(playerX + normalizedX * config.playerSpeed * dt, playerRadius, 100 - playerRadius)
        playerY = clamp(playerY + normalizedY * config.playerSpeed * dt, playerRadius, 100 - playerRadius)
        const hazards = getHazardDodgeHazards(config, at + dt * 1000)
        if (hazards.some(hazard => collidesWithHazard(config, playerX, playerY, hazard))) {
            return { playerX, playerY, hazards, hit: true, finished: true, success: false }
        }
    }

    const hazards = getHazardDodgeHazards(config, end)
    const finished = elapsedMs >= config.durationMs
    return { playerX, playerY, hazards, hit: false, finished, success: finished }
}

/** 타격 시각만으로 판정을 재생해 클라이언트 표시와 서버 결과가 같은 값을 사용한다. */
export function simulateForgeRhythm(
    config: ForgeRhythmConfig,
    actions: readonly MiniGameActionSample[],
    elapsedMs: number,
): ForgeRhythmSimulationState {
    const beats = [...config.beatTimesMs].filter(Number.isFinite).sort((left, right) => left - right)
    const strikes = actions
        .filter(action => action.action === 'strike' && Number.isFinite(action.at))
        .map(action => Math.max(0, Math.min(config.durationMs, action.at)))
        .sort((left, right) => left - right)
    const matchedBeatDistance = new Map<number, number>()
    let hitCount = 0
    let perfectCount = 0
    let missCount = 0
    let combo = 0
    let maxCombo = 0
    let qualityTotal = 0

    // 각 타격을 가장 가까운 note에 먼저 배정한다. 앞 note를 놓친 연타 구간에서
    // 다음 note의 정확한 타격이 넓은 판정창 때문에 앞 note에 빼앗기는 것을 막는다.
    for (const strike of strikes) {
        let match = -1
        let closest = Number.POSITIVE_INFINITY
        for (let index = 0; index < beats.length; index++) {
            if (matchedBeatDistance.has(index)) continue
            const distance = Math.abs(strike - beats[index])
            if (distance <= config.hitWindowMs && distance < closest) {
                match = index
                closest = distance
            }
        }
        if (match >= 0) matchedBeatDistance.set(match, closest)
    }

    for (let index = 0; index < beats.length; index++) {
        const beat = beats[index]
        if (beat > elapsedMs + config.hitWindowMs) break
        const closest = matchedBeatDistance.get(index)
        if (closest === undefined) {
            if (elapsedMs >= beat + config.hitWindowMs) {
                missCount++
                combo = 0
            }
            continue
        }
        hitCount++
        combo++
        maxCombo = Math.max(maxCombo, combo)
        const perfect = closest <= config.perfectWindowMs
        if (perfect) perfectCount++
        const falloffRange = Math.max(1, config.hitWindowMs - config.perfectWindowMs)
        qualityTotal += perfect ? 1 : Math.max(0.5, 1 - (closest - config.perfectWindowMs) / falloffRange * 0.5)
    }

    // 진행 중에는 아직 판정되지 않은 미래 note를 분모에 넣지 않는다. 종료 시에는
    // 모든 note가 hit 또는 miss로 확정되므로 서버 최종 성공 판정 값은 동일하다.
    const resolvedCount = hitCount + missCount
    const accuracy = resolvedCount === 0 ? 0 : qualityTotal / resolvedCount
    const finished = elapsedMs >= config.durationMs
    return {
        hitCount,
        perfectCount,
        missCount,
        maxCombo,
        accuracy,
        finished,
        success: finished && accuracy >= config.requiredAccuracy,
    }
}
