// Width × height for the preview's details (US-FILE-06): images from their header (sharp reads only that), MP4 and
// MOV from the video track's `tkhd` box, no ffprobe. Null when unknown.
import { open, type FileHandle } from 'node:fs/promises';
import { PREVIEW_VIDEOS } from './mime';

export interface Dimensions {
  width: number;
  height: number;
}

/** Image orientations 5–8 are stored on their side (EXIF): width and height swap on screen. */
const SIDEWAYS = new Set([5, 6, 7, 8]);

async function imageDimensions(path: string): Promise<Dimensions | null> {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(path, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) return null;
  return meta.orientation && SIDEWAYS.has(meta.orientation)
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

/** Boxes inside `moov` (and its `trak`, `mdia`…) are read from memory; `moov` itself is at most this big. */
const MAX_MOOV = 32 * 1024 * 1024;

async function readAt(fh: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** [type, start of body, end] for each box in buf[from, to). */
function* boxes(buf: Buffer, from: number, to: number): Generator<[string, number, number]> {
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return;
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) return;
    yield [type, at + header, at + size];
    at += size;
  }
}

/** The first track whose `tkhd` has a size: the video. Width and height are 16.16 fixed point at its end. */
function trackSize(moov: Buffer): Dimensions | null {
  for (const [type, start, end] of boxes(moov, 0, moov.length)) {
    if (type !== 'trak') continue;
    for (const [t, s, e] of boxes(moov, start, end)) {
      if (t !== 'tkhd' || e - s < 84) continue;
      const width = moov.readUInt32BE(e - 8) >>> 16;
      const height = moov.readUInt32BE(e - 4) >>> 16;
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return null;
}

async function videoDimensions(path: string, size: number): Promise<Dimensions | null> {
  const fh = await open(path, 'r');
  try {
    let at = 0;
    while (at + 8 <= size) {
      const head = await readAt(fh, at, 16);
      if (head.length < 8) return null;
      let boxSize = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      let header = 8;
      if (boxSize === 1) {
        boxSize = Number(head.readBigUInt64BE(8));
        header = 16;
      } else if (boxSize === 0) {
        boxSize = size - at;
      }
      if (boxSize < header) return null;
      if (type === 'moov') {
        const length = boxSize - header;
        if (length > MAX_MOOV) return null;
        return trackSize(await readAt(fh, at + header, length));
      }
      at += boxSize;
    }
    return null;
  } finally {
    await fh.close();
  }
}

export async function dimensionsOf(path: string, mime: string | null, size: number): Promise<Dimensions | null> {
  try {
    if (mime?.startsWith('image/') && mime !== 'image/svg+xml') return await imageDimensions(path);
    if (mime && PREVIEW_VIDEOS.has(mime) && mime !== 'video/webm') return await videoDimensions(path, size);
  } catch {
    // Unreadable or not what its name says: no dimensions.
  }
  return null;
}
