import { randomInt, randomBytes } from 'crypto'

export function randomDigits(length: number): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += randomInt(0, 10).toString()
  }
  return result
}

export function randomBase64(byteLength: number): string {
  return randomBytes(byteLength).toString('base64')
}

export function randomHex(byteLength: number): string {
  return randomBytes(byteLength).toString('hex')
}
