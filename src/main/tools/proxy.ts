/**
 * Kopia and rclone run as separate programs and read their proxy from the environment. An app
 * opened from the Dock or Start menu doesn't get the terminal's settings, so Tessera asks the
 * system which proxy it uses (as the browser would) and passes that on.
 */

/** The first proxy in a PAC-style answer ("PROXY host:port; DIRECT"), as a URL; null for none. */
export function proxyFromPac(answer: string): string | null {
  for (const part of answer.split(';').map((p) => p.trim())) {
    const m = /^(PROXY|HTTP|HTTPS|SOCKS5?|SOCKS4)\s+(\S+)$/i.exec(part);
    if (!m) continue;
    const kind = m[1]!.toUpperCase();
    const scheme = kind === 'HTTPS' ? 'https' : kind.startsWith('SOCKS') ? (kind === 'SOCKS4' ? 'socks4' : 'socks5') : 'http';
    return `${scheme}://${m[2]}`;
  }
  return null;
}

/** Set HTTPS_PROXY/HTTP_PROXY for child programs from the system's proxy, unless already set. */
export async function applySystemProxy(resolve: (url: string) => Promise<string>, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  if (env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy) return null;
  const proxy = proxyFromPac(await resolve('https://github.com').catch(() => 'DIRECT'));
  if (!proxy) return null;
  env.HTTPS_PROXY = proxy;
  env.HTTP_PROXY = proxy;
  // Kopia talks to its own rclone on this computer; that must never go through a proxy.
  env.NO_PROXY = [env.NO_PROXY ?? env.no_proxy, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
  return proxy;
}
