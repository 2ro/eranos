import { describe, it, expect } from 'vitest';
import { genUserName } from './genUserName';

describe('genUserName', () => {
  it('returns "Anonymous" for any seed', () => {
    expect(genUserName('test-seed-123')).toBe('Anonymous');
    expect(genUserName('e4690a13290739da123aa17d553851dec4cdd0e9d89aa18de3741c446caf8761')).toBe('Anonymous');
  });

  it('returns "Anonymous" for an undefined seed', () => {
    expect(genUserName(undefined)).toBe('Anonymous');
  });
});
