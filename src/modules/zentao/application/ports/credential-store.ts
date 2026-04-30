import type { ZentaoSession } from '../../domain/zentao-session';

export interface CredentialStore {
  read(): Promise<ZentaoSession | null>;
  write(session: ZentaoSession): Promise<void>;
  clear(): Promise<void>;
}
