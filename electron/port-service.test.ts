import { describe, expect, it } from 'vitest';
import {
  parseFuser,
  parseLsofFields,
  parseLsofPids,
  parseLsofTable,
  parseSs,
} from './port-service';

describe('parseLsofFields', () => {
  it('parses machine-readable lsof -Fpc output', () => {
    const stdout = ['p4242', 'cnode', 'p9999', 'cpostgres'].join('\n');
    expect(parseLsofFields(stdout)).toEqual([
      { pid: 4242, name: 'node' },
      { pid: 9999, name: 'postgres' },
    ]);
  });
});

describe('parseLsofTable', () => {
  it('parses classic tabular lsof output', () => {
    const stdout = [
      'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
      'node    12345 ubuntu   23u  IPv4  11942      0t0  TCP *:3000 (LISTEN)',
    ].join('\n');
    expect(parseLsofTable(stdout)).toEqual([
      {
        pid: 12345,
        name: 'node',
        user: 'ubuntu',
        command:
          'node    12345 ubuntu   23u  IPv4  11942      0t0  TCP *:3000 (LISTEN)',
      },
    ]);
  });
});

describe('parseLsofPids', () => {
  it('returns PIDs and never the port number', () => {
    expect(parseLsofPids('12345\n3000\n67890', 3000)).toEqual([12345, 67890]);
  });
});

describe('parseSs', () => {
  it('extracts pid and command from ss output', () => {
    const stdout =
      'LISTEN 0 511 *:3000 *:* users:(("node",pid=4242,fd=23))';
    expect(parseSs(stdout)).toEqual([{ pid: 4242, name: 'node' }]);
  });
});

describe('parseFuser', () => {
  it('does not treat the port number in 3000/tcp as a PID', () => {
    expect(parseFuser('3000/tcp:           12345', '', 3000)).toEqual([12345]);
    expect(parseFuser('', '3000/tcp:  111 222', 3000)).toEqual([111, 222]);
  });

  it('returns empty when only the port token is present', () => {
    expect(parseFuser('3000/tcp:', '', 3000)).toEqual([]);
    expect(parseFuser('3000', '', 3000)).toEqual([]);
  });
});
