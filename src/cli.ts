#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { buildDetailOperationPlan, buildDetailPackagingPlan, buildDetailUploadPlan, classifyPackagingAssetInputs, DETAIL_EDITOR_TARGET, readDetailEditorStatus } from './adapters/detail-editor.js';
import { DMP_TARGET, readDmpAdcComponents, readDmpBrandApply, readDmpCredits, readDmpDatabankDeeplink, readDmpDeeplinkReportTasks, readDmpLatestDay, readDmpPowerUser, readDmpReportNotice, readDmpSms, readDmpSmsCount, readDmpUser, readDmpWaterprint, readDmpWeeklyReports } from './adapters/dmp.js';
import { buildDmpCompetePaidPlan, readDmpCompetePaidProbe, readDmpCompeteShops } from './adapters/dmp-compete.js';
import { buildMaterialCreatePlan, MATERIAL_TEST_TARGET, readMaterialData, readMaterialItems, readMaterialTasks } from './adapters/material-test.js';
import { normalizeMemberUrls } from './adapters/member.js';
import { buildMopKolImg2VideoPlan, buildMopSearchRecommendPlan, readMopVideoTemplateCatalog } from './adapters/mop.js';
import { QUICK_VIDEO_TARGET, readAgreement, readCommercializeCheck, readDesktopDownload, readDigitalHumans, readItemPool, readItemSearch, readLayoutMenu, readOfflineResults, readOneConfigure, readPreference, readQuickPoints, readQuickSellerCategory, readRecommendItems, readScriptCategories, readSignStatus, readSwitches, readTemplateCategories, readTemplates } from './adapters/quick-video.js';
import { parseReviewLinks, readReviews, REVIEWS_TARGET } from './adapters/reviews.js';
import { SELLER_HOME_TARGET, readActivities, readCalendar, readDiagnoseOverview, readFinanceHome, readHomeAdvertisements, readHomeNumbers, readHomePopups, readHomeTodo, readNoticeAll, readRiskComponents, readSellerCard, readSellerInfoCards, readServiceStatus, readShopInfo, readShopTags, readSopTasks, readWarnInfo } from './adapters/seller-home.js';
import { buildBalaImagePlan, buildBalaVideoWorkflowPlan, buildQnImg2VideoPlan, buildSemirVideoMaterialPlan, readVideoTemplateCatalog } from './adapters/video.js';
import { DEFAULT_CDP_URL, DEFAULT_HOME_URL, DEFAULT_TARGET_MATCH, listTargets, selectTarget, withTmallPage } from './cdp.js';
import { AuthRequiredError, TmallCliError, toTmallError } from './errors.js';
import { endpointExpression, type EndpointSummary, menuExpression, type MenuSnapshot, snapshotExpression, type PageSnapshot } from './extractors.js';
import { listExecutorCommands, runExecutor } from './executor.js';
import { getManifest, MANIFEST } from './manifest.js';
import { getOperationRows, operationRowsForOutput, parseOperationDomains, readOperationCatalog, scanOperationSources } from './operations.js';
import { pickFields, render, type OutputFormat } from './output.js';
import { writeReconBundle, type ReconBundle } from './recon.js';

interface GlobalOptions {
  cdpUrl?: string;
  target?: string;
  format?: OutputFormat;
  json?: boolean;
}

const VERSION = '0.1.0';

export function createCli(): Command {
  const program = new Command();
  program
    .name('tmall')
    .description('天猫商家中心只读 CLI：复用 9222 CDP 登录态探查菜单、页面和接口形状')
    .version(VERSION)
    .option('--cdp-url <url>', 'Chrome CDP endpoint', process.env.TMALL_CDP_URL ?? DEFAULT_CDP_URL)
    .option('--target <text>', 'target URL/title contains text', process.env.TMALL_CDP_TARGET ?? DEFAULT_TARGET_MATCH)
    .option('-f, --format <format>', 'output format: table/json/ndjson/csv/md', 'table')
    .option('--json', 'shortcut for --format json')
    .showHelpAfterError();

  const globals = (): GlobalOptions => {
    const opts = program.opts<GlobalOptions>();
    return { ...opts, format: opts.json ? 'json' : opts.format ?? 'table' };
  };

  program.command('version').description('Print CLI version').action(() => {
    write({ version: VERSION, node: process.version }, globals());
  });

  program.command('doctor').description('Check local runtime and 9222 CDP visibility').action(async () => {
    const opts = globals();
    const targets = await listTargets(opts.cdpUrl);
    const target = selectTarget(targets, opts.target);
    write({
      cdpUrl: opts.cdpUrl,
      node: process.version,
      targetFound: Boolean(target),
      targetTitle: target?.title ?? '',
      targetUrl: target?.url ?? '',
      taobaoTargetCount: targets.filter((item) => /taobao\.com|tmall\.com|qn\.taobao\.com|quick\.taobao\.com/.test(item.url)).length
    }, opts);
  });

  program.command('targets').description('List Taobao/Tmall/QN CDP targets').option('-l, --limit <n>', 'maximum rows', '50').action(async (cmdOpts) => {
    const opts = globals();
    const limit = normalizeLimit(cmdOpts.limit, 50, 200);
    const targets = await listTargets(opts.cdpUrl);
    const rows = targets
      .filter((item) => /taobao\.com|tmall\.com|qn\.taobao\.com|quick\.taobao\.com|1688\.com/.test(item.url))
      .slice(0, limit)
      .map((item) => ({ id: item.id, type: item.type, title: item.title, url: item.url }));
    write(rows, opts);
  });

  program.command('whoami').description('Validate current seller-center page without reading cookies or localStorage values').action(async () => {
    const opts = globals();
    const page = await readSnapshot(opts);
    if (!page.loggedInLikely) throw new AuthRequiredError();
    write({
      loggedInLikely: page.loggedInLikely,
      title: page.title,
      href: page.href,
      menuCount: page.menuCount,
      visibleTextHead: page.textHead.slice(0, 160)
    }, opts);
  });

  const home = program.command('home').description('天猫商家中心首页真实只读接口');
  home.command('todo')
    .description('读取首页待办分组/明细')
    .option('--details', 'include todo detail rows')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: SELLER_HOME_TARGET };
      write(await readHomeTodo({ cdpUrl: opts.cdpUrl, target: opts.target, details: Boolean(cmdOpts.details) }), opts);
    });
  home.command('seller-info').description('读取首页卖家信息卡/DSR 摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readSellerInfoCards(opts), opts);
  });
  home.command('seller-card').description('读取新版卖家卡片/NPS/资质摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readSellerCard(opts), opts);
  });
  home.command('warn-info').description('读取经营预警状态').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readWarnInfo(opts), opts);
  });
  home.command('calendar')
    .description('读取商家日历事件')
    .option('--date <yyyy-mm-dd>', 'single date', today())
    .option('--start <yyyy-mm-dd>', 'start date')
    .option('--end <yyyy-mm-dd>', 'end date')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: SELLER_HOME_TARGET };
      const start = cmdOpts.start || cmdOpts.date;
      const end = cmdOpts.end || cmdOpts.date;
      write(await readCalendar({ cdpUrl: opts.cdpUrl, target: opts.target, start, end }), opts);
    });
  home.command('activities')
    .description('读取首页活动列表，默认 listType=2')
    .option('--list-type <n>', 'activity listType', '2')
    .option('--page-size <n>', 'page size hint', '4')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: SELLER_HOME_TARGET };
      write(await readActivities({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        listType: Number(cmdOpts.listType),
        pageSize: Number(cmdOpts.pageSize)
      }), opts);
    });
  home.command('diagnose').description('读取首页诊断概览').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readDiagnoseOverview(opts), opts);
  });
  home.command('shop-info').description('读取店铺基础信息').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readShopInfo(opts), opts);
  });
  home.command('notice').description('读取首页公告资源摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readNoticeAll(opts), opts);
  });
  home.command('sop-tasks').description('读取千牛 SOP 任务摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readSopTasks(opts), opts);
  });
  home.command('finance').description('读取财务/补贴首页提醒').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readFinanceHome(opts), opts);
  });
  home.command('numbers').description('读取千牛数字角标摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readHomeNumbers(opts), opts);
  });
  home.command('risk').description('读取首页风险组件节点/状态').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readRiskComponents(opts), opts);
  });
  home.command('ads').description('读取首页广告资源摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readHomeAdvertisements(opts), opts);
  });
  home.command('popups').description('读取首页通用弹窗资源摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readHomePopups(opts), opts);
  });
  home.command('shop-tags').description('读取店铺标签/扩展单元格摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readShopTags(opts), opts);
  });
  home.command('service-status').description('读取蓝星/服务大厅状态摘要').action(async () => {
    const opts = { ...globals(), target: SELLER_HOME_TARGET };
    write(await readServiceStatus(opts), opts);
  });

  const quick = program.command('quick').description('生意管家/智影图生视频真实只读接口');
  quick.command('snapshot').description('读取 Quick 页面可见快照').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readSnapshot(opts), opts);
  });
  quick.command('points').description('读取智影点数余额').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readQuickPoints(opts), opts);
  });
  quick.command('category').description('读取店铺主营类目').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readQuickSellerCategory(opts), opts);
  });
  quick.command('template-categories')
    .description('读取视频模板分类树')
    .option('-l, --limit <n>', 'maximum rows', '200')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write((await readTemplateCategories(opts)).slice(0, normalizeLimit(cmdOpts.limit, 200, 1000)), opts);
    });
  quick.command('templates')
    .description('读取视频模板列表')
    .option('--main-category <name>', 'filter by mainCategory, e.g. 童装/婴儿装/亲子装')
    .option('-l, --limit <n>', 'maximum rows', '50')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readTemplates({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        mainCategory: cmdOpts.mainCategory,
        limit: normalizeLimit(cmdOpts.limit, 50, 500)
      }), opts);
    });
  quick.command('configure')
    .description('读取一键成片配置项：模板/BGM/音色')
    .option('--ratio <ratio>', 'video ratio', '3:4')
    .option('-l, --limit <n>', 'per-type maximum rows', '30')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readOneConfigure({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        ratio: cmdOpts.ratio,
        limit: normalizeLimit(cmdOpts.limit, 30, 500)
      }), opts);
    });
  quick.command('preference').description('读取视频偏好状态，不修改偏好').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readPreference(opts), opts);
  });
  quick.command('sign-status').description('读取签到/积分面板状态，不执行签到').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readSignStatus(opts), opts);
  });
  quick.command('menu').description('读取 Quick 视频工作台菜单').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readLayoutMenu(opts), opts);
  });
  quick.command('switches').description('读取 Quick 用户功能开关').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readSwitches(opts), opts);
  });
  quick.command('digital-humans').description('读取数字人口播资源列表').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readDigitalHumans(opts), opts);
  });
  quick.command('recommend-items')
    .description('读取推荐可试用商品')
    .option('--page-num <n>', 'page number', '1')
    .option('--page-size <n>', 'page size', '10')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readRecommendItems({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        pageNum: Number(cmdOpts.pageNum),
        pageSize: normalizeLimit(cmdOpts.pageSize, 10, 50)
      }), opts);
    });
  quick.command('item-search')
    .description('读取商品选择器全部商品/标题或 ID 搜索结果')
    .option('-k, --keyword <text>', '商品标题/ID/编码关键词，空值代表第一页全部商品', '')
    .option('--page-num <n>', 'page number', '1')
    .option('--page-size <n>', 'page size', '24')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readItemSearch({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        keyword: cmdOpts.keyword,
        pageNum: Number(cmdOpts.pageNum),
        pageSize: normalizeLimit(cmdOpts.pageSize, 24, 100)
      }), opts);
    });
  quick.command('script-categories')
    .description('读取脚本成片可用类目')
    .option('--func-type <funcType>', 'function type', 'video_by_script')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readScriptCategories({ cdpUrl: opts.cdpUrl, target: opts.target, funcType: cmdOpts.funcType }), opts);
    });
  quick.command('desktop-download').description('读取生意管家客户端下载信息摘要').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readDesktopDownload(opts), opts);
  });
  quick.command('commercialize').description('读取团队商业化状态摘要').action(async () => {
    const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
    write(await readCommercializeCheck(opts), opts);
  });
  quick.command('agreement')
    .description('读取内容协议状态，不执行签约')
    .option('--scene <scene>', 'agreement scene', 'tb-video_ai')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readAgreement({ cdpUrl: opts.cdpUrl, target: opts.target, scene: cmdOpts.scene }), opts);
    });
  quick.command('item-pool')
    .description('读取商品池详情；可传 itemIds 或使用推荐商品作为样本')
    .option('--item-ids <ids>', 'comma-separated item ids')
    .option('--from-recommend', 'use current recommended items as readonly sample')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      const itemIds = String(cmdOpts.itemIds || '').split(',').map((item) => item.trim()).filter(Boolean);
      write(await readItemPool({ cdpUrl: opts.cdpUrl, target: opts.target, itemIds, fromRecommend: Boolean(cmdOpts.fromRecommend) }), opts);
    });
  quick.command('offline-results')
    .description('读取离线结果，不提交生成任务，forcePull 固定为 false')
    .option('--scene-code <sceneCode>', 'scene code', 'img2video_one_click')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readOfflineResults({ cdpUrl: opts.cdpUrl, target: opts.target, sceneCode: cmdOpts.sceneCode }), opts);
    });

  const material = program.command('material-test').description('天猫素材测图真实只读接口与操作计划');
  material.command('items')
    .description('读取千牛商品搜索结果，用于确认测图 itemId')
    .option('-k, --keyword <text>', '商品标题/ID/编码关键词', '')
    .option('--page-num <n>', 'page number', '1')
    .option('--page-size <n>', 'page size', '24')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: MATERIAL_TEST_TARGET };
      write(await readMaterialItems({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        keyword: cmdOpts.keyword,
        pageNum: Number(cmdOpts.pageNum),
        pageSize: normalizeLimit(cmdOpts.pageSize, 24, 100)
      }), opts);
    });
  material.command('tasks')
    .description('读取素材测图任务列表，不创建/上线任务')
    .option('--item-id <id>', 'item id or text containing item id', '')
    .option('--status <status>', '全部/未测试/测试中/已结束/已完成/已暂停 or raw status', '')
    .option('--channel <channel>', 'test channel', 'common_search')
    .option('--page-num <n>', 'page number', '1')
    .option('--page-size <n>', 'page size', '20')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: MATERIAL_TEST_TARGET };
      write(await readMaterialTasks({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        itemId: cmdOpts.itemId,
        testStatus: cmdOpts.status,
        testChannel: cmdOpts.channel,
        pageNum: Number(cmdOpts.pageNum),
        pageSize: normalizeLimit(cmdOpts.pageSize, 20, 100)
      }), opts);
    });
  material.command('data')
    .description('读取素材测图数据下载接口，不创建/修改任务')
    .requiredOption('--item-ids <ids>', 'comma/newline-separated item ids')
    .option('--statistic-type <type>', 'ACCUMULATE_30_DAYS or DAILY', 'ACCUMULATE_30_DAYS')
    .option('--start-date <yyyymmdd>', 'start date, defaults to last 30 days')
    .option('--end-date <yyyymmdd>', 'end date, defaults to today')
    .option('-l, --limit <n>', 'maximum rows', '100')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: MATERIAL_TEST_TARGET };
      write(await readMaterialData({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        itemIds: splitList(cmdOpts.itemIds),
        statisticType: cmdOpts.statisticType,
        startDate: cmdOpts.startDate,
        endDate: cmdOpts.endDate,
        limit: normalizeLimit(cmdOpts.limit, 100, 1000)
      }), opts);
    });
  material.command('plan-create')
    .description('生成创建/加图/上线/上传 payload 计划；只输出 blocked，不执行')
    .requiredOption('--item-id <id>', 'item id')
    .option('--material-urls <urls>', 'comma/newline-separated pic URLs')
    .option('--experiment-task-id <id>', 'existing task id for batch.add/online plan')
    .option('--source <source>', 'test source', 'common_search')
    .option('--size <ratio>', 'material ratio', '3:4')
    .option('--file-name <name>', 'sample upload file name', 'image.jpg')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildMaterialCreatePlan({
        itemId: cmdOpts.itemId,
        materialUrls: splitList(cmdOpts.materialUrls),
        experimentTaskId: cmdOpts.experimentTaskId,
        source: cmdOpts.source,
        size: cmdOpts.size,
        fileName: cmdOpts.fileName
      }), opts);
    });

  const reviews = program.command('reviews').description('天猫买家评价读取和商品链接解析');
  reviews.command('parse-links')
    .description('本地解析商品链接/ID，不访问页面')
    .argument('[input...]', 'links or ids')
    .action((input) => {
      const opts = globals();
      write(parseReviewLinks((input || []).join('\n')), opts);
    });
  reviews.command('list')
    .description('读取买家评价列表；默认 1 页，不提交任何操作')
    .option('--item-id <id>', 'item id')
    .option('--item-url <url>', 'detail item URL')
    .option('--sku-id <id>', 'sku id')
    .option('--page-num <n>', 'start page', '1')
    .option('--page-size <n>', 'page size', '20')
    .option('--max-pages <n>', 'maximum pages', '1')
    .option('-l, --limit <n>', 'maximum rows', '100')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: REVIEWS_TARGET };
      write(await readReviews({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        itemId: cmdOpts.itemId,
        itemUrl: cmdOpts.itemUrl,
        skuId: cmdOpts.skuId,
        pageNum: Number(cmdOpts.pageNum),
        pageSize: normalizeLimit(cmdOpts.pageSize, 20, 100),
        maxPages: normalizeLimit(cmdOpts.maxPages, 1, 20),
        limit: normalizeLimit(cmdOpts.limit, 100, 1000)
      }), opts);
    });

  const member = program.command('member').description('竞品会员中心本地 URL 标准化');
  member.command('urls')
    .description('根据 sellerId 或会员中心链接生成标准 URL；本地计算，不打开页面')
    .argument('[input...]', 'seller ids, member URLs, or newline text')
    .action((input) => {
      const opts = globals();
      write(normalizeMemberUrls((input || []).join('\n')), opts);
    });

  const detail = program.command('detail').description('天猫详情页编辑只读状态与 blocked 操作计划');
  detail.command('status')
    .description('读取当前详情发布/编辑页状态；不写表单、不点击')
    .action(async () => {
      const base = globals();
      const opts = { ...base, target: base.target && base.target !== DEFAULT_TARGET_MATCH ? base.target : DETAIL_EDITOR_TARGET };
      write(await readDetailEditorStatus({ cdpUrl: opts.cdpUrl, target: opts.target }), opts);
    });
  detail.command('classify-packaging')
    .description('本地分类包装图素材到主图/微详情/竖图/PC详情桶')
    .argument('[assets...]', 'asset URLs or paths')
    .option('--style-code <code>', 'style code for PC detail sequence dedupe')
    .option('--pc-detail-limit <n>', 'maximum PC detail images', '30')
    .action((assets, cmdOpts) => {
      const opts = globals();
      write(classifyPackagingAssetInputs(splitList((assets || []).join('\n')), {
        pcDetailLimit: normalizeLimit(cmdOpts.pcDetailLimit, 30, 200),
        styleCode: cmdOpts.styleCode
      }), opts);
    });
  detail.command('packaging-plan')
    .description('生成包装上传/详情页编辑计划；只输出 blocked，不上传/保存/发布')
    .option('--style-code <code>', 'style code')
    .option('--item-id <id>', 'tmall item id')
    .option('--assets <items>', 'comma/newline-separated asset URLs or paths')
    .option('--pc-detail-limit <n>', 'maximum PC detail images', '30')
    .option('--execute-mode <mode>', 'plan/upload_draft/publish_and_sync_mobile', 'plan')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildDetailPackagingPlan({
        styleCode: cmdOpts.styleCode,
        itemId: cmdOpts.itemId,
        assets: splitList(cmdOpts.assets),
        pcDetailLimit: normalizeLimit(cmdOpts.pcDetailLimit, 30, 200),
        executeMode: cmdOpts.executeMode
      }), opts);
    });
  detail.command('upload-plan')
    .description('输出天猫图片空间上传请求计划；本地生成，不上传文件')
    .option('--file-name <name>', 'sample file name', 'image.jpg')
    .option('--folder-id <id>', 'picture-space folder id', '0')
    .option('--origin-size', 'disable compression in plan')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildDetailUploadPlan({
        fileName: cmdOpts.fileName,
        folderId: cmdOpts.folderId,
        originSize: Boolean(cmdOpts.originSize)
      }), opts);
    });
  detail.command('operation-plan')
    .description('输出详情页编辑/手机详情/提交发布操作接口计划；本地生成，不请求页面')
    .option('--item-id <id>', 'tmall item id')
    .option('--pc-detail-image-count <n>', 'PC detail image count', '0')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildDetailOperationPlan({
        itemId: cmdOpts.itemId,
        pcDetailImageCount: Number(cmdOpts.pcDetailImageCount)
      }), opts);
    });

  const video = program.command('video').description('巴拉 AI 视频助手 / 生意管家图生视频接口计划');
  video.command('template-catalog')
    .description('读取生意管家图生视频模板目录，对应 MOP/巴拉模板导出脚本')
    .option('--main-category <name>', 'main category, e.g. 童装/婴儿装/亲子装')
    .option('-l, --limit <n>', 'maximum rows', '200')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readVideoTemplateCatalog({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        mainCategory: cmdOpts.mainCategory,
        limit: normalizeLimit(cmdOpts.limit, 200, 1000)
      }), opts);
    });
  video.command('semir-material-plan')
    .description('生成巴拉视频素材准备计划；不连接云盘、不下载')
    .argument('[itemCodes...]', 'style/item codes')
    .option('--cloud-path <path>', 'Semir cloud-drive root path')
    .option('--folder-scan-depth <n>', 'folder scan depth', '2')
    .option('--duplicate-mode <mode>', 'first_per_hash/all', 'first_per_hash')
    .option('--package-name <name>', 'local package name')
    .action((itemCodes, cmdOpts) => {
      const opts = globals();
      write(buildSemirVideoMaterialPlan({
        itemCodes: splitList((itemCodes || []).join('\n')),
        cloudPath: cmdOpts.cloudPath,
        folderScanDepth: normalizeLimit(cmdOpts.folderScanDepth, 2, 8),
        duplicateMode: cmdOpts.duplicateMode,
        packageName: cmdOpts.packageName
      }), opts);
    });
  video.command('bala-image-plan')
    .description('生成巴拉 AI 换脸/换背景/换装/换姿势任务计划；不创建 AI 任务')
    .option('--operation-type <type>', 'face_swap/background_swap/outfit_swap/pose_swap', 'face_swap')
    .option('--source-images <items>', 'comma/newline-separated local images')
    .option('--material-root <path>', 'material root directory')
    .option('--model-groups <items>', 'comma/newline-separated model groups')
    .option('--model-ref-ids <items>', 'comma/newline-separated model ref ids')
    .option('--background-prompt <text>', 'background prompt')
    .option('--garment-images <items>', 'outfit garment images')
    .option('--outfit-reference-images <items>', 'outfit reference images')
    .option('--variant-reference-images <items>', 'variant reference images')
    .option('--pose-prompt <text>', 'pose prompt')
    .option('--prompt-extra <text>', 'extra prompt requirements')
    .option('--generation-mode <mode>', 'submit_async/create_only', 'submit_async')
    .option('--review-mode <mode>', 'create_review_batch/none', 'create_review_batch')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildBalaImagePlan({
        operationType: cmdOpts.operationType,
        sourceImages: splitList(cmdOpts.sourceImages),
        materialRoot: cmdOpts.materialRoot,
        modelGroups: splitList(cmdOpts.modelGroups),
        modelRefIds: splitList(cmdOpts.modelRefIds),
        backgroundPrompt: cmdOpts.backgroundPrompt,
        garmentImages: splitList(cmdOpts.garmentImages),
        outfitReferenceImages: splitList(cmdOpts.outfitReferenceImages),
        variantReferenceImages: splitList(cmdOpts.variantReferenceImages),
        posePrompt: cmdOpts.posePrompt,
        promptExtra: cmdOpts.promptExtra,
        generationMode: cmdOpts.generationMode,
        reviewMode: cmdOpts.reviewMode
      }), opts);
    });
  video.command('qn-img2video-plan')
    .description('生成千牛/生意管家图生视频请求计划；不上传、不提交、不轮询')
    .option('--item-id <id>', 'item id')
    .option('--image-urls <items>', 'comma/newline-separated remote image URLs')
    .option('--image-count <n>', 'local image count placeholder', '1')
    .option('--ratio <ratio>', '1:1/3:4/9:16/16:9', '3:4')
    .option('--prompt <text>', 'video prompt')
    .option('--main-category <name>', 'main category', '童装/婴儿装/亲子装')
    .option('--template-id <id>', 'template id')
    .option('--template-type <type>', 'auto/action/slot', 'auto')
    .option('--provider <provider>', 'template provider', 'content')
    .option('--group-mode <mode>', 'one_image_per_video/all_images_one_video', 'one_image_per_video')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildQnImg2VideoPlan({
        itemId: cmdOpts.itemId,
        imageUrls: splitList(cmdOpts.imageUrls),
        imageCount: normalizeLimit(cmdOpts.imageCount, 1, 200),
        ratio: cmdOpts.ratio,
        prompt: cmdOpts.prompt,
        mainCategory: cmdOpts.mainCategory,
        templateId: cmdOpts.templateId,
        templateType: cmdOpts.templateType,
        provider: cmdOpts.provider,
        groupMode: cmdOpts.groupMode
      }), opts);
    });
  video.command('bala-workflow-plan')
    .description('生成巴拉 AI 视频完整链路计划；保留审核闸口，不执行生成')
    .argument('[itemCodes...]', 'style/item codes')
    .option('--item-id <id>', 'tmall item id')
    .option('--image-urls <items>', 'approved remote image URLs')
    .option('--operation-type <type>', 'face_swap/background_swap/outfit_swap/pose_swap', 'face_swap')
    .option('--model-groups <items>', 'model groups', '100女')
    .option('--main-category <name>', 'main category', '童装/婴儿装/亲子装')
    .option('--template-id <id>', 'template id')
    .action((itemCodes, cmdOpts) => {
      const opts = globals();
      write(buildBalaVideoWorkflowPlan({
        itemCodes: splitList((itemCodes || []).join('\n')),
        itemId: cmdOpts.itemId,
        imageUrls: splitList(cmdOpts.imageUrls),
        operationType: cmdOpts.operationType,
        modelGroups: splitList(cmdOpts.modelGroups),
        mainCategory: cmdOpts.mainCategory,
        templateId: cmdOpts.templateId
      }), opts);
    });

  const mop = program.command('mop').description('MOP 运营助手里的千牛/天猫素材与视频命令');
  mop.command('template-catalog')
    .description('读取 MOP 视频模板目录，对应 export-video-template-catalog.js')
    .option('--main-category <name>', 'main category')
    .option('-l, --limit <n>', 'maximum rows', '200')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: QUICK_VIDEO_TARGET };
      write(await readMopVideoTemplateCatalog({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        mainCategory: cmdOpts.mainCategory,
        limit: normalizeLimit(cmdOpts.limit, 200, 1000)
      }), opts);
    });
  mop.command('search-recommend-plan')
    .description('生成 MOP 搜推图文素材发布计划；不上传、不发布')
    .option('--item-id <id>', 'item id')
    .option('--merchant-code <code>', 'merchant/outer code')
    .option('--title <text>', 'short title')
    .option('--description <text>', 'content description')
    .option('--material-urls <items>', 'comma/newline-separated image URLs')
    .option('--material-count <n>', 'image count placeholder', '3')
    .option('--crop-ratio <ratio>', '1:1/3:4', '3:4')
    .option('--influencer <name>', '达人')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildMopSearchRecommendPlan({
        itemId: cmdOpts.itemId,
        merchantCode: cmdOpts.merchantCode,
        title: cmdOpts.title,
        description: cmdOpts.description,
        materialUrls: splitList(cmdOpts.materialUrls),
        materialCount: Number(cmdOpts.materialCount),
        cropRatio: cmdOpts.cropRatio,
        influencer: cmdOpts.influencer
      }), opts);
    });
  mop.command('kol-img2video-plan')
    .description('生成 MOP KOL 素材转短视频计划；不上传、不提交生成')
    .option('--item-id <id>', 'item id')
    .option('--merchant-code <code>', 'merchant/outer code')
    .option('--image-urls <items>', 'comma/newline-separated remote image URLs')
    .option('--material-count <n>', 'image count placeholder', '3')
    .option('--ratio <ratio>', '1:1/3:4/9:16/16:9', '3:4')
    .option('--prompt <text>', 'video prompt')
    .option('--main-category <name>', 'main category', '童装/婴儿装/亲子装')
    .option('--use-item-pics-fallback', 'plan item-picture fallback when no material image is available')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildMopKolImg2VideoPlan({
        itemId: cmdOpts.itemId,
        merchantCode: cmdOpts.merchantCode,
        imageUrls: splitList(cmdOpts.imageUrls),
        materialCount: normalizeLimit(cmdOpts.materialCount, 3, 12),
        ratio: cmdOpts.ratio,
        prompt: cmdOpts.prompt,
        mainCategory: cmdOpts.mainCategory,
        useItemPicsFallback: Boolean(cmdOpts.useItemPicsFallback)
      }), opts);
    });

  const dmp = program.command('dmp').description('达摩盘真实只读页面接口');
  dmp.command('snapshot').description('读取达摩盘页面可见快照').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readSnapshot(opts), opts);
  });
  dmp.command('user').description('读取达摩盘登录用户/权限摘要').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpUser(opts), opts);
  });
  dmp.command('credits').description('读取达摩盘 AI 豆/额度余额').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpCredits(opts), opts);
  });
  dmp.command('sms-count').description('读取达摩盘系统消息数量').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpSmsCount(opts), opts);
  });
  dmp.command('sms')
    .description('读取达摩盘系统消息列表')
    .option('-l, --limit <n>', 'maximum rows', '20')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: DMP_TARGET };
      write(await readDmpSms({ cdpUrl: opts.cdpUrl, target: opts.target, limit: normalizeLimit(cmdOpts.limit, 20, 200) }), opts);
    });
  dmp.command('weekly-reports')
    .description('读取达摩盘周报列表')
    .option('-l, --limit <n>', 'maximum rows', '20')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: DMP_TARGET };
      write(await readDmpWeeklyReports({ cdpUrl: opts.cdpUrl, target: opts.target, limit: normalizeLimit(cmdOpts.limit, 20, 200) }), opts);
    });
  dmp.command('report-notice').description('读取达摩盘投放报告通知状态').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpReportNotice(opts), opts);
  });
  dmp.command('latest-day').description('读取达摩盘数据最新日期').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpLatestDay(opts), opts);
  });
  dmp.command('adc-components')
    .description('读取当前达摩盘页 ADC 组件定义摘要')
    .option('-l, --limit <n>', 'maximum rows', '20')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: DMP_TARGET };
      write(await readDmpAdcComponents({ cdpUrl: opts.cdpUrl, target: opts.target, limit: normalizeLimit(cmdOpts.limit, 20, 200) }), opts);
    });
  dmp.command('power-user').description('读取达摩盘权限中心用户摘要').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpPowerUser(opts), opts);
  });
  dmp.command('brand-apply').description('读取品牌申请状态摘要').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpBrandApply(opts), opts);
  });
  dmp.command('databank-deeplink').description('读取 Databank deeplink 状态摘要').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpDatabankDeeplink(opts), opts);
  });
  dmp.command('deeplink-report-tasks')
    .description('读取 Deeplink 报告任务列表')
    .option('-l, --limit <n>', 'maximum rows', '20')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: DMP_TARGET };
      write(await readDmpDeeplinkReportTasks({ cdpUrl: opts.cdpUrl, target: opts.target, limit: normalizeLimit(cmdOpts.limit, 20, 200) }), opts);
    });
  dmp.command('waterprint').description('读取水印配置摘要').action(async () => {
    const opts = { ...globals(), target: DMP_TARGET };
    write(await readDmpWaterprint(opts), opts);
  });
  dmp.command('compete-shops')
    .description('解析竞争态势分析店铺 token；只调用 DMP 查询接口')
    .option('--shop-list <text>', 'newline shop list, optional position after whitespace')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: DMP_TARGET };
      write(await readDmpCompeteShops({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        shopList: cmdOpts.shopList
      }), opts);
    });
  dmp.command('compete-paid-probe')
    .description('探测竞品付费分析只读接口；输出接口状态/字段概要，不做投放')
    .option('--shop-list <text>', 'newline shop list, optional position after whitespace')
    .option('--begin-date <yyyy-mm-dd>', 'analysis begin date')
    .option('--end-date <yyyy-mm-dd>', 'analysis end date')
    .option('--peer-begin-date <yyyy-mm-dd>', 'comparison begin date')
    .option('--peer-end-date <yyyy-mm-dd>', 'comparison end date')
    .option('--max-competitors <n>', 'maximum competitors for probe', '3')
    .action(async (cmdOpts) => {
      const opts = { ...globals(), target: DMP_TARGET };
      write(await readDmpCompetePaidProbe({
        cdpUrl: opts.cdpUrl,
        target: opts.target,
        shopList: cmdOpts.shopList,
        beginDate: cmdOpts.beginDate,
        endDate: cmdOpts.endDate,
        peerBeginDate: cmdOpts.peerBeginDate,
        peerEndDate: cmdOpts.peerEndDate,
        maxCompetitors: normalizeLimit(cmdOpts.maxCompetitors, 3, 10)
      }), opts);
    });
  dmp.command('compete-paid-plan')
    .description('输出竞品付费分析接口 payload 计划；本地生成，不请求页面')
    .option('--begin-date <yyyy-mm-dd>', 'analysis begin date')
    .option('--end-date <yyyy-mm-dd>', 'analysis end date')
    .option('--peer-begin-date <yyyy-mm-dd>', 'comparison begin date')
    .option('--peer-end-date <yyyy-mm-dd>', 'comparison end date')
    .action((cmdOpts) => {
      const opts = globals();
      write(buildDmpCompetePaidPlan({
        beginDate: cmdOpts.beginDate,
        endDate: cmdOpts.endDate,
        peerBeginDate: cmdOpts.peerBeginDate,
        peerEndDate: cmdOpts.peerEndDate
      }), opts);
    });

  const ops = program.command('ops').description('操作类接口图谱：只记录调用方式，不执行线上动作');
  ops.command('list')
    .description('列出报名/提交/保存/删除/上传/投放等操作类接口形状')
    .option('--domain <domain>', 'home, quick, dmp, or all', 'all')
    .option('-l, --limit <n>', 'maximum rows', '100')
    .action(async (cmdOpts) => {
      const opts = globals();
      const rows = operationRowsForOutput((await readOperationCatalog({
        cdpUrl: opts.cdpUrl,
        domains: parseOperationDomains(cmdOpts.domain)
      })).rows).slice(0, normalizeLimit(cmdOpts.limit, 100, 1000));
      write(rows, opts);
    });
  ops.command('get')
    .description('查看某个操作类接口的请求族、参数形状和阻断状态')
    .argument('<pattern>', 'api/path substring, e.g. video.submit')
    .option('--domain <domain>', 'home, quick, dmp, or all', 'all')
    .action(async (pattern, cmdOpts) => {
      const opts = globals();
      const rows = await getOperationRows(pattern, {
        cdpUrl: opts.cdpUrl,
        domains: parseOperationDomains(cmdOpts.domain)
      });
      write(rows.map((row) => ({
        domain: row.domain,
        name: row.name,
        requestFamily: row.requestFamily,
        api: row.api ?? '',
        version: row.version ?? '',
        origin: row.origin,
        path: row.path,
        methodHint: row.methodHint,
        dataType: row.dataType ?? '',
        dataKeys: row.dataKeys,
        dataShape: row.dataShape,
        queryKeys: row.queryKeys,
        sources: row.sources,
        riskWords: row.riskWords,
        execution: row.execution,
        note: row.note
      })), opts);
    });
  ops.command('source')
    .description('在已加载静态 JS 中定位操作类接口字符串；只读源码，不执行接口')
    .argument('<pattern>', 'api/path/source substring, e.g. image.generate.video.submit')
    .option('--domain <domain>', 'home, quick, dmp, or all', 'all')
    .option('--max-scripts <n>', 'maximum static scripts to scan', '80')
    .option('--max-snippets <n>', 'snippets per script/pattern', '2')
    .action(async (pattern, cmdOpts) => {
      const opts = globals();
      const hints = await scanOperationSources(pattern, {
        cdpUrl: opts.cdpUrl,
        domains: parseOperationDomains(cmdOpts.domain),
        maxScripts: normalizeLimit(cmdOpts.maxScripts, 80, 200),
        maxSnippets: normalizeLimit(cmdOpts.maxSnippets, 2, 10)
      });
      write(hints, opts);
    });

  const menu = program.command('menu').description('Menu tree commands');
  menu.command('list')
    .description('Flatten window.$qnMenus from the seller-center page')
    .option('--top <name>', 'filter by top-level menu')
    .option('--include-hidden', 'include hidden menu nodes')
    .option('--leaves-only', 'only return leaf nodes')
    .option('-l, --limit <n>', 'maximum rows', '300')
    .action(async (cmdOpts) => {
      const opts = globals();
      const snapshot = await readMenu(opts);
      const limit = normalizeLimit(cmdOpts.limit, 300, 1000);
      const rows = snapshot.rows
        .filter((row) => cmdOpts.includeHidden || !row.hidden)
        .filter((row) => !cmdOpts.leavesOnly || !row.hasSub)
        .filter((row) => !cmdOpts.top || row.top === cmdOpts.top)
        .slice(0, limit);
      write(pickFields(rows, ['id', 'label', 'top', 'hidden', 'microKey', 'path', 'link', 'pcUrl']), opts);
    });

  menu.command('summary').description('Summarize menu coverage by top-level domain').action(async () => {
    const opts = globals();
    const snapshot = await readMenu(opts);
    write(Object.entries(snapshot.byTop).map(([top, item]) => ({ top, ...item })), opts);
  });

  menu.command('export')
    .description('Save flattened menu tree to a local JSON file')
    .option('-o, --output <file>', 'output JSON file', path.resolve(process.cwd(), 'tmall-menu.local.json'))
    .action(async (cmdOpts) => {
      const opts = globals();
      const snapshot = await readMenu(opts);
      const output = path.resolve(cmdOpts.output);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
      write({ output, count: snapshot.count }, opts);
    });

  const endpoints = program.command('endpoints').description('Loaded endpoint/resource commands');
  endpoints.command('apis')
    .description('Summarize already-loaded MTOP/H5 API names and data shapes')
    .option('--risk <risk>', 'filter risk: read_candidate/write_or_mutation_risk')
    .option('-l, --limit <n>', 'maximum rows', '120')
    .action(async (cmdOpts) => {
      const opts = globals();
      const snapshot = await readEndpoints(opts);
      const limit = normalizeLimit(cmdOpts.limit, 120, 500);
      const rows = snapshot.mtopApis
        .filter((row) => !cmdOpts.risk || row.risk === cmdOpts.risk)
        .slice(0, limit);
      write(pickFields(rows, ['api', 'version', 'risk', 'dataKeys', 'dataShape', 'resourceTypes', 'count']), opts);
    });

  endpoints.command('urls')
    .description('Summarize already-loaded URLs by origin/path/query keys; sensitive params are removed')
    .option('--category <category>', 'filter category')
    .option('--risk <risk>', 'filter risk: read_candidate/write_or_mutation_risk')
    .option('-l, --limit <n>', 'maximum rows', '120')
    .action(async (cmdOpts) => {
      const opts = globals();
      const snapshot = await readEndpoints(opts);
      const limit = normalizeLimit(cmdOpts.limit, 120, 500);
      const rows = snapshot.urls
        .filter((row) => !cmdOpts.category || row.category === cmdOpts.category)
        .filter((row) => !cmdOpts.risk || row.risk === cmdOpts.risk)
        .slice(0, limit);
      write(pickFields(rows, ['origin', 'path', 'category', 'risk', 'api', 'version', 'dataKeys', 'queryKeys', 'sources']), opts);
    });

  endpoints.command('summary').description('Summarize loaded URL categories and hosts').action(async () => {
    const opts = globals();
    const snapshot = await readEndpoints(opts);
    write({
      count: snapshot.count,
      byCategory: snapshot.byCategory,
      topHosts: Object.entries(snapshot.byHost).sort((a, b) => b[1] - a[1]).slice(0, 30),
      apiCount: snapshot.mtopApis.length,
      mutationCandidateCount: snapshot.mtopApis.filter((api) => api.risk === 'write_or_mutation_risk').length
    }, opts);
  });

  program.command('snapshot')
    .description('Read a bounded visible-page snapshot for orientation')
    .option('--max-anchors <n>', 'maximum anchors', '120')
    .option('--max-buttons <n>', 'maximum buttons', '80')
    .action(async (cmdOpts) => {
      const opts = globals();
      const page = await readSnapshot(opts, normalizeLimit(cmdOpts.maxAnchors, 120, 500), normalizeLimit(cmdOpts.maxButtons, 80, 300));
      write(page, opts);
    });

  const recon = program.command('recon').description('Recon artifact commands');
  recon.command('export')
    .description('Save local JSON and Markdown recon artifacts')
    .option('-o, --output-dir <dir>', 'output directory', path.resolve(process.cwd(), 'docs/recon'))
    .action(async (cmdOpts) => {
      const opts = globals();
      const bundle: ReconBundle = {
        generatedAt: new Date().toISOString(),
        strategy: {
          mode: 'read-only-cdp',
          notes: [
            'CDP Runtime.evaluate only; userGesture=false.',
            'No cookie/localStorage values or raw signed URLs are saved.',
            'Mutation-risk API names are blocked from execution.'
          ]
        },
        page: await readSnapshot(opts),
        menu: await readMenu(opts),
        endpoints: await readEndpoints(opts)
      };
      const outputDir = path.resolve(cmdOpts.outputDir);
      const written = await writeReconBundle(bundle, outputDir);
      write({
        outputDir,
        ...written,
        menuCount: bundle.menu.count,
        apiCount: bundle.endpoints.mtopApis.length,
        mutationCandidateCount: bundle.endpoints.mtopApis.filter((api) => api.risk === 'write_or_mutation_risk').length
      }, opts);
    });

  const executor = program.command('executor').alias('exec').description('Blocked-write executor with dry-run diff, whitelist, confirmation, and audit logs');
  executor.command('commands').description('List exact blocked-write commands that the executor can inspect').action(() => {
    write(listExecutorCommands(), globals());
  });
  executor.command('plan')
    .description('Inspect or execute a saved blocked-write plan; dry-run unless --execute is present')
    .requiredOption('--command <name>', 'exact command name, e.g. mop.search-recommend-plan')
    .requiredOption('--plan-file <file>', 'JSON plan file generated by a blocked-write plan command')
    .option('--execute', 'request real online execution after all safety gates pass')
    .option('--confirm <text>', 'exact second confirmation string from dry-run output')
    .option('--allow-command <name>', 'exact command allowlist entry; repeat or comma-separate', collectOption, [])
    .option('--allow-step <idOrKey>', 'exact step id/key allowlist; repeat or comma-separate', collectOption, [])
    .option('--allow-irreversible', 'acknowledge that rollback is manual/unsupported')
    .option('--operator <name>', 'operator name for audit log', process.env.USER || '')
    .option('--log-dir <dir>', 'audit log directory', path.resolve(process.cwd(), '.tmall-cli/audit'))
    .option('--continue-on-error', 'continue later selected steps after a failed online step')
    .action(async (cmdOpts) => {
      const opts = globals();
      const plan = await readJsonPlan(cmdOpts.planFile);
      write(await runExecutor({
        command: cmdOpts.command,
        plan,
        execute: Boolean(cmdOpts.execute),
        confirm: cmdOpts.confirm,
        allowCommands: cmdOpts.allowCommand,
        allowSteps: cmdOpts.allowStep,
        allowIrreversible: Boolean(cmdOpts.allowIrreversible),
        operator: cmdOpts.operator,
        logDir: cmdOpts.logDir,
        continueOnError: Boolean(cmdOpts.continueOnError),
        cdpUrl: opts.cdpUrl,
        target: opts.target && opts.target !== DEFAULT_TARGET_MATCH ? opts.target : undefined
      }), opts);
    });

  const manifest = program.command('manifest').description('Command manifest');
  manifest.command('list').description('List command manifest').action(() => {
    const opts = globals();
    write(MANIFEST.map((entry) => ({ name: entry.name, access: entry.access, browser: entry.browser, strategy: entry.strategy })), opts);
  });
  manifest.command('get').description('Get one manifest entry').argument('<name>').action((name) => {
    const opts = globals();
    const entry = getManifest(name);
    if (!entry) throw new TmallCliError('NOT_FOUND', `Manifest entry not found: ${name}`, 66);
    write(entry, opts);
  });

  program.exitOverride();
  return program;
}

export async function run(argv = process.argv): Promise<void> {
  const program = createCli();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (isCommanderInformationalExit(error)) return;
    const normalized = toTmallError(error);
    write({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        recover: normalized.recover
      }
    }, { format: 'json' });
    process.exitCode = normalized.exitCode;
  }
}

function isCommanderInformationalExit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; exitCode?: number };
  return candidate.exitCode === 0
    || candidate.code === 'commander.helpDisplayed'
    || candidate.code === 'commander.version';
}

async function readMenu(opts: GlobalOptions): Promise<MenuSnapshot> {
  return await withTmallPage({ cdpUrl: opts.cdpUrl, match: opts.target, openIfMissing: false }, async (page) => {
    const snapshot = await page.evaluateJson<MenuSnapshot>(menuExpression());
    if (!snapshot.count) throw new AuthRequiredError('页面未暴露 window.$qnMenus，可能未登录或还未进入商家中心。');
    return snapshot;
  });
}

async function readEndpoints(opts: GlobalOptions): Promise<EndpointSummary> {
  return await withTmallPage({ cdpUrl: opts.cdpUrl, match: opts.target, openIfMissing: false }, async (page) => {
    return await page.evaluateJson<EndpointSummary>(endpointExpression());
  });
}

async function readSnapshot(opts: GlobalOptions, maxAnchors = 120, maxButtons = 80): Promise<PageSnapshot> {
  return await withTmallPage({ cdpUrl: opts.cdpUrl, match: opts.target, openIfMissing: false, openUrl: DEFAULT_HOME_URL }, async (page) => {
    return await page.evaluateJson<PageSnapshot>(snapshotExpression(maxAnchors, maxButtons));
  });
}

function write(payload: unknown, opts: GlobalOptions): void {
  process.stdout.write(render(payload, opts.format ?? 'table'));
}

function normalizeLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const raw = value ?? defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new TmallCliError('ARGUMENT', `limit must be a positive integer <= ${maxValue}`, 2);
  if (n > maxValue) throw new TmallCliError('ARGUMENT', `limit must be <= ${maxValue}`, 2);
  return n;
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '')
    .split(/[\n\r,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, ...splitList(value)];
}

async function readJsonPlan(file: string): Promise<unknown> {
  const raw = await readFile(path.resolve(file), 'utf8');
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new TmallCliError('ARGUMENT', `plan-file is not valid JSON: ${(error as Error).message}`, 2);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isEntrypoint(metaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) return false;
  return realpathSync(new URL(metaUrl)) === realpathSync(argvPath);
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  void run();
}
