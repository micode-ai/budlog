import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join, basename } from 'path';

/** Local-disk file store for web uploads. Filenames are generated (no user input in the path);
 *  S3 can replace this behind the same two-method interface later. */
@Injectable()
export class FileStore {
  private readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('UPLOAD_DIR', 'uploads');
  }

  async save(buffer: Buffer, ext: string): Promise<{ fileRef: string }> {
    await fs.mkdir(this.dir, { recursive: true });
    const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const name = `${randomBytes(16).toString('hex')}.${safeExt}`;
    await fs.writeFile(join(this.dir, name), buffer);
    return { fileRef: name };
  }

  async read(fileRef: string): Promise<Buffer> {
    // Only generated basenames are valid — reject anything with path separators.
    if (basename(fileRef) !== fileRef) throw new BadRequestException('Invalid file reference');
    return fs.readFile(join(this.dir, fileRef));
  }
}
