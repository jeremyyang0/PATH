export type ZentaoWorkItemKind = 'bug' | 'task' | 'story' | 'case';

export interface ZentaoWorkItem {
  readonly id: string;
  readonly kind: ZentaoWorkItemKind;
  readonly title: string;
  readonly status: string;
  readonly assignee?: string;
  readonly url?: string;
}
