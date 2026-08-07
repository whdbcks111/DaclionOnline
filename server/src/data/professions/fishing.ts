import { defineFish } from '../../models/professions/Fishing.js';
import { getFishCatalog } from './fishingCatalog.js';

for (const fish of getFishCatalog()) {
    defineFish({ id: fish.id, itemDataId: fish.id, rarity: fish.rarity });
}
