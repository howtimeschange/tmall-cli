import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CDP_URL, withTmallPage } from './cdp.js';
import { CommandExecutionError } from './errors.js';
import { redactValue } from './redaction.js';

export const BLOCKED_WRITE_EXECUTOR_COMMANDS = [
  'material-test.plan-create',
  'detail.packaging-plan',
  'detail.upload-plan',
  'detail.operation-plan',
  'video.bala-image-plan',
  'video.qn-img2video-plan',
  'video.bala-workflow-plan',
  'mop.search-recommend-plan',
  'mop.kol-img2video-plan'
] as const;

type ExecutorCommandName = typeof BLOCKED_WRITE_EXECUTOR_COMMANDS[number];
type StepFamily = 'mtop' | 'http' | 'http-upload' | 'upload-helper' | 'page-model' | 'dom' | 'external-system' | 'mtop-upload' | 'unknown';
type ExecutorMode = 'dry-run' | 'refused' | 'executed' | 'failed';

export interface ExecutorOptions {
  command: string;
  plan: unknown;
  execute?: boolean;
  confirm?: string;
  allowCommands?: string[];
  allowSteps?: string[];
  allowIrreversible?: boolean;
  operator?: string;
  logDir?: string;
  cdpUrl?: string;
  target?: string;
  continueOnError?: boolean;
}

export interface ExecutionStep {
  id: string;
  key: string;
  path: string;
  family: StepFamily;
  access: string;
  execution: string;
  method: string;
  api: string;
  endpoint: string;
  helper: string;
  reason: string;
  data: unknown;
  rollback: {
    supported: boolean;
    strategy: string;
    reason: string;
  };
  executable: boolean;
  blockedReasons: string[];
}

interface ExecutorCommandConfig {
  command: ExecutorCommandName;
  target: string;
  runners: StepFamily[];
  rollback: 'unsupported';
}

interface PageMtopMutationResult {
  ok: boolean;
  title: string;
  href: string;
  ret?: string[];
  data?: unknown;
  error?: { message: string; ret?: string[] };
}

const COMMAND_CONFIG: Record<ExecutorCommandName, ExecutorCommandConfig> = {
  'material-test.plan-create': {
    command: 'material-test.plan-create',
    target: 'myseller.taobao.com',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'detail.packaging-plan': {
    command: 'detail.packaging-plan',
    target: 'sell.publish.tmall.com',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'detail.upload-plan': {
    command: 'detail.upload-plan',
    target: 'sell.publish.tmall.com',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'detail.operation-plan': {
    command: 'detail.operation-plan',
    target: 'sell.publish.tmall.com',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'video.bala-image-plan': {
    command: 'video.bala-image-plan',
    target: 'quick.taobao.com/videostudio/img2video',
    runners: [],
    rollback: 'unsupported'
  },
  'video.qn-img2video-plan': {
    command: 'video.qn-img2video-plan',
    target: 'quick.taobao.com/videostudio/img2video',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'video.bala-workflow-plan': {
    command: 'video.bala-workflow-plan',
    target: 'quick.taobao.com/videostudio/img2video',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'mop.search-recommend-plan': {
    command: 'mop.search-recommend-plan',
    target: 'quick.taobao.com/videostudio/img2video',
    runners: ['mtop'],
    rollback: 'unsupported'
  },
  'mop.kol-img2video-plan': {
    command: 'mop.kol-img2video-plan',
    target: 'quick.taobao.com/videostudio/img2video',
    runners: ['mtop'],
    rollback: 'unsupported'
  }
};

export function listExecutorCommands(): Array<Record<string, unknown>> {
  return Object.values(COMMAND_CONFIG).map((config) => ({
    command: config.command,
    access: 'blocked-write',
    target: config.target,
    supportedRunners: config.runners.join(',') || 'none',
    rollback: config.rollback,
    defaultMode: 'dry-run'
  }));
}

export async function runExecutor(options: ExecutorOptions): Promise<Record<string, unknown>> {
  const preview = buildExecutorPreview(options);
  if (!options.execute || preview.refusalReasons.length) {
    const mode: ExecutorMode = options.execute ? 'refused' : 'dry-run';
    const result = { ...preview, mode, executedSteps: [] };
    const auditLog = await writeAuditLog(result, options);
    return { ...result, auditLog };
  }

  const executedSteps: Array<Record<string, unknown>> = [];
  let mode: ExecutorMode = 'executed';
  for (const step of preview.selectedSteps) {
    try {
      const response = await executeStep(step, options);
      executedSteps.push({
        id: step.id,
        key: step.key,
        family: step.family,
        status: 'success',
        response: redactValue(response)
      });
    } catch (error) {
      mode = 'failed';
      executedSteps.push({
        id: step.id,
        key: step.key,
        family: step.family,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        rollback: step.rollback
      });
      if (!options.continueOnError) break;
    }
  }
  const result = {
    ...preview,
    mode,
    executedSteps,
    failureHandling: {
      continueOnError: Boolean(options.continueOnError),
      rollbackSupported: false,
      manualRecoveryRequired: mode === 'failed'
    }
  };
  const auditLog = await writeAuditLog(result, options);
  return { ...result, auditLog };
}

export function buildExecutorPreview(options: ExecutorOptions): {
  command: string;
  mode: 'dry-run';
  planHash: string;
  exactConfirmation: string;
  executeRequested: boolean;
  safety: Record<string, unknown>;
  refusalReasons: string[];
  validationErrors: string[];
  allSteps: ExecutionStep[];
  selectedSteps: ExecutionStep[];
  dryRunDiff: Array<Record<string, unknown>>;
  rollbackPlan: Record<string, unknown>;
} {
  const command = options.command;
  const planHash = hashPlan(options.plan);
  const exactConfirmation = `EXECUTE ${command} ${planHash.slice(0, 12)}`;
  const allSteps = extractExecutionSteps(command, options.plan);
  const selectedSteps = selectSteps(allSteps, options.allowSteps);
  const validationErrors = collectValidationErrors(options.plan);
  const commandKnown = isExecutorCommand(command);
  const config = commandKnown ? COMMAND_CONFIG[command] : null;
  const allowCommands = normalizeAllowList(options.allowCommands, process.env.TMALL_EXECUTOR_ALLOWLIST);
  const commandAllowed = allowCommands.includes(command);
  const confirmMatches = options.confirm === exactConfirmation;
  const refusalReasons = [
    ...(!commandKnown ? [`命令不在 blocked-write executor 白名单目录中: ${command}`] : []),
    ...(allSteps.length ? [] : ['计划中没有可执行或可审计的 blocked-write 步骤']),
    ...(selectedSteps.length ? [] : ['没有选中任何执行步骤；检查 --allow-step']),
    ...validationErrors.map((item) => `计划校验未通过: ${item}`),
    ...(options.execute && !commandAllowed ? [`缺少精确命令白名单授权: --allow-command ${command}`] : []),
    ...(options.execute && !confirmMatches ? [`二次确认不匹配；必须传入 --confirm "${exactConfirmation}"`] : []),
    ...(options.execute && selectedSteps.some((step) => !step.rollback.supported) && !options.allowIrreversible
      ? ['步骤没有自动回滚能力；必须显式传入 --allow-irreversible']
      : []),
    ...(options.execute ? selectedSteps.flatMap((step) => executableBlockers(step, config)) : [])
  ];
  return {
    command,
    mode: 'dry-run',
    planHash,
    exactConfirmation,
    executeRequested: Boolean(options.execute),
    safety: {
      commandKnown,
      commandAllowed,
      confirmMatches,
      allowIrreversible: Boolean(options.allowIrreversible),
      selectedStepCount: selectedSteps.length,
      defaultMode: 'dry-run',
      auditLog: 'always-written'
    },
    refusalReasons,
    validationErrors,
    allSteps,
    selectedSteps,
    dryRunDiff: selectedSteps.map((step) => ({
      step: step.id,
      key: step.key,
      family: step.family,
      target: options.target || config?.target || '',
      before: '<online state unchanged in dry-run>',
      after: summarizeStepChange(step)
    })),
    rollbackPlan: {
      supported: false,
      strategy: 'manual',
      reason: '这些天猫/千牛写接口没有可靠通用回滚语义；executor 失败时只记录已尝试步骤和响应，实际恢复必须由人工在商家后台核验处理。',
      failedStepPolicy: options.continueOnError ? 'continue-and-log' : 'stop-and-log'
    }
  };
}

export function extractExecutionSteps(command: string, plan: unknown): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  visitPlan(plan, {
    path: '$',
    parentBlocked: false,
    command,
    steps
  });
  return steps.map((step, index) => ({ ...step, id: `${command}#${index + 1}:${step.key}` }));
}

function visitPlan(value: unknown, context: {
  path: string;
  parentBlocked: boolean;
  command: string;
  steps: ExecutionStep[];
}): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitPlan(item, { ...context, path: `${context.path}[${index}]` }));
    return;
  }
  if (!isRecord(value)) return;

  const access = text(value.access);
  const execution = text(value.execution);
  const isRead = access === 'read' || execution === 'not_executed_by_plan' || access.includes('read/');
  const blocked = access === 'blocked-write' || execution === 'blocked' || (context.parentBlocked && !isRead);
  if (blocked && isActionLike(value)) {
    context.steps.push(buildStep(context.command, context.path, value));
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'data' || key === 'payloadShape' || key === 'query' || key === 'responseMap') continue;
    visitPlan(child, {
      ...context,
      path: `${context.path}.${key}`,
      parentBlocked: blocked
    });
  }
}

function buildStep(command: string, itemPath: string, record: Record<string, unknown>): ExecutionStep {
  const family = classifyStepFamily(record);
  const key = text(record.key) || itemPath.split('.').pop()?.replace(/\W+/g, '_') || family;
  const method = text(record.method ?? record.type);
  const api = text(record.api ?? record.configApi ?? record.initApi ?? record.completeApi);
  const endpoint = text(record.endpoint);
  const helper = text(record.helper);
  const data = record.data ?? record.payloadShape ?? record.query ?? {};
  const hasPlaceholders = containsPlaceholder({ api, endpoint, helper, data, record });
  const noRunner = family !== 'mtop';
  return {
    id: `${command}:pending:${key}`,
    key,
    path: itemPath,
    family,
    access: text(record.access) || 'blocked-write',
    execution: text(record.execution) || 'blocked',
    method: method || (api ? 'POST' : ''),
    api,
    endpoint,
    helper,
    reason: text(record.reason ?? record.note),
    data,
    rollback: {
      supported: false,
      strategy: 'manual',
      reason: '生产写接口没有通用自动回滚；执行前必须确认可人工恢复。'
    },
    executable: family === 'mtop' && !hasPlaceholders,
    blockedReasons: [
      ...(noRunner ? [`暂无 ${family} runner`] : []),
      ...(hasPlaceholders ? ['包含 <placeholder> 占位参数'] : [])
    ]
  };
}

function classifyStepFamily(record: Record<string, unknown>): StepFamily {
  if (text(record.api)) return 'mtop';
  if (text(record.configApi) || text(record.initApi) || text(record.completeApi)) return 'mtop-upload';
  if (text(record.helper)) return 'upload-helper';
  const endpoint = text(record.endpoint);
  if (endpoint) return /upload/i.test(endpoint) ? 'http-upload' : 'http';
  if (record.components || record.component || record.fields) return 'page-model';
  if (record.uiLabels) return 'dom';
  if (record.system) return 'external-system';
  return 'unknown';
}

function isActionLike(record: Record<string, unknown>): boolean {
  return Boolean(
    record.api
    || record.endpoint
    || record.configApi
    || record.initApi
    || record.completeApi
    || record.helper
    || record.components
    || record.component
    || record.fields
    || record.uiLabels
    || record.system
  );
}

function selectSteps(steps: ExecutionStep[], allowSteps: string[] | undefined): ExecutionStep[] {
  const allowed = normalizeAllowList(allowSteps);
  if (!allowed.length) return steps;
  return steps.filter((step) => allowed.includes(step.id) || allowed.includes(step.key));
}

function executableBlockers(step: ExecutionStep, config: ExecutorCommandConfig | null): string[] {
  const reasons = [...step.blockedReasons];
  if (!config?.runners.includes(step.family)) reasons.push(`命令 ${config?.command ?? 'unknown'} 未启用 ${step.family} runner`);
  if (!step.executable) reasons.push(`步骤不可执行: ${step.id}`);
  return reasons.map((reason) => `${step.id}: ${reason}`);
}

function summarizeStepChange(step: ExecutionStep): Record<string, unknown> {
  return {
    call: step.api || step.endpoint || step.helper || step.family,
    method: step.method,
    reason: step.reason,
    data: step.data,
    rollback: step.rollback
  };
}

function collectValidationErrors(plan: unknown): string[] {
  const errors: string[] = [];
  const visit = (value: unknown, seen: Set<unknown>): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, seen));
      return;
    }
    const record = value as Record<string, unknown>;
    const validation = text(record.validation);
    if (validation && validation !== 'ok') errors.push(validation);
    Object.values(record).forEach((child) => visit(child, seen));
  };
  visit(plan, new Set());
  return Array.from(new Set(errors));
}

function containsPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return /<[^>]+>/.test(value);
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  return Object.values(value as Record<string, unknown>).some(containsPlaceholder);
}

async function executeStep(step: ExecutionStep, options: ExecutorOptions): Promise<Record<string, unknown>> {
  if (step.family !== 'mtop') throw new CommandExecutionError(`没有 ${step.family} executor runner: ${step.id}`);
  const command = assertExecutorCommand(options.command);
  const target = options.target || COMMAND_CONFIG[command].target;
  const payload = {
    H5Request: true,
    api: step.api,
    v: '1.0',
    data: isRecord(step.data) ? step.data : {},
    type: (step.method || 'POST').toLowerCase(),
    dataType: 'json',
    valueType: 'original',
    timeout: 20_000
  };
  return await withTmallPage(
    { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: target, openIfMissing: false },
    async (page) => {
      const result = await page.evaluateJson<PageMtopMutationResult>(mtopMutationExpression(payload));
      if (!result.ok) throw new CommandExecutionError(`${step.id} 执行失败: ${result.error?.message ?? 'unknown'}`);
      const ret = result.ret ?? [];
      if (ret.length && !ret.some((item) => /^SUCCESS::/i.test(item))) {
        throw new CommandExecutionError(`${step.id} 返回失败: ${ret.join('; ')}`);
      }
      return {
        title: result.title,
        href: result.href,
        ret,
        data: result.data ?? null
      };
    }
  );
}

function mtopMutationExpression(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return `((async () => {
    const payload = ${json};
    const unwrap = (res) => {
      const root = res && typeof res === 'object' ? res : {};
      const data = root.data && typeof root.data === 'object' && Object.prototype.hasOwnProperty.call(root.data, 'data')
        ? root.data.data
        : root.data;
      return {
        ret: Array.isArray(root.ret) ? root.ret : (Array.isArray(root.data?.ret) ? root.data.ret : []),
        data
      };
    };
    try {
      const mtop = window.lib?.mtop || window.mtop;
      if (!mtop?.request) {
        return JSON.stringify({ ok: false, title: document.title, href: location.href, error: { message: 'window.lib.mtop/window.mtop.request 不可用' } });
      }
      const response = await mtop.request(payload);
      const unwrapped = unwrap(response);
      return JSON.stringify({ ok: true, title: document.title, href: location.href, ret: unwrapped.ret, data: unwrapped.data });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        title: document.title,
        href: location.href,
        error: {
          message: String(error && (error.message || error)).slice(0, 500),
          ret: Array.isArray(error?.ret) ? error.ret : undefined
        }
      });
    }
  })())`;
}

async function writeAuditLog(payload: Record<string, unknown>, options: ExecutorOptions): Promise<Record<string, unknown>> {
  const logDir = path.resolve(options.logDir || '.tmall-cli/audit');
  await mkdir(logDir, { recursive: true });
  const status = text(payload.mode) || 'unknown';
  const hash = text(payload.planHash).slice(0, 12) || 'nohash';
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${sanitizeFilePart(options.command)}-${hash}-${status}.json`;
  const file = path.join(logDir, fileName);
  const body = {
    schema: 'tmall-cli.executor.audit.v1',
    writtenAt: new Date().toISOString(),
    operator: text(options.operator) || process.env.USER || '',
    cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL,
    target: options.target ?? '',
    payload: redactValue(payload)
  };
  await writeFile(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  return { file, status, localWrite: true };
}

function hashPlan(plan: unknown): string {
  return createHash('sha256').update(stableStringify(plan)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function normalizeAllowList(values?: string[], envValue?: string): string[] {
  return Array.from(new Set([...(values ?? []), ...(envValue ? envValue.split(',') : [])]
    .flatMap((item) => String(item || '').split(/[\n\r,，、;；\s]+/))
    .map((item) => item.trim())
    .filter(Boolean)));
}

function assertExecutorCommand(value: string): ExecutorCommandName {
  if (isExecutorCommand(value)) return value;
  throw new CommandExecutionError(`未知 executor 命令: ${value}`);
}

function isExecutorCommand(value: string): value is ExecutorCommandName {
  return (BLOCKED_WRITE_EXECUTOR_COMMANDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function sanitizeFilePart(value: string): string {
  return text(value).replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 120) || 'executor';
}
