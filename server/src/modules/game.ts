import logger from "../utils/logger.js";
import { getOnlinePlayers } from "./player.js";
import { tickCoroutines } from "./coroutine.js";
import { updateLocations } from "./location.js";

const TARGET_FPS = 20;
const FRAME_TIME = 1000 / TARGET_FPS;

let running = false;
let lastTime = 0;

function tick(): void {
    const now = performance.now();
    const dt = (now - lastTime) / 1000; // 초 단위
    lastTime = now;

    const players = getOnlinePlayers();
    for (const player of players) {
        player.earlyUpdate(dt);
    }
    for (const player of players) {
        player.update(dt);
    }
    for (const player of players) {
        player.lateUpdate(dt);
    }

    updateLocations(dt);
    tickCoroutines(dt);
}

/** 게임 루프 시작 */
export function startGame(): void {
    if (running) return;
    running = true;
    lastTime = performance.now();

    setInterval(tick, FRAME_TIME);

    logger.success(`게임 루프 시작 (${TARGET_FPS} FPS)`);
}

/** 게임 모듈 초기화 */
export function initGame(): void {
    startGame();
}
