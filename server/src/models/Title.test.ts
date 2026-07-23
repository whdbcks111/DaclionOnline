import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';
import { PlayerProgress } from './Progress.js';
import TitleBook, { getAllTitles } from './Title.js';
import type Player from './Player.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import { GameTags } from '../../../shared/tags.js';
import '../data/jobs.js';
import '../data/progress.js';
import '../data/statusEffects.js';
import '../data/titles.js';

class TestTitlePlayer extends Entity {
    override readonly name = '칭호 시험 플레이어';
    readonly userId: number;
    readonly progress: PlayerProgress;
    readonly titles: TitleBook;
    readonly career = { hasJob: (_id: string) => false };

    constructor(progress = PlayerProgress.createEmpty(9701)) {
        super(100, 0, 'title-test', {
            maxLife: 1_000,
            atk: 100,
            magicForce: 80,
        }, Equipment.createEmpty(), undefined, [GameTags.ENTITY_PLAYER, GameTags.TRAIT_LIVING]);
        this.userId = progress.playerId;
        this.progress = progress;
        this.titles = new TitleBook(this as unknown as Player);
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

class TestWolf extends Entity {
    override readonly name = '시험 늑대';

    constructor() {
        super(1, 0, 'title-test', { maxLife: 100 }, Equipment.createEmpty(), undefined, [
            GameTags.ENTITY_MONSTER,
            GameTags.ENTITY_BEAST,
            GameTags.ENTITY_WOLF,
            GameTags.TRAIT_LIVING,
        ]);
    }
}

test('늑대 50마리를 처치하면 늑대 학살자를 획득한다', () => {
    const player = new TestTitlePlayer();
    for (let i = 0; i < 50; i++) {
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new TestWolf(),
            data: { causeType: 'attack' },
        });
    }

    const acquired = player.titles.refreshAcquisitions(false);

    assert.ok(acquired.some(title => title.id === 'title:wolf_slayer'));
    assert.equal(player.titles.isOwned('늑대 학살자'), true);
});

test('늑대 학살자는 늑대를 대상으로 지정한 동안 공격력과 마법력을 5% 높인다', () => {
    const player = new TestTitlePlayer();
    player.titles.grant('title:wolf_slayer', 'test', false);
    assert.equal(player.titles.equip('늑대학살자').success, true);
    assert.equal(player.attribute.get(AttributeType.ATK), 100);
    assert.equal(player.attribute.get(AttributeType.MAGIC_FORCE), 80);

    player.currentTarget = new TestWolf();
    player.titles.refreshPassiveEffects();

    assert.equal(player.attribute.get(AttributeType.ATK), 105);
    assert.equal(player.attribute.get(AttributeType.MAGIC_FORCE), 84);

    player.currentTarget = null;
    player.titles.refreshPassiveEffects();
    assert.equal(player.attribute.get(AttributeType.ATK), 100);
    assert.equal(player.attribute.get(AttributeType.MAGIC_FORCE), 80);
});

test('칭호 소유와 장착 상태는 PlayerProgress로 복원된다', () => {
    const progress = PlayerProgress.createEmpty(9702);
    const first = new TestTitlePlayer(progress);
    first.titles.grant('title:slime_researcher', 'test', false);
    assert.equal(first.titles.equip('슬라임 연구가').success, true);

    const restored = new TestTitlePlayer(progress);

    assert.equal(restored.titles.isOwned('title:slime_researcher'), true);
    assert.equal(restored.titles.equippedName, '슬라임 연구가');
});

test('관리자 회수 칭호는 패시브와 장착을 제거하고 다시 부여할 때까지 자동 획득을 막는다', () => {
    const player = new TestTitlePlayer();
    for (let i = 0; i < 50; i++) {
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new TestWolf(),
        });
    }
    player.titles.refreshAcquisitions(false);
    player.titles.equip('늑대 학살자');
    player.currentTarget = new TestWolf();
    player.titles.refreshPassiveEffects();
    assert.equal(player.attribute.get(AttributeType.ATK), 105);

    const revoked = player.titles.revoke('늑대 학살자', 'test', false);

    assert.equal(revoked.success, true);
    assert.equal(player.titles.isOwned('늑대 학살자'), false);
    assert.equal(player.titles.equippedName, '');
    assert.equal(player.attribute.get(AttributeType.ATK), 100);
    assert.equal(player.titles.refreshAcquisitions(false).length, 0);

    assert.equal(player.titles.grant('늑대 학살자', 'test', false).success, true);
    assert.equal(player.titles.isOwned('늑대 학살자'), true);
});

test('레거시 칭호 대부분과 신규 생활·보스 칭호를 등록한다', () => {
    const names = new Set(getAllTitles().map(title => title.name));
    for (const name of [
        '늑대 학살자', '언데드 킬러', '언데드 슬레이어', '벌레 사냥꾼', '불꽃 수집가',
        '곡괭이 살해자', '액스 파이터', '격투가', '광부의 길', '학살자', '몰살자',
        '아크스펠', '마도사', '속사', '페이탈디드', '초감각',
        '슬라임 연구가', '거인에게 맞서는 자', '광맥을 읽는 자', '전설을 낚은 자',
        '불꽃과 망치의 주인', '삼원소 조율자',
    ]) assert.equal(names.has(name), true, name);
    assert.equal(names.size, 22);
});
