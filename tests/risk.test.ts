import { describe, expect, it } from 'vitest';
import { classifyEndpointRisk } from '../src/risk.js';

describe('classifyEndpointRisk', () => {
  it('marks read-like endpoints as read candidates', () => {
    expect(classifyEndpointRisk('mtop.taobao.seller.calendar.query')).toBe('read_candidate');
    expect(classifyEndpointRisk('mtop.tmall.tmallwork.todoList')).toBe('read_candidate');
  });

  it('marks mutation-like endpoints as blocked risk', () => {
    expect(classifyEndpointRisk('mtop.taobao.multi.resource.menu.common.operate')).toBe('write_or_mutation_risk');
    expect(classifyEndpointRisk('/sell/ajax/commit.do')).toBe('write_or_mutation_risk');
    expect(classifyEndpointRisk('/item/update')).toBe('write_or_mutation_risk');
  });
});
