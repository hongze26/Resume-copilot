// 区块标题识别、区块类别判断、通用页面规则组装。
import { describe, expect, it } from 'vitest';
import { composeRules, recordKeysFor } from '../../src/adapters/dynamic';
import { genericRules } from '../../src/adapters/generic/rules';
import { guessSection, isResumeSectionTitle, sectionCore } from '../../src/core/matcher/sections';
import { guessCollection } from '../../src/core/matcher/semantic';

describe('区块标题', () => {
  it('去掉尾部括号说明、星号与冒号', () => {
    expect(sectionCore('基本信息(必填)')).toBe('基本信息');
    expect(sectionCore('联系方式(笔试、面试等信息会通过以下联系方式进行通知，请仔细填写并核对)')).toBe('联系方式');
    expect(sectionCore('* 教育背景：')).toBe('教育背景');
    expect(sectionCore('职(执)业资格(必填)')).toBe('职(执)业资格');
  });

  it('识别招聘网站常见叫法（含山东高速招聘平台的子页面名）', () => {
    for (const t of ['基本信息(必填)', '教育背景', '家庭情况(必填)', '工作履历', '职(执)业资格(必填)', '奖励情况', '附件上传(必填)', '联系方式(笔试、面试等信息会通过以下联系方式进行通知，请仔细填写并核对)', '工作技能', '其他']) {
      expect(isResumeSectionTitle(t), t).toBe(true);
    }
    for (const t of ['个人中心', '我的应聘', '修改密码', '姓名', '请选择']) expect(isResumeSectionTitle(t), t).toBe(false);
  });

  it('按完整叫法判断类别：工作技能不是工作经历，家庭成员需本人填写', () => {
    expect(guessSection('教育背景(必填)').collection).toBe('education');
    expect(guessSection('工作履历').collection).toBe('work');
    expect(guessSection('实习经历').collection).toBe('work');
    expect(guessSection('工作技能').collection).toBe('single');
    expect(guessSection('其他').collection).toBe('single');
    expect(guessSection('职(执)业资格').collection).toBe('certificates');
    expect(guessSection('奖励情况').collection).toBe('honors');
    expect(guessSection('外语能力').collection).toBe('languages');
    expect(guessSection('家庭情况(必填)').collection).toBe('manual');
    expect(guessSection('附件上传').collection).toBe('manual');
    // 计划层的作用域：manual 区块按单项处理（由适配器的 manual 模式拦住，不会填写）
    expect(guessCollection('家庭情况')).toBe('single');
  });
});

describe('通用页面规则组装', () => {
  it('按区块标题决定模式与类别，允许填写', () => {
    const rules = composeRules(genericRules, [
      { key: 'page:基本信息', title: '基本信息' },
      { key: 't:联系方式', title: '联系方式' },
      { key: 't:教育背景', title: '教育背景' },
      { key: 't:家庭情况', title: '家庭情况' },
    ]);
    expect(rules.allowExecute).toBe(true);
    expect(rules.id).toBe('generic');
    expect(rules.sections.map((s) => [s.key, s.mode, s.collection ?? null])).toEqual([
      ['page:基本信息', 'single', 'single'],
      ['t:联系方式', 'single', 'single'],
      ['t:教育背景', 'repeat', 'education'],
      ['t:家庭情况', 'manual', null],
    ]);
    expect(rules.sections[3].manualNote).toContain('本人');
  });

  it('记录比对关键字：教育按学校、工作按单位', () => {
    expect(recordKeysFor('education', { school: '示例大学' })).toEqual(['示例大学']);
    expect(recordKeysFor('work', { company: '示例公司' })).toEqual(['示例公司']);
    expect(recordKeysFor('work', {})).toEqual([]);
  });
});
