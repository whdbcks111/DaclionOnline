import type { Item, ItemMetadata } from "./Item.js";
import logger from "../../utils/logger.js";
import { TagCollection, normalizeTags } from "../../../../shared/tags.js";
import { GameTags } from "../../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../../shared/tags.js";
import { KarmaAccessPolicy } from '../player/Karma.js';
import type Player from '../actors/Player.js';

/** 판매 물품 목록 항목 (플레이어가 상점에 판매) */
export interface SellEntry {
    label: string;
    filter: (item: Item) => boolean;
    count: number;           // 1회 최대 판매 수량 (표시용)
    price: number;           // 개당 가격
}

/** 구매 물품 목록 항목 (플레이어가 상점에서 구매) */
export interface BuyEntry {
    label: string;
    create: () => { itemDataId: string; count: number; metadata?: ItemMetadata | null; tags?: TagId[] };
    count: number;           // 1회 구매 수량
    price: number;           // 1회 구매 가격
    stock: number;           // 최대 재고
    restockTime: number;     // 재고 1개 충전 시간 (초)
}

export interface ShopData {
    id: string;
    /** 이 상점이 담당하는 성장 구간. 구매품 사용·장착 조건 계산에 사용한다. */
    recommendedLevel?: number;
    sellList: SellEntry[];   // 판매 물품 목록 (플레이어가 상점에 팔 수 있는 것)
    buyList: BuyEntry[];     // 구매 물품 목록 (플레이어가 상점에서 살 수 있는 것)
    tags: TagId[];
}

/** 공유 상점을 동시에 이용해도 1인 기준 공급량을 유지할 목표 인원. */
export const SHOP_SHARED_PLAYER_CAPACITY = 5;
/** 마스터 데이터에 지정할 수 있는 품목당 1인 기준 최대 재입고 시간. */
export const MAX_SHOP_CONFIGURED_RESTOCK_SECONDS = 10 * 60;
/** 다인원 공급 보정 뒤 실제 품목 하나가 재입고되는 최대 시간. */
export const MAX_SHOP_RESTOCK_SECONDS =
    MAX_SHOP_CONFIGURED_RESTOCK_SECONDS / SHOP_SHARED_PLAYER_CAPACITY;

export function resolveShopRestockTime(restockTime: number): number {
    const configured = Math.min(MAX_SHOP_CONFIGURED_RESTOCK_SECONDS, Math.max(1, restockTime));
    return Math.max(1, configured / SHOP_SHARED_PLAYER_CAPACITY);
}

export function resolveShopStockCapacity(stock: number): number {
    return Math.max(0, Math.floor(stock)) * SHOP_SHARED_PLAYER_CAPACITY;
}

export class Shop implements TagReadable {
    readonly data: ShopData;
    readonly tags: TagCollection;
    private _stocks: number[];
    private _restockTimers: number[];

    constructor(data: ShopData) {
        this.data = data;
        this.tags = new TagCollection({ definition: data.tags });
        this._stocks = data.buyList.map(e => resolveShopStockCapacity(e.stock));
        this._restockTimers = data.buyList.map(() => 0);
    }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    /** 상점 성향과 플레이어 카르마를 합성한 거래 거부 사유. */
    getAccessDeniedReason(player: Player): string | undefined {
        return this.hasTag(GameTags.FACILITY_LAWFUL)
            ? player.getKarmaAccessDeniedReason(KarmaAccessPolicy.LAWFUL_SHOP)
            : undefined;
    }

    getStock(buyIndex: number): number {
        return this._stocks[buyIndex] ?? 0;
    }

    getStockCapacity(buyIndex: number): number {
        const entry = this.data.buyList[buyIndex];
        return entry ? resolveShopStockCapacity(entry.stock) : 0;
    }

    /** 구매 처리: 재고 amount 감소. 재고 부족 시 false */
    consumeStock(buyIndex: number, amount: number): boolean {
        if ((this._stocks[buyIndex] ?? 0) < amount) return false;
        this._stocks[buyIndex] -= amount;
        return true;
    }

    update(dt: number): void {
        for (let i = 0; i < this.data.buyList.length; i++) {
            const entry = this.data.buyList[i];
            const capacity = this.getStockCapacity(i);
            if (this._stocks[i] >= capacity) continue;
            this._restockTimers[i] += dt;
            const restockTime = resolveShopRestockTime(entry.restockTime);
            while (this._restockTimers[i] >= restockTime && this._stocks[i] < capacity) {
                this._restockTimers[i] -= restockTime;
                this._stocks[i]++;
            }
        }
    }
}

const shopInstances = new Map<string, Shop>();

/** 상점 정의 등록 */
export function defineShop(data: ShopData): void {
    const normalized = { ...data, tags: normalizeTags(data.tags) };
    shopInstances.set(data.id, new Shop(normalized));
    logger.debug('상점 정의 추가:', data.id);
}

/** 상점 인스턴스 조회 */
export function getShop(id: string): Shop | undefined {
    return shopInstances.get(id);
}

/** 모든 상점 업데이트 (게임 루프에서 호출) */
export function updateAllShops(dt: number): void {
    for (const shop of shopInstances.values()) {
        shop.update(dt);
    }
}
