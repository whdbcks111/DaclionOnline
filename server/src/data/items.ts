import { defineItem } from '../models/Item.js';
import { startCoroutine, Wait } from '../modules/coroutine.js';
import { registerItemUse } from '../modules/itemUse.js';
import { sendNotificationToUser } from '../modules/message.js';
import { getPlayer } from '../modules/player.js';
import logger from '../utils/logger.js';

registerItemUse('heal_hp', (inv, item, finish) => {
    function* healRoutine(amount: number, time: number) {
        try {
            const player = getPlayer(inv.playerId);
            if(!player) return;

            inv.removeItem(item.id, 1);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: '꿀꺽꿀꺽...', length: time * 1000 });
            yield Wait(time);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: `생명력을 ${amount.toFixed(0)} 회복했습니다!` });
        }
        catch(e) {
            logger.error(e);
        }
        finally {
            finish();
        }
    }
    startCoroutine(healRoutine(item.metadata?.amount ?? 0, item.metadata?.time ?? 1));
});

defineItem({
    id: 'health_potion',
    name: '체력 포션',
    description: '마시면 HP를 50 회복한다.',
    category: '소모품',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: { amount: 50 },
    onUse: 'heal_hp',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
});

defineItem({
    id: 'mana_potion',
    name: '마나 포션',
    description: '마시면 MP를 30 회복한다.',
    category: '소모품',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: 'heal_mp',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
});

defineItem({
    id: 'old_sword',
    name: '낡은 검',
    description: '녹슬고 낡은 검. 그래도 쓸 수는 있다.',
    category: '장검',
    weight: 3.0,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 5, source: '' },
    ],
    baseDurability: 50,
});

defineItem({
    id: 'old_shield',
    name: '낡은 방패',
    description: '낡은 나무 방패.',
    category: '방패',
    weight: 2.5,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 3, source: '' },
    ],
    baseDurability: 60,
});