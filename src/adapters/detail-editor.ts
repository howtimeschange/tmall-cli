import { CdpPage, DEFAULT_CDP_URL, listTargets, type CdpTarget } from '../cdp.js';
import { AuthRequiredError } from '../errors.js';
import { text, type BrowserOptions } from './common.js';

export const DETAIL_EDITOR_TARGET = 'sell.publish.tmall.com';
const DETAIL_EDITOR_TARGET_HOSTS = ['sell.publish.tmall.com', 'sell.xiangqing.taobao.com'];

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff']);
const CATEGORY_ORDER = ['main_1x1', 'micro_1x1', 'main_3x4', 'micro_3x4', 'vertical', 'pc_detail'] as const;
const CATEGORY_LABELS: Record<PackagingCategory, string> = {
  main_1x1: '1:1主图',
  micro_1x1: '1:1微详情',
  main_3x4: '3:4主图',
  micro_3x4: '3:4微详情',
  vertical: '商品竖图',
  pc_detail: 'PC详情'
};
const REQUIRED_COUNTS: Partial<Record<PackagingCategory, number>> = {
  main_1x1: 2,
  micro_1x1: 2,
  main_3x4: 2,
  micro_3x4: 3,
  vertical: 1
};

export type PackagingCategory = typeof CATEGORY_ORDER[number];

export interface PackagingAsset {
  input: string;
  filename: string;
  fullpath: string;
  url: string;
  ext: string;
  width?: number;
  height?: number;
  ratio: string;
  category: PackagingCategory | 'unknown';
  score: number;
}

export interface DetailPackagingPlanOptions {
  styleCode?: string;
  itemId?: string;
  assets?: string[];
  pcDetailLimit?: number;
  executeMode?: string;
}

export async function readDetailEditorStatus(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const cdpUrl = options.cdpUrl ?? DEFAULT_CDP_URL;
  const target = await selectDetailEditorTarget(cdpUrl, options.target);
  const page = await CdpPage.connect(target);
  try {
    return await page.evaluateJson<Record<string, unknown>>(detailStatusExpression());
  } finally {
    await page.close();
  }
}

export function classifyPackagingAssetInputs(inputs: string[], options: { pcDetailLimit?: number; styleCode?: string } = {}): Record<string, unknown>[] {
  const classified = classifyPackagingAssets(parsePackagingAssets(inputs), options);
  return CATEGORY_ORDER.flatMap((category) => classified.byCategory[category].map((asset, index) => ({
    category,
    label: CATEGORY_LABELS[category],
    index: index + 1,
    filename: asset.filename,
    width: asset.width ?? '',
    height: asset.height ?? '',
    ratio: asset.ratio,
    url: asset.url,
    fullpath: asset.fullpath,
    score: asset.score
  })));
}

async function selectDetailEditorTarget(cdpUrl: string, match?: string): Promise<CdpTarget> {
  const targets = await listTargets(cdpUrl);
  const pages = targets.filter((target) => target.type === 'page');
  const rawMatch = text(match);
  const useDefaultHosts = !rawMatch || rawMatch === DETAIL_EDITOR_TARGET;
  const found = pages.find((target) => {
    const haystack = `${target.url} ${target.title}`.toLowerCase();
    return useDefaultHosts
      ? DETAIL_EDITOR_TARGET_HOSTS.some((host) => haystack.includes(host))
      : haystack.includes(rawMatch.toLowerCase());
  });
  if (!found) {
    throw new AuthRequiredError(`未在 ${cdpUrl} 找到天猫详情发布/编辑标签页（${useDefaultHosts ? DETAIL_EDITOR_TARGET_HOSTS.join(' / ') : rawMatch}）。`);
  }
  return found;
}

export function buildDetailPackagingPlan(options: DetailPackagingPlanOptions): Record<string, unknown> {
  const itemId = normalizeItemId(options.itemId);
  const styleCode = text(options.styleCode);
  const assets = parsePackagingAssets(options.assets ?? []);
  const classified = classifyPackagingAssets(assets, { pcDetailLimit: options.pcDetailLimit, styleCode });
  const uploadedByCategory = Object.fromEntries(CATEGORY_ORDER.map((category) => [
    category,
    classified.byCategory[category].map((asset) => ({
      fileName: asset.filename,
      source: asset.url || asset.fullpath,
      url: asset.url || `<uploaded:${asset.filename}>`,
      width: asset.width,
      height: asset.height,
      pix: asset.width && asset.height ? `${asset.width}x${asset.height}` : undefined
    }))
  ]));
  const pcDetailUrls = (uploadedByCategory.pc_detail as Array<{ url: string }>).map((item) => item.url);
  return {
    access: 'blocked-write',
    execution: 'blocked',
    note: '详情页编辑、图片上传、保存、发布、手机详情同步都会改变线上状态；CLI 只生成计划，不执行。',
    itemId,
    styleCode,
    executeMode: normalizeExecuteMode(options.executeMode),
    categorySummary: CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      selected: classified.byCategory[category].length,
      required: REQUIRED_COUNTS[category] ?? '',
      missing: Math.max(0, (REQUIRED_COUNTS[category] ?? 0) - classified.byCategory[category].length)
    })),
    warnings: classified.warnings,
    uploadedByCategory,
    componentPlan: buildDetailComponentPlan(uploadedByCategory),
    mobileDetailPlan: buildMobileDetailPlan(pcDetailUrls),
    operationPlan: buildDetailOperationPlan({ itemId, pcDetailImageCount: pcDetailUrls.length })
  };
}

export function buildDetailUploadPlan(options: { fileName?: string; folderId?: string; originSize?: boolean } = {}): Record<string, unknown> {
  const endpoint = 'https://stream-upload.taobao.com/api/upload.api';
  return {
    access: 'blocked-write',
    execution: 'blocked',
    endpoint,
    method: 'POST',
    note: '图片空间上传会写入天猫图片空间；CLI 只记录请求形状，不上传文件。',
    streamUpload: {
      endpoint,
      method: 'POST',
      query: {
        appkey: 'tu',
        folderId: options.folderId || '0',
        watermark: false,
        picCompress: !options.originSize,
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
      config: { api: 'mtop.taobao.mediacenter.pc.image.upload.config', data: { bizCode: 'tu' } },
      init: {
        api: 'mtop.taobao.mediacenter.pc.image.upload.init',
        data: {
          sha256: '<sha256>',
          bizCode: 'tu',
          fileSize: '<bytes>',
          fileName: truncateFileName(options.fileName || 'image.jpg'),
          dirId: options.folderId || '0',
          clientType: 1,
          pixel: '<width>x<height>',
          fileType: extOf(options.fileName || 'image.jpg')
        }
      },
      uploadPart: {
        method: 'PUT',
        contentType: 'application/octet-stream',
        urlSource: 'init.model.uploadUrlList[].url',
        etagSource: 'ETag response header'
      },
      complete: {
        api: 'mtop.taobao.mediacenter.pc.image.upload.complete',
        type: 'POST',
        data: {
          bizCode: 'tu',
          uploadId: '<uploadId>',
          clientType: '1',
          partList: '<JSON.stringify(partList.map(JSON.stringify))>'
        }
      }
    }
  };
}

export function buildDetailOperationPlan(options: { itemId?: string; pcDetailImageCount?: number } = {}): Record<string, unknown>[] {
  return [
    {
      key: 'openPublishEditor',
      access: 'read/navigation-plan',
      execution: 'not_executed_by_plan',
      url: options.itemId
        ? `https://sell.publish.tmall.com/tmall/publish.htm?itemId=${encodeURIComponent(options.itemId)}`
        : 'https://sell.publish.tmall.com/tmall/publish.htm?<itemId>'
    },
    {
      key: 'uploadImage',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: 'https://stream-upload.taobao.com/api/upload.api',
      method: 'POST',
      reason: '写入图片空间'
    },
    {
      key: 'applyComponentValues',
      access: 'blocked-write',
      execution: 'blocked',
      components: ['mainImagesGroup', 'threeToFourImages', 'guideImageGroup', 'descType', 'modularDesc', 'tmDescription', 'descRepublicOfSell', 'descForShenbiPc'],
      reason: '修改发布页表单模型'
    },
    {
      key: 'generateMobileDesc',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: 'asyncOpt.htm?optType=wapDescAutoGen',
      method: 'POST',
      payloadShape: { catId: '<catId>', jsonBody: '{"desc":"<pcDetailHtml>"}' },
      pcDetailImageCount: options.pcDetailImageCount ?? '<count>'
    },
    {
      key: 'applyMobileDetail',
      access: 'blocked-write',
      execution: 'blocked',
      component: 'descForShenbiMobile',
      fields: ['descContainer.detail', 'descContainer.nativeDetail', 'empty']
    },
    {
      key: 'clearMobileEditor',
      access: 'blocked-write',
      execution: 'blocked',
      method: 'CDP Runtime.evaluate / DOM action',
      uiLabels: ['清除所有模块', '清空旧手机端详情模块'],
      reason: '清空旧手机端详情编辑器画布'
    },
    {
      key: 'importMobilePcDetail',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: '/template/convert.htm',
      method: 'POST or editor React instance process()',
      uiLabels: ['导入', '导入详情', '导入电脑端详情'],
      payloadShape: { itemId: options.itemId || '<itemId>', op: '0=全图生成 / 1=图文分离' },
      reason: '把电脑端详情导入手机端详情编辑器'
    },
    {
      key: 'saveMobileEditor',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: '/sell/ajax/save_item_template.do',
      method: 'POST or editor Save click',
      uiLabels: ['保存'],
      reason: '保存手机端详情编辑器模板'
    },
    {
      key: 'finishMobileEditor',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: '/sell/ajax/commit.do',
      method: 'POST or editor Finish click',
      uiLabels: ['完成编辑'],
      reason: '完成手机端详情编辑并返回发布页'
    },
    {
      key: 'commitNewDesc',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: 'https://xiangqing.wangpu.taobao.com/template/ajax/commit_item_description.do',
      method: 'POST',
      payloadShape: { ...redactedTokenField(), changed: true, templateContent: '<templateContent>' }
    },
    {
      key: 'submitPublish',
      access: 'blocked-write',
      execution: 'blocked',
      endpoint: 'submit.htm',
      method: 'POST',
      payloadShape: { catId: '<catId>', itemId: options.itemId || '<itemId>', jsonBody: '<formValues JSON>' }
    }
  ];
}

function buildDetailComponentPlan(uploadedByCategory: Record<string, unknown>): Record<string, unknown> {
  const category = uploadedByCategory as Record<PackagingCategory, Array<Record<string, unknown>>>;
  const main1x1 = [...category.main_1x1, ...category.micro_1x1].slice(0, 5).map(imageValue);
  const main3x4 = [...category.main_3x4, ...category.micro_3x4].slice(0, 5).map((item) => ({ url: item.url }));
  const vertical = category.vertical.slice(0, 1).map((item) => ({ url: item.url }));
  const pcDetailUrls = category.pc_detail.map((item) => text(item.url));
  return {
    mainImagesGroup: main1x1.length ? { images: main1x1 } : undefined,
    threeToFourImages: main3x4.length ? main3x4 : undefined,
    guideImageGroup: vertical.length ? { verticalImage: vertical } : undefined,
    pcDetailTargets: ['modularDesc', 'tmDescription', 'descRepublicOfSell', 'descForShenbiPc'],
    detailHtml: buildPcDetailHtml(pcDetailUrls),
    pcDetailImageCount: pcDetailUrls.length
  };
}

function buildMobileDetailPlan(pcDetailUrls: string[]): Record<string, unknown> {
  return {
    component: 'descForShenbiMobile',
    imageCount: pcDetailUrls.length,
    wapDesc: buildWapDescDetailFromUrls(pcDetailUrls),
    nativeDetailShape: {
      data: {
        type: 'native',
        key: 'sys_list',
        params: { requestMap: '{"see_more":true}' },
        children: pcDetailUrls.map((url, index) => ({
          ID: `detail_pic_<timestamp>_${index + 1}`,
          type: 'native',
          key: 'detail_container_style7',
          params: { childrenStyle: 'sequence', picUrl: url },
          putID: -1
        }))
      }
    }
  };
}

function parsePackagingAssets(inputs: string[]): PackagingAsset[] {
  return inputs.flatMap((value) => String(value || '').split(/[\n\r,，;；]+/))
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((input) => {
      const filename = filenameOf(input);
      const dim = parseDimension(`${filename} ${input}`);
      const ext = extOf(filename);
      const ratio = dim ? ratioOf(dim.width, dim.height) : '';
      const base = {
        input,
        filename,
        fullpath: input,
        url: /^https?:\/\//i.test(input) || input.startsWith('//') ? normalizeUrl(input) : '',
        ext,
        width: dim?.width,
        height: dim?.height,
        ratio,
        category: 'unknown' as const,
        score: 0
      };
      return { ...base, ...inferPackagingCategory(base) };
    })
    .filter((asset) => IMAGE_EXTS.has(asset.ext));
}

function classifyPackagingAssets(assets: PackagingAsset[], options: { pcDetailLimit?: number; styleCode?: string } = {}): {
  byCategory: Record<PackagingCategory, PackagingAsset[]>;
  warnings: string[];
} {
  const byCategory: Record<PackagingCategory, PackagingAsset[]> = {
    main_1x1: [],
    micro_1x1: [],
    main_3x4: [],
    micro_3x4: [],
    vertical: [],
    pc_detail: []
  };
  const used = new Set<string>();
  const warnings: string[] = [];
  const sorted = assets.slice().sort((a, b) => b.score - a.score || naturalCompare(a.fullpath, b.fullpath));
  for (const category of CATEGORY_ORDER) {
    const limit = category === 'pc_detail' ? positiveInt(options.pcDetailLimit, 30, 200) : categoryLimit(category);
    const pool = sorted.filter((asset) => asset.category === category && !used.has(asset.input));
    const selected = category === 'pc_detail'
      ? selectPcDetailAssets(pool, { limit, styleCode: options.styleCode, warnings })
      : pool.slice(0, limit);
    for (const asset of selected) {
      byCategory[category].push(asset);
      used.add(asset.input);
    }
  }
  warnings.push(...CATEGORY_ORDER
    .filter((category) => REQUIRED_COUNTS[category] && byCategory[category].length < Number(REQUIRED_COUNTS[category]))
    .map((category) => `${CATEGORY_LABELS[category]} 缺少 ${Number(REQUIRED_COUNTS[category]) - byCategory[category].length} 张`));
  if (!byCategory.pc_detail.length) warnings.push('PC详情未匹配到可用图片');
  return { byCategory, warnings };
}

function inferPackagingCategory(asset: Omit<PackagingAsset, 'category' | 'score'>): Pick<PackagingAsset, 'category' | 'score'> {
  const full = `${asset.fullpath} ${asset.filename}`;
  const normalized = full.replace(/\\/g, '/');
  const isMain = /(^|\/)(?:1-)?主图(\/|$)|主图微详情|01_?1比1主图|03_?3比4主图|天猫|tmall/i.test(normalized);
  const isMicro = /微详情|micro|02_?1比1微详情|04_?3比4微详情/i.test(normalized);
  const isDetail = /(^|\/)(?:2-)?详情(\/|$)|\/images(\/|$)|PC详情|商详|detail|电脑/i.test(normalized);
  const isVertical = /竖图|vertical|商品竖图/i.test(normalized);
  if (isDetail) return { category: 'pc_detail', score: scorePcDetail(normalized) };
  if (asset.width === 1440 && asset.height === 2160) return { category: 'vertical', score: isVertical ? 100 : 70 };
  if (asset.width === 1440 && asset.height === 1920) return { category: isMicro ? 'micro_3x4' : 'main_3x4', score: isMain || isMicro ? 100 : 70 };
  if (asset.width === 1440 && asset.height === 1440) return { category: isMicro ? 'micro_1x1' : 'main_1x1', score: isMain || isMicro ? 100 : 70 };
  if (asset.ratio === '3:4') return { category: isMicro ? 'micro_3x4' : 'main_3x4', score: 50 };
  if (asset.ratio === '1:1') return { category: isMicro ? 'micro_1x1' : 'main_1x1', score: 50 };
  if (isVertical) return { category: 'vertical', score: 40 };
  return { category: 'unknown', score: 0 };
}

function scorePcDetail(value: string): number {
  let score = 0;
  if (/\/2-详情\//.test(value)) score += 1000;
  if (/\/详情\//.test(value)) score += 700;
  if (/\/images(\/|$)/i.test(value)) score += 650;
  if (/详情|detail|pc|电脑/i.test(value)) score += 400;
  if (/\/jpg\//i.test(value)) score += 120;
  if (/[0-9]{9,}[_-]\d{1,3}\.(?:jpe?g|png|gif|webp)$/i.test(value)) score += 100;
  if (/产品信息|商品信息|宝贝信息|想要的信息看这里|包装图示/.test(value)) score += 80;
  if (/主图微详情|微详情|导购切图|创意拍切图|\/(?:1-)?主图(\/|$)/.test(value)) score -= 700;
  if (/唯品|vip|京东|抖音|小红书|拼多多|得物/i.test(value)) score -= 800;
  if (/尺码|尺码表|洗涤|水洗|吊牌|合格证|品牌故事|售后/.test(value)) score -= 500;
  return score;
}

function selectPcDetailAssets(
  pool: PackagingAsset[],
  options: { limit: number; styleCode?: string; warnings: string[] }
): PackagingAsset[] {
  const optimized = pool.filter(isOptimizedPcDetailAsset);
  const selected = (optimized.length ? optimized : pool).slice(0, options.limit);
  const deduped = dedupePcDetailDuplicateSequences(selected, options.styleCode);
  if (deduped.reason) options.warnings.push(deduped.reason);
  return deduped.items;
}

function isOptimizedPcDetailAsset(asset: PackagingAsset): boolean {
  return /\/[^/]*优化[^/]*\/[^/]+-优化\/images\//.test(asset.fullpath.replace(/\\/g, '/'));
}

function dedupePcDetailDuplicateSequences(items: PackagingAsset[], styleCode?: string): { items: PackagingAsset[]; removed: number; reason: string } {
  const list = items.slice();
  if (list.length < 6) return { items: list, removed: 0, reason: '' };
  for (let blockSize = Math.floor(list.length / 2); blockSize >= 3; blockSize -= 1) {
    if (list.length % blockSize !== 0) continue;
    const repeatCount = list.length / blockSize;
    if (repeatCount < 2) continue;
    const blocks = Array.from({ length: repeatCount }, (_, index) => list.slice(index * blockSize, (index + 1) * blockSize));
    const signatures = blocks.map((block) => block.map(pcDetailSequenceToken));
    if (signatures.some((signature) => signature.some((token) => !token))) continue;
    const firstSignature = signatures[0].join(',');
    if (!firstSignature || !signatures.every((signature) => signature.join(',') === firstSignature)) continue;
    const styleBlockIndex = styleCode ? blocks.findIndex((block) => pcDetailBlockLooksStyleSpecific(block, styleCode)) : -1;
    const templateBlockIndex = blocks.findIndex(pcDetailBlockLooksGenericTemplate);
    if (styleBlockIndex < 0 || templateBlockIndex < 0 || styleBlockIndex === templateBlockIndex) continue;
    const keptBlock = blocks[styleBlockIndex];
    return {
      items: keptBlock,
      removed: list.length - blockSize,
      reason: `PC详情候选检测到 ${repeatCount} 段重复 ${blockSize} 张序列（款号图+模版图），源素材异常，已保留款号序列并剔除模版重复图`
    };
  }
  return { items: list, removed: 0, reason: '' };
}

function pcDetailSequenceToken(asset: PackagingAsset): string {
  const stem = fileStem(asset.filename);
  const match = stem.match(/(?:^|[_\-\s])(\d{1,3})(?:\D*)$/) || stem.match(/(\d{1,3})$/);
  if (!match) return '';
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 200) return '';
  return String(value).padStart(3, '0');
}

function pcDetailBlockLooksGenericTemplate(items: PackagingAsset[]): boolean {
  return /模版|模板|template|通用|标准版|固定图|公共图/i.test(items.map(assetText).join(' '));
}

function pcDetailBlockLooksStyleSpecific(items: PackagingAsset[], styleCode: string): boolean {
  const style = text(styleCode);
  return !!style && items.some((asset) => startsWithCodeToken(fileStem(asset.filename), style));
}

function startsWithCodeToken(value: string, code: string): boolean {
  const source = text(value);
  const expected = text(code);
  if (!source || !expected) return false;
  return source === expected || source.startsWith(`${expected}_`) || source.startsWith(`${expected}-`) || source.startsWith(`${expected} `);
}

function assetText(asset: PackagingAsset): string {
  return `${asset.fullpath} ${asset.filename}`;
}

function detailStatusExpression(): string {
  return `(() => {
    const compact = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
    const normalizeItemId = (value) => {
      const match = compact(value).match(/\\d{8,}/);
      return match ? match[0] : '';
    };
    const safeKeys = (value) => value && typeof value === 'object' ? Object.keys(value).filter((key) => !/token|cookie|csrf|sign|password|secret/i.test(key)).slice(0, 40) : [];
    const getSellState = () => {
      const candidates = [window.__SELL_STATE__, window.__sellState, window.sellState, window.__PUBLISH_STATE__].filter(Boolean);
      for (const item of candidates) {
        if (item && typeof item === 'object') return item;
      }
      return null;
    };
    const state = getSellState();
    const engine = state?.engine || null;
    let models = {};
    try { models = engine && typeof engine.getModels === 'function' ? engine.getModels() || {} : {}; } catch {}
    const formValues = models.formValues && typeof models.formValues === 'object' ? models.formValues : {};
    const componentCount = (name) => {
      const value = formValues[name];
      if (Array.isArray(value)) return value.length;
      if (value?.images && Array.isArray(value.images)) return value.images.length;
      if (value?.verticalImage && Array.isArray(value.verticalImage)) return value.verticalImage.length;
      return 0;
    };
    const bodyText = compact(document.body?.innerText || document.body?.textContent || '');
    return JSON.stringify({
      title: document.title,
      href: location.href,
      isPublishEditor: /sell\\.publish\\.tmall\\.com|sell\\.xiangqing\\.taobao\\.com/.test(location.href) || Boolean(engine),
      ready: Boolean(engine || Object.keys(formValues).length),
      itemId: normalizeItemId(location.href),
      formKeys: safeKeys(formValues),
      counts: {
        main1x1: componentCount('mainImagesGroup'),
        main3x4: componentCount('threeToFourImages'),
        vertical: componentCount('guideImageGroup'),
        pcModules: componentCount('modularDesc')
      },
      hasValidationText: /必填项|不能为空|请填写|存在错误/.test(bodyText),
      hasSpeedLimitText: /操作速度太快|稍等一会儿再试|访问过于频繁|请求过于频繁/.test(bodyText),
      hasCaptchaText: /验证码|安全验证|滑块验证|请完成验证/.test(bodyText)
    });
  })()`;
}

function buildPcDetailHtml(urls: string[]): string {
  const imgs = urls.map(text).filter(Boolean).map((url) => `<img src="${escapeHtmlAttribute(url)}" align="absmiddle"/>`).join('');
  return imgs ? `<p style="text-align:center;">${imgs}</p>` : '';
}

function buildWapDescDetailFromUrls(urls: string[]): string {
  const imgs = urls.map(text).filter(Boolean).map((url) => `<img size="0">${escapeXmlText(url)}</img>`).join('');
  return `<wapDesc>${imgs}</wapDesc>`;
}

function imageValue(item: Record<string, unknown>): Record<string, unknown> {
  return {
    url: item.url,
    pix: item.pix,
    width: item.width ? String(item.width) : undefined,
    height: item.height ? String(item.height) : undefined
  };
}

function filenameOf(value: string): string {
  const normalized = normalizeUrl(value).split(/[?#]/)[0].replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized || 'image.jpg';
}

function fileStem(value: string): string {
  const filename = filenameOf(value);
  const index = filename.lastIndexOf('.');
  return index > 0 ? filename.slice(0, index) : filename;
}

function extOf(value: unknown): string {
  const name = text(value);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).trim().toLowerCase() : '';
}

function parseDimension(value: string): { width: number; height: number } | null {
  const normalized = value.replace(/[×X＊*]/g, 'x');
  const match = normalized.match(/(?:^|[^\d])(\d{3,4})\s*[x_-]\s*(\d{3,4})(?=[^\d]|$)/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function ratioOf(width: number, height: number): string {
  if (width === height) return '1:1';
  if (width * 4 === height * 3) return '3:4';
  if (width * 3 === height * 2) return '2:3';
  return `${width}:${height}`;
}

function categoryLimit(category: PackagingCategory): number {
  if (category === 'micro_3x4') return 3;
  if (category === 'vertical') return 1;
  return 2;
}

function normalizeExecuteMode(value: unknown): string {
  const mode = text(value).toLowerCase();
  if (mode === 'upload_draft' || mode === 'live') return 'upload_draft';
  if (mode === 'publish_and_sync_mobile' || mode === 'full_publish' || mode === 'publish_mobile') return 'publish_and_sync_mobile';
  return 'plan';
}

function normalizeItemId(value: unknown): string {
  const match = text(value).match(/\d{8,}/);
  return match ? match[0] : '';
}

function normalizeUrl(value: string): string {
  return value.startsWith('//') ? `https:${value}` : value;
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function naturalCompare(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

function truncateFileName(fileName: string, maxLength = 100): string {
  const index = fileName.lastIndexOf('.');
  const ext = index > -1 ? fileName.slice(index) : '';
  const base = index > -1 ? fileName.slice(0, index) : fileName;
  const limit = Math.max(1, maxLength - ext.length);
  return `${base.length > limit ? base.slice(0, limit) : base}${ext}`;
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;');
}

function redactedTokenField(): Record<string, unknown> {
  return { _tb_token_: '<page token, not read by CLI>' };
}
