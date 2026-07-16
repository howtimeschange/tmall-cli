export interface ManifestEntry {
  name: string;
  description: string;
  access: 'read' | 'local-write' | 'blocked-write';
  browser: boolean;
  strategy: 'cdp-dom-state' | 'cdp-performance' | 'cdp-targets' | 'local' | 'mtop-read' | 'page-get' | 'static-source-scan';
  columns: string[];
}

export const MANIFEST: ManifestEntry[] = [
  {
    name: 'version',
    description: 'Print CLI version',
    access: 'read',
    browser: false,
    strategy: 'local',
    columns: ['version', 'node']
  },
  {
    name: 'doctor',
    description: 'Check local runtime and 9222 CDP visibility',
    access: 'read',
    browser: false,
    strategy: 'cdp-targets',
    columns: ['cdpUrl', 'targetFound', 'targetTitle', 'targetUrl']
  },
  {
    name: 'targets',
    description: 'List Taobao/Tmall/QN CDP targets',
    access: 'read',
    browser: false,
    strategy: 'cdp-targets',
    columns: ['id', 'type', 'title', 'url']
  },
  {
    name: 'whoami',
    description: 'Validate current seller-center page without reading cookies or localStorage values',
    access: 'read',
    browser: true,
    strategy: 'cdp-dom-state',
    columns: ['loggedInLikely', 'title', 'href', 'menuCount']
  },
  {
    name: 'menu.list',
    description: 'Flatten the QianNiu/Tmall seller-center menu tree from window.$qnMenus',
    access: 'read',
    browser: true,
    strategy: 'cdp-dom-state',
    columns: ['id', 'label', 'top', 'microKey', 'path', 'pcUrl']
  },
  {
    name: 'menu.export',
    description: 'Save the flattened menu tree to a local JSON file',
    access: 'local-write',
    browser: true,
    strategy: 'cdp-dom-state',
    columns: ['output', 'count']
  },
  {
    name: 'endpoints.apis',
    description: 'Summarize already-loaded MTOP/H5 API names and data shapes, with sensitive params removed',
    access: 'read',
    browser: true,
    strategy: 'cdp-performance',
    columns: ['api', 'version', 'risk', 'dataKeys', 'count']
  },
  {
    name: 'endpoints.urls',
    description: 'Summarize already-loaded resource URLs by origin/path/query keys, with sensitive params removed',
    access: 'read',
    browser: true,
    strategy: 'cdp-performance',
    columns: ['origin', 'path', 'category', 'risk', 'sources']
  },
  {
    name: 'snapshot',
    description: 'Read a bounded visible-page snapshot for orientation',
    access: 'read',
    browser: true,
    strategy: 'cdp-dom-state',
    columns: ['title', 'href', 'loggedInLikely', 'menuCount']
  },
  {
    name: 'recon.export',
    description: 'Save local JSON and Markdown recon artifacts from menu and endpoint snapshots',
    access: 'local-write',
    browser: true,
    strategy: 'cdp-dom-state',
    columns: ['outputDir', 'jsonFile', 'markdownFile', 'menuCount', 'apiCount']
  },
  ...readCommand('ops.list', 'List operation-class request shapes without executing them', 'cdp-performance', ['domain', 'name', 'family', 'dataKeys', 'execution']),
  ...readCommand('ops.get', 'Inspect one operation-class request shape and blocked execution status', 'cdp-performance', ['domain', 'name', 'requestFamily', 'dataShape', 'execution']),
  ...readCommand('ops.source', 'Locate operation-class API strings in already-loaded static JavaScript', 'static-source-scan', ['domain', 'pattern', 'script', 'occurrences']),
  ...readCommand('home.todo', 'Read seller-center todo groups/details from mtop.tmall.tmallwork.todoList', 'mtop-read', ['todoId', 'tag', 'count', 'detailCount']),
  ...readCommand('home.seller-info', 'Read seller info card and DSR summary', 'mtop-read', ['level', 'sellerType', 'averageServiceScoreSixmonth']),
  ...readCommand('home.seller-card', 'Read newer seller card, NPS, qualification and online summary', 'mtop-read', ['warnLevel', 'npsValue', 'warnQualiCount', 'onlineFlag']),
  ...readCommand('home.warn-info', 'Read seller-center warning state', 'mtop-read', ['level', 'month', 'msgCount', 'warnId']),
  ...readCommand('home.calendar', 'Read seller calendar events for a date range', 'mtop-read', ['eventId', 'title', 'startTime', 'status']),
  ...readCommand('home.activities', 'Read seller-center front activity list without entering signup URLs', 'mtop-read', ['frontActivityId', 'name', 'statusDesc', 'hasSignUrl']),
  ...readCommand('home.diagnose', 'Read seller-center diagnosis overview', 'mtop-read', ['flowAccCount', 'flowLimitedCount', 'itemDiagnoseCount']),
  ...readCommand('home.shop-info', 'Read shop info summary', 'mtop-read', ['shopName', 'displayShopStatus', 'mainCategory', 'shopDomainUrl']),
  ...readCommand('home.notice', 'Read seller-center notice resource summary', 'mtop-read', ['resultKeys', 'itemCount']),
  ...readCommand('home.sop-tasks', 'Read QianNiu SOP task summary', 'mtop-read', ['modelKeys', 'taskCount']),
  ...readCommand('home.finance', 'Read finance/subsidy notice summary', 'mtop-read', ['text', 'url', 'ignore']),
  ...readCommand('home.numbers', 'Read QianNiu number badge summaries', 'mtop-read', ['source', 'resultType', 'resultKeys']),
  ...readCommand('home.risk', 'Read seller-center risk component node and status summaries', 'mtop-read', ['source', 'resultType', 'resultKeys']),
  ...readCommand('home.ads', 'Read seller-center advertisement resource summaries', 'mtop-read', ['source', 'resultType', 'resultKeys']),
  ...readCommand('home.popups', 'Read seller-center general popup resource summary', 'mtop-read', ['source', 'resultType', 'resultKeys']),
  ...readCommand('home.shop-tags', 'Read shop tag and common-cell summaries', 'mtop-read', ['source', 'resultType', 'resultKeys']),
  ...readCommand('home.service-status', 'Read blue-star and service-hall status summaries', 'mtop-read', ['source', 'resultType', 'resultKeys']),
  ...readCommand('quick.snapshot', 'Read visible Quick video page snapshot', 'cdp-dom-state', ['title', 'href', 'textHead']),
  ...readCommand('quick.points', 'Read Quick video point balance', 'mtop-read', ['totalUnUsePoint', 'packageUnUsePoint', 'pointTypeCount']),
  ...readCommand('quick.category', 'Read Quick seller category', 'mtop-read', ['mainCateId', 'mainCateName', 'mainCateNameLv2']),
  ...readCommand('quick.template-categories', 'Read Quick video template category tree', 'mtop-read', ['group', 'code', 'name', 'path']),
  ...readCommand('quick.templates', 'Read Quick video template list', 'mtop-read', ['id', 'name', 'ratio', 'duration', 'inputImageSlots']),
  ...readCommand('quick.configure', 'Read Quick one-click video config items', 'mtop-read', ['type', 'id', 'name', 'hq']),
  ...readCommand('quick.preference', 'Read Quick video preference state', 'mtop-read', ['scene', 'record']),
  ...readCommand('quick.sign-status', 'Read Quick sign-in points panel status without signing', 'mtop-read', ['enable', 'signedToday', 'signedSlotCount', 'nextUnsignedPoints']),
  ...readCommand('quick.menu', 'Read Quick video workspace menu', 'mtop-read', ['menuCode', 'funcName', 'funcType', 'status']),
  ...readCommand('quick.switches', 'Read Quick user feature switches', 'mtop-read', ['materialCenterMaterialTestEnabled', 'selectorCropByUrlParam']),
  ...readCommand('quick.digital-humans', 'Read Quick digital human resources', 'mtop-read', ['avatarId', 'name', 'gender', 'style']),
  ...readCommand('quick.recommend-items', 'Read Quick recommended items for trial generation', 'mtop-read', ['itemId', 'title', 'itemPrice', 'quantity']),
  ...readCommand('quick.item-search', 'Read Quick item selector all-items/search results', 'mtop-read', ['itemId', 'title', 'itemPrice', 'quantity', 'hasMore']),
  ...readCommand('quick.script-categories', 'Read Quick script-video supported category ids', 'mtop-read', ['funcType', 'index', 'categoryId']),
  ...readCommand('quick.desktop-download', 'Read Quick desktop client download information summary', 'mtop-read', ['resultType', 'resultKeys']),
  ...readCommand('quick.commercialize', 'Read Quick team commercialize status summary', 'mtop-read', ['resultType', 'resultKeys']),
  ...readCommand('quick.agreement', 'Read Quick agreement state without signing', 'mtop-read', ['scene', 'hasAgree', 'subAccount']),
  ...readCommand('quick.item-pool', 'Read Quick item pool details from explicit or recommended item ids', 'mtop-read', ['itemId', 'title', 'status', 'keys']),
  ...readCommand('quick.offline-results', 'Read Quick offline results without submitting generation jobs', 'mtop-read', ['sceneCode', 'taskId', 'status', 'resultKeys']),
  ...readCommand('dmp.snapshot', 'Read visible DMP page snapshot', 'cdp-dom-state', ['title', 'href', 'textHead']),
  ...readCommand('dmp.user', 'Read DMP login user and permission summary', 'page-get', ['siteName', 'serverDate', 'accountLevel', 'permissionCount']),
  ...readCommand('dmp.credits', 'Read DMP AI credit balance', 'page-get', ['balance', 'estimatedDays', 'totalConsumption']),
  ...readCommand('dmp.sms-count', 'Read DMP system message count', 'page-get', ['count']),
  ...readCommand('dmp.sms', 'Read DMP system messages', 'page-get', ['id', 'subject', 'readStatus', 'createTime']),
  ...readCommand('dmp.weekly-reports', 'Read DMP weekly reports', 'page-get', ['id', 'title', 'mainCateName', 'reportDate']),
  ...readCommand('dmp.report-notice', 'Read DMP report-push notice state', 'page-get', ['pushed']),
  ...readCommand('dmp.latest-day', 'Read DMP latest data day', 'page-get', ['latestDay']),
  ...readCommand('dmp.adc-components', 'Read current DMP page ADC component definitions', 'page-get', ['id', 'code', 'name', 'subComponentCount']),
  ...readCommand('dmp.power-user', 'Read DMP power-center user summary', 'page-get', ['dataType', 'dataKeys', 'listCount']),
  ...readCommand('dmp.brand-apply', 'Read DMP brand-apply status summary', 'page-get', ['dataType', 'dataKeys', 'listCount']),
  ...readCommand('dmp.databank-deeplink', 'Read DMP databank deeplink summary', 'page-get', ['dataType', 'dataKeys', 'listCount']),
  ...readCommand('dmp.deeplink-report-tasks', 'Read DMP deeplink report tasks', 'page-get', ['id', 'name', 'status', 'keys']),
  ...readCommand('dmp.waterprint', 'Read DMP watermark config summary', 'page-get', ['dataType', 'dataKeys'])
];

export function getManifest(name: string): ManifestEntry | undefined {
  return MANIFEST.find((entry) => entry.name === name);
}

function readCommand(name: string, description: string, strategy: ManifestEntry['strategy'], columns: string[]): ManifestEntry[] {
  return [{ name, description, access: 'read', browser: true, strategy, columns }];
}
