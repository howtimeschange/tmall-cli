import { normalizeTextList as normalizeList, text } from './common.js';
import { buildQnImg2VideoPlan, readVideoTemplateCatalog, type QnImg2VideoPlanOptions } from './video.js';

const DEFAULT_BIZ_CODE = 's_upload_feeds';
const DEFAULT_PUBLISH_SCENE = 'feed_search_recommend';
const MIN_SEARCH_RECOMMEND_IMAGES = 3;
const MAX_SEARCH_RECOMMEND_IMAGES = 9;

export interface MopSearchRecommendPlanOptions {
  itemId?: string;
  merchantCode?: string;
  title?: string;
  description?: string;
  materialUrls?: string[];
  materialCount?: number;
  cropRatio?: string;
  influencer?: string;
}

export interface MopKolImg2VideoPlanOptions extends QnImg2VideoPlanOptions {
  merchantCode?: string;
  materialCount?: number;
  useItemPicsFallback?: boolean;
}

export const readMopVideoTemplateCatalog = readVideoTemplateCatalog;

export function buildMopSearchRecommendPlan(options: MopSearchRecommendPlanOptions = {}): Record<string, unknown> {
  const itemId = normalizeItemId(options.itemId);
  const merchantCode = normalizeMerchantCode(options.merchantCode);
  const title = text(options.title);
  const description = text(options.description);
  const materialUrls = normalizeList(options.materialUrls);
  const materialCount = materialUrls.length || intOrFallback(options.materialCount, MIN_SEARCH_RECOMMEND_IMAGES);
  const materials = buildMaterialRows(materialUrls, materialCount, normalizeCropRatio(options.cropRatio));
  const ignoredMaterialCount = Math.max(0, materialCount - materials.length);
  return {
    access: 'blocked-write',
    execution: 'blocked',
    note: 'MOP 搜推素材发布会上传图片并发布图文内容；CLI 只生成真实请求计划，不上传、不发布。',
    sourceAdapter: 'mop-ops-assistant/search-recommend-material-publish.js',
    itemId,
    merchantCode,
    influencer: text(options.influencer),
    cropRatio: normalizeCropRatio(options.cropRatio),
    validation: searchRecommendValidation({ itemId, merchantCode, title, description, materialCount }),
    readBeforeWrite: [
      readRequest('merchantCodeResolve', 'mtop.tmall.sell.pc.manage.async', {
        url: '/tmall/manager/table.htm',
        jsonBody: JSON.stringify({
          tab: 'on_sale',
          pagination: { current: 1, pageSize: 20 },
          filtertab: '',
          filter: { queryOuterId: merchantCode || '<merchantCode>' },
          table: {}
        })
      }),
      readRequest('feedsItemList', 'mtop.taobao.feeds.material.item.list', {
        pageNo: 1,
        pageSize: 10,
        scene: DEFAULT_PUBLISH_SCENE,
        condition: JSON.stringify({ itemId: itemId || '<itemId>' }),
        orderBys: '',
        source: 'selfShop'
      }),
      readRequest('shopItemSearch', 'mtop.taobao.qianniu.shop.item.search', {
        searchType: 'all',
        param: JSON.stringify({ currentPage: 1, pageSize: 24, k: itemId || merchantCode || '<itemIdOrMerchantCode>' })
      }),
      readRequest('itemMaterial', 'mtop.taobao.qn.copilot.item.material.get', { itemId: itemId || '<itemId>' }),
      readRequest('publishConfig', 'mtop.taobao.spongebob.item.material.publish.config', {
        contentType: 'article',
        ugcScene: DEFAULT_PUBLISH_SCENE,
        contentId: '',
        dataSession: '<page dataSession>',
        itemId: itemId || '<itemId>'
      }),
      readRequest('publishSession', 'mtop.taobao.media.guang.session.generate', {
        request: JSON.stringify({ ugcScene: DEFAULT_PUBLISH_SCENE })
      })
    ],
    uploadPlan: {
      access: 'blocked-write',
      execution: 'blocked',
      helper: 'window.$startFileUpload(dataUrl)',
      preprocessing: `center-crop ${normalizeCropRatio(options.cropRatio)}`,
      inputMaterialCount: materialCount,
      materialCount: materials.length,
      ignoredMaterialCount,
      reason: '本地图片上传会写入千牛素材空间'
    },
    publishRequest: {
      key: 'publishSearchRecommendMaterial',
      access: 'blocked-write',
      execution: 'blocked',
      api: 'mtop.taobao.spongebob.item.material.publish',
      method: 'POST',
      data: {
        request: JSON.stringify({
          contentType: 'article',
          bizCode: DEFAULT_BIZ_CODE,
          ugcScene: DEFAULT_PUBLISH_SCENE,
          requestId: '<uuid>',
          shortTitle: encodeURIComponent(title || '<title>'),
          title: encodeURIComponent(description || '<description>'),
          pics: materials,
          items: [{
            itemId: itemId || '<itemId>',
            picUrl: '<item pic url>',
            title: '<item title>',
            source: 'selfShop'
          }],
          publishExtra: {
            qn_aigc_task_id: '<optional task id>',
            publish_ai_tool_type: '',
            publish_ai_tool_info: '',
            text_type: '0',
            post_channel: 'normal',
            is_rcmd_publisher: '1',
            dataSession: '<page dataSession>'
          },
          publishSession: '<publishSession>',
          coverPic: materials[0] ?? { url: '<cover url>' }
        })
      }
    }
  };
}

export function buildMopKolImg2VideoPlan(options: MopKolImg2VideoPlanOptions = {}): Record<string, unknown> {
  const itemId = normalizeItemId(options.itemId);
  const merchantCode = normalizeMerchantCode(options.merchantCode);
  const plannedItemId = itemId || (merchantCode ? '<resolved itemId from merchantCode>' : '');
  const base = buildQnImg2VideoPlan({
    ...options,
    itemId: plannedItemId,
    imageCount: options.imageUrls?.length || options.imageCount || options.materialCount || 3
  });
  return {
    ...base,
    sourceAdapter: 'mop-ops-assistant/kol-material-img2video-batch.js',
    note: 'MOP KOL 素材转短视频会解析商品、上传图片并提交展示视频生成；CLI 只生成计划，不上传、不提交。',
    merchantCode,
    useItemPicsFallback: Boolean(options.useItemPicsFallback),
    readBeforeWrite: [
      readRequest('merchantCodeResolve', 'mtop.tmall.sell.pc.manage.async', {
        url: '/tmall/manager/table.htm',
        jsonBody: JSON.stringify({
          tab: 'on_sale',
          pagination: { current: 1, pageSize: 20 },
          filtertab: '',
          filter: { queryOuterId: merchantCode || '<merchantCode>' },
          table: {}
        })
      }),
      readRequest('shopItemSearch', 'mtop.taobao.qianniu.shop.item.search', {
        searchType: 'all',
        param: JSON.stringify({ currentPage: 1, pageSize: 24, k: itemId || merchantCode || '<itemIdOrMerchantCode>' })
      }),
      readRequest('itemMaterial', 'mtop.taobao.qn.copilot.item.material.get', { itemId: plannedItemId || '<itemId>' })
    ],
    validation: itemId || merchantCode ? 'ok' : '商品ID或商家编码必填'
  };
}

function searchRecommendValidation(input: {
  itemId: string;
  merchantCode: string;
  title: string;
  description: string;
  materialCount: number;
}): string {
  const errors: string[] = [];
  if (!input.itemId && !input.merchantCode) errors.push('商品ID或商家编码必填');
  if (!input.title) errors.push('添加标题必填');
  if (input.title.length > 30) errors.push('添加标题最多 30 字');
  if (!input.description) errors.push('内容描述必填');
  if (input.description.length > 200) errors.push('内容描述最多 200 字');
  if (input.materialCount < MIN_SEARCH_RECOMMEND_IMAGES) errors.push(`素材图片至少 ${MIN_SEARCH_RECOMMEND_IMAGES} 张`);
  if (input.materialCount > MAX_SEARCH_RECOMMEND_IMAGES) errors.push(`素材图片最多 ${MAX_SEARCH_RECOMMEND_IMAGES} 张`);
  return errors.length ? errors.join('；') : 'ok';
}

function buildMaterialRows(urls: string[], count: number, ratio: string): Array<Record<string, unknown>> {
  const rows = urls.length
    ? urls.map((url, index) => ({ id: index, url }))
    : Array.from({ length: count }, (_, index) => ({ id: index, url: `<uploaded material url ${index + 1}>` }));
  return rows.slice(0, MAX_SEARCH_RECOMMEND_IMAGES).map((row) => ({ ...row, cropRatio: ratio }));
}

function readRequest(key: string, api: string, data: Record<string, unknown>): Record<string, unknown> {
  return { key, access: 'read', execution: 'not_executed_by_plan', api, method: 'POST', data };
}

function normalizeItemId(value: unknown): string {
  const match = text(value).match(/\d{8,}/);
  return match ? match[0] : '';
}

function normalizeMerchantCode(value: unknown): string {
  return text(value).toUpperCase();
}

function normalizeCropRatio(value: unknown): string {
  const raw = text(value);
  return ['1:1', '3:4'].includes(raw) ? raw : '3:4';
}

function intOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
