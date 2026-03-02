import { registerConnectionCondition } from "../models/Location.js";


registerConnectionCondition('level_5', player => {
    return player.level >= 5 ? 'visible' : 'locked';
});