import { createDecipheriv, createHash, ECDH, randomBytes } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Tesla 2026.20 encrypted dashcam container.
 *
 * Layout (all integers big-endian):
 *   0x0000  8   plaintext size (uint64)
 *   0x0004  16  correlation id sent to Tesla (overlaps the low half of the size field,
 *               NOT unique: two clips of identical size share it)
 *   0x0014  4   metadata offset, always 0x1000 - this is how an encrypted file is detected
 *   0x1000  4   key_id (uint32, never zero in a complete file)
 *   0x1004  65  public key (uncompressed EC point, starts with 0x04)
 *   0x1045  17  VIN (ASCII)
 *   0x1056  8   timestamp (uint64)
 *   0x105e  44  wrapped file key
 *   0x2000+     payload: 4096-byte pages, each an independent AES-128-CBC message with
 *               IV = MD5( MD5(fileKey) || ascii(pageIndex) zero-padded to 32 bytes )
 */
export const PAGE_SIZE = 4096
const PAYLOAD_OFFSET = 0x2000
const METADATA_OFFSET = 0x1000
const METADATA_OFFSET_FIELD = 0x14
const ID_OFFSET = 4
const ID_SIZE = 16
const KEY_ID_OFFSET = METADATA_OFFSET
const KEY_ID_SIZE = 4
const PUBLIC_KEY_OFFSET = KEY_ID_OFFSET + KEY_ID_SIZE
const PUBLIC_KEY_SIZE = 65
const EC_COORDINATE_SIZE = 32
/** The car drops leading zero bytes of a coordinate, so the key field is not always 65 bytes. */
const MIN_PUBLIC_KEY_SIZE = 61
const VIN_SIZE = 17
const TIMESTAMP_SIZE = 8
const WRAPPED_KEY_SIZE = 44
const METADATA_END = PUBLIC_KEY_OFFSET + PUBLIC_KEY_SIZE + VIN_SIZE + TIMESTAMP_SIZE + WRAPPED_KEY_SIZE
const AES_KEY_SIZE = 16
const PAGES_PER_READ = 256
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/

export interface EncryptedHeader {
  id: string
  plaintextSize: number
  keyId: number
  /** Always a valid 65-byte uncompressed P-256 point (coordinates zero-padded). */
  publicKey: Buffer
  /** The key bytes exactly as stored in the file; differs from `publicKey` when the car trimmed a zero byte. */
  publicKeyRaw: Buffer
  vin: string
  timestamp: bigint
  wrappedKey: Buffer
}

export type ProbeResult =
  | { kind: 'plain' }
  | { kind: 'encrypted'; header: EncryptedHeader }
  /** Encrypted, but the car wrote no key metadata, so Tesla cannot issue a key (event.json, thumb.png). */
  | { kind: 'keyless' }
  | { kind: 'invalid'; reason: string }

export class DecryptCancelledError extends Error {
  constructor() {
    super('Decryption cancelled')
  }
}

function formatId(bytes: Buffer): string {
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function hasEncryptedSignature(probe: Buffer): boolean {
  return (
    probe.length >= METADATA_OFFSET_FIELD + 4 &&
    probe.readUInt32BE(METADATA_OFFSET_FIELD) === METADATA_OFFSET
  )
}

function isOnP256(point: Buffer) {
  try {
    ECDH.convertKey(point, 'prime256v1', undefined, undefined, 'compressed')
    return true
  } catch {
    return false
  }
}

/**
 * Turns the stored key bytes into a 65-byte uncompressed point. When the car trimmed leading
 * zero bytes, every split of the missing bytes between X and Y is tried and the one that lies
 * on the curve wins.
 */
function normalizePublicKey(raw: Buffer): Buffer | null {
  if (raw[0] !== 0x04) {
    return null
  }
  const coordinates = raw.subarray(1)
  const missing = 2 * EC_COORDINATE_SIZE - coordinates.length
  if (missing === 0) {
    return isOnP256(raw) ? raw : null
  }
  for (let xMissing = 0; xMissing <= missing; xMissing += 1) {
    const xLength = EC_COORDINATE_SIZE - xMissing
    const yLength = EC_COORDINATE_SIZE - (missing - xMissing)
    if (xLength + yLength !== coordinates.length) {
      continue
    }
    const point = Buffer.alloc(PUBLIC_KEY_SIZE)
    point[0] = 0x04
    coordinates.copy(point, 1 + xMissing, 0, xLength)
    coordinates.copy(point, 1 + EC_COORDINATE_SIZE + (missing - xMissing), xLength)
    if (isOnP256(point)) {
      return point
    }
  }
  return null
}

export function parseHeader(probe: Buffer, fileSize: number): ProbeResult {
  if (!hasEncryptedSignature(probe)) {
    return { kind: 'plain' }
  }
  if (probe.length < KEY_ID_OFFSET + KEY_ID_SIZE || fileSize <= PAYLOAD_OFFSET) {
    return { kind: 'invalid', reason: 'File is truncated (recording was interrupted)' }
  }
  if (probe.subarray(KEY_ID_OFFSET, KEY_ID_OFFSET + KEY_ID_SIZE).equals(Buffer.alloc(KEY_ID_SIZE))) {
    return { kind: 'keyless' }
  }

  const plaintextSizeBig = probe.readBigUInt64BE(0)
  if (plaintextSizeBig === 0n || plaintextSizeBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { kind: 'invalid', reason: 'Header declares an invalid video size' }
  }
  const plaintextSize = Number(plaintextSizeBig)
  const pagesNeeded = Math.ceil(plaintextSize / PAGE_SIZE)
  if (fileSize < PAYLOAD_OFFSET + pagesNeeded * PAGE_SIZE) {
    return { kind: 'invalid', reason: 'File is truncated (recording was interrupted)' }
  }

  // The key field has no length prefix: find the length at which a valid VIN follows and the
  // key bytes form a point on the curve. Longest first, since 65 bytes is the common case.
  for (let keySize = PUBLIC_KEY_SIZE; keySize >= MIN_PUBLIC_KEY_SIZE; keySize -= 1) {
    const vinOffset = PUBLIC_KEY_OFFSET + keySize
    const wrappedKeyOffset = vinOffset + VIN_SIZE + TIMESTAMP_SIZE
    if (probe.length < wrappedKeyOffset + WRAPPED_KEY_SIZE) {
      continue
    }
    const vin = probe.subarray(vinOffset, vinOffset + VIN_SIZE).toString('latin1')
    if (!VIN_PATTERN.test(vin)) {
      continue
    }
    const publicKeyRaw = Buffer.from(probe.subarray(PUBLIC_KEY_OFFSET, vinOffset))
    const publicKey = normalizePublicKey(publicKeyRaw)
    if (!publicKey) {
      continue
    }
    return {
      kind: 'encrypted',
      header: {
        id: formatId(probe.subarray(ID_OFFSET, ID_OFFSET + ID_SIZE)),
        plaintextSize,
        keyId: probe.readUInt32BE(KEY_ID_OFFSET),
        publicKey,
        publicKeyRaw,
        vin,
        timestamp: probe.readBigUInt64BE(vinOffset + VIN_SIZE),
        wrappedKey: Buffer.from(probe.subarray(wrappedKeyOffset, wrappedKeyOffset + WRAPPED_KEY_SIZE)),
      },
    }
  }

  return { kind: 'invalid', reason: 'Unrecognised key metadata in the file header' }
}

/** Reads only the header bytes, so it is cheap enough to run on every file of a USB drive. */
export async function probeFile(filePath: string): Promise<ProbeResult> {
  const handle = await open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    const probe = Buffer.alloc(Math.min(size, METADATA_END))
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
    return parseHeader(probe.subarray(0, bytesRead), size)
  } finally {
    await handle.close()
  }
}

/** Fast check used by the library scanner: reads 24 bytes. */
export async function isEncryptedFile(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, 'r')
    try {
      const probe = Buffer.alloc(METADATA_OFFSET_FIELD + 4)
      const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
      return hasEncryptedSignature(probe.subarray(0, bytesRead))
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}

export function pageIv(rootIv: Buffer, pageIndex: number): Buffer {
  const digits = Buffer.from(String(pageIndex), 'ascii')
  const material = Buffer.alloc(Math.max(32, rootIv.length + digits.length))
  rootIv.copy(material, 0)
  digits.copy(material, rootIv.length)
  return createHash('md5').update(material).digest()
}

export function decryptPage(key: Buffer, rootIv: Buffer, pageIndex: number, page: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-cbc', key, pageIv(rootIv, pageIndex))
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(page), decipher.final()])
}

export interface DecryptFileOptions {
  /** Validates that page 0 decrypts to an ISO-BMFF ("ftyp") file - catches a wrong key. */
  expectMp4: boolean
  signal?: AbortSignal
  onBytes?: (bytes: number) => void
}

/**
 * Decrypts `sourcePath` into `destinationPath`. Writes to a temporary file next to the
 * destination and renames it at the end, so a failed or cancelled run never leaves a
 * half-written video behind.
 */
export async function decryptFile(
  sourcePath: string,
  destinationPath: string,
  header: EncryptedHeader,
  key: Buffer,
  options: DecryptFileOptions,
): Promise<number> {
  if (key.length !== AES_KEY_SIZE) {
    throw new Error(`Tesla returned a ${key.length}-byte key, expected ${AES_KEY_SIZE}`)
  }

  const rootIv = createHash('md5').update(key).digest()
  const tempPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${randomBytes(4).toString('hex')}.part`,
  )

  const source = await open(sourcePath, 'r')
  let target: Awaited<ReturnType<typeof open>> | null = null
  let completed = false

  try {
    target = await open(tempPath, 'w')
    const buffer = Buffer.alloc(PAGE_SIZE * PAGES_PER_READ)
    let written = 0
    let pageIndex = 0
    let position = PAYLOAD_OFFSET

    while (written < header.plaintextSize) {
      if (options.signal?.aborted) {
        throw new DecryptCancelledError()
      }

      const remainingPages = Math.ceil((header.plaintextSize - written) / PAGE_SIZE)
      const pagesToRead = Math.min(PAGES_PER_READ, remainingPages)
      const { bytesRead } = await source.read(buffer, 0, pagesToRead * PAGE_SIZE, position)
      if (bytesRead === 0) {
        throw new Error('File is truncated (recording was interrupted)')
      }
      if (bytesRead % PAGE_SIZE !== 0) {
        throw new Error('File ends in the middle of an encrypted page')
      }
      position += bytesRead

      const output: Buffer[] = []
      for (let offset = 0; offset < bytesRead; offset += PAGE_SIZE) {
        let plain = decryptPage(key, rootIv, pageIndex, buffer.subarray(offset, offset + PAGE_SIZE))
        if (pageIndex === 0 && options.expectMp4 && plain.subarray(4, 8).toString('latin1') !== 'ftyp') {
          throw new Error('Decrypted data is not a video - the key does not match this file')
        }
        const remaining = header.plaintextSize - written
        if (remaining < plain.length) {
          plain = plain.subarray(0, remaining)
        }
        output.push(plain)
        written += plain.length
        pageIndex += 1
      }

      const chunk = Buffer.concat(output)
      await target.write(chunk)
      options.onBytes?.(chunk.length)
    }

    await target.close()
    target = null
    await rename(tempPath, destinationPath)
    completed = true
    return written
  } finally {
    await source.close()
    if (target) {
      await target.close().catch(() => undefined)
    }
    if (!completed) {
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  }
}
