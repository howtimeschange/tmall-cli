import WebSocket from 'ws';
import { AuthRequiredError, CommandExecutionError } from './errors.js';

export const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';
export const DEFAULT_HOME_URL = 'https://myseller.taobao.com/home.htm/QnworkbenchHome/';
export const DEFAULT_TARGET_MATCH = 'myseller.taobao.com';

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface RuntimeEvaluateResponse {
  id: number;
  result?: {
    result?: {
      type?: string;
      subtype?: string;
      value?: unknown;
      description?: string;
    };
    exceptionDetails?: {
      text?: string;
      exception?: { description?: string };
    };
  };
  error?: { message?: string };
}

export class CdpPage {
  private nextId = 1;

  private constructor(private readonly socket: WebSocket, readonly target: CdpTarget) {}

  static async connect(target: CdpTarget): Promise<CdpPage> {
    if (!target.webSocketDebuggerUrl) {
      throw new CommandExecutionError(`Chrome target ${target.id} 没有 webSocketDebuggerUrl`);
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new CdpPage(socket, target);
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    const response = await new Promise<RuntimeEvaluateResponse>((resolve, reject) => {
      const onMessage = (data: WebSocket.RawData) => {
        let message: RuntimeEvaluateResponse;
        try {
          message = JSON.parse(String(data)) as RuntimeEvaluateResponse;
        } catch {
          return;
        }
        if (message.id !== id) return;
        this.socket.off('message', onMessage);
        resolve(message);
      };
      this.socket.on('message', onMessage);
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) {
          this.socket.off('message', onMessage);
          reject(error);
        }
      });
    });
    if (response.error) throw new CommandExecutionError(response.error.message ?? `${method} failed`);
    return response as T;
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await this.send<RuntimeEvaluateResponse>('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false
    });
    const exception = response.result?.exceptionDetails;
    if (exception) {
      throw new CommandExecutionError(exception.exception?.description ?? exception.text ?? 'page evaluation failed');
    }
    const result = response.result?.result;
    if (result?.subtype === 'error') throw new CommandExecutionError(result.description ?? 'page evaluation failed');
    return result?.value as T;
  }

  async evaluateJson<T = unknown>(expressionReturningJson: string): Promise<T> {
    const text = await this.evaluate<string>(expressionReturningJson);
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new CommandExecutionError(`页面返回非 JSON 结果: ${(error as Error).message}`);
    }
  }
}

export async function listTargets(cdpUrl = DEFAULT_CDP_URL): Promise<CdpTarget[]> {
  const base = cdpUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/json/list`);
  if (!response.ok) throw new CommandExecutionError(`无法连接 Chrome CDP ${cdpUrl}: HTTP ${response.status}`);
  return await response.json() as CdpTarget[];
}

export function selectTarget(targets: CdpTarget[], match = DEFAULT_TARGET_MATCH): CdpTarget | null {
  const normalized = match.toLowerCase();
  const pages = targets.filter((target) => target.type === 'page');
  return pages.find((target) => target.url.toLowerCase().includes(normalized))
    ?? pages.find((target) => /myseller\.taobao\.com|qn\.taobao\.com/.test(target.url))
    ?? null;
}

export async function openTarget(cdpUrl = DEFAULT_CDP_URL, url = DEFAULT_HOME_URL): Promise<CdpTarget> {
  const endpoint = `${cdpUrl.replace(/\/$/, '')}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: 'PUT' });
  if (!response.ok) response = await fetch(endpoint);
  if (!response.ok) throw new CommandExecutionError(`无法在 9222 浏览器打开天猫商家中心: HTTP ${response.status}`);
  return await response.json() as CdpTarget;
}

export async function ensureTarget(options: {
  cdpUrl?: string;
  match?: string;
  openIfMissing?: boolean;
  openUrl?: string;
} = {}): Promise<CdpTarget> {
  const targets = await listTargets(options.cdpUrl);
  const target = selectTarget(targets, options.match);
  if (target) return target;
  if (options.openIfMissing) return await openTarget(options.cdpUrl, options.openUrl);
  throw new AuthRequiredError(`未在 ${options.cdpUrl ?? DEFAULT_CDP_URL} 找到天猫商家中心标签页。`);
}

export async function withTmallPage<T>(
  options: { cdpUrl?: string; match?: string; openIfMissing?: boolean; openUrl?: string },
  fn: (page: CdpPage) => Promise<T>
): Promise<T> {
  const target = await ensureTarget(options);
  const page = await CdpPage.connect(target);
  try {
    return await fn(page);
  } finally {
    await page.close();
  }
}
