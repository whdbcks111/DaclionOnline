import { defineFish } from '../models/Fishing.js';
import { getFishCatalog } from './fishingCatalog.js';

for (const fish of getFishCatalog()) {
    defineFish({ id: fish.id, itemDataId: fish.id, rarity: fish.rarity });
}
