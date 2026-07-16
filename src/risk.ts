const MUTATION_WORDS = [
  'add',
  'apply',
  'approve',
  'bind',
  'cancel',
  'change',
  'close',
  'commit',
  'confirm',
  'create',
  'delete',
  'edit',
  'modify',
  'operate',
  'open',
  'patch',
  'pay',
  'post',
  'publish',
  'refund',
  'remove',
  'save',
  'set',
  'sign',
  'submit',
  'update',
  'upload',
  'write'
];

const READ_HINTS = [
  'all',
  'calendar',
  'detail',
  'find',
  'get',
  'info',
  'list',
  'notice',
  'overview',
  'query',
  'search',
  'status',
  'todo',
  'warn'
];

export type EndpointRisk = 'read_candidate' | 'write_or_mutation_risk';

export function classifyEndpointRisk(name: string): EndpointRisk {
  const normalized = String(name || '').toLowerCase();
  if (!normalized) return 'read_candidate';
  const hasMutation = MUTATION_WORDS.some((word) => new RegExp(`(^|[._/-])${word}($|[._/-])`, 'i').test(normalized));
  if (hasMutation) return 'write_or_mutation_risk';
  const hasReadHint = READ_HINTS.some((word) => new RegExp(`(^|[._/-])${word}($|[._/-])`, 'i').test(normalized));
  return hasReadHint ? 'read_candidate' : 'read_candidate';
}

export function assertNotMutation(name: string): void {
  if (classifyEndpointRisk(name) === 'write_or_mutation_risk') {
    throw new Error(`mutation blocked: ${name}`);
  }
}
