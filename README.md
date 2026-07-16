# Tmall CLI

天猫商家中心只读 CLI。它复用已经登录的 `9222` Chrome CDP 会话，把天猫/千牛商家中心里的菜单树、页面快照、已加载接口形状整理成稳定的命令行输出，方便人和 AI agent 继续做能力设计。

## Safety Contract

- 默认只读：不点击提交、保存、发布、删除、退款、报名、上传等线上写操作。
- 不读取或落盘 cookies、localStorage 值、密码、token、签名、原始带签 URL。
- 已加载 MTOP/H5 接口只输出 API 名、版本、data 字段形状和风险分类。
- 命中 `save/update/delete/create/submit/commit/operate` 等动词的接口会标记为 `write_or_mutation_risk`，当前不提供执行入口。
- `menu export` 和 `recon export` 只写本地文件。

## Quick Start

```bash
npm install
npm run build

# 复用你已经登录的 9222 浏览器
npm run dev -- doctor -f json
npm run dev -- whoami -f json
npm run dev -- menu summary -f table
npm run dev -- menu list --top 商品 --leaves-only -f table
npm run dev -- endpoints apis -f table
npm run dev -- recon export --output-dir docs/recon -f json
```

也可以直接运行构建产物：

```bash
node dist/cli.js targets
node dist/cli.js endpoints summary -f json
```

## Strategy Note

Strategy: DOM_STATE + CDP_PERFORMANCE

Contract: visible-ui / loaded-runtime-state

Evidence:
- Menu source: `window.$qnMenus` exposed by the logged-in seller-center page.
- Page source: bounded DOM text, anchors, buttons, and global key names.
- Endpoint source: already-loaded `performance.getEntriesByType("resource")`, summarized without raw signatures.
- Auth source: existing browser session only; this project does not extract or store auth material.

Why not PAGE_FETCH / INTERCEPT yet:
- The first useful contract is the page-owned menu tree and loaded resource list.
- Replaying signed MTOP URLs would introduce token/signature handling and mutation risk before we have a stable command need.
- Any future read endpoint replay should be added one command at a time with fixture evidence and explicit mutation-risk blocking.

## Commands

| Command | Purpose |
| --- | --- |
| `doctor` | Check Node/CDP and whether a seller-center target is visible. |
| `targets` | List Taobao/Tmall/QN related CDP targets. |
| `whoami` | Validate the current page without reading cookies or storage values. |
| `menu summary` | Count menu nodes by top-level business domain. |
| `menu list` | Flatten `window.$qnMenus`. Supports `--top`, `--leaves-only`, `--include-hidden`. |
| `menu export` | Save the menu snapshot to a local JSON file. |
| `endpoints summary` | Count loaded URL categories, hosts, and MTOP API shapes. |
| `endpoints apis` | List unique MTOP/H5 API names and data shapes. |
| `endpoints urls` | List loaded resource summaries without sensitive query values. |
| `snapshot` | Return a bounded visible-page snapshot. |
| `recon export` | Save local JSON + Markdown recon artifacts. |
| `manifest list/get` | Machine-readable command surface. |

## Implemented Adapter Coverage

All adapter commands are read-only and were validated against the logged-in `9222` browser session.

- `home *`: seller-center todo, seller cards, warnings, calendar, activities, diagnostics, shop info, notices, SOP tasks, finance reminders, number badges, risk widgets, ads, popups, shop tags, and service status.
- `quick *`: Quick/生意管家 snapshot, points, seller category, templates, one-click configuration, preference readback, sign-in panel status, workspace menu, switches, digital humans, recommended items, all-item search, script categories, agreement status, desktop/commercialize summaries, item-pool probe, and offline result pull.
- `dmp *`: DMP user, credits, messages, weekly reports, report notices, latest data day, ADC components, power user, brand apply, Databank deeplink, Deeplink report tasks, and watermark config.
- `ops *`: operation-class request shape catalog and static source lookup for submit/save/delete/upload/apply-like APIs. These commands document how operation requests are shaped, but `execution` remains `blocked`.

## Relationship To Existing CLIs

- OpenCLI pattern: browser/CDP state becomes a command surface, but endpoint contracts must be proven before becoming commands.
- Semir Yunpan CLI pattern: direct `9222` CDP connection with page-side reads.
- Bmall CLI pattern: explicit manifest, JSON-friendly output, typed errors, local auditability, and strict write boundaries.
