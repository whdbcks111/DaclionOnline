import { initGeneralCommands } from "./general.js";
import { initPlayerCommands } from "./player.js";
import { initAdminCommands } from "./admin.js";
import { initLocationCommands } from "./location.js";

export function initAllCommands(): void {
    initGeneralCommands();
    initPlayerCommands();
    initAdminCommands();
    initLocationCommands();
}
