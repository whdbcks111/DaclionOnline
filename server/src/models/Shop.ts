import type { Item } from "./Item.js";
import logger from "../utils/logger.js";

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
    create: () => { itemDataId: string; count: number; metadata?: Record<string, any> | null };
    count: number;           // 1회 구매 수량
    price: number;           // 1회 구매 가격
    stock: number;           // 최대 재고
    restockTime: number;     // 재고 1개 충전 시간 (초)
}

export interface ShopData {
    id: string;
    sellList: SellEntry[];   // 판매 물품 목록 (플레이어가 상점에 팔 수 있는 것)
    buyList: BuyEntry[];     // 구매 물품 목록 (플레이어가 상점에서 살 수 있는 것)
}

export class Shop {
    readonly data: ShopData;
    private _stocks: number[];
    private _restockTimers: number[];

    constructor(data: ShopData) {
        this.data = data;
        this._stocks = data.buyList.map(e => e.stock);
        this._restockTimers = data.buyList.map(() => 0);
    }

    getStock(buyIndex: number): number {
        return this._stocks[buyIndex] ?? 0;
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
            if (this._stocks[i] >= entry.stock) continue;
            this._restockTimers[i] += dt;
            while (this._restockTimers[i] >= entry.restockTime && this._stocks[i] < entry.stock) {
                this._restockTimers[i] -= entry.restockTime;
                this._stocks[i]++;
            }
        }
    }
}

const shopInstances = new Map<string, Shop>();

/** 상점 정의 등록 */
export function defineShop(data: ShopData): void {
    shopInstances.set(data.id, new Shop(data));
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
