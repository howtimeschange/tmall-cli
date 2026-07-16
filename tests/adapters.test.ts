import { describe, expect, it } from 'vitest';
import { buildDetailOperationPlan, buildDetailPackagingPlan, buildDetailUploadPlan, classifyPackagingAssetInputs } from '../src/adapters/detail-editor.js';
import { buildDmpCompetePaidPlan } from '../src/adapters/dmp-compete.js';
import { buildMaterialCreatePlan, buildMaterialDataPayload, buildMaterialTaskSearchPayload } from '../src/adapters/material-test.js';
import { normalizeMemberUrls } from '../src/adapters/member.js';
import { buildMopKolImg2VideoPlan, buildMopSearchRecommendPlan } from '../src/adapters/mop.js';
import { parseReviewLinks } from '../src/adapters/reviews.js';
import { buildBalaImagePlan, buildBalaVideoWorkflowPlan, buildQnImg2VideoPlan, buildSemirVideoMaterialPlan } from '../src/adapters/video.js';

describe('converted Crawshrimp adapter commands', () => {
  it('builds material-test read payloads and blocked write plans', () => {
    expect(buildMaterialTaskSearchPayload({ itemId: 'id=1060862679580', testStatus: '测试中' })).toMatchObject({
      modelCode: 'image_test_mgr',
      currentPage: 1,
      pageSize: 20
    });
    expect(JSON.parse(String(buildMaterialTaskSearchPayload({ itemId: '1060862679580' }).params))).toMatchObject({
      tabCode: 'all',
      testChannel: 'common_search',
      itemIdOrName: '1060862679580'
    });
    expect(buildMaterialDataPayload({
      itemIds: ['1060862679580'],
      startDate: '20260701',
      endDate: '20260716'
    })).toMatchObject({
      itemIds: '["1060862679580"]',
      statisticType: 'ACCUMULATE_30_DAYS'
    });
    const plan = buildMaterialCreatePlan({
      itemId: '1060862679580',
      materialUrls: ['//img.alicdn.com/a.jpg']
    });
    expect(plan.execution).toBe('blocked');
    expect(plan.access).toBe('blocked-write');
    expect(JSON.stringify(plan)).toContain('mtop.taobao.qn.copilot.test.image.task.create');
    expect(JSON.stringify(plan)).toContain('https://img.alicdn.com/a.jpg');
  });

  it('parses review and member inputs locally', () => {
    expect(parseReviewLinks('https://detail.tmall.com/item.htm?id=1060862679580&skuId=123')).toEqual([{
      itemId: '1060862679580',
      skuId: '123',
      url: 'https://detail.tmall.com/item.htm?id=1060862679580&skuId=123'
    }]);
    expect(normalizeMemberUrls('左西旗舰店 123456789')).toEqual([{
      shopName: '左西旗舰店',
      sellerId: '123456789',
      url: 'https://market.m.taobao.com/app/sj/member-center-rax/pages/pages_index_index?wh_weex=true&source=ShopSelfUse&sellerId=123456789',
      status: 'valid',
      note: ''
    }]);
  });

  it('builds DMP paid-analysis read plans without execution', () => {
    const plan = buildDmpCompetePaidPlan({
      beginDate: '2026-07-06',
      endDate: '2026-07-08',
      peerBeginDate: '2026-07-09',
      peerEndDate: '2026-07-12'
    });
    expect(plan.every((row) => row.access === 'read')).toBe(true);
    expect(plan.some((row) => row.path === '/api/competition/analysis/base/indicator')).toBe(true);
    expect(plan.find((row) => row.path === '/api/competition/analysis/flow/indicator')?.data).toMatchObject({
      attributionScale: '2',
      attributionMode: 1
    });
  });

  it('classifies packaging assets and builds blocked detail plans', () => {
    const assets = [
      '/包/1-主图/tmall/208126156202_1440x1440_01.jpg',
      '/包/主图微详情/208126156202_1440x1920_01.jpg',
      '/包/商品竖图/208126156202_1440x2160.jpg',
      '/包/2-详情/images/208126156202_01.jpg'
    ];
    const classified = classifyPackagingAssetInputs(assets);
    expect(classified.map((row) => row.category)).toContain('main_1x1');
    expect(classified.map((row) => row.category)).toContain('micro_3x4');
    expect(classified.map((row) => row.category)).toContain('vertical');
    expect(classified.map((row) => row.category)).toContain('pc_detail');

    const plan = buildDetailPackagingPlan({
      styleCode: '208126156202',
      itemId: '1060862679580',
      assets
    });
    expect(plan.access).toBe('blocked-write');
    expect(plan.execution).toBe('blocked');
    expect(JSON.stringify(plan)).toContain('descForShenbiMobile');
    expect(JSON.stringify(plan)).toContain('submit.htm');

    expect(buildDetailUploadPlan({ fileName: '208126156202_01.jpg' }).execution).toBe('blocked');
    const operations = buildDetailOperationPlan({ itemId: '1060862679580' });
    expect(operations.every((row) => row.execution === 'blocked' || row.execution === 'not_executed_by_plan')).toBe(true);
    expect(JSON.stringify(operations)).toContain('/template/convert.htm');
    expect(JSON.stringify(operations)).toContain('/sell/ajax/save_item_template.do');
    expect(JSON.stringify(operations)).toContain('/sell/ajax/commit.do');
  });

  it('keeps style-specific PC detail sequence when template duplicates are present', () => {
    const plan = buildDetailPackagingPlan({
      styleCode: '208126156202',
      itemId: '1060862679580',
      pcDetailLimit: 6,
      assets: [
        '/包/2-详情/images/208126156202_01.jpg',
        '/包/2-详情/images/208126156202_02.jpg',
        '/包/2-详情/images/208126156202_03.jpg',
        '/包/2-详情/images/通用模板_01.jpg',
        '/包/2-详情/images/通用模板_02.jpg',
        '/包/2-详情/images/通用模板_03.jpg'
      ]
    });
    expect(JSON.stringify(plan.warnings)).toContain('PC详情候选检测到 2 段重复 3 张序列');
    expect(JSON.stringify(plan.uploadedByCategory)).toContain('208126156202_01.jpg');
    expect(JSON.stringify(plan.uploadedByCategory)).not.toContain('通用模板_01.jpg');
  });

  it('builds blocked Bala video workflow and QN img2video plans', () => {
    const materialPlan = buildSemirVideoMaterialPlan({
      itemCodes: ['208326102205'],
      cloudPath: '巴拉营运BU-商品//巴拉货控/02 产品上新模块/2-2 巴拉产品上新/'
    });
    expect(materialPlan.execution).toBe('not_executed_by_cli');

    const imagePlan = buildBalaImagePlan({
      operationType: 'background_swap',
      backgroundPrompt: '海边',
      sourceImages: ['/tmp/source.jpg']
    });
    expect(imagePlan.execution).toBe('blocked');
    expect(imagePlan.validation).toBe('ok');

    const videoPlan = buildQnImg2VideoPlan({
      itemId: '1060862679580',
      imageUrls: ['https://img.alicdn.com/a.jpg'],
      templateId: 'tpl-1'
    });
    expect(videoPlan.execution).toBe('blocked');
    expect(JSON.stringify(videoPlan)).toContain('mtop.taobao.qn.copilot.image.generate.video.submit');
    expect(JSON.stringify(videoPlan)).toContain('mtop.taobao.qn.copilot.img2video.template.video.generate');
    expect(JSON.stringify(videoPlan)).toContain('mtop.taobao.qn.copilot.quick.task.get');

    const workflow = buildBalaVideoWorkflowPlan({
      itemCodes: ['208326102205'],
      itemId: '1060862679580',
      imageUrls: ['https://img.alicdn.com/a.jpg']
    });
    expect(JSON.stringify(workflow)).toContain('review_gate');
    expect(JSON.stringify(workflow)).toContain('approved/rejected/retry/exported-to-video');
  });

  it('builds blocked MOP search-recommend and KOL img2video plans', () => {
    const publishPlan = buildMopSearchRecommendPlan({
      itemId: '1060862679580',
      title: '标题',
      description: '内容描述',
      materialUrls: [
        'https://img.alicdn.com/a.jpg',
        'https://img.alicdn.com/b.jpg',
        'https://img.alicdn.com/c.jpg'
      ]
    });
    expect(publishPlan.execution).toBe('blocked');
    expect(publishPlan.validation).toBe('ok');
    expect(JSON.stringify(publishPlan)).toContain('mtop.taobao.spongebob.item.material.publish');

    const kolPlan = buildMopKolImg2VideoPlan({
      merchantCode: '46X096070266',
      materialCount: 3
    });
    expect(kolPlan.execution).toBe('blocked');
    expect(kolPlan.validation).toBe('ok');
    expect(JSON.stringify(kolPlan)).toContain('mtop.taobao.qn.copilot.image.generate.video.submit');
    expect(JSON.stringify(kolPlan)).toContain('mtop.tmall.sell.pc.manage.async');
  });
});
