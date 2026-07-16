export class TmallCliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly recover?: string;

  constructor(code: string, message: string, exitCode = 1, recover?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    this.recover = recover;
  }
}

export class ArgumentError extends TmallCliError {
  constructor(message: string) {
    super('ARGUMENT', message, 2);
  }
}

export class AuthRequiredError extends TmallCliError {
  constructor(message = '天猫商家中心登录态不可用，请确认 9222 浏览器中已登录 myseller.taobao.com。') {
    super('AUTH_REQUIRED', message, 77, '在 9222 浏览器完成登录后重试。');
  }
}

export class CommandExecutionError extends TmallCliError {
  constructor(message: string) {
    super('COMMAND_EXEC', message, 1);
  }
}

export class MutationBlockedError extends TmallCliError {
  constructor(action: string) {
    super(
      'MUTATION_BLOCKED',
      `已阻止可能修改线上数据的动作: ${action}`,
      73,
      '本 CLI 当前只允许读取、探查、导出本地报告。'
    );
  }
}

export function toTmallError(error: unknown): TmallCliError {
  if (error instanceof TmallCliError) return error;
  if (error instanceof Error) return new CommandExecutionError(error.message);
  return new CommandExecutionError(String(error));
}
