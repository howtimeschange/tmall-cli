import { callPageGet, type PageGetSpec } from '../page-fetch.js';
import { asArray, asRecord, formatTimestamp, text, type BrowserOptions } from './common.js';

export const DMP_TARGET = 'dmp.taobao.com/index_new.html';

const dmpSpec = (
  key: string,
  path: string,
  description: string,
  origin = 'https://dmp.taobao.com',
  fallbackQuery: Record<string, string | number | boolean> = { bizCode: 'dmp' }
): PageGetSpec => ({
  adapter: 'dmp',
  key,
  path,
  description,
  origin,
  fallbackQuery,
  target: DMP_TARGET,
  requireLoadedUrl: key !== 'loginUser'
});

export const DMP_SPECS = {
  loginUser: dmpSpec('loginUser', '/api_2/login/loginuserinfo', '达摩盘登录用户/权限信息', 'https://dmp.taobao.com', { bizCode: 'dmp' }),
  credits: dmpSpec('credits', '/api_2/credits/balance-overview', '达摩盘 AI 豆/额度余额'),
  smsCount: dmpSpec('smsCount', '/api_2/sms/count', '达摩盘系统消息数量'),
  sms: dmpSpec('sms', '/api_2/sms', '达摩盘系统消息列表'),
  weeklyReport: dmpSpec('weeklyReport', '/api_2/weekly/report', '达摩盘周报列表'),
  reportNotice: dmpSpec('reportNotice', '/api_2/insight/adv/report/notice', '达摩盘投放报告通知'),
  latestDay: dmpSpec('latestDay', '/api/latestDay', '达摩盘数据最新日期', 'https://dmp.advgateway.taobao.com'),
  adcComponent: dmpSpec('adcComponent', '/api/adc/component/v2', '达摩盘当前页面 ADC 组件定义', 'https://dmp.advgateway.taobao.com'),
  powerUser: dmpSpec('powerUser', '/api_2/power/center/user', '达摩盘权限中心用户'),
  brandApply: dmpSpec('brandApply', '/api_2/metadmp/brandapply/getbyseller', '品牌申请状态'),
  databankDeeplink: dmpSpec('databankDeeplink', '/api_2/databank/deeplink', 'Databank deeplink 状态'),
  deeplinkReportTasks: dmpSpec('deeplinkReportTasks', '/api_2/deeplink/report/task/list', 'Deeplink 报告任务列表', 'https://dmp.taobao.com', { bizCode: 'dmp', reportType: 1 }),
  waterprint: dmpSpec('waterprint', '/api_2/userconfig/waterprint', '水印配置', 'https://dmp.taobao.com', { bizCode: 'dmp', mode: 'query' })
} satisfies Record<string, PageGetSpec>;

export async function readDmpUser(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.loginUser, options);
  const data = asRecord(response.data).data;
  const root = asRecord(data);
  const loginUser = asRecord(root.loginUser);
  const permissions = asRecord(root.permissions2);
  return {
    siteName: root.SITE_NAME ?? '',
    serverDate: root.SERVER_DATE ?? '',
    accountLevel: root.accountLevel ?? null,
    availableUser: root.availableUser ?? null,
    subUser: root.subUser ?? null,
    deeplinkUser: root.deeplinkUser ?? null,
    userState: root.USER_STATE ?? null,
    operType: loginUser.operType ?? null,
    shopId: loginUser.shopId ?? null,
    permissionCount: Object.keys(permissions).length,
    empowerCount: asArray(root.empowers).length,
    usedLoadedUrl: response.usedLoadedUrl,
    capturedAt: response.capturedAt
  };
}

export async function readDmpCredits(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.credits, options);
  const data = asRecord(asRecord(response.data).data);
  return {
    balance: data.balance ?? null,
    estimatedDays: data.estimatedDays ?? null,
    totalConsumption: data.totalConsumption ?? null,
    avgDailyConsumption: data.avgDailyConsumption ?? null,
    inactiveApplied: data.inactiveApplied ?? null,
    activeUser: data.activeUser ?? null,
    applyMonth: data.applyMonth ?? null,
    usedLoadedUrl: response.usedLoadedUrl,
    capturedAt: response.capturedAt
  };
}

export async function readDmpSmsCount(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.smsCount, options);
  const data = asRecord(asRecord(response.data).data);
  return {
    count: data.count ?? null,
    usedLoadedUrl: response.usedLoadedUrl,
    capturedAt: response.capturedAt
  };
}

export async function readDmpSms(options: BrowserOptions & { limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.sms, options);
  const data = asRecord(asRecord(response.data).data);
  return asArray<Record<string, unknown>>(data.list).slice(0, options.limit ?? 20).map((item) => ({
    id: item.id ?? '',
    subject: item.subject ?? '',
    readStatus: item.readStatus ?? null,
    sendType: item.sendType ?? null,
    isTop: item.isTop ?? null,
    createTime: formatTimestamp(item.createTime),
    updateTime: formatTimestamp(item.updateTime)
  }));
}

export async function readDmpWeeklyReports(options: BrowserOptions & { limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.weeklyReport, options);
  return asArray<Record<string, unknown>>(asRecord(response.data).data).slice(0, options.limit ?? 20).map((report) => ({
    id: report.id ?? '',
    title: report.reportTitle ?? '',
    type: report.reportType ?? null,
    mainCateName: report.mainCateName ?? '',
    reportDate: formatTimestamp(report.reportDate),
    beginDate: formatTimestamp(report.beginDate),
    endDate: formatTimestamp(report.endDate),
    readStatus: report.readStatus ?? null,
    introduction: report.reportPersonalizedIntroduction ?? report.reportDefaultIntroduction ?? ''
  }));
}

export async function readDmpReportNotice(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.reportNotice, options);
  const data = asRecord(asRecord(response.data).data);
  return {
    pushed: data.pushed ?? null,
    usedLoadedUrl: response.usedLoadedUrl,
    capturedAt: response.capturedAt
  };
}

export async function readDmpLatestDay(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.latestDay, options);
  return {
    latestDay: asRecord(response.data).data ?? '',
    usedLoadedUrl: response.usedLoadedUrl,
    capturedAt: response.capturedAt
  };
}

export async function readDmpAdcComponents(options: BrowserOptions & { limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.adcComponent, options);
  const list = asArray<unknown>(asRecord(asRecord(response.data).data).list);
  return list.slice(0, options.limit ?? 20).map((raw) => {
    const component = typeof raw === 'string' ? parseComponent(raw) : asRecord(raw);
    return {
      id: component.id ?? '',
      code: component.code ?? '',
      name: component.name ?? '',
      type: component.type ?? '',
      status: component.status ?? null,
      subComponentCount: asArray(component.subComponentList).length,
      metaCount: asArray(component.metaList).length,
      hasFilters: asArray(component.filters).length > 0,
      description: text(component.description)
    };
  });
}

export async function readDmpPowerUser(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.powerUser, options);
  return summarizeDmpObject(response.data, response.usedLoadedUrl, response.capturedAt);
}

export async function readDmpBrandApply(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.brandApply, options);
  return summarizeDmpObject(response.data, response.usedLoadedUrl, response.capturedAt);
}

export async function readDmpDatabankDeeplink(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.databankDeeplink, options);
  return summarizeDmpObject(response.data, response.usedLoadedUrl, response.capturedAt);
}

export async function readDmpDeeplinkReportTasks(options: BrowserOptions & { limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.deeplinkReportTasks, options);
  const data = asRecord(asRecord(response.data).data);
  const list = asArray<Record<string, unknown>>(data.list || data.result || data.tasks);
  if (!list.length) return [summarizeDmpObject(response.data, response.usedLoadedUrl, response.capturedAt)];
  return list.slice(0, options.limit ?? 20).map((task) => ({
    id: task.id ?? task.taskId ?? '',
    name: task.name ?? task.taskName ?? task.title ?? '',
    status: task.status ?? task.taskStatus ?? '',
    createTime: formatTimestamp(task.createTime ?? task.gmtCreate),
    updateTime: formatTimestamp(task.updateTime ?? task.gmtModified),
    keys: Object.keys(task).slice(0, 20).join(',')
  }));
}

export async function readDmpWaterprint(options: BrowserOptions = {}): Promise<Record<string, unknown>> {
  const response = await callPageGet<Record<string, unknown>>(DMP_SPECS.waterprint, options);
  return summarizeDmpObject(response.data, response.usedLoadedUrl, response.capturedAt);
}

function parseComponent(value: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return {};
  }
}

function summarizeDmpObject(raw: unknown, usedLoadedUrl: boolean, capturedAt: string): Record<string, unknown> {
  const data = asRecord(asRecord(raw).data);
  const list = asArray(data.list || data.result || data.items);
  return {
    dataType: Array.isArray(asRecord(raw).data) ? 'array' : typeof asRecord(raw).data,
    dataKeys: Object.keys(data).slice(0, 30).join(','),
    listCount: list.length,
    usedLoadedUrl,
    capturedAt
  };
}
