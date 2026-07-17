export type MiniGameType = 'fishing_capture'
export type FishingCaptureShape = 'circle' | 'square' | 'rectangle'

export interface MiniGameInputSample {
    /** 미니게임 시작 후 경과 시간(ms) */
    at: number
    /** -1~1 수평 입력 */
    x: number
    /** -1~1 수직 입력 */
    y: number
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

export interface MiniGameStartData {
    sessionId: string
    token: string
    type: MiniGameType
    expiresAt: number
    config: FishingCaptureConfig
}

export interface MiniGameResultRequest {
    sessionId: string
    token: string
    elapsedMs: number
    inputs: MiniGameInputSample[]
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
