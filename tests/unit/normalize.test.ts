import { describe, expect, it } from 'vitest';
import { displayDate, extractDate, formatDate, parseDate, precisionFit } from '../../src/core/normalize/date';
import { aliasesFor, ETHNIC_GROUPS, yearsAliases } from '../../src/core/normalize/dicts';
import { matchOptions, matchPathSuffix } from '../../src/core/normalize/options';
import { regionKey, regionPath, sameRegionName } from '../../src/core/normalize/region';
import { coreLabel, norm } from '../../src/core/normalize/text';

describe('文本规整', () => {
  it('全角、括号、空白、大小写', () => {
    expect(norm(' 本科（普通教育） / 法学 ')).toBe('本科(普通教育)/法学');
    expect(norm('ＣＥＴ－４')).toBe('cet-4');
    expect(norm('*学历：')).toBe('学历');
  });
  it('核心标签去掉括号说明', () => {
    expect(coreLabel('学校名称（此处仅填写完整学校名称，方便用人单位搜索）')).toBe('学校名称');
    expect(coreLabel('是否涉及该段学历（非本硕连读等情况请勾选有）')).toBe('是否涉及该段学历');
  });
});

describe('学历与政治面貌别名', () => {
  it('学历别名', () => {
    expect(aliasesFor('educationLevel', 'master')).toContain('硕士研究生');
    expect(aliasesFor('educationLevel', 'junior-college')).toContain('大专');
    expect(aliasesFor('educationLevel', 'master')).not.toContain('研究生');
  });
  it('政治面貌：团员', () => {
    const m = matchOptions(aliasesFor('politicalStatus', 'cyl-member'), ['中共党员', '中共预备党员', '共青团员', '群众']);
    expect(m).toEqual({ status: 'exact', option: '共青团员', via: '共青团员' });
  });
  it('“研究生”歧义：选项只有“研究生”时只能是包含关系（中置信）', () => {
    const m = matchOptions(aliasesFor('educationLevel', 'master'), ['博士', '研究生', '本科']);
    expect(m.status).toBe('contains');
    if (m.status === 'contains') expect(m.candidates).toEqual(['研究生']);
  });
  it('“博士研究生”属于博士，不能作为硕士的包含候选', () => {
    const others = Object.entries({ doctor: aliasesFor('educationLevel', 'doctor') }).flatMap(([, v]) => v);
    const m = matchOptions(aliasesFor('educationLevel', 'master'), ['博士研究生', '本科'], { excludeAliases: others });
    expect(m.status).toBe('none');
  });
});

describe('民族', () => {
  it('56 个民族，接受去“族”写法', () => {
    expect(ETHNIC_GROUPS).toHaveLength(56);
    expect(matchOptions(aliasesFor('ethnicity', '汉族'), ['汉', '满', '回'])).toMatchObject({ status: 'exact', option: '汉' });
    expect(matchOptions(aliasesFor('ethnicity', '汉族'), ['汉族', '满族'])).toMatchObject({ status: 'exact', option: '汉族' });
  });
});

describe('日期解析', () => {
  it.each([
    ['2024-09', { y: 2024, m: 9 }],
    ['2024年9月', { y: 2024, m: 9 }],
    ['2024/09/01', { y: 2024, m: 9, d: 1 }],
    ['2024.9', { y: 2024, m: 9 }],
    ['2024.09.15', { y: 2024, m: 9, d: 15 }],
    ['2024年09月15日', { y: 2024, m: 9, d: 15 }],
    ['2024', { y: 2024 }],
  ])('%s', (input, expected) => {
    expect(parseDate(input)).toEqual(expected);
  });
  it('至今 / present / 2099-12-31', () => {
    expect(parseDate('至今')).toBe('present');
    expect(parseDate('present')).toBe('present');
    expect(parseDate('2099-12-31')).toBe('present');
  });
  it('非法日期', () => {
    expect(parseDate('2024-13')).toBeNull();
    expect(parseDate('2023-02-29')).toBeNull();
    expect(parseDate('明年')).toBeNull();
  });
  it('不为凑精度补 01 日', () => {
    expect(formatDate({ y: 2024, m: 9 })).toBe('2024-09');
    expect(displayDate({ y: 2024, m: 9 })).toBe('2024年9月');
  });
  it('精度匹配：档案到月、页面到日 → 需补充', () => {
    expect(precisionFit({ y: 2024, m: 9 }, 'day')).toBe('needs-detail');
    expect(precisionFit({ y: 2024, m: 9, d: 1 }, 'month')).toBe('ok');
    expect(precisionFit({ y: 2024, m: 9 }, 'month')).toBe('ok');
  });
  it('从页面显示文字提取', () => {
    expect(extractDate('2024-09')).toEqual({ y: 2024, m: 9 });
    expect(extractDate('2024年09月')).toEqual({ y: 2024, m: 9 });
  });
});

describe('地区', () => {
  it('去后缀', () => {
    expect(regionKey('湖南省')).toBe('湖南');
    expect(regionKey('北京市')).toBe('北京');
    expect(regionKey('广西壮族自治区')).toBe('广西');
    expect(regionKey('香港特别行政区')).toBe('香港');
    expect(sameRegionName('海淀区', '海淀')).toBe(true);
  });
  it('直辖市路径只保留一次“北京”', () => {
    expect(regionPath({ province: '北京市', city: '北京市', district: '海淀区' })).toEqual(['北京市', '海淀区']);
    expect(regionPath({ province: '湖南省', city: '长沙市' })).toEqual(['湖南省', '长沙市']);
  });
});

describe('数值区间与学制', () => {
  it('学制 4 → “4年”', () => {
    expect(matchOptions(yearsAliases(4), ['0.5年', '1年', '3.5年', '4年', '4.5年'])).toMatchObject({ status: 'exact', option: '4年' });
  });
  it('学制 0.5 不会误配 “0.5年” 以外的项', () => {
    expect(matchOptions(yearsAliases(0.5), ['0.5年', '1年', '1.5年'])).toMatchObject({ status: 'exact', option: '0.5年' });
  });
});

describe('专业分类路径', () => {
  it('后缀唯一匹配', () => {
    const opts = ['本科（普通教育）/ 管理学 / 工商管理类', '本科（普通教育）/ 法学 / 法学类'];
    expect(matchPathSuffix(['管理学', '工商管理类'], opts)).toMatchObject({ status: 'exact', option: opts[0] });
  });
  it('多个前缀 → multiple', () => {
    const opts = ['本科（普通教育）/ 管理学 / 工商管理类', '本科（职业教育）/ 管理学 / 工商管理类'];
    expect(matchPathSuffix(['管理学', '工商管理类'], opts).status).toBe('multiple');
  });
});
