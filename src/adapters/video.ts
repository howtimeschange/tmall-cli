import { callMtop, type MtopSpec } from '../mtop.js';
import { asArray, asRecord, normalizeTextList as normalizeList, parseJsonObject, resultOf, text, type BrowserOptions } from './common.js';
import { QUICK_VIDEO_TARGET } from './quick-video.js';

const DEFAULT_VIDEO_CATEGORY = '童装/婴儿装/亲子装';

const videoSpec = (key: string, api: string, description: string, data: Record<string, unknown> = {}): MtopSpec => ({
  adapter: 'video',
  key,
  api,
  version: '1.0',
  method: 'POST',
  data,
  target: QUICK_VIDEO_TARGET,
  description
});

export const VIDEO_SPECS = {
  sellerCategory: videoSpec('sellerCategory', 'mtop.taobao.qn.copilot.node.aigc.seller.category.get', '生意管家店铺主营类目'),
  templates: videoSpec('templates', 'mtop.taobao.qn.copilot.video.template.list', '生意管家图生视频模板目录')
} satisfies Record<string, MtopSpec>;

export interface QnImg2VideoPlanOptions {
  itemId?: string;
  imageUrls?: string[];
  imageCount?: number;
  ratio?: string;
  prompt?: string;
  mainCategory?: string;
  templateId?: string;
  templateType?: string;
  provider?: string;
  groupMode?: string;
}

export interface BalaImagePlanOptions {
  operationType?: string;
  sourceImages?: string[];
  materialRoot?: string;
  modelGroups?: string[];
  modelRefIds?: string[];
  backgroundPrompt?: string;
  garmentImages?: string[];
  outfitReferenceImages?: string[];
  variantReferenceImages?: string[];
  posePrompt?: string;
  promptExtra?: string;
  generationMode?: string;
  reviewMode?: string;
}

export interface SemirVideoMaterialPlanOptions {
  itemCodes?: string[];
  cloudPath?: string;
  folderScanDepth?: number;
  duplicateMode?: string;
  packageName?: string;
}

export async function readVideoTemplateCatalog(options: BrowserOptions & { mainCategory?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const category = text(options.mainCategory) || await readDefaultCategory(options) || DEFAULT_VIDEO_CATEGORY;
  const response = await callMtop<Record<string, unknown>>(VIDEO_SPECS.templates, {
    ...options,
    data: { mainCategory: category }
  });
  const rows = asArray<Record<string, unknown>>(resultOf(response.data));
  return rows.slice(0, positiveInt(options.limit, 200, 1000)).map((template, index) => {
    const slot = slotSummary(template.inputImages);
    return {
      index: index + 1,
      mainCategory: category,
      templateId: text(template.templateId ?? template.id),
      name: text(template.name),
      type: text(template.type),
      ratio: text(template.ratio),
      duration: template.duration ?? '',
      requiredSlots: slot.requiredCount,
      optionalSlots: slot.optionalCount,
      slotText: slot.slotText,
      category: categoryLabel(template.category),
      description: text(template.description),
      provider: text(template.provider),
      coverUrl: safeMediaUrl(template.coverUrl),
      videoPreviewUrl: safeMediaUrl(template.videoUrl),
      capturedAt: response.capturedAt
    };
  });
}

export function buildSemirVideoMaterialPlan(options: SemirVideoMaterialPlanOptions = {}): Record<string, unknown> {
  const itemCodes = normalizeList(options.itemCodes);
  return {
    access: 'read',
    execution: 'not_executed_by_cli',
    note: '森马云盘素材准备会读取云盘并下载本地素材；天猫 CLI 只沉淀计划，不连接云盘下载。',
    sourceAdapter: 'bala-ai-video-assistant/semir-video-material-prepare.js',
    itemCodes,
    cloudPath: text(options.cloudPath) || '巴拉营运BU-商品//巴拉货控/02 产品上新模块/2-2 巴拉产品上新/',
    folderScanDepth: positiveInt(options.folderScanDepth, 2, 8),
    duplicateMode: normalizeDuplicateMode(options.duplicateMode),
    packageName: text(options.packageName) || '巴拉AI视频素材_<timestamp>',
    outputFolders: ['01_模拍原图', '02_商品细节图', '03_平拍/主图候选'],
    rows: itemCodes.map((code, index) => ({
      index: index + 1,
      itemCode: code,
      searchStrategy: '按款号搜索最新已选/已写素材文件夹',
      plannedAction: 'download-local-only'
    }))
  };
}

export function buildBalaImagePlan(options: BalaImagePlanOptions = {}): Record<string, unknown> {
  const operationType = normalizeOperationType(options.operationType);
  const sourceImages = normalizeList(options.sourceImages);
  const modelGroups = normalizeList(options.modelGroups);
  const modelRefIds = normalizeList(options.modelRefIds);
  const validation = balaImageValidation(operationType, options, modelGroups, modelRefIds);
  return {
    access: 'blocked-write',
    execution: 'blocked',
    note: 'AI 生图会创建外部生成任务并可能消耗额度；CLI 只生成任务规划，且保留审核后才能进入视频生成的边界。',
    sourceAdapter: 'bala-ai-video-assistant/bala-ai-face-background-generate.js',
    operationType,
    operationLabel: operationLabel(operationType),
    generationMode: normalizeGenerationMode(options.generationMode),
    reviewMode: normalizeReviewMode(options.reviewMode),
    sourceImageCount: sourceImages.length,
    materialRoot: text(options.materialRoot),
    modelGroups,
    modelRefIds,
    backgroundPrompt: text(options.backgroundPrompt),
    garmentImages: normalizeList(options.garmentImages),
    outfitReferenceImages: normalizeList(options.outfitReferenceImages),
    variantReferenceImages: normalizeList(options.variantReferenceImages),
    posePrompt: text(options.posePrompt),
    promptExtra: text(options.promptExtra),
    validation: validation || 'ok',
    nextGate: 'approved review rows only -> video qn-img2video-plan',
    blockedRequests: [
      {
        key: 'createAiImageJobs',
        system: 'crawshrimp AI image backend / 1XM',
        execution: 'blocked',
        reason: '创建外部 AI 生图任务'
      },
      {
        key: 'createReviewBatch',
        system: 'crawshrimp review workbench',
        execution: 'blocked',
        reason: '创建审核池/审批看板'
      }
    ]
  };
}

export function buildBalaVideoWorkflowPlan(options: SemirVideoMaterialPlanOptions & BalaImagePlanOptions & QnImg2VideoPlanOptions = {}): Record<string, unknown> {
  return {
    access: 'blocked-write',
    execution: 'blocked',
    note: '巴拉 AI 视频链路必须保留“AI 图审核通过后再进入图生视频”的人工边界。',
    sourceAdapter: 'bala-ai-video-assistant',
    stages: [
      {
        key: 'semir_video_material_prepare',
        command: 'video semir-material-plan',
        execution: 'not_executed_by_cli',
        output: '本地素材包和素材准备结果表'
      },
      {
        key: 'bala_ai_face_background_generate',
        command: 'video bala-image-plan',
        execution: 'blocked',
        output: 'AI 生图任务行和审核批次'
      },
      {
        key: 'review_gate',
        execution: 'required_manual_gate',
        output: 'approved/rejected/retry/exported-to-video'
      },
      {
        key: 'qn_img2video_batch',
        command: 'video qn-img2video-plan',
        execution: 'blocked',
        output: '千牛图生视频任务计划'
      }
    ],
    materialPlan: buildSemirVideoMaterialPlan(options),
    imagePlan: buildBalaImagePlan(options),
    videoPlan: buildQnImg2VideoPlan(options)
  };
}

export function buildQnImg2VideoPlan(options: QnImg2VideoPlanOptions = {}): Record<string, unknown> {
  const imageUrls = normalizeList(options.imageUrls);
  const imageCount = imageUrls.length || positiveInt(options.imageCount, 1, 200);
  const materials = buildMaterialPlaceholders(imageUrls, imageCount);
  const ratio = normalizeRatio(options.ratio);
  const itemId = normalizeItemId(options.itemId);
  const templateId = text(options.templateId);
  const provider = text(options.provider) || 'content';
  const templateType = normalizeTemplateType(options.templateType);
  const prompt = text(options.prompt);
  return {
    access: 'blocked-write',
    execution: 'blocked',
    note: '千牛/生意管家图生视频会上传图片并创建视频生成任务；CLI 只输出真实请求形状，不上传、不提交、不轮询生成。',
    sourceAdapters: ['bala-ai-video-assistant/qn-img2video-batch.js', 'mop-ops-assistant/kol-material-img2video-batch.js'],
    target: QUICK_VIDEO_TARGET,
    itemId,
    mainCategory: text(options.mainCategory) || DEFAULT_VIDEO_CATEGORY,
    ratio,
    groupMode: normalizeGroupMode(options.groupMode),
    materialCount: materials.length,
    prerequisites: [
      readRequest('sellerCategory', 'mtop.taobao.qn.copilot.node.aigc.seller.category.get', {}),
      readRequest('templates', 'mtop.taobao.qn.copilot.video.template.list', { mainCategory: text(options.mainCategory) || DEFAULT_VIDEO_CATEGORY }),
      readRequest('itemMaterial', 'mtop.taobao.qn.copilot.item.material.get', { itemId: itemId || '<itemId>' }),
      readRequest('taskPoll', 'mtop.taobao.qn.copilot.quick.task.get', { id: '<taskId>' })
    ],
    uploadPlan: {
      access: 'blocked-write',
      execution: 'blocked',
      helper: 'window.$startFileUpload(dataUrl)',
      skippedForRemoteUrls: imageUrls.length,
      reason: '本地图片上传会写入千牛素材空间'
    },
    generationRequests: generationRequests({
      itemId,
      materials,
      ratio,
      prompt,
      templateId,
      templateType,
      provider
    }),
    resultReadback: [
      readRequest('quickTaskGet', 'mtop.taobao.qn.copilot.quick.task.get', { id: '<taskId>' }),
      readRequest('offlineResultPull', 'mtop.taobao.qn.copilot.quick.item.customized.offline.result.pull', { sceneCode: 'img2video_one_click', forcePull: false })
    ]
  };
}

function generationRequests(options: {
  itemId: string;
  materials: Array<Record<string, unknown>>;
  ratio: string;
  prompt: string;
  templateId: string;
  templateType: string;
  provider: string;
}): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [{
    key: 'directImg2Video',
    access: 'blocked-write',
    execution: 'blocked',
    api: 'mtop.taobao.qn.copilot.image.generate.video.submit',
    method: 'POST',
    data: {
      clips: JSON.stringify(options.materials.map((item) => ({
        modelUrl: item.url,
        prompt: options.prompt,
        ...(options.itemId ? { itemId: options.itemId } : {})
      }))),
      qualityMode: 'highQuality',
      ratio: options.ratio,
      selectFirstLastFrame: 'false',
      itemVO: JSON.stringify(options.itemId ? { itemId: options.itemId } : {}),
      funcType: 'model_img2video'
    }
  }];
  if (options.templateId && ['auto', 'action'].includes(options.templateType)) {
    requests.push({
      key: 'actionTemplateVideo',
      access: 'blocked-write',
      execution: 'blocked',
      api: 'mtop.taobao.qn.copilot.img2video.template.video.generate',
      method: 'POST',
      data: {
        templateId: options.templateId,
        templateVO: '<template json from video template-catalog>',
        imageUrl: text(options.materials[0]?.url) || '<uploaded image url>',
        prompt: options.prompt || '<template.description>',
        provider: options.provider
      }
    });
  }
  if (options.templateId && ['auto', 'slot'].includes(options.templateType)) {
    requests.push({
      key: 'slotTemplateVideo',
      access: 'blocked-write',
      execution: 'blocked',
      api: 'mtop.taobao.qn.copilot.video.template.generate',
      method: 'POST',
      data: {
        templateId: options.templateId,
        templateVO: '<template json from video template-catalog>',
        modelVO: '',
        provider: options.provider,
        modelImages: JSON.stringify({ front: text(options.materials[0]?.url) || '<uploaded image url>', back: '', left: '', right: '' }),
        inputImages: JSON.stringify(options.materials.map((item, index) => ({ code: String(index), imageUrl: item.url })))
      }
    });
  }
  return requests;
}

function readRequest(key: string, api: string, data: Record<string, unknown>): Record<string, unknown> {
  return { key, access: 'read', execution: 'not_executed_by_plan', api, method: 'POST', data };
}

async function readDefaultCategory(options: BrowserOptions): Promise<string> {
  try {
    const response = await callMtop<Record<string, unknown>>(VIDEO_SPECS.sellerCategory, options);
    const result = asRecord(resultOf(response.data));
    return text(result.mainCateName);
  } catch {
    return '';
  }
}

function slotSummary(value: unknown): Record<string, unknown> {
  const slots = safeJsonArray(value);
  const required: string[] = [];
  const optional: string[] = [];
  slots.forEach((slot, index) => {
    const record = asRecord(slot);
    const code = text(record.code ?? record.slotCode ?? index);
    const name = text(record.slotName ?? record.name) || '未命名槽位';
    const description = text(record.description);
    const row = `${code}:${name}${description ? `(${description})` : ''}`;
    if (record.require === false || record.required === false) optional.push(row);
    else required.push(row);
  });
  return {
    requiredCount: required.length,
    optionalCount: optional.length,
    slotText: [...required, ...optional].join('\n')
  };
}

function categoryLabel(value: unknown): string {
  const data = parseJsonObject(value);
  return ['tagCategory', 'bizCategory', 'storeCategory']
    .flatMap((key) => {
      const node = asRecord(data[key]);
      const children = asArray<Record<string, unknown>>(node.children).map((item) => text(item.name)).filter(Boolean);
      return [text(node.name), ...children.slice(0, 3)].filter(Boolean);
    })
    .join('/');
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

function safeMediaUrl(value: unknown): string {
  return text(value).split(/[?#]/)[0];
}

function buildMaterialPlaceholders(urls: string[], count: number): Array<Record<string, unknown>> {
  if (urls.length) return urls.map((url, index) => ({ ref: `remote:${index + 1}`, url, source: 'remote-url' }));
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    ref: `local:${index + 1}`,
    url: `<uploaded image url ${index + 1}>`,
    source: 'local-upload-placeholder'
  }));
}

function normalizeItemId(value: unknown): string {
  const raw = text(value);
  const match = raw.match(/\d{8,}/);
  return match ? match[0] : (raw.startsWith('<') ? raw : '');
}

function normalizeRatio(value: unknown): string {
  const raw = text(value);
  return ['1:1', '3:4', '9:16', '16:9'].includes(raw) ? raw : '3:4';
}

function normalizeTemplateType(value: unknown): string {
  const raw = text(value).toLowerCase();
  return ['action', 'slot', 'auto'].includes(raw) ? raw : 'auto';
}

function normalizeGroupMode(value: unknown): string {
  const raw = text(value).toLowerCase();
  return ['all_images_one_video', 'all', 'one_video', 'multi_image_one_video'].includes(raw) ? 'all_images_one_video' : 'one_image_per_video';
}

function normalizeDuplicateMode(value: unknown): string {
  return text(value) === 'all' ? 'all' : 'first_per_hash';
}

function normalizeOperationType(value: unknown): string {
  const raw = text(value).toLowerCase();
  if (['background_swap', 'background', '换背景', 'ai换背景'].includes(raw)) return 'background_swap';
  if (['outfit_swap', 'outfit', '换装', 'ai换装'].includes(raw)) return 'outfit_swap';
  if (['pose_swap', 'pose', '换姿势', 'ai换姿势'].includes(raw)) return 'pose_swap';
  return 'face_swap';
}

function operationLabel(operationType: string): string {
  if (operationType === 'background_swap') return 'AI换背景';
  if (operationType === 'outfit_swap') return 'AI换装';
  if (operationType === 'pose_swap') return 'AI换姿势';
  return 'AI换脸';
}

function normalizeGenerationMode(value: unknown): string {
  return text(value) === 'create_only' ? 'create_only' : 'submit_async';
}

function normalizeReviewMode(value: unknown): string {
  return text(value) === 'none' ? 'none' : 'create_review_batch';
}

function balaImageValidation(optionsType: string, options: BalaImagePlanOptions, modelGroups: string[], modelRefIds: string[]): string {
  if (optionsType === 'face_swap' && !modelGroups.length && !modelRefIds.length) return '缺少模特素材';
  if (optionsType === 'background_swap' && !text(options.backgroundPrompt)) return '缺少背景Prompt';
  if (optionsType === 'outfit_swap' && !normalizeList(options.garmentImages).length) return '缺少服装图';
  if (optionsType === 'pose_swap' && !text(options.posePrompt)) return '缺少姿势Prompt';
  return '';
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
