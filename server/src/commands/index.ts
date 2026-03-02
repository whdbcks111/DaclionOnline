import { initGeneralCommands } from "./general.js";
import { initPlayerCommands } from "./player.js";
import { initAdminCommands } from "./admin.js";
import { initLocationCommands } from "./location.js";
import { initShopCommands } from "./shop.js";

export function initAllCommands(): void {
    initGeneralCommands();
    initPlayerCommands();
    initAdminCommands();
    initLocationCommands();
    initShopCommands();
}
