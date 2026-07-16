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
npm run dev -- dmp compete-shops -f json
npm run dev -- dmp compete-paid-probe --max-competitors 1 -f json
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
| `dmp compete-shops/compete-paid-probe/compete-paid-plan` | Resolve DMP competition shops and probe paid-analysis read APIs. |

## Implemented Adapter Coverage

All adapter commands are read-only and were validated against the logged-in `9222` browser session.

- `home *`: seller-center todo, seller cards, warnings, calendar, activities, diagnostics, shop info, notices, SOP tasks, finance reminders, number badges, risk widgets, ads, popups, shop tags, and service status.
- `quick *`: Quick/生意管家 snapshot, points, seller category, templates, one-click configuration, preference readback, sign-in panel status, workspace menu, switches, digital humans, recommended items, all-item search, script categories, agreement status, desktop/commercialize summaries, item-pool probe, and offline result pull.
- `dmp *`: DMP user, credits, messages, weekly reports, report notices, latest data day, ADC components, power user, brand apply, Databank deeplink, Deeplink report tasks, and watermark config.
- `material-test *`: converted from Crawshrimp `tmall-material-test*.js`: QianNiu item search, material-test task search, material-test data download/readback, and local blocked plans for create/add/online/upload request shapes.
- `reviews *`: converted from Crawshrimp `buyer-reviews.js`: item-link parsing plus `mtop.taobao.rate.detaillist.get` with `rate.tmall.com/list_detail_rate.htm` fallback.
- `member *`: converted safe local normalization from Crawshrimp `tmall-compete-member-monitor.js`; automatic navigation/screenshot capture is intentionally not enabled in this CLI.
- `detail *`: converted safe planning pieces from Crawshrimp `tmall-packaging-upload.js`: packaging asset bucket classification, style-aware PC detail sequence dedupe, picture-space upload request shapes, Tmall publish-page component write shapes, new-detail commit shape, PC-to-mobile detail sync shape, and old mobile editor fallback labels/endpoints. All write steps are blocked.
- `dmp compete-*`: converted from Crawshrimp `tmall-compete-paid-monitor.js`: competition shop resolution and paid-analysis read API probing. The probe summarizes endpoint health/shape instead of exporting full workbook data.
- `ops *`: operation-class request shape catalog and static source lookup for submit/save/delete/upload/apply-like APIs. These commands document how operation requests are shaped, but `execution` remains `blocked`.

## Crawshrimp Conversion Notes

Inspected source folder: `/Users/xingyicheng/Documents/crawshrimp/adapters/tmall-ops-assistant`.

- `buyer-reviews.js` -> `reviews parse-links`, `reviews list`.
- `tmall-material-test-data-export.js` and `tmall-material-test.js` -> `material-test items`, `material-test tasks`, `material-test data`, `material-test plan-create`.
- `tmall-compete-paid-monitor.js` -> `dmp compete-shops`, `dmp compete-paid-probe`, `dmp compete-paid-plan`.
- `tmall-compete-member-monitor.js` -> `member urls`.
- `tmall-packaging-upload.js` -> `detail classify-packaging`, `detail packaging-plan`, `detail upload-plan`, `detail operation-plan`.
- `tmall-ai-image-test-chain.js` contains upload/create/online orchestration; this CLI only records request shapes through plan/source commands and does not execute those operations.

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

These commands intentionally never call those endpoints. They expose request shapes, component names, UI labels, and payload skeletons so an operator can audit the run plan before any future approved executor exists.

Live smoke on the logged-in `9222` session:

- `material-test tasks --item-id 1060862679580`: success, `total=0`.
- `material-test items --keyword 1060862679580`: success, returned the Bala item title.
- `material-test data --item-ids 1060862679580`: success, no detail rows for the sample item.
- `detail classify-packaging`: success, categorized sample packaging paths into main, micro, vertical, and PC detail buckets.
- `detail packaging-plan`: success, emitted blocked upload/detail/mobile/final-submit plan for item `1060862679580`.
- `detail upload-plan`: success, emitted blocked picture-space upload request shape.
- `detail operation-plan`: success, emitted blocked publish-page, mobile-sync, old-editor, new-desc, and final-submit operation plan.
- `detail status`: requires an open detail publish/editor tab; if only seller home/DMP/Quick tabs are open, the command correctly reports that no matching editor target exists.
- `dmp compete-shops`: success, resolved default competitor shops.
- `dmp compete-paid-probe --max-competitors 1`: success across the paid-analysis read endpoints.

## Relationship To Existing CLIs

- OpenCLI pattern: browser/CDP state becomes a command surface, but endpoint contracts must be proven before becoming commands.
- Semir Yunpan CLI pattern: direct `9222` CDP connection with page-side reads.
- Bmall CLI pattern: explicit manifest, JSON-friendly output, typed errors, local auditability, and strict write boundaries.
