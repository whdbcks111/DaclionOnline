const PORTAL_HOST = 'gamebox.mcv.kr'
const GAME_HOST = 'daclion.mcv.kr'

export function isDaclionSite(): boolean {
  return window.location.hostname === GAME_HOST
}

/** 로컬 개발은 기존 단일 origin 경로를 유지한다. */
export function getPortalUrl(path = '/'): string {
  return isDaclionSite() ? `${window.location.protocol}//${PORTAL_HOST}${path}` : path
}

export function getGameStartUrl(): string {
  return window.location.hostname === PORTAL_HOST ? '/auth/daclion' : '/games/daclion/'
}
