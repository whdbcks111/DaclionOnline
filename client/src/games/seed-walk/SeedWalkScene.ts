import Phaser from 'phaser'
import { createSeedWalkMap, seedWalkHash, seedWalkGrassColor, SEED_WALK_SIZE, SEED_WALK_TILE, SEED_WALK_VERSION, SeedWalkTerrain, type SeedWalkSnapshot } from '@shared/seedWalk'

interface Actor { node: Phaser.GameObjects.Container; x: number; y: number }

/** Rendering/interpolation only: positions and collision are owned by the server. */
export class SeedWalkScene extends Phaser.Scene {
  private readonly selfId: number
  private readonly readState: () => SeedWalkSnapshot | null
  private readonly actors = new Map<number, Actor>()
  private previousTick = -1
  constructor(selfId: number, readState: () => SeedWalkSnapshot | null) {
    super('seed-walk')
    this.selfId = selfId
    this.readState = readState
  }
  create() {
    const state = this.readState()
    if (!state || state.version !== SEED_WALK_VERSION) return
    const map = createSeedWalkMap(state.seed)
    const tile = SEED_WALK_TILE, size = SEED_WALK_SIZE * tile
    const art = this.make.graphics({ x: 0, y: 0 })
    for (let y = 0; y < SEED_WALK_SIZE; y++) for (let x = 0; x < SEED_WALK_SIZE; x++) {
      const terrain = SeedWalkTerrain.fromCode(map.tiles[y * SEED_WALK_SIZE + x])
      const px = x * tile, py = y * tile
      const color = terrain === SeedWalkTerrain.GRASS ? seedWalkGrassColor(state.seed, x, y) : terrain.color
      art.fillStyle(color).fillRect(px, py, tile, tile)
      if (terrain === SeedWalkTerrain.GRASS && seedWalkHash(`${state.seed}:${x}:${y}`) % 4 === 0) {
        art.lineStyle(1, 0x719963, .65).lineBetween(px + 12, py + 19, px + 14, py + 14).lineBetween(px + 14, py + 14, px + 17, py + 18)
      }
      if (terrain === SeedWalkTerrain.WATER) art.fillStyle(0x77aab1, .6).fillRect(px + 7, py + 18, 12, 2)
      if (terrain === SeedWalkTerrain.ROCK) art.fillStyle(0x9da8a4).fillRoundedRect(px + 4, py + 4, tile - 8, tile - 9, 5)
    }
    art.generateTexture('land', size, size)
    art.destroy()
    this.add.image(0, 0, 'land').setOrigin(0)
    this.add.circle(32.5 * tile, 32.5 * tile, 38).setStrokeStyle(2, 0xf4e6bf).setFillStyle(0xf4e6bf, .12)
    const camera = this.cameras.main
    camera.setBounds(0, 0, size, size)
    const resize = () => camera.setZoom(Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / 650, .75, 1.2))
    resize()
    this.scale.on('resize', resize)
    this.events.once('shutdown', () => this.scale.off('resize', resize))
  }
  update(_time: number, delta: number) {
    const state = this.readState()
    if (!state) return
    if (state.tick !== this.previousTick) {
      this.previousTick = state.tick
      const present = new Set(state.players.map(player => player.id))
      for (const [id, actor] of this.actors) if (!present.has(id)) { actor.node.destroy(); this.actors.delete(id) }
      for (const player of state.players) {
        let actor = this.actors.get(player.id)
        if (!actor) {
          const self = player.id === this.selfId
          const foot = this.add.ellipse(0, 9, 22, 8, 0x344b38, .3)
          const body = this.add.circle(0, 0, 10, player.color).setStrokeStyle(self ? 3 : 2, self ? 0xffffff : 0x344b38)
          const eyes = this.add.graphics().fillStyle(0x263d39).fillCircle(-3, -1, 1.5).fillCircle(3, -1, 1.5)
          const label = this.add.text(0, -23, `${player.name}${self ? ' (나)' : ''}`, { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#304537', strokeThickness: 4 }).setOrigin(.5, 1)
          const node = this.add.container(player.x, player.y, [foot, body, eyes, label]).setDepth(10)
          actor = { node, x: player.x, y: player.y }
          this.actors.set(player.id, actor)
          if (self) this.cameras.main.startFollow(node, true, .16, .16)
        }
        actor.x = player.x; actor.y = player.y
      }
    }
    const blend = 1 - Math.exp(-Math.min(delta, 100) / 55)
    for (const actor of this.actors.values()) {
      actor.node.x = Phaser.Math.Linear(actor.node.x, actor.x, blend)
      actor.node.y = Phaser.Math.Linear(actor.node.y, actor.y, blend)
      actor.node.setDepth(10 + actor.node.y / 10000)
    }
  }
}
