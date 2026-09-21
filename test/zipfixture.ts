import { writeFileSync } from 'node:fs';
import yazl from 'yazl';

/** Build a zip in memory from `{ path: contents }`; a nested object becomes a zip inside the zip. */
export async function makeZip(files: Record<string, string | Buffer | Record<string, string>>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? Buffer.from(content) : Buffer.isBuffer(content) ? content : await makeZip(content);
    zip.addBuffer(data, name, { mtime: new Date('2024-01-01T00:00:00Z') });
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function writeZip(path: string, files: Parameters<typeof makeZip>[0]): Promise<void> {
  writeFileSync(path, await makeZip(files));
}
