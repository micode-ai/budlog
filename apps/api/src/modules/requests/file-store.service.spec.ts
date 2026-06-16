import { FileStore } from './file-store.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileStore', () => {
  const dir = join(tmpdir(), 'budlog-filestore-test');
  const config: any = { get: (k: string, d?: any) => (k === 'UPLOAD_DIR' ? dir : d) };

  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('saves a buffer and reads it back; rejects path traversal', async () => {
    const store = new FileStore(config);
    const { fileRef } = await store.save(Buffer.from('hello'), 'txt');
    expect(fileRef).toMatch(/^[a-f0-9]{32}\.txt$/); // generated name only, no dirs
    const back = await store.read(fileRef);
    expect(back.toString()).toBe('hello');
    await expect(store.read('../../etc/passwd')).rejects.toThrow();
  });
});
