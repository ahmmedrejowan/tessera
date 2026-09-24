import { startApp, waitFor, withSamples } from './harness.mjs';

export const name = 'An agent working in the library';

export async function run(ok) {
  const t = await startApp();
  try {
    await withSamples(t);
    const status = await t.call('mcp:status');
    ok('the door is open while the app is', status.enabled && status.running, status.url);
    ok('and the tools that cannot be undone are not offered', status.tools.on < status.tools.all, `${status.tools.on} of ${status.tools.all}`);

    let id = 0;
    const rpc = async (method, params) => {
      const res = await fetch(status.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      });
      const text = await res.text();
      return JSON.parse(text.startsWith('event:') ? (text.split('\n').find((l) => l.startsWith('data:'))?.slice(5) ?? '{}') : text);
    };
    const said = async (name, args) => {
      const answer = await rpc('tools/call', { name, arguments: args });
      const text = answer.result?.content?.[0]?.text ?? JSON.stringify(answer.error);
      return { error: !!answer.result?.isError, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
    };

    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
    const tools = await rpc('tools/list', {});
    ok('it lists the tools that are on', tools.result.tools.length === status.tools.on, `${tools.result.tools.length} tools`);

    const library = await said('library_status', {});
    ok('an agent can read the library', library.json?.packs === 3, `${library.json?.packs} packs`);
    const found = await said('search', { text: 'arcade', of: 'packs' });
    const pack = found.json.packs[0];
    await said('star', { packIds: [pack.id] });
    await waitFor(t, async () => (await t.call('browse:packs', { scope: 'library', text: '', filters: {}, favourites: true }, 'name', 0, 5)).total === 1, 'the star to show');
    ok('what it does shows in the window at once', true);
    ok('and is written down as an agent doing it', (await t.call('activity:list', 5)).some((e) => e.kind === 'agent'));
    ok('a tool that is off is refused, with where to turn it on', (await said('empty_bin', {})).text.includes('switched off in Tessera'));

    // A web page must not be able to use the door, however it found the address.
    const fromAPage = await fetch(status.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', Origin: 'https://evil.example' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }),
    });
    ok('and a web page is refused outright', fromAPage.status === 403, `${fromAPage.status}`);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
