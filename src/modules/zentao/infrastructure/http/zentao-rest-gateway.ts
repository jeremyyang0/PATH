import type { ZentaoGateway } from '../../application/ports/zentao-gateway';
import type { ZentaoCase, ZentaoCaseStep } from '../../domain/zentao-case';
import type { ZentaoSession } from '../../domain/zentao-session';
import type { ZentaoWorkItem } from '../../domain/zentao-work-item';
import * as http from 'http';
import * as https from 'https';

type JsonRecord = Record<string, unknown>;
const HEADER_CONTENT_TYPE = 'Content-Type';
const HEADER_TOKEN = 'Token';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\r\n/g, '\n');
}

function normalizeApiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/max/api.php/v1`;
}

function createDetailUrl(baseUrl: string, kind: ZentaoWorkItem['kind'], id: string): string {
  const apiBase = normalizeApiBase(baseUrl);
  const resource = kind === 'story' ? 'stories' : `${kind}s`;
  return `${apiBase}/${resource}/${id}`;
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function toJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

async function sendRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const requestOptions = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method,
      headers,
      timeout: 5000
    };
    const requestFactory = target.protocol === 'https:' ? https.request : http.request;

    const request = requestFactory(requestOptions, response => {
      let responseBody = '';
      response.on('data', chunk => {
        responseBody += chunk;
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${responseBody}`));
          return;
        }
        resolve(responseBody);
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('请求超时'));
    });

    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function sendJsonRequest<T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await sendRequest(url, method, {
    [HEADER_CONTENT_TYPE]: 'application/json',
    ...headers
  }, payload);
  return JSON.parse(response) as T;
}

function mapWorkItems(baseUrl: string, kind: ZentaoWorkItem['kind'], payload: unknown): ZentaoWorkItem[] {
  const record = toJsonRecord(payload);
  if (!record) {
    return [];
  }

  const source = Array.isArray(record[kind === 'story' ? 'stories' : `${kind}s`])
    ? record[kind === 'story' ? 'stories' : `${kind}s`] as unknown[]
    : Array.isArray(record['data'])
      ? record['data'] as unknown[]
      : Array.isArray(record['items'])
        ? record['items'] as unknown[]
        : [];

  const mappedItems: Array<ZentaoWorkItem | null> = source.map(item => {
      const value = toJsonRecord(item);
      if (!value) {
        return null;
      }

      const id = toStringValue(value['id']);
      const title = decodeHtmlEntities(toStringValue(value['title'] || value['name']));
      if (!id || !title) {
        return null;
      }

      return {
        id,
        kind,
        title,
        status: toStringValue(value['status']) || 'unknown',
        assignee: toStringValue(value['assignedTo'] || value['assignedToRealName']) || undefined,
        url: toStringValue(value['url']) || createDetailUrl(baseUrl, kind, id)
      } satisfies ZentaoWorkItem;
    });

  return mappedItems.filter((item): item is ZentaoWorkItem => item !== null);
}

/**
 * 把旧 zentaoService.ts 的 HTTP 细节收口到 Gateway，避免 UI 层直接处理 token、请求和响应解码。
 */
export class ZentaoRestGateway implements ZentaoGateway {
  async login(baseUrl: string, account: string, password: string): Promise<ZentaoSession> {
    const result = await sendJsonRequest<{ token?: string; error?: unknown }>(
      `${normalizeApiBase(baseUrl)}/tokens`,
      'POST',
      {},
      {
        account,
        password
      }
    );

    if (!result.token) {
      throw new Error(`获取禅道 Token 失败: ${JSON.stringify(result.error ?? result)}`);
    }

    return {
      baseUrl,
      account,
      token: result.token
    };
  }

  async loadAssignedWorkItems(session: ZentaoSession): Promise<readonly ZentaoWorkItem[]> {
    const queries: Array<{ kind: ZentaoWorkItem['kind']; path: string }> = [
      { kind: 'task', path: `/tasks?assignedTo=${encodeURIComponent(session.account)}&limit=20` },
      { kind: 'bug', path: `/bugs?assignedTo=${encodeURIComponent(session.account)}&limit=20` },
      { kind: 'story', path: `/stories?assignedTo=${encodeURIComponent(session.account)}&limit=20` },
      { kind: 'case', path: `/testcases?assignedTo=${encodeURIComponent(session.account)}&limit=20` }
    ];
    const workItems: ZentaoWorkItem[] = [];

    for (const query of queries) {
      try {
        const payload = await sendJsonRequest<unknown>(
          `${normalizeApiBase(session.baseUrl)}${query.path}`,
          'GET',
          { [HEADER_TOKEN]: session.token }
        );
        workItems.push(...mapWorkItems(session.baseUrl, query.kind, payload));
      } catch {
        // 不同禅道版本接口集合不完全一致，单个列表失败时继续尝试其它资源。
      }
    }

    return workItems;
  }

  async getCase(session: ZentaoSession, caseId: string): Promise<ZentaoCase> {
    const result = await sendJsonRequest<JsonRecord>(
      `${normalizeApiBase(session.baseUrl)}/testcases/${caseId}`,
      'GET',
      { [HEADER_TOKEN]: session.token }
    );

    const steps = Array.isArray(result['steps'])
      ? (result['steps'] as unknown[]).map((step, index) => {
        const value = toJsonRecord(step);
        return {
          desc: `${index + 1}: ${decodeHtmlEntities(toStringValue(value?.['desc']))}`,
          expect: `${index + 1}: ${decodeHtmlEntities(toStringValue(value?.['expect']))}`
        } satisfies ZentaoCaseStep;
      })
      : [];

    const id = toStringValue(result['id']);
    if (!id) {
      throw new Error(`获取禅道用例失败: ${JSON.stringify(result)}`);
    }

    return {
      id,
      title: decodeHtmlEntities(toStringValue(result['title'])),
      precondition: decodeHtmlEntities(toStringValue(result['precondition'])),
      steps,
      url: toStringValue(result['url']) || `${normalizeApiBase(session.baseUrl)}/testcases/${id}`
    };
  }

  async updateCaseSteps(session: ZentaoSession, caseId: string, steps: readonly ZentaoCaseStep[]): Promise<void> {
    const result = await sendJsonRequest<JsonRecord>(
      `${normalizeApiBase(session.baseUrl)}/testcases/${caseId}`,
      'PUT',
      { [HEADER_TOKEN]: session.token },
      {
        steps: steps.map(step => ({
          desc: step.desc,
          expect: step.expect
        }))
      }
    );

    if (!toStringValue(result['id'])) {
      throw new Error(`更新禅道用例失败: ${JSON.stringify(result)}`);
    }
  }
}
