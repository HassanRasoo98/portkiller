import { describe, expect, it } from 'vitest';
import { COMMON_PORTS } from '../shared/common-ports';

describe('COMMON_PORTS', () => {
  it('includes frequently used development ports', () => {
    const ports = COMMON_PORTS.map((item) => item.port);
    expect(ports).toContain(3000);
    expect(ports).toContain(5173);
    expect(ports).toContain(5432);
    expect(ports).toContain(6379);
  });

  it('has unique port numbers', () => {
    const ports = COMMON_PORTS.map((item) => item.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('keeps ports in the valid TCP range', () => {
    for (const item of COMMON_PORTS) {
      expect(item.port).toBeGreaterThanOrEqual(1);
      expect(item.port).toBeLessThanOrEqual(65535);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.category.length).toBeGreaterThan(0);
    }
  });
});
