import { EventEmitter } from 'node:events';

import type { LoadMyZentaoWorkItems } from '../../application/use-cases/load-my-zentao-work-items';
import { ZentaoNode } from './zentao-node';
import { ZentaoStatusNode } from './zentao-status-node';

export type ZentaoTreeItem = ZentaoNode | ZentaoStatusNode;

export class ZentaoTreeController {
  private readonly events = new EventEmitter();
  private current: readonly ZentaoTreeItem[] = [];

  constructor(private readonly loadMyWorkItems: LoadMyZentaoWorkItems) {}

  onDidChange(listener: () => void): void {
    this.events.on('change', listener);
  }

  async refresh(): Promise<void> {
    const items = await this.loadMyWorkItems.execute();
    this.current = items.length > 0
      ? items.map((item) => new ZentaoNode(item))
      : [
        new ZentaoStatusNode(
          '没有查到禅道工单',
          '可尝试刷新，或确认当前账号是否有被分配的任务',
          'pathZentaoTree.refresh'
        )
      ];
    this.events.emit('change');
  }

  clear(): void {
    this.current = [
      new ZentaoStatusNode('点击登录禅道', '登录后加载我的工单', 'pathZentaoTree.login')
    ];
    this.events.emit('change');
  }

  showError(message: string): void {
    this.current = [
      new ZentaoStatusNode('刷新禅道失败', message, 'pathZentaoTree.refresh')
    ];
    this.events.emit('change');
  }

  getNodes(): readonly ZentaoTreeItem[] {
    return this.current;
  }
}
