import { norm } from './text';
import type { Region } from '../profile/types';

const SUFFIXES = [
  '维吾尔自治区', '壮族自治区', '回族自治区', '特别行政区', '自治区', '自治州', '地区', '盟',
  '省', '市', '区', '县',
];

/** 去后缀后的地名，用于相等判断：“湖南省”→“湖南”，“北京市”→“北京”，“海淀区”→“海淀”。 */
export function regionKey(s: string | undefined): string {
  let n = norm(s);
  if (!n) return '';
  for (const suf of SUFFIXES) {
    if (n.length > suf.length + 1 && n.endsWith(suf)) {
      n = n.slice(0, -suf.length);
      break;
    }
  }
  return n;
}

export function sameRegionName(a: string, b: string): boolean {
  const ka = regionKey(a);
  return ka.length > 0 && ka === regionKey(b);
}

const MUNICIPALITIES = ['北京', '上海', '天津', '重庆'];

export function isMunicipality(province: string): boolean {
  return MUNICIPALITIES.includes(regionKey(province));
}

/** 级联选择的目标路径（省 → 市 → 区）。直辖市的“市”层与省同名时只保留一次，由驱动按需兼容两层/三层。 */
export function regionPath(r: Region): string[] {
  const out = [r.province];
  if (r.city && !(isMunicipality(r.province) && sameRegionName(r.city, r.province))) out.push(r.city);
  if (r.district) out.push(r.district);
  return out;
}

export function displayRegion(r: Region | undefined): string {
  if (!r) return '';
  return [r.province, r.city && !sameRegionName(r.city, r.province) ? r.city : undefined, r.district].filter(Boolean).join(' / ');
}
