export interface ZipInputFile {
  name: string;
  content: string | Uint8Array;
}

export interface ExtractedZipFile {
  name: string;
  bytes: Uint8Array;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number): void { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number): void { view.setUint32(offset, value >>> 0, true); }

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function join(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

/** Creates a standards-compliant ZIP using the STORE method (no compression). */
export function createZip(files: ZipInputFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const safeName = file.name.replace(/^\/+/, '').replace(/\\/g, '/');
    if (!safeName || safeName.split('/').some((part) => part === '..')) continue;
    const nameBytes = encoder.encode(safeName);
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const checksum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, stamp.time);
    write16(localView, 12, stamp.date);
    write32(localView, 14, checksum);
    write32(localView, 18, data.length);
    write32(localView, 22, data.length);
    write16(localView, 26, nameBytes.length);
    write16(localView, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, stamp.time);
    write16(centralView, 14, stamp.date);
    write32(centralView, 16, checksum);
    write32(centralView, 20, data.length);
    write32(centralView, 24, data.length);
    write16(centralView, 28, nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length + data.length;
  }

  const centralDirectory = join(centralParts);
  const localData = join(localParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, centralParts.length);
  write16(endView, 10, centralParts.length);
  write32(endView, 12, centralDirectory.length);
  write32(endView, 16, localData.length);
  write16(endView, 20, 0);
  return join([localData, centralDirectory, end]);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot extract compressed ZIP entries. Try a ZIP file created with standard Deflate compression in a newer browser.');
  }
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Extracts ordinary ZIP archives with STORE or DEFLATE entries. */
export async function extractZip(buffer: ArrayBuffer): Promise<ExtractedZipFile[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;
  const minOffset = Math.max(0, bytes.length - 22 - 65535);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error('This file is not a valid ZIP archive.');

  const count = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const extracted: ExtractedZipFile[] = [];
  let totalExpanded = 0;

  if (count > 5000) throw new Error('This ZIP contains too many entries to inspect safely (maximum 5,000).');

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIP directory is damaged or unsupported.');
    const generalPurposeFlags = view.getUint16(cursor + 8, true);
    if (generalPurposeFlags & 0x0001) throw new Error(`Encrypted ZIP entries are not supported (${decoder.decode(bytes.slice(cursor + 46, cursor + 46 + view.getUint16(cursor + 28, true)))}).`);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (uncompressedSize > 12 * 1024 * 1024) throw new Error(`ZIP entry is too large to read safely: ${name}`);
    totalExpanded += uncompressedSize;
    if (totalExpanded > 24 * 1024 * 1024) throw new Error('The expanded ZIP exceeds the 24 MB reading limit.');

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`ZIP entry header is invalid: ${name}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let content: Uint8Array;
    if (method === 0) content = compressed;
    else if (method === 8) content = await inflateRaw(compressed);
    else throw new Error(`ZIP compression method ${method} is not supported (${name}).`);
    if (content.byteLength !== uncompressedSize) throw new Error(`ZIP entry size does not match its directory record (${name}).`);
    extracted.push({ name, bytes: content });
  }
  return extracted;
}
