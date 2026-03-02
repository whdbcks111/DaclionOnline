import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser } from "../modules/message.js";
import { getPlayerByUserId } from "../modules/player.js";
import { getLocation } from "../models/Location.js";
import { getShop } from "../models/Shop.js";
import { chat } from "../utils/chatBuilder.js";

function getPlayerShop(userId: number) {
    const player = getPlayerByUserId(userId);
    if (!player) return null;

    const location = getLocation(player.locationId);
    if (!location?.data.shopId) return null;

    const shop = getShop(location.data.shopId);
    if (!shop) return null;

    return { player, location, shop };
}

export function initShopCommands(): void {
    registerCommand({
        name: '상점',
        aliases: ['shop'],
        description: '현재 위치의 상점 정보를 확인합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const ctx = getPlayerShop(userId);
            if (!ctx) {
                const player = getPlayerByUserId(userId);
                if (!player) return;
                const location = getLocation(player.locationId);
                if (!location?.data.shopId) {
                    sendBotMessageToUser(userId, '이곳에는 상점이 없습니다.');
                } else {
                    sendBotMessageToUser(userId, '상점 정보를 찾을 수 없습니다.');
                }
                return;
            }

            const { player, location, shop } = ctx;

            const b = chat()
                .color('yellow', b2 => b2.text(`[ ${location.data.name} ]`))
                .text(`  보유 골드: `)
                .color('gold', b2 => b2.text(`${player.gold.toLocaleString()}G`))
                .text('\n\n');

            // 구매 목록 (플레이어가 상점에서 살 수 있는 것)
            b.color('gray', b2 => b2.text('[ 구매 가능 목록 ]')).text('\n');
            if (shop.data.buyList.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (let i = 0; i < shop.data.buyList.length; i++) {
                    const entry = shop.data.buyList[i];
                    const stock = shop.getStock(i);
                    const outOfStock = stock <= 0;

                    b.color('gray', b2 => b2.text(`[${i + 1}] `));
                    b.color(outOfStock ? 'gray' : 'white', b2 =>
                        b2.text(`${entry.label}`)
                    );
                    b.text(` — `);
                    b.color('gold', b2 => b2.text(`${entry.price}G`));
                    b.text(` × ${entry.count}개  `);
                    b.color(outOfStock ? 'red' : 'gray', b2 =>
                        b2.text(outOfStock ? '[품절]' : `[재고 ${stock}/${entry.stock}]`)
                    );

                    if (!outOfStock) {
                        b.text('  ').button(`/구매 ${i + 1}`, b2 =>
                            b2.color('lime', b3 => b3.text('구매')), true
                        );
                    }
                    b.text('\n');
                }
            }

            b.text('\n');

            // 판매 목록 (플레이어가 상점에 팔 수 있는 것)
            b.color('gray', b2 => b2.text('[ 판매 가능 목록 ]')).text('\n');
            if (shop.data.sellList.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (let i = 0; i < shop.data.sellList.length; i++) {
                    const entry = shop.data.sellList[i];
                    const matchCount = player.inventory.items
                        .filter(item => entry.filter(item))
                        .reduce((sum, item) => sum + item.count, 0);

                    b.color('gray', b2 => b2.text(`[${i + 1}] `));
                    b.text(`${entry.label} — `);
                    b.color('gold', b2 => b2.text(`${entry.price}G/개`));

                    if (matchCount > 0) {
                        b.color('gray', b2 => b2.text(`  (보유 ${matchCount}개)`));
                        b.text('  ').button(`/판매 ${i + 1} 전체`, b2 =>
                            b2.color('gold', b3 => b3.text('전체 판매')), true
                        );
                    }
                    b.text('\n');
                }

                b.text('\n').button('/전체판매', b2 =>
                    b2.color('gold', b3 => b3.text('한번에 전체 판매')), true
                );
            }

            sendBotMessageToUser(userId, b.build());
        },
    });

    registerCommand({
        name: '구매',
        aliases: ['buy'],
        description: '상점에서 아이템을 구매합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '번호',
                description: '구매할 항목 번호 (/상점에서 확인)',
                required: true,
                completions: (userId) => {
                    const ctx = getPlayerShop(userId);
                    if (!ctx) return [];
                    return ctx.shop.data.buyList.map((e, i) => ({ value: String(i + 1), description: e.label }));
                },
            },
            { name: '개수', description: '구매할 횟수 (기본 1)' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            const ctx = getPlayerShop(userId);
            if (!ctx) {
                const location = getLocation(player.locationId);
                sendBotMessageToUser(userId, location?.data.shopId
                    ? '상점 정보를 찾을 수 없습니다.'
                    : '이곳에는 상점이 없습니다.'
                );
                return;
            }

            const { shop } = ctx;
            const entryIndex = parseInt(args[0], 10) - 1;
            const amount = args[1] ? parseInt(args[1], 10) : 1;

            if (isNaN(entryIndex) || entryIndex < 0 || entryIndex >= shop.data.buyList.length) {
                sendBotMessageToUser(userId, `유효한 번호를 입력해주세요. (1~${shop.data.buyList.length})`);
                return;
            }

            if (isNaN(amount) || amount < 1) {
                sendBotMessageToUser(userId, '유효한 개수를 입력해주세요.');
                return;
            }

            const entry = shop.data.buyList[entryIndex];
            const totalCost = entry.price * amount;
            const totalItemCount = entry.count * amount;
            const stock = shop.getStock(entryIndex);

            if (stock < amount) {
                sendBotMessageToUser(userId, `재고가 부족합니다. (현재 재고: ${stock}개)`);
                return;
            }

            if (player.gold < totalCost) {
                sendBotMessageToUser(userId, `골드가 부족합니다. (필요: ${totalCost.toLocaleString()}G, 보유: ${player.gold.toLocaleString()}G)`);
                return;
            }

            const created = entry.create();
            if (!player.inventory.canAdd(created.itemDataId, totalItemCount)) {
                sendBotMessageToUser(userId, '무게 초과로 아이템을 받을 수 없습니다.');
                return;
            }

            shop.consumeStock(entryIndex, amount);
            player.gold -= totalCost;
            player.inventory.addItem(created.itemDataId, totalItemCount, created.metadata ?? null);

            sendBotMessageToUser(userId, chat()
                .color('lime', b => b.text('구매 완료'))
                .text(`  ${entry.label}`)
                .color('gray', b => b.text(` x${totalItemCount}`))
                .text(`  — `)
                .color('gold', b => b.text(`${totalCost.toLocaleString()}G`))
                .text(' 지불\n')
                .color('gray', b => b.text(`남은 골드: ${player.gold.toLocaleString()}G  |  재고: ${shop.getStock(entryIndex)}/${entry.stock}`))
                .build()
            );
        },
    });

    registerCommand({
        name: '판매',
        aliases: ['sell'],
        description: '상점에 아이템을 판매합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '번호',
                description: '판매할 항목 번호 (/상점에서 확인)',
                required: true,
                completions: (userId) => {
                    const ctx = getPlayerShop(userId);
                    if (!ctx) return [];
                    return ctx.shop.data.sellList.map((e, i) => ({ value: String(i + 1), description: e.label }));
                },
            },
            { name: '개수', description: '판매할 개수 (기본 1, "전체" 입력 시 전체 판매)' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            const ctx = getPlayerShop(userId);
            if (!ctx) {
                const location = getLocation(player.locationId);
                sendBotMessageToUser(userId, location?.data.shopId
                    ? '상점 정보를 찾을 수 없습니다.'
                    : '이곳에는 상점이 없습니다.'
                );
                return;
            }

            const { shop } = ctx;
            const entryIndex = parseInt(args[0], 10) - 1;
            const countArg = args[1];

            if (isNaN(entryIndex) || entryIndex < 0 || entryIndex >= shop.data.sellList.length) {
                sendBotMessageToUser(userId, `유효한 번호를 입력해주세요. (1~${shop.data.sellList.length})`);
                return;
            }

            const entry = shop.data.sellList[entryIndex];

            const matchingItems = player.inventory.items.filter(item => entry.filter(item));
            const totalAvailable = matchingItems.reduce((sum, item) => sum + item.count, 0);

            if (totalAvailable === 0) {
                sendBotMessageToUser(userId, `판매할 '${entry.label}' 아이템이 없습니다.`);
                return;
            }

            let toSell: number;
            if (!countArg || countArg === '1') {
                toSell = 1;
            } else if (countArg === '전체') {
                toSell = totalAvailable;
            } else {
                toSell = parseInt(countArg, 10);
                if (isNaN(toSell) || toSell < 1) {
                    sendBotMessageToUser(userId, '유효한 개수를 입력해주세요. ("전체" 입력 시 전체 판매)');
                    return;
                }
            }

            toSell = Math.min(toSell, totalAvailable);
            const totalGold = toSell * entry.price;

            let remaining = toSell;
            for (const item of [...matchingItems]) {
                if (remaining <= 0) break;
                const remove = Math.min(remaining, item.count);
                player.inventory.removeItem(item.id, remove);
                remaining -= remove;
            }

            player.gold += totalGold;

            sendBotMessageToUser(userId, chat()
                .color('gold', b => b.text('판매 완료'))
                .text(`  ${entry.label}`)
                .color('gray', b => b.text(` x${toSell}`))
                .text(`  → `)
                .color('gold', b => b.text(`+${totalGold.toLocaleString()}G`))
                .text('\n')
                .color('gray', b => b.text(`보유 골드: ${player.gold.toLocaleString()}G`))
                .build()
            );
        },
    });

    registerCommand({
        name: '전체판매',
        aliases: ['sellall'],
        description: '상점에서 팔 수 있는 모든 아이템을 판매합니다.',
        showCommandUse: 'private',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            const ctx = getPlayerShop(userId);
            if (!ctx) {
                const location = getLocation(player.locationId);
                sendBotMessageToUser(userId, location?.data.shopId
                    ? '상점 정보를 찾을 수 없습니다.'
                    : '이곳에는 상점이 없습니다.'
                );
                return;
            }

            const { shop } = ctx;

            let totalGold = 0;
            const results: { label: string; count: number; gold: number }[] = [];

            for (const entry of shop.data.sellList) {
                const matchingItems = player.inventory.items.filter(item => entry.filter(item));
                const count = matchingItems.reduce((sum, item) => sum + item.count, 0);
                if (count === 0) continue;

                let remaining = count;
                for (const item of [...matchingItems]) {
                    if (remaining <= 0) break;
                    const remove = Math.min(remaining, item.count);
                    player.inventory.removeItem(item.id, remove);
                    remaining -= remove;
                }

                const gold = count * entry.price;
                totalGold += gold;
                results.push({ label: entry.label, count, gold });
            }

            if (results.length === 0) {
                sendBotMessageToUser(userId, '판매할 수 있는 아이템이 없습니다.');
                return;
            }

            player.gold += totalGold;

            const b = chat().color('gold', b2 => b2.text('전체 판매 완료\n'));
            for (const r of results) {
                b.color('gray', b2 => b2.text(`  ${r.label} x${r.count}`))
                 .text(' → ')
                 .color('gold', b2 => b2.text(`+${r.gold.toLocaleString()}G`))
                 .text('\n');
            }
            b.text(`합계: `)
             .color('gold', b2 => b2.text(`+${totalGold.toLocaleString()}G`))
             .text(`  |  보유 골드: `)
             .color('gold', b2 => b2.text(`${player.gold.toLocaleString()}G`));

            sendBotMessageToUser(userId, b.build());
        },
    });
}
