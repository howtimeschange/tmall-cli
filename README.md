# Tmall CLI

天猫商家中心只读 CLI。它复用已经登录的 `9222` Chrome CDP 会话，把天猫/千牛商家中心里的菜单树、页面快照、已加载接口形状整理成稳定的命令行输出，方便人和 AI agent 继续做能力设计。

## Safety Contract

- 默认只读：不点击提交、保存、发布、删除、退款、报名、上传等线上写操作。
- 不读取或落盘 cookies、localStorage 值、密码、token、签名、原始带签 URL。
- 已加载 MTOP/H5 接口只输出 API 名、版本、data 字段形状和风险分类。
- 命中 `save/update/delete/create/submit/commit/operate` 等动词的接口会标记为 `write_or_mutation_risk`。计划命令本身永远不执行；只有独立 `executor plan` 可以接管 saved plan。
- `executor plan` 默认 dry-run，只输出 diff 和安全门状态。真实执行必须同时满足 `--execute`、精确 `--allow-command`、dry-run 给出的 `--confirm`、`--allow-irreversible`、无 `<placeholder>` 参数、命令/step runner 支持，并写本地审计日志。
- `menu export`、`recon export` 和 `executor plan` 审计日志只写本地文件。

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

# 从 Crawshrimp 天猫运营助手沉淀出的功能域
npm run dev -- material-test items --keyword 1060862679580 -f json
npm run dev -- material-test tasks --item-id 1060862679580 -f json
npm run dev -- material-test data --item-ids 1060862679580 -f json
npm run dev -- material-test plan-create --item-id 1060862679580 --material-urls //img.alicdn.com/a.jpg -f json
npm run dev -- reviews parse-links 'https://detail.tmall.com/item.htm?id=1060862679580' -f json
npm run dev -- reviews list --item-id 1060862679580 --page-size 2 --max-pages 1 -f json
npm run dev -- member urls '左西旗舰店 123456789' -f json
npm run dev -- detail status -f json
npm run dev -- detail classify-packaging --style-code 208126156202 '/包/1-主图/tmall/208126156202_1440x1440_01.jpg' '/包/2-详情/images/208126156202_01.jpg' -f json
npm run dev -- detail packaging-plan --style-code 208126156202 --item-id 1060862679580 --assets '/包/1-主图/tmall/208126156202_1440x1440_01.jpg,/包/2-详情/images/208126156202_01.jpg' -f json
npm run dev -- detail upload-plan --file-name 208126156202_01.jpg -f json
npm run dev -- detail operation-plan --item-id 1060862679580 --pc-detail-image-count 11 -f json
npm run dev -- video template-catalog --main-category '童装/婴儿装/亲子装' -f table
npm run dev -- video qn-img2video-plan --item-id 1060862679580 --image-urls https://img.alicdn.com/a.jpg --template-id tpl_001 -f json
npm run dev -- video bala-workflow-plan 208326102205 --item-id 1060862679580 --image-urls https://img.alicdn.com/a.jpg -f json
npm run dev -- mop search-recommend-plan --item-id 1060862679580 --title '新品上新' --description '童装穿搭素材' --material-urls https://img.alicdn.com/a.jpg,https://img.alicdn.com/b.jpg,https://img.alicdn.com/c.jpg -f json
npm run dev -- mop kol-img2video-plan --merchant-code 46X096070266 --material-count 3 -f json
npm run dev -- dmp compete-shops -f json
npm run dev -- dmp compete-paid-probe --max-competitors 1 -f json

# 独立 executor：默认 dry-run，不触发线上写操作。
npm run dev -- executor commands -f table
npm run dev -- mop search-recommend-plan --item-id 1060862679580 --title '新品上新' --description '童装穿搭素材' --material-urls https://img.alicdn.com/a.jpg,https://img.alicdn.com/b.jpg,https://img.alicdn.com/c.jpg -f json > /tmp/mop-plan.json
npm run dev -- executor plan --command mop.search-recommend-plan --plan-file /tmp/mop-plan.json -f json
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
| `material-test items/tasks/data/plan-create` | Query material-test item/task/data read APIs and build blocked create/upload plans. |
| `reviews parse-links/list` | Parse item links locally and read buyer reviews with bounded pagination. |
| `member urls` | Normalize member-center sellerId URLs locally; does not open pages. |
| `detail status/classify-packaging/packaging-plan/upload-plan/operation-plan` | Read detail editor status and build blocked packaging/detail-edit request plans. |
| `video template-catalog/semir-material-plan/bala-image-plan/qn-img2video-plan/bala-workflow-plan` | Integrate Bala AI video assistant planning and Quick img2video read/blocked surfaces. |
| `mop template-catalog/search-recommend-plan/kol-img2video-plan` | Integrate MOP material/video scripts as read or blocked request plans. |
| `dmp compete-shops/compete-paid-probe/compete-paid-plan` | Resolve DMP competition shops and probe paid-analysis read APIs. |
| `executor commands/plan` | Inspect or explicitly execute saved blocked-write plans behind whitelist, confirmation, rollback, and audit gates. |

## Implemented Adapter Coverage

All adapter commands are read-only and were validated against the logged-in `9222` browser session.

- `home *`: seller-center todo, seller cards, warnings, calendar, activities, diagnostics, shop info, notices, SOP tasks, finance reminders, number badges, risk widgets, ads, popups, shop tags, and service status.
- `quick *`: Quick/生意管家 snapshot, points, seller category, templates, one-click configuration, preference readback, sign-in panel status, workspace menu, switches, digital humans, recommended items, all-item search, script categories, agreement status, desktop/commercialize summaries, item-pool probe, and offline result pull.
- `dmp *`: DMP user, credits, messages, weekly reports, report notices, latest data day, ADC components, power user, brand apply, Databank deeplink, Deeplink report tasks, and watermark config.
- `material-test *`: converted from Crawshrimp `tmall-material-test*.js`: QianNiu item search, material-test task search, material-test data download/readback, and local blocked plans for create/add/online/upload request shapes.
- `reviews *`: converted from Crawshrimp `buyer-reviews.js`: item-link parsing plus `mtop.taobao.rate.detaillist.get` with `rate.tmall.com/list_detail_rate.htm` fallback.
- `member *`: converted safe local normalization from Crawshrimp `tmall-compete-member-monitor.js`; automatic navigation/screenshot capture is intentionally not enabled in this CLI.
- `detail *`: converted safe planning pieces from Crawshrimp `tmall-packaging-upload.js`: packaging asset bucket classification, style-aware PC detail sequence dedupe, picture-space upload request shapes, Tmall publish-page component write shapes, new-detail commit shape, PC-to-mobile detail sync shape, and old mobile editor fallback labels/endpoints. All write steps are blocked.
- `video *`: converted from Crawshrimp `bala-ai-video-assistant`: Semir material-prep planning, Bala AI image operation planning, mandatory review-gate workflow, Quick/QN template catalog readback, and blocked img2video upload/generation payloads.
- `mop *`: converted from Crawshrimp `mop-ops-assistant`: MOP video template catalog readback, blocked search-recommend material publish payloads, and blocked KOL material img2video payloads.
- `dmp compete-*`: converted from Crawshrimp `tmall-compete-paid-monitor.js`: competition shop resolution and paid-analysis read API probing. The probe summarizes endpoint health/shape instead of exporting full workbook data.
- `ops *`: operation-class request shape catalog and static source lookup for submit/save/delete/upload/apply-like APIs. These commands document how operation requests are shaped, but `execution` remains `blocked`.
- `executor *`: separate execution layer for saved blocked-write plans. It can inspect every blocked-write plan, writes an audit log for dry-run/refused/executed attempts, and only MTOP-family steps with complete parameters currently have an online runner. Upload helpers, DOM/page-model operations, external AI-job creation, and multipart upload flows are refused until a dedicated runner and recovery story exists.

## Blocked-Write Executor

The plan commands remain safe by construction: they only emit JSON. To move from a plan to an attempted online write, save the plan and pass it to the separate executor.

```bash
# 1. Generate a plan. This does not write online data.
node dist/cli.js material-test plan-create \
  --item-id 1060862679580 \
  --material-urls https://img.alicdn.com/a.jpg \
  -f json > /tmp/material-plan.json

# 2. Dry-run through the executor. This writes only a local audit log and prints exactConfirmation.
node dist/cli.js executor plan \
  --command material-test.plan-create \
  --plan-file /tmp/material-plan.json \
  --log-dir .tmall-cli/audit \
  -f json

# 3. If, and only if, the dry-run is acceptable, request execution for exact step(s).
# This will still refuse if parameters contain placeholders, a runner is missing, or validation failed.
node dist/cli.js executor plan \
  --command material-test.plan-create \
  --plan-file /tmp/material-plan.json \
  --execute \
  --allow-command material-test.plan-create \
  --allow-step create \
  --allow-irreversible \
  --confirm 'EXECUTE material-test.plan-create <hash-from-dry-run>' \
  --log-dir .tmall-cli/audit \
  -f json
```

Executor gates:

- `--execute` is required for any online request. Without it, mode is always `dry-run`.
- `--allow-command` must exactly match the plan command. It may also be provided through `TMALL_EXECUTOR_ALLOWLIST`.
- `--confirm` must exactly match the dry-run `exactConfirmation` string, which includes the plan hash.
- `--allow-step` can narrow execution to exact step ids or keys. Without it, every extracted blocked-write step is selected.
- `--allow-irreversible` is required because the current Tmall/QN write surfaces do not have a generic automatic rollback.
- Plans with `validation` other than `ok`, `<placeholder>` values, unsupported step families, missing runners, or unknown commands are refused before any page request.
- Every dry-run, refusal, success, or failure writes a redacted JSON audit log. CLI output keeps business parameters visible for operator review; logs redact IDs, tokens, signed URLs, and sensitive keys.

Supported online runner today:

- `mtop`: executes through the logged-in 9222 browser page via `window.lib.mtop` / `window.mtop`.

Refused until dedicated runners exist:

- `http-upload`, `mtop-upload`, `upload-helper`, `page-model`, `dom`, and `external-system`.

## Crawshrimp Conversion Notes

Inspected source folder: `/Users/xingyicheng/Documents/crawshrimp/adapters/tmall-ops-assistant`.

- `buyer-reviews.js` -> `reviews parse-links`, `reviews list`.
- `tmall-material-test-data-export.js` and `tmall-material-test.js` -> `material-test items`, `material-test tasks`, `material-test data`, `material-test plan-create`.
- `tmall-compete-paid-monitor.js` -> `dmp compete-shops`, `dmp compete-paid-probe`, `dmp compete-paid-plan`.
- `tmall-compete-member-monitor.js` -> `member urls`.
- `tmall-packaging-upload.js` -> `detail classify-packaging`, `detail packaging-plan`, `detail upload-plan`, `detail operation-plan`.
- `tmall-ai-image-test-chain.js` contains upload/create/online orchestration; this CLI only records request shapes through plan/source commands and does not execute those operations.
- `bala-ai-video-assistant/semir-video-material-prepare.js` -> `video semir-material-plan`.
- `bala-ai-video-assistant/bala-ai-face-background-generate.js` -> `video bala-image-plan`.
- `bala-ai-video-assistant/qn-img2video-batch.js` -> `video template-catalog`, `video qn-img2video-plan`, `video bala-workflow-plan`.
- `mop-ops-assistant/export-video-template-catalog.js` -> `mop template-catalog`.
- `mop-ops-assistant/search-recommend-material-publish.js` -> `mop search-recommend-plan`.
- `mop-ops-assistant/kol-material-img2video-batch.js` -> `mop kol-img2video-plan`.

## Detail / Packaging CLI

The packaging upload flow is generalized as a detail-page editing adapter. It is useful for preparing and auditing a real packaging run while preserving the production safety boundary.

```bash
# Read-only probe. Requires a sell.publish.tmall.com / sell.xiangqing.taobao.com editor tab to be open.
node dist/cli.js detail status -f json

# Local classification only. Paths and URLs may be separated by spaces, commas, or newlines.
node dist/cli.js detail classify-packaging --style-code 208126156202 \
  '/包/1-主图/tmall/208126156202_1440x1440_01.jpg' \
  '/包/主图微详情/208126156202_1440x1920_01.jpg' \
  '/包/商品竖图/208126156202_1440x2160.jpg' \
  '/包/2-详情/images/208126156202_01.jpg' \
  -f json

# Build the full blocked plan: upload, publish-page component writes, PC detail, mobile detail sync, final submit.
node dist/cli.js detail packaging-plan \
  --style-code 208126156202 \
  --item-id 1060862679580 \
  --assets '/包/1-主图/tmall/208126156202_1440x1440_01.jpg,/包/2-详情/images/208126156202_01.jpg' \
  --execute-mode publish_and_sync_mobile \
  -f json

# Inspect upload and operation request shapes separately.
node dist/cli.js detail upload-plan --file-name 208126156202_01.jpg -f json
node dist/cli.js detail operation-plan --item-id 1060862679580 --pc-detail-image-count 11 -f json
```

Supported packaging buckets:

- `main_1x1`: 1:1 Tmall main image candidates, capped at 2 replacements.
- `micro_1x1`: 1:1 micro-detail candidates, capped at 2.
- `main_3x4`: 3:4 Tmall main image candidates, capped at 2 replacements.
- `micro_3x4`: 3:4 micro-detail candidates, capped at 3.
- `vertical`: product vertical image, capped at 1.
- `pc_detail`: PC detail image sequence, default cap 30. Optimized detail packages are preferred, and duplicated style/template sequences keep the style-code-specific block.

Blocked operation families emitted by `detail operation-plan`:

- Picture-space upload: `POST https://stream-upload.taobao.com/api/upload.api`.
- Publish-page model writes: `mainImagesGroup`, `threeToFourImages`, `guideImageGroup`, `descType`, `modularDesc`, `tmDescription`, `descRepublicOfSell`, `descForShenbiPc`, `descForShenbiMobile`.
- PC-to-mobile API sync: `POST asyncOpt.htm?optType=wapDescAutoGen`.
- Old mobile editor fallback: clear modules, `POST /template/convert.htm`, `POST /sell/ajax/save_item_template.do`, `POST /sell/ajax/commit.do`.
- New detail commit: `POST https://xiangqing.wangpu.taobao.com/template/ajax/commit_item_description.do`.
- Final publish submit: `POST submit.htm`.

These plan commands intentionally never call those endpoints. They expose request shapes, component names, UI labels, and payload skeletons so an operator can audit the run plan. If a saved detail plan is passed to `executor plan`, unsupported upload, DOM, and page-model steps are refused unless a dedicated runner is later implemented.

## Video / MOP CLI

The Bala and MOP adapters share the Quick/QN img2video surface. Read APIs remain callable; upload/generate/publish APIs are represented as blocked plans.

```bash
# Read actual Quick/QN template catalog with slot summaries.
node dist/cli.js video template-catalog --main-category '童装/婴儿装/亲子装' -f table
node dist/cli.js mop template-catalog --main-category '童装/婴儿装/亲子装' -f table

# Bala AI video workflow plans. The review gate is mandatory before video generation.
node dist/cli.js video semir-material-plan 208326102205 208326105214 -f json
node dist/cli.js video bala-image-plan --operation-type background_swap --source-images /tmp/a.jpg --background-prompt '海边' -f json
node dist/cli.js video bala-workflow-plan 208326102205 --item-id 1060862679580 --image-urls https://img.alicdn.com/a.jpg -f json

# Quick/QN img2video request shapes, shared by Bala and MOP scripts.
node dist/cli.js video qn-img2video-plan \
  --item-id 1060862679580 \
  --image-urls https://img.alicdn.com/a.jpg \
  --template-id tpl_001 \
  --template-type auto \
  -f json

# MOP search-recommend and KOL video plans.
node dist/cli.js mop search-recommend-plan \
  --item-id 1060862679580 \
  --title '新品上新' \
  --description '童装穿搭素材' \
  --material-urls https://img.alicdn.com/a.jpg,https://img.alicdn.com/b.jpg,https://img.alicdn.com/c.jpg \
  -f json

node dist/cli.js mop kol-img2video-plan --merchant-code 46X096070266 --material-count 3 -f json
```

Blocked operation families:

- Quick/QN image upload helper: `window.$startFileUpload(dataUrl)`.
- Direct img2video submit: `mtop.taobao.qn.copilot.image.generate.video.submit`.
- Action-template img2video: `mtop.taobao.qn.copilot.img2video.template.video.generate`.
- Slot-template video generation: `mtop.taobao.qn.copilot.video.template.generate`.
- Video task polling is read-only in shape: `mtop.taobao.qn.copilot.quick.task.get`.
- MOP search-recommend publish: `mtop.taobao.spongebob.item.material.publish`.
- MOP publish config/session reads: `mtop.taobao.spongebob.item.material.publish.config`, `mtop.taobao.media.guang.session.generate`.
- Merchant-code resolution reads: `mtop.tmall.sell.pc.manage.async` with `/tmall/manager/table.htm`.

Live smoke on the logged-in `9222` session:

- `material-test tasks --item-id 1060862679580`: success, `total=0`.
- `material-test items --keyword 1060862679580`: success, returned the Bala item title.
- `material-test data --item-ids 1060862679580`: success, no detail rows for the sample item.
- `detail classify-packaging`: success, categorized sample packaging paths into main, micro, vertical, and PC detail buckets.
- `detail packaging-plan`: success, emitted blocked upload/detail/mobile/final-submit plan for item `1060862679580`.
- `detail upload-plan`: success, emitted blocked picture-space upload request shape.
- `detail operation-plan`: success, emitted blocked publish-page, mobile-sync, old-editor, new-desc, and final-submit operation plan.
- `detail status`: requires an open detail publish/editor tab; if only seller home/DMP/Quick tabs are open, the command correctly reports that no matching editor target exists.
- `video qn-img2video-plan`: success, emitted blocked direct/template img2video request shapes.
- `video bala-workflow-plan`: success, emitted Semir material plan, AI image plan, mandatory review gate, and blocked video plan.
- `mop search-recommend-plan`: success, emitted blocked search-recommend material publish plan.
- `mop kol-img2video-plan`: success, emitted blocked MOP KOL img2video plan.
- `dmp compete-shops`: success, resolved default competitor shops.
- `dmp compete-paid-probe --max-competitors 1`: success across the paid-analysis read endpoints.

## Relationship To Existing CLIs

- OpenCLI pattern: browser/CDP state becomes a command surface, but endpoint contracts must be proven before becoming commands.
- Semir Yunpan CLI pattern: direct `9222` CDP connection with page-side reads.
- Bmall CLI pattern: explicit manifest, JSON-friendly output, typed errors, local auditability, and strict write boundaries.
