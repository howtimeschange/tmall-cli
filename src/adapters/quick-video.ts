import { callMtop, type MtopSpec } from '../mtop.js';
import { asArray, asRecord, bool, firstText, num, parseJsonObject, resultOf, text, type BrowserOptions } from './common.js';

export const QUICK_VIDEO_TARGET = 'quick.taobao.com/videostudio/img2video';

const quickSpec = (key: string, api: string, description: string, data: Record<string, unknown> = {}): MtopSpec => ({
  adapter: 'quick-video',
  key,
  api,
  version: '1.0',
  data,
  target: QUICK_VIDEO_TARGET,
  description
});

export const QUICK_VIDEO_SPECS = {
  points: quickSpec('points', 'mtop.taobao.qn.copilot.point.info', '智影/生意管家点数余额'),
  sellerCategory: quickSpec('sellerCategory', 'mtop.taobao.qn.copilot.node.aigc.seller.category.get', 'AI 视频页识别的店铺主营类目'),
  templateCategories: quickSpec('templateCategories', 'mtop.taobao.qn.copilot.video.template.category.list', '视频模板分类树'),
  templates: quickSpec('templates', 'mtop.taobao.qn.copilot.video.template.list', '视频模板列表'),
  oneConfigure: quickSpec('oneConfigure', 'mtop.taobao.qn.copilot.video.one.configure.get', '一键成片配置项'),
  preference: quickSpec('preference', 'mtop.taobao.qn.copilot.video.preference.get', '视频生成偏好读取', { scene: 'videoType' }),
  signStatus: { ...quickSpec('signStatus', 'mtop.taobao.qn.copilot.sign.query.sign.status', '签到/积分面板状态查询'), allowMutationName: true },
  layoutMenu: quickSpec('layoutMenu', 'mtop.taobao.qn.copilot.quick.layout.menu', 'Quick 视频工作台菜单', { bizType: 'tb-video_ai' }),
  switches: quickSpec('switches', 'mtop.taobao.qn.copilot.quick.user.switch.info.query', 'Quick 用户功能开关'),
  digitalHumans: quickSpec('digitalHumans', 'mtop.taobao.qn.copilot.quick.video.digital.human.list', '数字人口播资源列表'),
  recommendItems: quickSpec('recommendItems', 'mtop.taobao.qn.copilot.quick.video.try.on.recommend.item.query', '推荐可试用商品', { pageNum: 1, pageSize: 10 }),
  itemSearch: quickSpec('itemSearch', 'mtop.taobao.qianniu.shop.item.search', '商品选择器全部商品/标题或 ID 搜索'),
  scriptCategories: quickSpec('scriptCategories', 'mtop.taobao.qn.copilot.quick.video.script.category.list', '脚本成片可用类目'),
  desktopDownload: quickSpec('desktopDownload', 'mtop.taobao.next.gateway.desktop.download.info', '生意管家客户端下载信息'),
  commercializeCheck: quickSpec('commercializeCheck', 'mtop.taobao.next.team.commercialize.check', '团队商业化状态'),
  agreement: quickSpec('agreement', 'mtop.taobao.qianniu.content.agreement.get.v3', '内容协议状态', { scene: 'tb-video_ai' }),
  itemPool: { ...quickSpec('itemPool', 'mtop.taobao.qn.copilot.item.pool.batch.query', '商品池详情'), method: 'POST' },
  offlineResults: quickSpec('offlineResults', 'mtop.taobao.qn.copilot.quick.item.customized.offline.result.pull', '离线结果拉取')
} satisfies Record<string, MtopSpec>;

export async function readQuickPoints(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.points, options);
  const result = asRecord(resultOf(response.data));
  const pointTypeMap = asRecord(result.pointTypeMap);
  return {
    totalUnUsePoint: result.totalUnUsePoint ?? null,
    packageUnUsePoint: result.packageUnUsePoint ?? null,
    buyUnUsePoint: result.buyUnUsePoint ?? null,
    dailySignUnUsePoint: result.dailySignUnUsePoint ?? null,
    waitUnUsePoint: result.waitUnUsePoint ?? null,
    pointTypeCount: Object.keys(pointTypeMap).length,
    pointTypes: Object.values(pointTypeMap).map((item) => text(item)).filter(Boolean).join(','),
    capturedAt: response.capturedAt
  };
}

export async function readQuickSellerCategory(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.sellerCategory, options);
  const result = asRecord(resultOf(response.data));
  return {
    mainCateId: result.mainCateId ?? '',
    mainCateName: result.mainCateName ?? '',
    mainCateIdLv2: result.mainCateIdLv2 ?? '',
    mainCateNameLv2: result.mainCateNameLv2 ?? '',
    capturedAt: response.capturedAt
  };
}

export async function readTemplateCategories(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.templateCategories, options);
  const result = asRecord(resultOf(response.data));
  return Object.entries(result).flatMap(([groupKey, rawGroup]) => flattenCategory(groupKey, asRecord(rawGroup)));
}

export async function readTemplates(options: BrowserOptions & { mainCategory?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const data = options.mainCategory ? { mainCategory: options.mainCategory } : {};
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.templates, { ...options, data });
  const limit = options.limit ?? 50;
  return asArray<Record<string, unknown>>(resultOf(response.data)).slice(0, limit).map((template) => {
    const category = parseJsonObject(template.category);
    const inputImages = safeJsonArray(template.inputImages);
    const clips = safeJsonArray(template.clips);
    return {
      id: template.id ?? null,
      templateId: template.templateId ?? '',
      name: template.name ?? '',
      ratio: template.ratio ?? '',
      duration: template.duration ?? null,
      clipNum: template.clipNum ?? null,
      provider: template.provider ?? '',
      type: template.type ?? '',
      tag: template.tag ?? '',
      category: categoryName(category),
      inputImageSlots: inputImages.length,
      clips: clips.length,
      hasCoverUrl: Boolean(template.coverUrl),
      hasVideoUrl: Boolean(template.videoUrl)
    };
  });
}

export async function readOneConfigure(options: BrowserOptions & { ratio?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.oneConfigure, {
    ...options,
    data: { ratio: options.ratio ?? '3:4' }
  });
  const result = asRecord(resultOf(response.data));
  const limit = options.limit ?? 30;
  return [
    ...asArray<Record<string, unknown>>(result.template).slice(0, limit).map((row) => ({
      type: 'template',
      id: row.id ?? '',
      name: row.name ?? '',
      hq: row.hq ?? null,
      extra: row.icon ? 'hasIcon' : ''
    })),
    ...asArray<Record<string, unknown>>(result.ttsTone).slice(0, limit).map((row) => ({
      type: 'ttsTone',
      id: row.id ?? '',
      name: row.name ?? '',
      hq: null,
      extra: ''
    })),
    ...asArray<Record<string, unknown>>(result.bgm).slice(0, limit).map((row) => ({
      type: 'bgm',
      id: row.bgmId ?? row.id ?? '',
      name: row.songName ?? row.name ?? '',
      hq: null,
      extra: ''
    }))
  ];
}

export async function readPreference(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.preference, options);
  const result = asRecord(resultOf(response.data));
  return {
    scene: 'videoType',
    record: result.record ?? null,
    capturedAt: response.capturedAt
  };
}

export async function readSignStatus(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.signStatus, options);
  const result = asRecord(resultOf(response.data));
  const slots = asArray<Record<string, unknown>>(result.slots);
  return {
    enable: result.enable ?? null,
    panelNo: result.panelNo ?? null,
    panelSignedDays: result.panelSignedDays ?? null,
    panelSize: result.panelSize ?? null,
    signedToday: result.signedToday ?? null,
    slotCount: slots.length,
    signedSlotCount: slots.filter((slot) => Boolean(slot.signed)).length,
    nextUnsignedSlot: slots.find((slot) => !slot.signed)?.slot ?? null,
    nextUnsignedPoints: slots.find((slot) => !slot.signed)?.points ?? null,
    capturedAt: response.capturedAt
  };
}

export async function readLayoutMenu(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.layoutMenu, options);
  const result = asRecord(resultOf(response.data));
  return asArray<Record<string, unknown>>(result.layoutMenu).flatMap((menu) => {
    const subMenus = asArray<Record<string, unknown>>(menu.subMenus);
    if (!subMenus.length) {
      return [{
        menuCode: text(menu.menuCode),
        menuName: text(menu.menuName),
        funcName: '',
        funcType: '',
        menuCategory: '',
        status: null,
        sortIndex: null,
        env: ''
      }];
    }
    return subMenus.map((sub) => ({
      menuCode: text(menu.menuCode),
      menuName: text(menu.menuName),
      funcName: text(sub.funcName),
      funcType: text(sub.funcType),
      menuCategory: text(sub.menuCategory),
      status: sub.status ?? null,
      sortIndex: sub.sortIndex ?? null,
      env: text(sub.env)
    }));
  });
}

export async function readSwitches(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.switches, options);
  const result = asRecord(resultOf(response.data));
  return {
    materialCenterMaterialTestEnabled: bool(result.materialCenterMaterialTestEnabled),
    selectorCropByUrlParam: bool(result.selectorCropByUrlParam),
    capturedAt: response.capturedAt
  };
}

export async function readDigitalHumans(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.digitalHumans, options);
  return asArray<Record<string, unknown>>(resultOf(response.data)).map((row) => ({
    avatarId: row.avatarId ?? '',
    name: row.name ?? '',
    gender: row.gender ?? '',
    style: row.style ?? '',
    favorite: row.favorite ?? null,
    spkNames: asArray(row.spkName).map((item) => text(item)).join(','),
    voiceCount: asArray(row.voiceUrl).length,
    videoCount: asArray(row.videoUrl).length,
    hasImage: Boolean(row.imageUrl)
  }));
}

export async function readRecommendItems(options: BrowserOptions & { pageNum?: number; pageSize?: number } = {}): Promise<Record<string, unknown>[]> {
  const pageNum = options.pageNum ?? 1;
  const pageSize = options.pageSize ?? 10;
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.recommendItems, {
    ...options,
    data: { pageNum, pageSize }
  });
  const result = asRecord(resultOf(response.data));
  return asArray<Record<string, unknown>>(result.data).map((item) => ({
    itemId: item.itemId ?? '',
    title: item.title ?? '',
    itemPrice: item.itemPrice ?? '',
    quantity: item.quantity ?? null,
    status: item.status ?? null,
    isTmall: item.isTmall ?? null,
    categoryId: item.categoryId ?? null,
    image1x1Count: asArray(item.mainImages_1_1).length,
    image3x4Count: asArray(item.mainImages_3_4).length,
    hasPicUrl: Boolean(item.picUrl)
  }));
}

export async function readItemSearch(options: BrowserOptions & { keyword?: string; pageNum?: number; pageSize?: number } = {}): Promise<Record<string, unknown>[]> {
  const currentPage = options.pageNum ?? 1;
  const pageSize = options.pageSize ?? 24;
  const keyword = options.keyword ?? '';
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.itemSearch, {
    ...options,
    data: {
      searchType: 'all',
      param: JSON.stringify({ currentPage, pageSize, k: keyword })
    }
  });
  const result = asRecord(resultOf(response.data));
  return asArray<Record<string, unknown>>(result.list).map((item) => ({
    itemId: item.itemId ?? '',
    title: item.title ?? '',
    itemPrice: item.itemPrice ?? item.icPrice ?? '',
    quantity: item.quantity ?? null,
    status: item.status ?? null,
    categoryId: item.categoryId ?? null,
    hasPicUrl: Boolean(item.picUrl),
    hasMore: result.hasMore ?? null,
    pageNum: result.pageNum ?? currentPage,
    pageSize: result.pageSize ?? pageSize
  }));
}

export async function readScriptCategories(options: BrowserOptions & { funcType?: string } = {}): Promise<Record<string, unknown>[]> {
  const funcType = options.funcType ?? 'video_by_script';
  const response = await callMtop<unknown>(QUICK_VIDEO_SPECS.scriptCategories, {
    ...options,
    data: { funcType }
  });
  return asArray<unknown>(resultOf(response.data)).map((item, index) => ({
    funcType,
    index,
    categoryId: item
  }));
}

export async function readDesktopDownload(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.desktopDownload, options);
  const result = asRecord(resultOf(response.data));
  return {
    resultType: Array.isArray(resultOf(response.data)) ? 'array' : typeof resultOf(response.data),
    resultKeys: Object.keys(result).join(','),
    capturedAt: response.capturedAt
  };
}

export async function readCommercializeCheck(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.commercializeCheck, options);
  const result = asRecord(resultOf(response.data));
  return {
    resultType: Array.isArray(resultOf(response.data)) ? 'array' : typeof resultOf(response.data),
    resultKeys: Object.keys(result).join(','),
    capturedAt: response.capturedAt
  };
}

export async function readAgreement(options: BrowserOptions & { scene?: string } = {}): Promise<Record<string, unknown>> {
  const scene = options.scene ?? 'tb-video_ai';
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.agreement, {
    ...options,
    data: { scene }
  });
  const data = asRecord(response.data);
  return {
    scene,
    hasAgree: data.hasAgree ?? null,
    subAccount: data.subAccount ?? null,
    resultKeys: Object.keys(data).join(','),
    capturedAt: response.capturedAt
  };
}

export async function readItemPool(options: BrowserOptions & { itemIds?: string[]; fromRecommend?: boolean } = {}): Promise<Record<string, unknown>[]> {
  let itemIds = options.itemIds?.filter(Boolean) ?? [];
  if (!itemIds.length && options.fromRecommend) {
    itemIds = await readRecommendItemIds(options);
  }
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.itemPool, {
    ...options,
    data: { itemIds: JSON.stringify(itemIds) }
  });
  const result = resultOf(response.data);
  const rows = extractRows(result);
  if (!rows.length) {
    const record = asRecord(result);
    return [{
      itemIdCount: itemIds.length,
      resultType: Array.isArray(result) ? 'array' : typeof result,
      resultKeys: Object.keys(record).join(','),
      capturedAt: response.capturedAt
    }];
  }
  return rows.map((item) => ({
    itemId: item.itemId ?? item.itemIdStr ?? item.id ?? item.__mapKey ?? '',
    title: item.title ?? item.itemTitle ?? '',
    status: item.status ?? item.itemStatus ?? null,
    hasPicUrl: Boolean(item.picUrl || item.imageUrl || item.pictUrl || item.pic),
    image1x1Count: asArray(item.mainImages_1_1 ?? item.mainImages11 ?? item.images).length,
    image3x4Count: asArray(item.mainImages_3_4 ?? item.mainImages34).length,
    keys: Object.keys(item).slice(0, 20).join(',')
  }));
}

export async function readOfflineResults(options: BrowserOptions & { sceneCode: string } = { sceneCode: 'img2video_one_click' }): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.offlineResults, {
    ...options,
    data: { sceneCode: options.sceneCode, forcePull: false }
  });
  const result = resultOf(response.data);
  const rows = extractRows(result);
  if (!rows.length) {
    const record = asRecord(result);
    return [{
      sceneCode: options.sceneCode,
      resultType: Array.isArray(result) ? 'array' : typeof result,
      resultKeys: Object.keys(record).join(','),
      resultCount: 0,
      capturedAt: response.capturedAt
    }];
  }
  return rows.map((item) => ({
    sceneCode: options.sceneCode,
    taskId: item.taskId ?? item.id ?? '',
    status: item.status ?? item.taskStatus ?? '',
    title: item.title ?? item.itemTitle ?? '',
    resultKeys: Object.keys(item).slice(0, 20).join(',')
  }));
}

async function readRecommendItemIds(options: BrowserOptions): Promise<string[]> {
  const response = await callMtop<Record<string, unknown>>(QUICK_VIDEO_SPECS.recommendItems, {
    ...options,
    data: { pageNum: 1, pageSize: 5 },
    redact: false
  });
  const result = asRecord(resultOf(response.data));
  return asArray<Record<string, unknown>>(result.data)
    .map((item) => text(item.itemId ?? item.itemIdStr ?? item.id))
    .filter(Boolean)
    .slice(0, 5);
}

function extractRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return asArray<Record<string, unknown>>(value);
  const record = asRecord(value);
  const candidateKeys = ['data', 'list', 'items', 'itemList', 'itemInfoList', 'result', 'records', 'tasks'];
  for (const key of candidateKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return asArray<Record<string, unknown>>(candidate);
    const nested = asRecord(candidate);
    const nestedRows = rowsFromObjectMap(nested);
    if (nestedRows.length) return nestedRows;
  }
  return rowsFromObjectMap(record);
}

function rowsFromObjectMap(record: Record<string, unknown>): Record<string, unknown>[] {
  const rows = Object.entries(record)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => ({ __mapKey: key, ...asRecord(value) }));
  return rows.some((row) => Object.keys(row).length > 1) ? rows : [];
}

function flattenCategory(groupKey: string, node: Record<string, unknown>, trail: string[] = []): Record<string, unknown>[] {
  const name = text(node.name);
  const code = text(node.code);
  const path = [...trail, name].filter(Boolean);
  const children = asArray<Record<string, unknown>>(node.children);
  const current = {
    group: groupKey,
    code,
    name,
    path: path.join('/'),
    childCount: children.length
  };
  return [current, ...children.flatMap((child) => flattenCategory(groupKey, child, path))];
}

function safeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function categoryName(category: Record<string, unknown>): string {
  const parts = ['storeCategory', 'bizCategory', 'tagCategory']
    .map((key) => firstText(asRecord(category[key]), ['name']))
    .filter(Boolean);
  return parts.join('/');
}
