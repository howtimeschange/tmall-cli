import { callMtop, type MtopSpec } from '../mtop.js';
import { asArray, asRecord, firstText, num, text, type BrowserOptions } from './common.js';

export const MATERIAL_TEST_TARGET = 'myseller.taobao.com';

const materialSpec = (
  key: string,
  api: string,
  description: string,
  data: Record<string, unknown> = {}
): MtopSpec => ({
  adapter: 'material-test',
  key,
  api,
  version: '1.0',
  method: 'POST',
  data,
  target: MATERIAL_TEST_TARGET,
  description
});

export const MATERIAL_TEST_SPECS = {
  itemSearch: materialSpec('itemSearch', 'mtop.taobao.qianniu.shop.item.search', '千牛商品搜索'),
  taskSearch: materialSpec('taskSearch', 'mtop.taobao.qn.copilot.framework.listmodel.data.search', '素材测图任务列表'),
  dataDownload: materialSpec('dataDownload', 'mtop.taobao.qn.copilot.test.image.data.download', '素材测图数据下载/读取')
} satisfies Record<string, MtopSpec>;

export interface MaterialTaskSearchOptions extends BrowserOptions {
  itemId?: string;
  testStatus?: string;
  testChannel?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface MaterialDataOptions extends BrowserOptions {
  itemIds: string[];
  statisticType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface MaterialPlanOptions {
  itemId: string;
  materialUrls?: string[];
  experimentTaskId?: string;
  source?: string;
  size?: string;
  fileName?: string;
}

export async function readMaterialItems(
  options: BrowserOptions & { keyword?: string; pageNum?: number; pageSize?: number } = {}
): Promise<Record<string, unknown>[]> {
  const currentPage = positiveInt(options.pageNum, 1, 200);
  const pageSize = positiveInt(options.pageSize, 24, 100);
  const response = await callMtop<Record<string, unknown>>(MATERIAL_TEST_SPECS.itemSearch, {
    ...options,
    data: {
      searchType: 'all',
      param: JSON.stringify({
        currentPage,
        pageSize,
        k: text(options.keyword)
      })
    }
  });
  const rows = extractArray(response.data, [
    'result.list',
    'result.items',
    'model.list',
    'list',
    'items',
    'data.list',
    'data.items'
  ]);
  return rows.map((item) => ({
    itemId: text(item.itemId ?? item.item_id ?? item.id ?? item.numIid),
    title: firstText(item, ['title', 'itemTitle', 'auctionTitle', 'name']),
    outerId: firstText(item, ['outerId', 'outer_id', 'skuOuterId', 'itemCode']),
    price: item.price ?? item.itemPrice ?? '',
    quantity: item.quantity ?? item.stock ?? '',
    status: item.status ?? item.itemStatus ?? '',
    keys: Object.keys(item).slice(0, 24).join(','),
    capturedAt: response.capturedAt
  }));
}

export async function readMaterialTasks(options: MaterialTaskSearchOptions = {}): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(MATERIAL_TEST_SPECS.taskSearch, {
    ...options,
    data: buildMaterialTaskSearchPayload(options)
  });
  const rows = extractArray(response.data, [
    'list',
    'records',
    'result.list',
    'result.records',
    'data.list',
    'data.records',
    'data.result.list',
    'modelDataList'
  ]);
  const total = firstNumber(response.data, ['total', 'count', 'result.total', 'data.total', 'data.result.total']) ?? rows.length;
  if (!rows.length) {
    return [{
      itemId: normalizeItemId(options.itemId),
      taskId: '',
      title: '',
      status: 'no_tasks',
      channel: normalizeSource(options.testChannel),
      materialCount: 0,
      total,
      capturedAt: response.capturedAt
    }];
  }
  return rows.map((row) => normalizeTaskRow(row, total, response.capturedAt));
}

export async function readMaterialData(options: MaterialDataOptions): Promise<Record<string, unknown>[]> {
  const itemIds = normalizeItemIds(options.itemIds);
  const { startDate, endDate } = normalizeDateRange(options.startDate, options.endDate);
  const statisticType = text(options.statisticType) || 'ACCUMULATE_30_DAYS';
  const response = await callMtop<Record<string, unknown>>(MATERIAL_TEST_SPECS.dataDownload, {
    ...options,
    data: buildMaterialDataPayload({ itemIds, statisticType, startDate, endDate })
  });
  const rows = extractArray(response.data, [
    'list',
    'rows',
    'dataList',
    'data',
    'data.list',
    'data.rows',
    'data.dataList',
    'result.dataList',
    'result.list',
    'result.rows',
    'data.result.dataList',
    'data.result.list',
    'result'
  ]);
  const limit = positiveInt(options.limit, 100, 1000);
  if (!rows.length) {
    return [{
      itemIds: itemIds.join(','),
      statisticType,
      startDate,
      endDate,
      rowCount: 0,
      downloadUrl: findDownloadUrl(response.data),
      dataKeys: Object.keys(asRecord(response.data)).slice(0, 24).join(','),
      capturedAt: response.capturedAt
    }];
  }
  return rows.slice(0, limit).map((row) => normalizeDataRow(row, statisticType, startDate, endDate, response.capturedAt));
}

export function buildMaterialTaskSearchPayload(options: MaterialTaskSearchOptions): Record<string, unknown> {
  const params: Record<string, unknown> = {
    tabCode: 'all',
    testChannel: normalizeSource(options.testChannel)
  };
  const status = normalizeStatus(options.testStatus);
  if (status !== '') params.testStatus = status;
  const itemId = normalizeItemId(options.itemId);
  if (itemId) params.itemIdOrName = itemId;
  return {
    modelCode: 'image_test_mgr',
    params: JSON.stringify(params),
    currentPage: positiveInt(options.pageNum, 1, 200),
    pageSize: positiveInt(options.pageSize, 20, 100)
  };
}

export function buildMaterialDataPayload(options: {
  itemIds: string[];
  statisticType?: string;
  startDate?: string;
  endDate?: string;
}): Record<string, unknown> {
  const { startDate, endDate } = normalizeDateRange(options.startDate, options.endDate);
  return {
    startDate,
    endDate,
    itemIds: JSON.stringify(normalizeItemIds(options.itemIds)),
    statisticType: text(options.statisticType) || 'ACCUMULATE_30_DAYS'
  };
}

export function buildMaterialCreatePlan(options: MaterialPlanOptions): Record<string, unknown> {
  const itemId = normalizeItemId(options.itemId);
  const source = normalizeSource(options.source);
  const mtopSource = toMtopSource(source);
  const materials = buildMaterialPayloads(options.materialUrls ?? [], { size: options.size || '3:4' });
  const taskStatus = [{ experimentTaskId: options.experimentTaskId || '<experimentTaskId>', source }];
  return {
    access: 'blocked-write',
    execution: 'blocked',
    note: '创建测图任务、添加素材、上线任务、上传图片都会改变线上状态；CLI 只生成 payload 计划，不执行。',
    itemId,
    source,
    requests: [
      {
        key: 'create',
        api: 'mtop.taobao.qn.copilot.test.image.task.create',
        method: 'POST',
        data: {
          source: 'qn',
          itemId,
          imageTestSources: JSON.stringify([mtopSource])
        }
      },
      {
        key: 'batchAdd',
        api: 'mtop.taobao.qn.copilot.test.image.batch.add',
        method: 'POST',
        data: {
          experimentTaskId: options.experimentTaskId || '<experimentTaskId>',
          itemId,
          source,
          materials: JSON.stringify(materials)
        }
      },
      {
        key: 'online',
        api: 'mtop.taobao.qn.copilot.test.image.task.online',
        method: 'POST',
        data: {
          source: 'qn',
          itemId,
          taskStatusList: JSON.stringify(taskStatus)
        }
      }
    ],
    materialCount: materials.length,
    upload: buildPictureCenterUploadPlan({ fileName: options.fileName })
  };
}

export function buildMaterialSelectorUploadUrl(): string {
  const query = new URLSearchParams({
    type: 'pic',
    mime: 'png,jpg',
    needCrop: 'true',
    handleId: 'pic_space',
    picMaxSize: '20MB',
    needClose: 'true',
    minWidth: 'undefined',
    bizScene: 'material_test',
    max: '5',
    aspectRatio: '1:1'
  });
  return `https://market.m.taobao.com/app/crs-qn/sucai-selector-ng/index?${query.toString()}`;
}

function normalizeTaskRow(row: Record<string, unknown>, total: number, capturedAt: string): Record<string, unknown> {
  const metrics = asRecord(row.testImageMetrics ?? row.imageMetrics);
  const materialCount = Object.values(metrics).reduce<number>((sum, value) => sum + asArray(value).length, 0);
  const best = asRecord(row.bestTestImage ?? row.bestImage);
  return {
    itemId: text(row.itemId ?? row.itemID ?? row.item_id),
    taskId: text(row.experimentTaskId ?? row.taskId ?? row.id),
    title: firstText(row, ['title', 'itemTitle', 'auctionTitle', 'itemName']),
    status: statusLabel(row.testStatus ?? row.status),
    channel: sourceLabel(row.imageTestSource ?? row.source ?? row.testChannel),
    materialCount,
    bestImageUrl: normalizeRemoteUrl(best.imageUrl ?? row.bestTestImageUrl ?? ''),
    total,
    keys: Object.keys(row).slice(0, 24).join(','),
    capturedAt
  };
}

function normalizeDataRow(
  row: Record<string, unknown>,
  statisticType: string,
  startDate: string,
  endDate: string,
  capturedAt: string
): Record<string, unknown> {
  const searchExposure = num(row.searchExposure) ?? 0;
  const searchClick = num(row.searchClick) ?? 0;
  const detailExposure = num(row.detailExposure) ?? 0;
  const detailClick = num(row.detailClick) ?? 0;
  return {
    itemId: text(row.itemId),
    taskId: text(row.experimentTaskId ?? row.taskId),
    statisticType,
    startDate,
    endDate,
    statisticDate: text(row.statisticDate),
    imageType: text(row.imageType),
    materialId: text(row.materialId),
    materialRatio: text(row.materialRatio),
    materialUrl: normalizeRemoteUrl(row.materialUrl ?? row.imageUrl ?? ''),
    searchExposure,
    searchClick,
    searchCtr: ratio(searchClick, searchExposure),
    detailExposure,
    detailClick,
    detailCtr: ratio(detailClick, detailExposure),
    detailAddCart: num(row.detailAddCart) ?? '',
    detailPayConversion: num(row.detailPayConversion) ?? '',
    capturedAt
  };
}

function buildMaterialPayloads(urls: string[], options: { size: string }): Array<Record<string, unknown>> {
  return urls.map((url) => normalizeRemoteUrl(url)).filter(Boolean).map((picUrl) => ({
    sourceType: 4,
    picUrl,
    size: options.size
  }));
}

function buildPictureCenterUploadPlan(options: { fileName?: string }): Record<string, unknown> {
  return {
    selectorUrl: buildMaterialSelectorUploadUrl(),
    streamUpload: {
      endpoint: 'https://stream-upload.taobao.com/api/upload.api',
      method: 'POST',
      query: {
        appkey: 'tu',
        folderId: '0',
        watermark: false,
        picCompress: true,
        _input_charset: 'utf-8'
      },
      multipartFields: ['file', '_tb_token_', 'name', 'water', 'ua(optional)'],
      responseMap: {
        fileId: 'object.fileId',
        folderId: 'object.folderId',
        fullUrl: 'object.url',
        pixel: 'object.pix',
        size: 'object.size',
        quality: 'object.quality'
      }
    },
    multipartMtop: {
      configApi: 'mtop.taobao.mediacenter.pc.image.upload.config',
      initApi: 'mtop.taobao.mediacenter.pc.image.upload.init',
      completeApi: 'mtop.taobao.mediacenter.pc.image.upload.complete',
      sampleFileName: truncateFileName(options.fileName || 'image.jpg')
    }
  };
}

function extractArray(payload: unknown, paths: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.map(asRecord);
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((target, part) => asRecord(target)[part], payload);
    if (Array.isArray(value)) return value.map(asRecord);
  }
  return [];
}

function firstNumber(payload: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((target, part) => asRecord(target)[part], payload);
    const parsed = num(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function findDownloadUrl(payload: unknown, seen = new Set<unknown>()): string {
  if (!payload) return '';
  if (typeof payload === 'string') {
    const url = normalizeRemoteUrl(payload);
    return /^https?:\/\//i.test(url) ? url : '';
  }
  if (typeof payload !== 'object' || seen.has(payload)) return '';
  seen.add(payload);
  const record = asRecord(payload);
  for (const key of ['url', 'downloadUrl', 'fileUrl', 'href']) {
    const found = findDownloadUrl(record[key], seen);
    if (found) return found;
  }
  for (const value of Object.values(record)) {
    const found = findDownloadUrl(value, seen);
    if (found) return found;
  }
  return '';
}

function normalizeItemIds(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeItemId).filter(Boolean)));
}

function normalizeItemId(value: unknown): string {
  const match = text(value).match(/\d{8,}/);
  return match ? match[0] : '';
}

function normalizeSource(value: unknown): string {
  const raw = text(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (!raw || raw === 'commonsearch' || raw === 'search') return 'common_search';
  return text(value).toLowerCase();
}

function toMtopSource(value: unknown): string {
  const source = normalizeSource(value);
  if (source === 'common_search') return 'COMMON_SEARCH';
  return source.toUpperCase();
}

function sourceLabel(value: unknown): string {
  const source = normalizeSource(value);
  if (source === 'common_search') return '搜索测图';
  return text(value) || '未知渠道';
}

function normalizeStatus(value: unknown): string {
  const raw = text(value);
  const labels: Record<string, string> = {
    全部: '',
    未测试: '0',
    未开始: '0',
    测试中: '1',
    已结束: '2',
    已完成: '3',
    已暂停: '-1'
  };
  return Object.prototype.hasOwnProperty.call(labels, raw) ? labels[raw] : raw;
}

function statusLabel(value: unknown): string {
  const labels: Record<string, string> = {
    '-1': '已暂停',
    0: '未测试',
    1: '测试中',
    2: '已结束',
    3: '已完成'
  };
  const key = String(value ?? '').trim();
  return labels[key] || text(value);
}

function normalizeDateRange(start?: string, end?: string): { startDate: string; endDate: string } {
  if (validDate(start) && validDate(end)) return { startDate: compactDate(start), endDate: compactDate(end) };
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { startDate: formatDate(startDate), endDate: formatDate(endDate) };
}

function validDate(value: unknown): boolean {
  return /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.test(text(value));
}

function compactDate(value: unknown): string {
  const match = text(value).match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeRemoteUrl(value: unknown): string {
  const url = text(value);
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}

function ratio(numerator: number, denominator: number): string {
  if (!denominator) return '';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function truncateFileName(fileName: string, maxLength = 100): string {
  const index = fileName.lastIndexOf('.');
  const ext = index > -1 ? fileName.slice(index) : '';
  const base = index > -1 ? fileName.slice(0, index) : fileName;
  const limit = Math.max(1, maxLength - ext.length);
  return `${base.length > limit ? base.slice(0, limit) : base}${ext}`;
}
