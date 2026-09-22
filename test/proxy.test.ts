import { describe, expect, it } from 'vitest';
import { applySystemProxy, proxyFromPac } from '../src/main/tools/proxy';

describe('system proxy for helper programs', () => {
  it('reads the proxy the system would use', () => {
    expect(proxyFromPac('DIRECT')).toBeNull();
    expect(proxyFromPac('PROXY proxy.corp:8080; DIRECT')).toBe('http://proxy.corp:8080');
    expect(proxyFromPac('HTTPS secure.corp:443')).toBe('https://secure.corp:443');
    expect(proxyFromPac('SOCKS5 127.0.0.1:1080')).toBe('socks5://127.0.0.1:1080');
  });

  it('passes it on, keeps local traffic direct, and never overrides one already set', async () => {
    const env: NodeJS.ProcessEnv = {};
    expect(await applySystemProxy(async () => 'PROXY p:3128', env)).toBe('http://p:3128');
    expect(env).toMatchObject({ HTTPS_PROXY: 'http://p:3128', HTTP_PROXY: 'http://p:3128', NO_PROXY: 'localhost,127.0.0.1,::1' });
    const set: NodeJS.ProcessEnv = { HTTPS_PROXY: 'http://mine:1' };
    expect(await applySystemProxy(async () => 'PROXY p:3128', set)).toBeNull();
    expect(set.HTTPS_PROXY).toBe('http://mine:1');
  });
});
