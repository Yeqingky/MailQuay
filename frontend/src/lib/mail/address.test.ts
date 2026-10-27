import { describe, expect, it } from 'vitest';
import {
  formatAddress,
  formatAddressList,
  joinRecipients,
  parseRecipientInput,
  splitRecipients,
} from './address';

describe('address formatting', () => {
  it('formats a named address', () => {
    expect(formatAddress({ name: 'Ada Lovelace', email: 'ada@example.com' })).toBe(
      'Ada Lovelace <ada@example.com>',
    );
  });

  it('formats a bare address without extra brackets', () => {
    expect(formatAddress({ email: 'ada@example.com' })).toBe('ada@example.com');
    expect(formatAddress(undefined)).toBe('');
    expect(formatAddress({ name: 'Only Name', email: '' })).toBe('Only Name');
  });

  it('summarizes long recipient lists', () => {
    const summary = formatAddressList(
      [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
        { name: 'Carol', email: 'carol@example.com' },
        { name: 'Dave', email: 'dave@example.com' },
      ],
      'en',
    );
    expect(summary).toContain('Alice');
    expect(summary).toContain('+2');
  });

  it('joins short recipient lists with commas', () => {
    expect(
      formatAddressList([
        { name: 'Alice', email: 'alice@example.com' },
        { email: 'bob@example.com' },
      ]),
    ).toBe('Alice, bob@example.com');
  });

  it('parses, normalizes and deduplicates recipient input', () => {
    expect(
      parseRecipientInput('Alice <Alice@Example.com>, bob@example.com; invalid; ALICE@example.com'),
    ).toEqual(['Alice@Example.com', 'bob@example.com']);
  });

  it('accepts mailto prefixes and newlines', () => {
    expect(parseRecipientInput('mailto:a@example.com\na@example.com')).toEqual(['a@example.com']);
    expect(splitRecipients('a@example.com, b@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('joins stored recipient arrays', () => {
    expect(joinRecipients(['a@example.com', 'b@example.com'])).toBe('a@example.com, b@example.com');
    expect(joinRecipients(undefined)).toBe('');
  });
});
