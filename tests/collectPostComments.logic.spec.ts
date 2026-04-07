import { test, expect } from '@playwright/test';
import {
  normalizeThaiPhoneDigits,
  buildExcludedPhoneSet,
  filterPhonesForCollect,
  keepLatestPhonePerSelection,
} from '../src/helpers/collectPostComments';

test.describe('collect phone logic', () => {
  test('normalizeThaiPhoneDigits normalizes common Thai formats', () => {
    expect(normalizeThaiPhoneDigits('081-234-5678')).toBe('0812345678');
    expect(normalizeThaiPhoneDigits('+66 81 234 5678')).toBe('0812345678');
    expect(normalizeThaiPhoneDigits('66812345678')).toBe('0812345678');
    expect(normalizeThaiPhoneDigits('912345678')).toBe('0912345678');
    expect(normalizeThaiPhoneDigits('hello')).toBeNull();
  });

  test('buildExcludedPhoneSet parses separators and normalizes', () => {
    const set = buildExcludedPhoneSet('081-111-1111, +66 81 222 2222;0811111111');
    expect([...set].sort()).toEqual(['0811111111', '0812222222']);
  });

  test('filterPhonesForCollect skips self phone and day duplicates', () => {
    const excluded = buildExcludedPhoneSet('0899999999');
    const seenToday = new Set<string>(['0812345678']);
    const kept = filterPhonesForCollect(
      ['081-234-5678', '+66 89 999 9999', '0861234567', '086-123-4567', 'foo'],
      { excluded, seenToday }
    );
    expect(kept).toEqual(['0861234567']);
    expect([...seenToday].sort()).toEqual(['0812345678', '0861234567']);
  });

  test('keepLatestPhonePerSelection keeps latest post only', () => {
    const out = keepLatestPhonePerSelection([
      { postLogId: 'a', jobId: 'j1', createdAtMs: 100, phone: '0901111111' },
      { postLogId: 'b', jobId: 'j2', createdAtMs: 200, phone: '0901111111' },
      { postLogId: 'a', jobId: 'j1', createdAtMs: 100, phone: '0892222222' },
    ]);
    expect(out.get('a')).toEqual(['0892222222']);
    expect(out.get('b')).toEqual(['0901111111']);
  });
});
