import * as vscode from 'vscode';

import type { CredentialStore } from '../../application/ports/credential-store';
import type { ZentaoSession } from '../../domain/zentao-session';

export class VscodeSecretCredentialStore implements CredentialStore {
  private static readonly storageKey = 'path.zentao.session';

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async read(): Promise<ZentaoSession | null> {
    const raw = await this.secrets.get(VscodeSecretCredentialStore.storageKey);
    return raw ? (JSON.parse(raw) as ZentaoSession) : null;
  }

  async write(session: ZentaoSession): Promise<void> {
    await this.secrets.store(VscodeSecretCredentialStore.storageKey, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.secrets.delete(VscodeSecretCredentialStore.storageKey);
  }
}
