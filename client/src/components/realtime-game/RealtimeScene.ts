import Phaser from 'phaser'
import { seedWalkHash, seedWalkGrassColor, SEED_WALK_TILE, SEED_WALK_VERSION, type SeedWalkSnapshot } from '@shared/seedWalk'

import { TEST2_MAP, type Test2Snapshot } from '@shared/test2'

interface Actor { node: Phaser.GameObjects.Container; x: number; y: number }

/** Rendering/interpolation only: positions and collision are owned by the server. */
export class RealtimeScene extends Phaser.Scene {
  private readonly selfId: number
  private readonly readState: () => SeedWalkSnapshot | null
  private readonly actors = new Map<number, Actor>()
  private readonly platformer: boolean
  private previousTick = -1
  private ground!: Phaser.GameObjects.Graphics
  private groundKey = ''
  private readonly project: (id: number, x: number, y: number) => void
  constructor(selfId: number, readState: () => SeedWalkSnapshot | null, project: (id: number, x: number, y: number) => void, platformer = false) {
    super('realtime-game')
    this.platformer = platformer
    this.selfId = selfId
    this.readState = readState
    this.project = project
  }
  create() {
    const state = this.readState()
    if (!state || (!this.platformer && state.version !== SEED_WALK_VERSION)) return
    this.ground = this.add.graphics().setDepth(-1)
    const camera = this.cameras.main
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
          const body = (this.platformer ? this.add.rectangle(0, 0, 22, 28, player.color) : this.add.circle(0, 0, 10, player.color)).setStrokeStyle(self ? 3 : 2, self ? 0xffffff : 0x344b38)
          const eyes = this.add.graphics().fillStyle(0x263d39).fillCircle(-3, -1, 1.5).fillCircle(3, -1, 1.5)
          const label = this.add.text(0, -23, `${player.name}${self ? ' (나)' : ''}`, { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#304537', strokeThickness: 4 }).setOrigin(.5, 1)
          const node = this.add.container(player.x, player.y, [foot, body, eyes, label]).setDepth(10)
          actor = { node, x: player.x, y: player.y }
          this.actors.set(player.id, actor)
          if (self) {
            this.cameras.main.startFollow(node, true, .16, .16)
            if (this.platformer) this.cameras.main.setFollowOffset(-120, 0)
          }
        }
        actor.x = player.x; actor.y = player.y
      }
    }
    const camera = this.cameras.main, tile = SEED_WALK_TILE
    const left = Math.floor(camera.worldView.x / tile) - 3, top = Math.floor(camera.worldView.y / tile) - 3
    const cols = Math.ceil(this.scale.width / camera.zoom / tile) + 7, rows = Math.ceil(this.scale.height / camera.zoom / tile) + 7
    const checkpoint = this.platformer ? (state as Test2Snapshot).players.find(p => p.id === this.selfId)?.checkpoint ?? 0 : -1
    const key = `${left}:${top}:${cols}:${rows}:${checkpoint}`
    if (key !== this.groundKey) {
      this.groundKey = key; this.ground.clear()
      if (this.platformer) {
        for (const platform of TEST2_MAP) {
          if (platform.x > (left + cols) * tile || platform.x + platform.width < left * tile) continue
          this.ground.fillStyle(0x596f7d).fillRect(platform.x, platform.y, platform.width, 28)
          this.ground.fillStyle(0xa7cbb4).fillRect(platform.x, platform.y, platform.width, 6)
          if (platform.checkpoint >= 0) {
            this.ground.lineStyle(3, 0x485d66).lineBetween(platform.x + 65, platform.y - 64, platform.x + 65, platform.y)
            this.ground.fillStyle(platform.finish || platform.checkpoint <= checkpoint ? 0xe7bb64 : 0x6a9da5).fillTriangle(platform.x + 65, platform.y - 64, platform.x + 100, platform.y - 53, platform.x + 65, platform.y - 41)
          }
        }
      } else {
      for (let y = top; y < top + rows; y++) for (let x = left; x < left + cols; x++) {
        const px = x * tile, py = y * tile
        this.ground.fillStyle(seedWalkGrassColor(state.seed, x, y)).fillRect(px, py, tile, tile)
        if (seedWalkHash(`${state.seed}:${x}:${y}`) % 4 === 0) this.ground.lineStyle(1, 0x719963, .65).lineBetween(px + 12, py + 19, px + 14, py + 14).lineBetween(px + 14, py + 14, px + 17, py + 18)
      }      }

    }
    const blend = 1 - Math.exp(-Math.min(delta, 100) / 55)
    for (const [id, actor] of this.actors) {
      actor.node.x = Phaser.Math.Linear(actor.node.x, actor.x, blend)
      actor.node.y = Phaser.Math.Linear(actor.node.y, actor.y, blend)
      this.project(id, (actor.node.x - camera.worldView.x) * camera.zoom, (actor.node.y - camera.worldView.y) * camera.zoom - 48)
    }
  }
}
