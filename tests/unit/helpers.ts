import { readFileSync } from 'node:fs';
import type { FieldDescriptor } from '../../src/core/plan/types';
import type { Profile } from '../../src/core/profile/types';

export function sampleProfile(): Profile {
  return JSON.parse(readFileSync(new URL('../../schema/sample-profile.json', import.meta.url), 'utf8')) as Profile;
}

let n = 0;
export function fd(partial: Partial<FieldDescriptor> & { label: string }): FieldDescriptor {
  n += 1;
  return {
    key: `f${n}`,
    formIndex: 0,
    itemIndex: n,
    kind: 'text',
    required: false,
    disabled: false,
    readonly: false,
    isEmpty: true,
    visible: true,
    ...partial,
  };
}
