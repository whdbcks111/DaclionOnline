import { initGeneralCommands } from "./general.js";
import { initPlayerCommands } from "./player.js";
import { initAdminCommands } from "./admin.js";
import { initLocationCommands } from "./location.js";
import { initShopCommands } from "./shop.js";
import { initSkillCommands } from "./skill.js";
import { initProgressCommands } from "./progress.js";
import { initCraftingCommands } from "./crafting.js";
import { initNpcCommands } from "./npc.js";
import { initQuestCommands } from './quest.js';
import { initAffinityCommands } from './affinity.js';
import { initMapCommands } from './map.js';
import { initCareerCommands } from './career.js';
import { initPartyCommands } from './party.js';
import { initInspectionCommands } from './inspection.js';

export function initAllCommands(): void {
    initGeneralCommands();
    initPlayerCommands();
    initAdminCommands();
    initLocationCommands();
    initShopCommands();
    initSkillCommands();
    initProgressCommands();
    initCraftingCommands();
    initNpcCommands();
    initQuestCommands();
    initAffinityCommands();
    initMapCommands();
    initCareerCommands();
    initPartyCommands();
    initInspectionCommands();
}
