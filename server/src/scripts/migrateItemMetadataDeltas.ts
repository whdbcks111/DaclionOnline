import prisma from '../config/prisma.js';
import '../data/items.js';
import {
    isPersistedItemMetadataDelta,
    migratePersistedItemMetadata,
} from '../models/Item.js';

const BATCH_SIZE = 100;
const dryRun = process.argv.includes('--dry-run');

async function migrateInventoryItems(): Promise<number> {
    const rows = await prisma.item.findMany({
        select: { id: true, itemDataId: true, metadata: true },
    });
    const legacyRows = rows.filter(row =>
        row.metadata !== null && !isPersistedItemMetadataDelta(row.metadata)
    );

    if (dryRun) return legacyRows.length;

    for (let offset = 0; offset < legacyRows.length; offset += BATCH_SIZE) {
        const batch = legacyRows.slice(offset, offset + BATCH_SIZE);
        await prisma.$transaction(batch.map(row => prisma.item.update({
            where: { id: row.id },
            data: { metadata: migratePersistedItemMetadata(row.itemDataId, row.metadata) },
        })));
    }
    return legacyRows.length;
}

async function migrateEquipmentItems(): Promise<number> {
    const rows = await prisma.equipment.findMany({
        select: { id: true, itemDataId: true, metadata: true },
    });
    const legacyRows = rows.filter(row =>
        row.metadata !== null && !isPersistedItemMetadataDelta(row.metadata)
    );

    if (dryRun) return legacyRows.length;

    for (let offset = 0; offset < legacyRows.length; offset += BATCH_SIZE) {
        const batch = legacyRows.slice(offset, offset + BATCH_SIZE);
        await prisma.$transaction(batch.map(row => prisma.equipment.update({
            where: { id: row.id },
            data: { metadata: migratePersistedItemMetadata(row.itemDataId, row.metadata) },
        })));
    }
    return legacyRows.length;
}

try {
    const [inventoryCount, equipmentCount] = await Promise.all([
        migrateInventoryItems(),
        migrateEquipmentItems(),
    ]);
    console.log(`Item metadata delta migration ${dryRun ? 'dry-run' : 'complete'}: items=${inventoryCount}, equipments=${equipmentCount}`);
} finally {
    await prisma.$disconnect();
}
