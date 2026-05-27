import { describe, it, expect } from 'vitest';
import type { OpenAIContentPart } from '../services/chat-handler/index.js';
import type { OpenAIContentPartUnion } from '../services/chat-handler/index.js';
import { extractTextContent, extractImageParts } from './content.js';

describe('extractTextContent', () => {
  it('returns empty string for null', () => {
    expect(extractTextContent(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(extractTextContent(undefined)).toBe('');
  });

  it('returns string content as-is', () => {
    expect(extractTextContent('hello world')).toBe('hello world');
  });

  it('joins text from content parts', () => {
    const parts: OpenAIContentPart[] = [
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
    ];
    expect(extractTextContent(parts)).toBe('hello world');
  });

  it('returns empty string for empty array', () => {
    expect(extractTextContent([])).toBe('');
  });
});

describe('extractImageParts', () => {
  it('returns empty array for null', () => {
    expect(extractImageParts(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(extractImageParts(undefined)).toEqual([]);
  });

  it('returns empty array for string content', () => {
    expect(extractImageParts('plain text')).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(extractImageParts([])).toEqual([]);
  });

  it('returns empty array when no image parts exist', () => {
    const parts: OpenAIContentPartUnion[] = [
      { type: 'text', text: 'hello' },
      { type: 'text', text: ' world' },
    ];
    expect(extractImageParts(parts)).toEqual([]);
  });

  it('extracts mime type and size from a data-URI image part', () => {
    // 1x1 red PNG as base64
    const redPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const dataUri = `data:image/png;base64,${redPngBase64}`;
    const parts: OpenAIContentPartUnion[] = [{ type: 'image_url', image_url: { url: dataUri } }];
    const result = extractImageParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('image/png');
    expect(result[0].sizeBytes).toBeGreaterThan(0);
  });

  it('extracts jpeg mime type from data URI', () => {
    const fakeJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg';
    const parts: OpenAIContentPartUnion[] = [{ type: 'image_url', image_url: { url: fakeJpeg } }];
    const result = extractImageParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('image/jpeg');
  });

  it('returns unknown mime type and zero size for external URLs', () => {
    const parts: OpenAIContentPartUnion[] = [
      { type: 'image_url', image_url: { url: 'https://example.com/photo.png' } },
    ];
    const result = extractImageParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('unknown');
    expect(result[0].sizeBytes).toBe(0);
  });

  it('works alongside text parts', () => {
    const parts: OpenAIContentPartUnion[] = [
      { type: 'text', text: 'Here is an image:' },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQVNIRSAAAAA=',
        },
      },
    ];
    const result = extractImageParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('image/webp');
  });

  it('handles multiple image parts', () => {
    const parts: OpenAIContentPartUnion[] = [
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAA=' },
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA=' },
      },
    ];
    const result = extractImageParts(parts);
    expect(result).toHaveLength(2);
    expect(result[0].mimeType).toBe('image/png');
    expect(result[1].mimeType).toBe('image/jpeg');
  });
});
