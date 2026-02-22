import logger from "../utils/logger.js";
import { getAllLocations } from "../models/Location.js";

/** 모든 장소의 update 호출 (게임 루프에서 매 프레임) */
export function updateLocations(dt: number): void {
    for (const location of getAllLocations()) {
        location.update(dt);
    }
}

/** 장소 모듈 초기화 */
export function initLocation(): void {
    logger.success('장소 모듈 초기화 완료');
}
