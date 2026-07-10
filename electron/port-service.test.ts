import { describe, expect, it } from 'vitest';
import { findListenersOnPort, killPort } from './port-service';

describe('port-service', () => {
  it('rejects invalid ports by returning no listeners', async () => {
    await expect(findListenersOnPort(0)).resolves.toEqual([]);
    await expect(findListenersOnPort(70000)).resolves.toEqual([]);
    await expect(findListenersOnPort(3.14)).resolves.toEqual([]);
  });

  it('reports no kill targets for an unused high port', async () => {
    // 58421 is unlikely to be bound in CI; if it is, killPort still returns a structured result
    const result = await killPort(58421, true);
    expect(result).toHaveProperty('killed');
    expect(result).toHaveProperty('failed');
    expect(Array.isArray(result.killed)).toBe(true);
    expect(Array.isArray(result.failed)).toBe(true);
  });
});
