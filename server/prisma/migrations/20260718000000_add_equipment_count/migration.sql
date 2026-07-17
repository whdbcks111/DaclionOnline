-- Stackable equipment such as bait keeps its full count in the equipped slot.
ALTER TABLE `equipments` ADD COLUMN `count` INTEGER NOT NULL DEFAULT 1 AFTER `item_data_id`;
