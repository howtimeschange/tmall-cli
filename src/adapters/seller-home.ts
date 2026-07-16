import { callMtop, type MtopSpec } from '../mtop.js';
import { asArray, asRecord, firstNumber, firstText, formatTimestamp, num, parseJsonObject, resultOf, text, type BrowserOptions } from './common.js';

export const SELLER_HOME_TARGET = 'myseller.taobao.com/home.htm/QnworkbenchHome';

const homeSpec = (key: string, api: string, description: string, data: Record<string, unknown> = {}): MtopSpec => ({
  adapter: 'seller-home',
  key,
  api,
  version: '1.0',
  data,
  target: SELLER_HOME_TARGET,
  description
});

export const SELLER_HOME_SPECS = {
  todo: homeSpec('todo', 'mtop.tmall.tmallwork.todoList', '天猫商家中心首页待办分组', { bizParams: '{}' }),
  sellerInfoCards: homeSpec('sellerInfoCards', 'mtop.tmall.tmallwork.sellerInfoCards', '首页卖家信息卡/DSR/资质状态', { bizParams: '{}' }),
  warnInfo: homeSpec('warnInfo', 'mtop.tmall.tmallwork.getWarnInfo', '首页经营预警信息', { bizParams: '{}' }),
  calendar: homeSpec('calendar', 'mtop.taobao.seller.calendar.query', '商家日历事件'),
  activities: homeSpec('activities', 'mtop.taobao.porsche.queryFrontActivityList', '首页可报名/活动列表'),
  diagnose: homeSpec('diagnose', 'mtop.taobao.sell.psc.diagnose.qianniu.home.overview', '首页商品/流量诊断概览'),
  shopInfo: homeSpec('shopInfo', 'mtop.taobao.jdy.resource.shop.info.get', '店铺基础信息'),
  noticeAll: homeSpec('noticeAll', 'mtop.taobao.ow.resource.notice.all', '首页公告资源'),
  sopTasks: homeSpec('sopTasks', 'mtop.taobao.qianniu.sop.task.list.get.V3', '千牛 SOP 任务列表', { entrance: 'qn_home' }),
  sellerCard: homeSpec('sellerCard', 'mtop.alibaba.tos.seller.manager.seller.tmallwork.sellercard.get', '新版卖家卡片信息'),
  financeHome: homeSpec('financeHome', 'mtop.taobao.finance.commission.account.qn.home.page', '财务/补贴首页提醒'),
  numbersExt: homeSpec('numbersExt', 'mtop.taobao.qianniu.number.get.ext', '千牛扩展数字角标'),
  numbersNew: homeSpec('numbersNew', 'mtop.taobao.qianniu.number.get.new', '千牛新版数字角标', { fields: '{}' }),
  riskNode: homeSpec('riskNode', 'mtop.taobao.multi.risk.component.node.get', '风险组件节点'),
  riskStatus: homeSpec('riskStatus', 'mtop.taobao.multi.risk.component.status.get', '风险组件状态', { source: 'qn', refer: 'menu' }),
  adList: homeSpec('adList', 'mtop.taobao.multi.advertisement.list', '首页广告资源列表', { params: JSON.stringify([{ types: '20' }]) }),
  adGet: homeSpec('adGet', 'mtop.taobao.multi.advertisement.get', '首页广告资源详情', { types: '1045', channelId: '2' }),
  generalPop: homeSpec('generalPop', 'mtop.taobao.multi.general.pop.query', '首页通用弹窗资源', { scene: 'qnHome', bizCodes: ['discountCompete'] }),
  shopTag: homeSpec('shopTag', 'mtop.taobao.jdy.shop.tag.query', '店铺标签'),
  shopCell: homeSpec('shopCell', 'mtop.taobao.jdy.shop.common.cell.query', '店铺扩展单元格', { extModule: JSON.stringify(['userTag']) }),
  blueStar: homeSpec('blueStar', 'mtop.alibaba.tos.seller.manager.join.bluestar.info', '蓝星服务状态'),
  serviceHall: homeSpec('serviceHall', 'mtop.com.taobao.servicehall.isUserInLineOneForQN', '服务大厅在线状态')
} satisfies Record<string, MtopSpec>;

export async function readHomeTodo(options: BrowserOptions & { details?: boolean } = {}): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.todo, options);
  const groups = asArray<Record<string, unknown>>(asRecord(response.data).result);
  if (!options.details) {
    return groups.map((group) => ({
      todoId: group.todoId ?? null,
      tag: text(group.todoTag),
      count: num(group.todoCount) ?? 0,
      detailCount: asArray(group.todoListDetail).length
    }));
  }
  return groups.flatMap((group) => {
    const details = asArray<Record<string, unknown>>(group.todoListDetail);
    if (!details.length) {
      return [{
        group: text(group.todoTag),
        groupCount: num(group.todoCount) ?? 0,
        todoId: group.todoId ?? null,
        title: '',
        count: null,
        action: '',
        status: '',
        keys: ''
      }];
    }
    return details.map((detail) => ({
      group: text(group.todoTag),
      groupCount: num(group.todoCount) ?? 0,
      todoId: group.todoId ?? null,
      title: firstText(detail, ['title', 'name', 'todoName', 'todoTitle', 'desc', 'description', 'content']),
      count: firstNumber(detail, ['count', 'num', 'todoCount', 'amount', 'quantity']),
      action: firstText(detail, ['action', 'actionName', 'buttonName', 'btnText', 'buttonText']),
      status: firstText(detail, ['status', 'statusDesc', 'type', 'todoType']),
      keys: Object.keys(detail).slice(0, 16).join(',')
    }));
  });
}

export async function readSellerInfoCards(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.sellerInfoCards, options);
  const data = asRecord(response.data);
  const dsr = asRecord(data.dsrMap);
  return {
    level: data.level ?? null,
    sellerType: data.sellerType ?? null,
    sellerEmpower: data.sellerEmpower ?? null,
    hasQualification: data.hasQualification ?? null,
    qualificationCount: data.qualificationCount ?? null,
    ensureMoneyStatus: data.ensureMoneyStatus ?? null,
    needMoneyFlag: data.needMoneyFlag ?? null,
    dailyExamOpenStatus: data.dailyExamOpenStatus ?? null,
    dailyExamResultCode: data.dailyExamResultCode ?? null,
    averageMerchandisScoreSixmonth: dsr.averageMerchandisScoreSixmonth ?? null,
    merchandisGapString: dsr.merchandisGapString ?? null,
    averageServiceScoreSixmonth: dsr.averageServiceScoreSixmonth ?? null,
    serviceGapString: dsr.serviceGapString ?? null,
    averageLogisticsScoreSixmonth: dsr.averageLogisticsScoreSixmonth ?? null,
    logisticsGapString: dsr.logisticsGapString ?? null,
    msgCount: asArray(data.msgList).length,
    capturedAt: response.capturedAt
  };
}

export async function readSellerCard(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.sellerCard, options);
  const data = asRecord(response.data);
  const daily = asRecord(data.dailyExamInfoVO);
  const nps = asRecord(data.npsInfo);
  const quali = asRecord(data.qualiWarnInfo);
  const online = asRecord(data.shopOnlineInfo);
  return {
    warnLevel: daily.warnLevel ?? null,
    popup: daily.popup ?? null,
    dailyMsgCount: asArray(daily.msgList).length,
    npsValue: nps.npsValue ?? null,
    npsValueDesc: nps.npsValueDesc ?? '',
    npsValueStatus: nps.npsValueStatus ?? null,
    npsSuccess: nps.success ?? null,
    hasWarnQuali: quali.hasWarnQuali ?? null,
    warnQualiCount: quali.warnQualiCount ?? null,
    onlineFlag: online.onlineFlag ?? null,
    capturedAt: response.capturedAt
  };
}

export async function readWarnInfo(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.warnInfo, options);
  const data = asRecord(response.data);
  return {
    level: data.level ?? null,
    month: data.month ?? '',
    warnMonth: data.warnMonth ?? '',
    examSpanStart: data.examSpanStart ?? '',
    examSpanEnd: data.examSpanEnd ?? '',
    enforceShow: data.enforceShow ?? null,
    msgCount: asArray(data.msgList).length,
    warnId: data.warnId ?? null,
    capturedAt: response.capturedAt
  };
}

export async function readCalendar(options: BrowserOptions & { start: string; end: string }): Promise<Record<string, unknown>[]> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.calendar, {
    ...options,
    data: { dateStart: compactDate(options.start), dateEnd: compactDate(options.end) }
  });
  const data = asRecord(response.data);
  const eventMap = asRecord(data.eventMap);
  const rows = Object.entries(eventMap).flatMap(([eventId, raw]) => {
    const event = asRecord(raw);
    return [{
      eventId,
      title: firstText(event, ['title', 'name', 'eventName', 'summary']),
      type: firstText(event, ['type', 'eventType', 'category']),
      startTime: event.startTime ?? event.startDate ?? '',
      endTime: event.endTime ?? event.endDate ?? '',
      status: firstText(event, ['status', 'statusDesc']),
      keys: Object.keys(event).slice(0, 16).join(',')
    }];
  });
  if (rows.length) return rows;
  return [{
    eventId: '',
    title: '',
    type: '',
    startTime: options.start,
    endTime: options.end,
    status: 'no_events',
    keys: ''
  }];
}

export async function readActivities(options: BrowserOptions & { listType?: number; pageSize?: number } = {}): Promise<Record<string, unknown>[]> {
  const listType = options.listType ?? 2;
  const pageSizeCode = options.pageSize ? String(options.pageSize) : 'qnHomeActivityPageSize';
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.activities, {
    ...options,
    data: {
      code: 'frontActivityList',
      param: JSON.stringify({ listType, pageSizeCode }),
      bizParams: '{}'
    }
  });
  const value = asRecord(asRecord(response.data).value);
  return asArray<Record<string, unknown>>(value.list).map((activity) => ({
    frontActivityId: activity.frontActivityId ?? null,
    name: activity.frontActivityName ?? '',
    typeName: activity.frontActivityTypeName ?? '',
    statusCode: activity.statusCode ?? null,
    statusDesc: activity.statusDesc ?? '',
    onlineTime: activity.onlineTime ?? '',
    applicable: activity.applicable ?? null,
    favorite: activity.favorite ?? null,
    supportWirelessApply: activity.supportWirelessApply ?? null,
    hasSignUrl: Boolean(activity.signUrl),
    buttonCount: asArray(activity.buttonList).length
  }));
}

export async function readDiagnoseOverview(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.diagnose, options);
  const parsed = parseJsonObject(asRecord(response.data).result);
  const model = asRecord(parsed.model);
  return {
    flowAccCount: model.flowAccCount ?? null,
    flowLimitedCount: model.flowLimitedCount ?? null,
    itemDiagnoseCount: model.itemDiagnoseCount ?? null,
    abnormalItemCount: model.abnormalItemCount ?? null,
    errors: asArray(parsed.errors).length,
    extInfoKeys: Object.keys(asRecord(parsed.extInfo)).join(','),
    capturedAt: response.capturedAt
  };
}

export async function readShopInfo(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.shopInfo, options);
  const result = asRecord(resultOf(response.data));
  return {
    shopName: result.shopName ?? '',
    displayShopStatus: result.displayShopStatus ?? '',
    postName: result.postName ?? '',
    postNames: asArray(result.postNames).join(','),
    mainCategory: result.mainCategory ?? '',
    level: result.level ?? null,
    layer: result.layer ?? '',
    saleOff: result.saleOff ?? null,
    isMainAccount: result.isMainAccount ?? null,
    hitVipSeller: result.hitVipSeller ?? null,
    shopDomainUrl: result.shopDomainUrl ?? '',
    mas: result.mas ?? null,
    sas: result.sas ?? null,
    cas: result.cas ?? null,
    lastStarts: formatTimestamp(result.lastStarts)
  };
}

export async function readNoticeAll(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.noticeAll, options);
  const result = asRecord(resultOf(response.data));
  return {
    resultKeys: Object.keys(result).join(','),
    itemCount: asArray(result.list).length || asArray(result.items).length,
    capturedAt: response.capturedAt
  };
}

export async function readSopTasks(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.sopTasks, options);
  const model = asRecord(asRecord(response.data).model);
  return {
    modelKeys: Object.keys(model).join(','),
    taskCount: asArray(model.list).length || asArray(model.tasks).length,
    capturedAt: response.capturedAt
  };
}

export async function readFinanceHome(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.financeHome, options);
  const data = asRecord(response.data);
  return {
    text: data.text ?? '',
    url: data.url ?? '',
    ignore: data.ignore ?? null,
    isSignUp: data.isSignUp ?? null,
    capturedAt: response.capturedAt
  };
}

export async function readHomeNumbers(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const [ext, newer] = await Promise.all([
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.numbersExt, options),
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.numbersNew, options)
  ]);
  return [
    summarizeResult('ext', ext.data, ext.capturedAt),
    summarizeResult('new', newer.data, newer.capturedAt)
  ];
}

export async function readRiskComponents(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const [node, status] = await Promise.all([
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.riskNode, options),
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.riskStatus, options)
  ]);
  return [
    summarizeResult('node', node.data, node.capturedAt),
    summarizeResult('status', status.data, status.capturedAt)
  ];
}

export async function readHomeAdvertisements(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const [list, detail] = await Promise.all([
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.adList, options),
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.adGet, options)
  ]);
  return [
    summarizeResult('list', list.data, list.capturedAt),
    summarizeResult('detail', detail.data, detail.capturedAt)
  ];
}

export async function readHomePopups(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.generalPop, options);
  return summarizeResult('generalPop', response.data, response.capturedAt);
}

export async function readShopTags(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const [tag, cell] = await Promise.all([
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.shopTag, options),
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.shopCell, options)
  ]);
  return [
    summarizeResult('tag', tag.data, tag.capturedAt),
    summarizeResult('cell', cell.data, cell.capturedAt)
  ];
}

export async function readServiceStatus(options: BrowserOptions = {}): Promise<Record<string, unknown>[]> {
  const [blueStar, serviceHall] = await Promise.all([
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.blueStar, options),
    callMtop<Record<string, unknown>>(SELLER_HOME_SPECS.serviceHall, options)
  ]);
  return [
    summarizeResult('blueStar', blueStar.data, blueStar.capturedAt),
    summarizeResult('serviceHall', serviceHall.data, serviceHall.capturedAt)
  ];
}

function summarizeResult(source: string, raw: unknown, capturedAt: string): Record<string, unknown> {
  const result = resultOf(raw);
  const record = asRecord(result);
  const array = asArray(result);
  return {
    source,
    resultType: Array.isArray(result) ? 'array' : result === null ? 'null' : typeof result,
    resultCount: Array.isArray(result) ? array.length : 0,
    resultKeys: Object.keys(record).slice(0, 30).join(','),
    capturedAt
  };
}

function compactDate(value: string): string {
  return value.replace(/-/g, '');
}
