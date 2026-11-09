import { describe, expect, it } from 'vitest';
import { mergeCustomDefs, sanitizeCustomDefs, type CustomAdapterDef } from '../../src/adapters/custom';
import { migrateToCurrent } from '../../src/core/profile/migrate';
import { validateProfile } from '../../src/core/profile/validate';
import { BACKUP_EXTRA_KEY, packBackup, unpackBackup } from '../../src/pages/shared/backup';
import { DEFAULT_SETTINGS } from '../../src/pages/shared/storage';
import { sampleProfile } from './helpers';

const def = (id: string, name = '某企业招聘'): CustomAdapterDef => ({
  id,
  name,
  hosts: ['jobs.example.com'],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
  sections: [{ key: 't:个人信息', title: '个人信息', collection: 'single' }],
  fields: [{ section: 't:个人信息', label: '姓名', path: 'basic.name' }],
});

describe('备份文件', () => {
  it('备份包含档案、定制适配器和设置；拆开后档案部分仍通过校验', () => {
    const file = JSON.parse(JSON.stringify(packBackup(sampleProfile(), [def('custom-a')], { ...DEFAULT_SETTINGS, followPage: false })));
    expect(file.basic.name).toBe(sampleProfile().basic.name);
    expect(file[BACKUP_EXTRA_KEY].customAdapters).toHaveLength(1);
    const { profile, extras } = unpackBackup(file);
    expect(BACKUP_EXTRA_KEY in (profile as object)).toBe(false);
    expect(validateProfile(migrateToCurrent(profile).profile)).toEqual([]);
    expect(extras.customAdapters[0]).toEqual(def('custom-a'));
    expect(extras.settings.followPage).toBe(false);
  });

  it('旧备份（只有档案）照常导入，没有附加内容', () => {
    const { profile, extras } = unpackBackup(JSON.parse(JSON.stringify(sampleProfile())));
    expect(validateProfile(migrateToCurrent(profile).profile)).toEqual([]);
    expect(extras).toEqual({ customAdapters: [], settings: {} });
  });

  it('结构不完整或多余的内容被丢弃', () => {
    const bad = [
      null,
      { id: 'not-custom', name: 'x', hosts: [], sections: [], fields: [] },
      { id: 'custom-b', name: '', hosts: [], sections: [], fields: [] },
      { ...def('custom-c'), sections: [{ key: 's', title: '标题', collection: 'unknown' }] },
      { ...def('custom-d'), extra: 'x', fields: [{ section: 't:个人信息', label: '姓名', path: 'basic.name', evil: 1 }, { section: '不存在', label: 'x' }, { section: 't:个人信息', label: 5 }] },
      def('custom-d'),
    ];
    const out = sanitizeCustomDefs(bad);
    expect(out.map((d) => d.id)).toEqual(['custom-d']);
    expect(out[0]).toEqual(def('custom-d'));
    const { extras } = unpackBackup({ ...sampleProfile(), [BACKUP_EXTRA_KEY]: { customAdapters: 'x', settings: { followPage: 'yes', unknown: true } } });
    expect(extras).toEqual({ customAdapters: [], settings: {} });
  });

  it('导入时同 id 的适配器被备份里的替换，其余保留', () => {
    const merged = mergeCustomDefs([def('custom-a', '旧'), def('custom-b')], [def('custom-a', '新')]);
    expect(merged.map((d) => `${d.id}:${d.name}`).sort()).toEqual(['custom-a:新', 'custom-b:某企业招聘']);
  });
});
