import { describe, expect, it } from 'vitest';
import { emptyProfile, newRecordId } from '../../src/core/profile/empty';
import { maskBySensitivity, maskIdNumber, maskMobile, maskName, scrubText } from '../../src/core/profile/mask';
import { migrateToCurrent, MigrationError } from '../../src/core/profile/migrate';
import { validateProfile } from '../../src/core/profile/validate';
import { sampleProfile } from './helpers';

describe('Schema 校验', () => {
  it('示例档案通过', () => {
    expect(validateProfile(sampleProfile())).toEqual([]);
  });
  it('空档案（新建）通过', () => {
    const p = emptyProfile();
    p.basic.name = '测试';
    expect(validateProfile(p)).toEqual([]);
  });
  it('缺必填字段被拒绝', () => {
    const p = sampleProfile() as unknown as Record<string, unknown>;
    delete p.basic;
    const issues = validateProfile(p);
    expect(issues.some((i) => i.path === '/basic' && i.message === '缺少必填项')).toBe(true);
  });
  it('类型错误被拒绝', () => {
    const p = sampleProfile();
    (p.education[0] as unknown as Record<string, unknown>).durationYears = '四年';
    expect(validateProfile(p).length).toBeGreaterThan(0);
  });
  it('日期格式（不补 01 日）', () => {
    const p = sampleProfile();
    p.education[0].start = '2021-9';
    expect(validateProfile(p).some((i) => i.path.includes('/education/0/start'))).toBe(true);
  });
  it('邮箱格式与记录 ID 重复', () => {
    const p = sampleProfile();
    p.contact.email = 'not-an-email';
    p.work![0].id = p.education[0].id;
    const issues = validateProfile(p);
    expect(issues.some((i) => i.path === '/contact/email')).toBe(true);
    expect(issues.some((i) => i.message.includes('重复'))).toBe(true);
  });
  it('未定义字段被拒绝', () => {
    const p = sampleProfile() as unknown as Record<string, unknown>;
    p.unknownField = 1;
    expect(validateProfile(p).some((i) => i.message.includes('unknownField'))).toBe(true);
  });
});

describe('版本迁移', () => {
  it('伪 v0 档案迁移到 v1 并通过校验', () => {
    const v0 = {
      basic: { name: '旧版本' },
      contact: {},
      education: [{ id: 'edu-old-1', level: 'bachelor', schoolName: '示例大学', start: '2020-09' }],
    };
    const { profile, from, steps } = migrateToCurrent(v0);
    expect(from).toBe(0);
    expect(steps).toBe(1);
    expect(profile.education[0].school).toBe('示例大学');
    expect(profile.meta.reviewedAt).toBeNull();
    expect(validateProfile(profile)).toEqual([]);
  });
  it('当前版本不变', () => {
    const { steps } = migrateToCurrent(sampleProfile());
    expect(steps).toBe(0);
  });
  it('更新的版本给出明确错误', () => {
    expect(() => migrateToCurrent({ schemaVersion: 99 })).toThrow(MigrationError);
  });
  it('非对象', () => {
    expect(() => migrateToCurrent([1, 2])).toThrow(MigrationError);
  });
});

describe('脱敏', () => {
  it('证件号保留前 3 后 2', () => {
    expect(maskIdNumber('110101199001011234')).toBe('110*************34');
  });
  it('手机号保留前 3 后 4', () => {
    expect(maskMobile('13900001234')).toBe('139****1234');
  });
  it('姓名保留首字', () => {
    expect(maskName('林示例')).toBe('林**');
  });
  it('自由文本脱敏', () => {
    const s = scrubText('证件 110101199001011234 手机 13900001234 邮箱 a.b@example.com 编号 1234567');
    expect(s).not.toMatch(/110101199001011234|13900001234|a\.b@example\.com|1234567/);
  });
  it('高敏感默认只显示圆点', () => {
    expect(maskBySensitivity('共青团员', 'high')).toBe('••••');
  });
  it('记录 ID 符合 Schema 规则', () => {
    expect(newRecordId('edu')).toMatch(/^[a-z0-9-]{4,40}$/);
  });
});
