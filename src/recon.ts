import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EndpointSummary, MenuSnapshot, PageSnapshot } from './extractors.js';

export interface ReconBundle {
  generatedAt: string;
  strategy: {
    mode: 'read-only-cdp';
    notes: string[];
  };
  page: PageSnapshot;
  menu: MenuSnapshot;
  endpoints: EndpointSummary;
}

export async function writeReconBundle(bundle: ReconBundle, outputDir: string): Promise<{ jsonFile: string; markdownFile: string }> {
  await mkdir(outputDir, { recursive: true });
  const stamp = bundle.generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
  const jsonFile = path.resolve(outputDir, `tmall-recon-${stamp}.local.json`);
  const markdownFile = path.resolve(outputDir, `tmall-recon-${stamp}.local.md`);
  await writeFile(jsonFile, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownFile, renderMarkdown(bundle), { mode: 0o600 });
  return { jsonFile, markdownFile };
}

export function renderMarkdown(bundle: ReconBundle): string {
  const topRows = Object.entries(bundle.menu.byTop)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([top, item]) => `| ${top} | ${item.total} | ${item.leaves} | ${item.hidden} |`)
    .join('\n');
  const apiRows = bundle.endpoints.mtopApis
    .slice(0, 120)
    .map((api) => `| ${api.api || '(unknown)'} | ${api.version} | ${api.risk} | ${(api.dataKeys || []).join(', ')} | ${api.count} |`)
    .join('\n');
  const mutationRows = bundle.endpoints.mtopApis
    .filter((api) => api.risk === 'write_or_mutation_risk')
    .map((api) => `- ${api.api || '(unknown)'} ${api.version ? `v${api.version}` : ''}`)
    .join('\n') || '- None observed in the bounded snapshot.';

  return `# Tmall Seller Center Recon

Generated: ${bundle.generatedAt}

## Strategy

- Mode: read-only CDP against an already logged-in 9222 browser.
- No cookies, localStorage values, passwords, tokens, signatures, request bodies, or raw signed URLs are saved.
- Mutating API names are cataloged as blocked capabilities, not executable commands.

## Page

- Title: ${bundle.page.title}
- URL: ${bundle.page.href}
- Logged-in likely: ${bundle.page.loggedInLikely}
- Top-level menu count: ${bundle.page.menuCount}

## Menu Coverage

Total flattened menu nodes: ${bundle.menu.count}

| Top | Nodes | Leaves | Hidden |
| --- | ---: | ---: | ---: |
${topRows}

## Loaded Endpoint Coverage

Loaded URL/resource summaries: ${bundle.endpoints.count}

| Category | Count |
| --- | ---: |
${Object.entries(bundle.endpoints.byCategory).sort((a, b) => b[1] - a[1]).map(([category, count]) => `| ${category} | ${count} |`).join('\n')}

Unique MTOP/H5 API shapes: ${bundle.endpoints.mtopApis.length}

| API | Version | Risk | Data Keys | Observed |
| --- | --- | --- | --- | ---: |
${apiRows}

## Blocked Mutation Candidates

${mutationRows}
`;
}
