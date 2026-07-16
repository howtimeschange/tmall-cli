#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { DMP_TARGET, readDmpAdcComponents, readDmpBrandApply, readDmpCredits, readDmpDatabankDeeplink, readDmpDeeplinkReportTasks, readDmpLatestDay, readDmpPowerUser, readDmpReportNotice, readDmpSms, readDmpSmsCount, readDmpUser, readDmpWaterprint, readDmpWeeklyReports } from './adapters/dmp.js';
import { QUICK_VIDEO_TARGET, readAgreement, readCommercializeCheck, readDesktopDownload, readDigitalHumans, readItemPool, readItemSearch, readLayoutMenu, readOfflineResults, readOneConfigure, readPreference, readQuickPoints, readQuickSellerCategory, readRecommendItems, readScriptCategories, readSignStatus, readSwitches, readTemplateCategories, readTemplates } from './adapters/quick-video.js';
import { SELLER_HOME_TARGET, readActivities, readCalendar, readDiagnoseOverview, readFinanceHome, readHomeAdvertisements, readHomeNumbers, readHomePopups, readHomeTodo, readNoticeAll, readRiskComponents, readSellerCard, readSellerInfoCards, readServiceStatus, readShopInfo, readShopTags, readSopTasks, readWarnInfo } from './adapters/seller-home.js';
import { DEFAULT_CDP_URL, DEFAULT_HOME_URL, DEFAULT_TARGET_MATCH, listTargets, selectTarget, withTmallPage } from './cdp.js';
import { AuthRequiredError, TmallCliError, toTmallError } from './errors.js';
import { endpointExpression, type EndpointSummary, menuExpression, type MenuSnapshot, snapshotExpression, type PageSnapshot } from './extractors.js';
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
