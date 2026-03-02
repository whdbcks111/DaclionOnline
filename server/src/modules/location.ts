import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from "../utils/logger.js";
import { defineLocation, getAllLocationData, getAllLocations, reloadAllLocations } from "../models/Location.js";
import type { LocationData } from "../models/Location.js";
import { getIO } from "./socket.js";
import { getSession } from "./login.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCATIONS_JSON = path.join(__dirname, '../data/locations.json');

/** JSON 파일에서 장소 데이터 로드 후 defineLocation 등록 */
export function loadLocationsFromJson(): void {
    try {
        const raw = fs.readFileSync(LOCATIONS_JSON, 'utf-8');
        const locations: LocationData[] = JSON.parse(raw);
        for (const loc of locations) {
            defineLocation(loc);
        }
        logger.success(`장소 ${locations.length}개 로드 완료 (${LOCATIONS_JSON})`);
    } catch (e) {
        logger.error('locations.json 로드 실패:', e);
    }
}

/** 장소 데이터를 JSON 파일에 저장 */
function saveLocationsToJson(locations: LocationData[]): void {
    fs.writeFileSync(LOCATIONS_JSON, JSON.stringify(locations, null, 2), 'utf-8');
}

/** 모든 장소의 update 호출 (게임 루프에서 매 프레임) */
export function updateLocations(dt: number): void {
    for (const location of getAllLocations()) {
        location.update(dt);
    }
}

/** 장소 모듈 초기화 */
export function initLocation(): void {
    loadLocationsFromJson();

    const io = getIO();

    io.on('connection', socket => {
        socket.on('adminRequestLocations', () => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session || (session.permission ?? 0) < 10) return;

            socket.emit('adminLocations', getAllLocationData());
        });

        socket.on('adminSaveLocations', (locations: unknown) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session || (session.permission ?? 0) < 10) {
                socket.emit('adminSaveResult', { error: '권한이 없습니다.' });
                return;
            }

            if (!Array.isArray(locations)) {
                socket.emit('adminSaveResult', { error: '잘못된 데이터 형식입니다.' });
                return;
            }

            try {
                const data = locations as LocationData[];
                saveLocationsToJson(data);
                reloadAllLocations(data);
                logger.success(`어드민 ${session.username}: 장소 데이터 저장 (${data.length}개)`);
                socket.emit('adminSaveResult', { ok: true });
            } catch (e) {
                logger.error('locations.json 저장 실패:', e);
                socket.emit('adminSaveResult', { error: '저장 중 오류가 발생했습니다.' });
            }
        });
    });

    logger.success('장소 모듈 초기화 완료');
}
