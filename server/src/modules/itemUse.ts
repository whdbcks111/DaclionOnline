import logger from "../utils/logger.js";
import type Inventory from "../models/Inventory.js";
import { Item } from "../models/Item.js";

type ItemUseHandler = (inventory: Inventory, item: Item, finish: () => void) => void;

const handlers = new Map<string, ItemUseHandler>();

/** 아이템 사용 핸들러 등록 */
export function registerItemUse(id: string, handler: ItemUseHandler): void {
    handlers.set(id, handler);
    logger.debug(`아이템 사용 핸들러 등록: ${id}`);
}

/** 핸들러 ID로 직접 실행 (Inventory.useItem에서 호출) */
export function executeItemUse(onUseId: string, inventory: Inventory, item: Item, finish: () => void): boolean {
    const handler = handlers.get(onUseId);
    if (!handler) return false;
    handler(inventory, item, finish);
    return true;
}

/** 핸들러 존재 여부 확인 */
export function hasItemUseHandler(id: string): boolean {
    return handlers.has(id);
}

/** 아이템 사용 모듈 초기화 */
export function initItemUse(): void {
    // 기본 핸들러 등록 예시:
    // registerItemUse('heal_small', (inventory, item) => {
    //     // 회복 로직
    //     inventory.removeItem(item.id, 1);
    // });

    logger.success('아이템 사용 모듈 초기화 완료');
}
