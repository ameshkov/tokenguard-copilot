import { describe, it, expect } from 'vitest';
import { getImageDimensions } from './image-dimensions.js';

/**
 * Build a minimal valid PNG (4×4) with IHDR chunk.
 *
 * PNG signature (8) + chunk length (4) + "IHDR" (4) +
 * IHDR data (13) + CRC (4) = 33 bytes minimum.
 */
function minimalPng(): Uint8Array {
  // PNG signature
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // Chunk length: 13 (big-endian)
    0x00, 0x00, 0x00, 0x0d,
    // "IHDR"
    0x49, 0x48, 0x44, 0x52,
    // Width: 4 (big-endian)
    0x00, 0x00, 0x00, 0x04,
    // Height: 4 (big-endian)
    0x00, 0x00, 0x00, 0x04,
    // Bit depth: 8
    0x08,
    // Color type: 6 (RGBA)
    0x06,
    // Compression: 0
    0x00,
    // Filter: 0
    0x00,
    // Interlace: 0
    0x00,
    // CRC (dummy value)
    0x00, 0x00, 0x00, 0x00,
  ]);
  return bytes;
}

/**
 * Build a minimal valid JPEG (640×480) with SOF0 marker.
 *
 * SOI marker (2) + SOF0 segment (19) = 21 bytes.
 */
function minimalJpeg(): Uint8Array {
  const bytes = new Uint8Array([
    // SOI marker
    0xff, 0xd8,
    // SOF0 marker
    0xff, 0xc0,
    // Segment length: 17 (big-endian)
    0x00, 0x11,
    // Precision: 8
    0x08,
    // Height: 480 (0x01E0, big-endian)
    0x01, 0xe0,
    // Width: 640 (0x0280, big-endian)
    0x02, 0x80,
    // Number of components: 3
    0x03,
    // Component 1: ID=1, sampling=0x11, qtable=0
    0x01, 0x11, 0x00,
    // Component 2: ID=2, sampling=0x11, qtable=0
    0x02, 0x11, 0x00,
    // Component 3: ID=3, sampling=0x11, qtable=0
    0x03, 0x11, 0x00,
  ]);
  return bytes;
}

/**
 * Build a minimal valid GIF (100×200) with header + LSD.
 *
 * GIF signature (6) + LSD (7) = 13 bytes.
 */
function minimalGif(): Uint8Array {
  const bytes = new Uint8Array([
    // "GIF89a"
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    // Width: 100 (0x0064, little-endian)
    0x64, 0x00,
    // Height: 200 (0x00C8, little-endian)
    0xc8, 0x00,
    // Packed field: 0 (no GCT)
    0x00,
    // Background color index
    0x00,
    // Pixel aspect ratio
    0x00,
  ]);
  return bytes;
}

/**
 * Build a minimal valid WebP (150×300) with VP8 chunk.
 *
 * RIFF header (12) + "VP8 " tag (4) + VP8 frame header
 * (3) + width/height (4) = 23 bytes.
 */
function minimalWebP(): Uint8Array {
  const bytes = new Uint8Array([
    // "RIFF"
    0x52, 0x49, 0x46, 0x46,
    // File size (little-endian): 22 bytes after RIFF header
    0x16, 0x00, 0x00, 0x00,
    // "WEBP"
    0x57, 0x45, 0x42, 0x50,
    // "VP8 "
    0x56, 0x50, 0x38, 0x20,
    // VP8 frame header: 3-byte sync code
    0x9d, 0x01, 0x2a,
    // Various header fields (2 bytes)
    0x00, 0x00,
    // Padding byte to reach offset 6 from chunkStart
    0x00,
    // Width: 150 (int16 LE at chunkStart+6)
    0x96, 0x00,
    // Height: 300 (int16 LE at chunkStart+8)
    0x2c, 0x01,
    // Padding to meet minimum length check (30 bytes)
    0x00, 0x00, 0x00, 0x00,
  ]);
  return bytes;
}

describe('getImageDimensions', () => {
  it('parses PNG dimensions', () => {
    const result = getImageDimensions(minimalPng(), 'image/png');
    expect(result).toEqual({ width: 4, height: 4 });
  });

  it('parses JPEG dimensions', () => {
    const result = getImageDimensions(minimalJpeg(), 'image/jpeg');
    expect(result).toEqual({ width: 640, height: 480 });
  });

  it('parses JPEG with jpg MIME type', () => {
    const result = getImageDimensions(minimalJpeg(), 'image/jpg');
    expect(result).toEqual({ width: 640, height: 480 });
  });

  it('parses GIF dimensions', () => {
    const result = getImageDimensions(minimalGif(), 'image/gif');
    expect(result).toEqual({ width: 100, height: 200 });
  });

  it('parses WebP dimensions', () => {
    const result = getImageDimensions(minimalWebP(), 'image/webp');
    expect(result).toEqual({ width: 150, height: 300 });
  });

  it('throws on unsupported format', () => {
    expect(() => getImageDimensions(new Uint8Array([0, 0, 0, 0]), 'image/bmp')).toThrow(
      'Unsupported image format: image/bmp',
    );
  });

  it('throws on truncated PNG', () => {
    expect(() => getImageDimensions(new Uint8Array(10), 'image/png')).toThrow('PNG data too short');
  });

  it('throws on truncated JPEG', () => {
    // SOI marker + non-marker data that passes the length
    // check but has no SOF marker
    expect(() =>
      getImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00]), 'image/jpeg'),
    ).toThrow('No SOF marker found in JPEG data');
  });

  it('throws on truncated GIF', () => {
    expect(() => getImageDimensions(new Uint8Array(5), 'image/gif')).toThrow('GIF data too short');
  });

  it('throws on truncated WebP', () => {
    expect(() => getImageDimensions(new Uint8Array(5), 'image/webp')).toThrow(
      'WebP data too short',
    );
  });
});
