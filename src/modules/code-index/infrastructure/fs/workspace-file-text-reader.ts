import { readFile } from 'node:fs/promises';

import type { FileTextReader } from '../../application/ports/file-text-reader';

export class WorkspaceFileTextReader implements FileTextReader {
  async read(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }
}
