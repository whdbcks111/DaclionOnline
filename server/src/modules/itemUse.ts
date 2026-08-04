import logger from "../utils/logger.js";
import type Inventory from "../models/Inventory.js";
import { Item } from "../models/Item.js";

type ItemUseHandler = (inventory: Inventory, item: Item, finish: () => void) => void;
type QuickBundleEligibility = boolean | ((item: Item) => boolean);

export interface ItemUseOptions {
    /** true 또는 predicate인 핸들러만 소모품 묶음 퀵 버튼에서 실행할 수 있다. */
    readonly quickBundle?: QuickBundleEligibility;
}

interface ItemUseRegistration {
    readonly handler: ItemUseHandler;
    readonly quickBundle: QuickBundleEligibility;
}

const handlers = new Map<string, ItemUseRegistration>();

/** 아이템 사용 핸들러 등록 */
export function registerItemUse(id: string, handler: ItemUseHandler, options: ItemUseOptions = {}): void {
    handlers.set(id, { handler, quickBundle: options.quickBundle ?? false });
    logger.debug(`아이템 사용 핸들러 등록: ${id}`);
}

/** 핸들러 ID로 직접 실행 (Inventory.useItem에서 호출) */
export function executeItemUse(onUseId: string, inventory: Inventory, item: Item, finish: () => void): boolean {
    const registration = handlers.get(onUseId);
    if (!registration) return false;
    registration.handler(inventory, item, finish);
    return true;
}

/** 핸들러 존재 여부 확인 */
export function hasItemUseHandler(id: string): boolean {
    return handlers.has(id);
}

/** 클라이언트 표시와 서버 실행 검증이 공유하는 일괄 퀵 사용 허용 정책. */
export function isItemQuickBundleEligible(item: Item): boolean {
    const onUseId = item.data?.onUse;
    const registration = onUseId ? handlers.get(onUseId) : undefined;
    if (!registration) return false;
    try {
        return typeof registration.quickBundle === 'function'
            ? registration.quickBundle(item)
            : registration.quickBundle;
    } catch (error) {
        logger.error(`아이템 묶음 사용 허용 검사 실패: ${item.itemDataId}`, error);
        return false;
    }
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
