import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMaterialCreatePlan } from '../src/adapters/material-test.js';
import { buildMopSearchRecommendPlan } from '../src/adapters/mop.js';
import { buildExecutorPreview, extractExecutionSteps, runExecutor } from '../src/executor.js';

describe('blocked-write executor safety gates', () => {
  it('extracts blocked-write steps and dry-run diff without executing', async () => {
    const logDir = await mkdtemp(path.join(os.tmpdir(), 'tmall-executor-'));
    try {
      const plan = buildMopSearchRecommendPlan({
        itemId: '1060862679580',
        title: '标题',
        description: '内容描述',
        materialUrls: [
          'https://img.alicdn.com/a.jpg',
          'https://img.alicdn.com/b.jpg',
          'https://img.alicdn.com/c.jpg'
        ]
      });
      const result = await runExecutor({
        command: 'mop.search-recommend-plan',
        plan,
        logDir
      });
      expect(result.mode).toBe('dry-run');
      expect(String(result.exactConfirmation)).toMatch(/^EXECUTE mop\.search-recommend-plan [a-f0-9]{12}$/);
      expect(JSON.stringify(result)).toContain('mtop.taobao.spongebob.item.material.publish');
      expect(JSON.stringify(result)).toContain('window.$startFileUpload(dataUrl)');
      expect((result.auditLog as { file: string }).file).toContain(logDir);
      const audit = JSON.parse(await readFile((result.auditLog as { file: string }).file, 'utf8')) as Record<string, unknown>;
      expect(audit.schema).toBe('tmall-cli.executor.audit.v1');
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('refuses execution without exact command allowlist, confirmation, and irreversible acknowledgement', async () => {
    const logDir = await mkdtemp(path.join(os.tmpdir(), 'tmall-executor-'));
    try {
      const plan = buildMaterialCreatePlan({
        itemId: '1060862679580',
        materialUrls: ['https://img.alicdn.com/a.jpg']
      });
      const preview = buildExecutorPreview({ command: 'material-test.plan-create', plan });
      const result = await runExecutor({
        command: 'material-test.plan-create',
        plan,
        execute: true,
        confirm: preview.exactConfirmation,
        logDir
      });
      expect(result.mode).toBe('refused');
      expect(JSON.stringify(result.refusalReasons)).toContain('--allow-command material-test.plan-create');
      expect(JSON.stringify(result.refusalReasons)).toContain('--allow-irreversible');
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('supports exact step allowlists and refuses placeholder steps before online calls', () => {
    const plan = buildMaterialCreatePlan({
      itemId: '1060862679580',
      materialUrls: ['https://img.alicdn.com/a.jpg']
    });
    const steps = extractExecutionSteps('material-test.plan-create', plan);
    expect(steps.map((step) => step.key)).toContain('create');
    expect(steps.find((step) => step.key === 'create')?.data).toMatchObject({ itemId: '1060862679580' });
    expect(steps.find((step) => step.key === 'batchAdd')?.blockedReasons).toContain('包含 <placeholder> 占位参数');

    const preview = buildExecutorPreview({
      command: 'material-test.plan-create',
      plan,
      execute: true,
      allowCommands: ['material-test.plan-create'],
      allowSteps: ['batchAdd'],
      allowIrreversible: true,
      confirm: buildExecutorPreview({ command: 'material-test.plan-create', plan }).exactConfirmation
    });
    expect(preview.selectedSteps.map((step) => step.key)).toEqual(['batchAdd']);
    expect(JSON.stringify(preview.refusalReasons)).toContain('包含 <placeholder> 占位参数');
  });

  it('CLI executor consumes saved plan files', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'tmall-executor-cli-'));
    try {
      const planFile = path.join(tmp, 'plan.json');
      await writeFile(planFile, JSON.stringify(buildMaterialCreatePlan({ itemId: '1060862679580' })));
      const result = await runExecutor({
        command: 'material-test.plan-create',
        plan: JSON.parse(await readFile(planFile, 'utf8')) as unknown,
        logDir: tmp
      });
      expect(result.mode).toBe('dry-run');
      expect((result.allSteps as unknown[]).length).toBeGreaterThan(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
