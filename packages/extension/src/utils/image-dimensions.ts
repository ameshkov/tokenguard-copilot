/**
 * Extract image dimensions from raw binary data.
 *
 * Only the following formats are supported — anything else
 * causes the function to throw:
 * - PNG  (IHDR chunk)
 * - JPEG (SOF0 / SOF1 / SOF2 markers)
 * - GIF  (header + Logical Screen Descriptor)
 * - WebP (VP8 / VP8L / VP8X chunk)
 *
 * @internal Exported for tests only; not part of the
 *   public module API.
 *
 * @param data - Raw image file bytes.
 * @param mimeType - MIME type of the image (e.g.
 *   `image/png`).
 * @returns The width and height in pixels.
 * @throws If the format is unsupported or the data cannot
 *   be parsed.
 */
export function getImageDimensions(
  data: Uint8Array,
  mimeType: string,
): { width: number; height: number } {
  switch (mimeType) {
    case 'image/png':
      return parsePng(data);
    case 'image/jpeg':
    case 'image/jpg':
      return parseJpeg(data);
    case 'image/gif':
      return parseGif(data);
    case 'image/webp':
      return parseWebP(data);
    default:
      throw new Error(`Unsupported image format: ${mimeType}`);
  }
}

/**
 * Parse PNG IHDR chunk for image dimensions.
 *
 * PNG signature (8 bytes) + IHDR chunk header
 * (4 length + 4 type) → width (4 bytes) + height
 * (4 bytes), both big-endian uint32.
 */
function parsePng(data: Uint8Array): { width: number; height: number } {
  if (data.length < 33) {
    throw new Error('PNG data too short to contain IHDR');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // IHDR chunk starts at offset 16 (8-byte signature + 4-byte length + 4-byte "IHDR")
  const width = view.getUint32(16);
  const height = view.getUint32(20);

  return { width, height };
}

/**
 * Parse JPEG SOF0/SOF1/SOF2 markers for image dimensions.
 *
 * Scans segments for Start Of Frame markers (0xFFC0, 0xFFC1,
 * 0xFFC2) and reads the 16-bit height and width.
 */
function parseJpeg(data: Uint8Array): { width: number; height: number } {
  if (data.length < 4) {
    throw new Error('JPEG data too short');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2; // Skip SOI marker (0xFFD8)

  while (offset < data.length - 1) {
    // Find marker byte 0xFF
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if (marker >= 0xc0 && marker <= 0xc2) {
      if (offset + 10 > data.length) {
        throw new Error('JPEG SOF marker truncated');
      }
      // SOF payload: 1 byte precision + 2 bytes height + 2 bytes width
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return { width, height };
    }

    // SOS marker (0xDA) — no more SOF after this
    if (marker === 0xda) {
      break;
    }

    // Skip to next marker: marker segment has 2-byte length after marker
    // RST markers (0xD0–0xD7) and SOI (0xD8)/EOI (0xD9) have no length
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8 || marker === 0xd9) {
      offset += 2;
    } else {
      if (offset + 4 > data.length) {
        break;
      }
      const segLength = view.getUint16(offset + 2);
      offset += 2 + segLength;
    }
  }

  throw new Error('No SOF marker found in JPEG data');
}

/**
 * Parse GIF header for image dimensions.
 *
 * GIF signature (6 bytes) + Logical Screen Descriptor:
 * width at offset 6 (2 bytes, little-endian), height at
 * offset 8 (2 bytes, little-endian).
 */
function parseGif(data: Uint8Array): { width: number; height: number } {
  if (data.length < 10) {
    throw new Error('GIF data too short to contain header');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const width = view.getUint16(6, true); // little-endian
  const height = view.getUint16(8, true); // little-endian

  return { width, height };
}

/**
 * Parse WebP container for image dimensions.
 *
 * RIFF container: "RIFF" (4) + file size (4) + "WEBP" (4)
 * then format-specific chunk:
 * - VP8 :  VP8 header (3) + width/height from 16-bit signed
 *          values at offsets 6 and 8 of the VP8 frame header.
 * - VP8L: VP8L header (4) + 14-bit width/height packed in
 *         4 bytes at offset 4.
 * - VP8X: VP8X header (4) + at offset 4: 1-byte flags +
 *          3 bytes width-1 + 3 bytes height-1 (little-endian
 *          24-bit).
 */
function parseWebP(data: Uint8Array): { width: number; height: number } {
  if (data.length < 30) {
    throw new Error('WebP data too short');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Validate RIFF header
  if (
    view.getUint32(0) !== 0x52494646 || // "RIFF"
    view.getUint32(8) !== 0x57454250 // "WEBP"
  ) {
    throw new Error('Invalid WebP RIFF header');
  }

  const chunkTag = view.getUint32(12);
  const chunkStart = 16;

  switch (chunkTag) {
    case 0x56503820: {
      // "VP8 "
      // VP8 frame header: 3 bytes (0x9D 0x01 0x2A) then:
      // bytes 6-7: 16-bit signed width (little-endian)
      // bytes 8-9: 16-bit signed height (little-endian)
      if (data.length < chunkStart + 10) {
        throw new Error('VP8 chunk truncated');
      }
      const rawW = view.getInt16(chunkStart + 6, true);
      const rawH = view.getInt16(chunkStart + 8, true);
      const width = rawW & 0x3fff;
      const height = rawH & 0x3fff;
      return { width, height };
    }

    case 0x5650384c: {
      // "VP8L"
      // VP8L header: 1 byte (0x2F) then 4 bytes with packed
      // 14-bit width and 14-bit height
      if (data.length < chunkStart + 5) {
        throw new Error('VP8L chunk truncated');
      }
      const packed = view.getUint32(chunkStart + 1, true);
      const width = (packed & 0x3fff) + 1;
      const height = ((packed >> 14) & 0x3fff) + 1;
      return { width, height };
    }

    case 0x56503858: {
      // "VP8X"
      // VP8X: 1 byte flags + 3 bytes width-1 (little-endian 24-bit)
      // + 3 bytes height-1 (little-endian 24-bit)
      if (data.length < chunkStart + 7) {
        throw new Error('VP8X chunk truncated');
      }
      const b0 = view.getUint8(chunkStart + 1);
      const b1 = view.getUint8(chunkStart + 2);
      const b2 = view.getUint8(chunkStart + 3);
      const width = ((b2 << 16) | (b1 << 8) | b0) + 1;

      const h0 = view.getUint8(chunkStart + 4);
      const h1 = view.getUint8(chunkStart + 5);
      const h2 = view.getUint8(chunkStart + 6);
      const height = ((h2 << 16) | (h1 << 8) | h0) + 1;

      return { width, height };
    }

    default:
      throw new Error(`Unsupported WebP chunk type: 0x${chunkTag.toString(16)}`);
  }
}
