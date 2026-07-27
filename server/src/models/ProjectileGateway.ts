import type Projectile from './Projectile.js';
import type { SpawnProjectileDataOptions } from './Projectile.js';

type ProjectileSpawner = (options: SpawnProjectileDataOptions) => Projectile | undefined;

let projectileSpawner: ProjectileSpawner | undefined;

/** Projectile 모듈을 직접 import하지 않고도 아이템 효과가 투사체 생성을 요청하는 공개 경계. */
export function registerProjectileSpawner(spawner: ProjectileSpawner): void {
    projectileSpawner = spawner;
}

export function spawnProjectileThroughGateway(
    options: SpawnProjectileDataOptions,
): Projectile | undefined {
    return projectileSpawner?.(options);
}
