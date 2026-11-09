// 智联校园网申页的站点弹窗驱动（依据页面上弹窗的结构与交互，2026-11-09 核对）。
//
// 1. 地区弹窗 s-region：输入框只读，点击后弹出 .s-dialog__overlay（挂在 body 末尾）。
//    第一列 .s-cascader__first-level：“热门”、各省简称（湖南、广西、内蒙古…）、港澳台、国外；直辖市只在“热门”里。
//    第二列 .s-cascader__second-level：城市简称（长沙、北京…），有 .s-cascader__option-icon 的还有下一级。
//    第三列 .s-cascader__third-level：区县按钮 .s-checkbutton__item。
//    单选：点到最末一级（或允许选市时点市）即确认并关闭；多选（期望城市）：逐个点选后点底部“确定”。
// 2. 语言证书弹窗 s-language-certification：同一套 s-dialog + s-cascader，第一列考试，第三列级别 .s-cascader__select-option。
// 3. 技能弹窗（Element el-dialog .v-skill）：左列大类 → 中列小类 → 右列技能。没有下一级的分类点一下就会被选中，所以只点有箭头的分类。
import { regionKey } from '../../core/normalize/region';
import { matchCertLeaves } from '../../core/normalize/cert';
import { coreLabel, norm } from '../../core/normalize/text';
import type { FillValue } from '../../core/plan/types';
import { focusEl, isVisible, safeClick, settle, sleep, text, waitFor } from '../dom';
import { fail, inputOf, OK, type DriverResult } from './common';

// ---------------- 识别 ----------------

function fieldContent(el: Element): Element | null {
  return el.closest('.el-form-item__content') ?? el.parentElement;
}

/** 这个控件旁边挂着智联地区弹窗。 */
export function hasSRegion(el: Element): boolean {
  return !!fieldContent(el)?.querySelector('.s-region');
}

/** 这个控件点开是站点弹窗（语言证书、技能），用 popup-pick 填写。 */
export function isSitePopupHost(el: Element): boolean {
  return !!el.closest('.apply-form-language') || !!fieldContent(el)?.querySelector('.v-skill, .el-dialog__wrapper');
}

// ---------------- 弹窗 ----------------

const visibleOverlay = (doc: Document): Element | null =>
  Array.from(doc.querySelectorAll('.s-dialog__overlay')).find((o) => isVisible(o) && (o as HTMLElement).style.display !== 'none' && !!o.querySelector('.s-cascader')) ?? null;

const visibleSkillDialog = (doc: Document): Element | null =>
  Array.from(doc.querySelectorAll('.el-dialog.v-skill')).find((d) => isVisible(d)) ?? null;

async function openDialog(el: Element, find: (doc: Document) => Element | null): Promise<Element | null> {
  const doc = el.ownerDocument;
  const input = inputOf(el) as HTMLInputElement | null;
  const target = input ?? el;
  if (input?.disabled) return null;
  if (input) focusEl(input);
  let d = await waitFor(() => find(doc), 600, '弹窗打开').catch(() => null);
  if (!d) {
    safeClick(target);
    d = await waitFor(() => find(doc), 2500, '弹窗打开').catch(() => null);
  }
  if (d) await sleep(200);
  return d;
}

async function closeSDialog(dlg: Element): Promise<void> {
  const x = dlg.querySelector('.s-dialog__icon, .s-dialog__close');
  if (x) safeClick(x);
  await settle(200);
}

async function closeElDialog(dlg: Element): Promise<void> {
  const x = dlg.querySelector('.el-dialog__headerbtn');
  if (x) safeClick(x);
  await settle(250);
}

const optionText = (o: Element) => (o.querySelector('[title]')?.getAttribute('title') || text(o)).trim();
const levelOptions = (dlg: Element, level: 'first' | 'second' | 'third'): Element[] =>
  Array.from(dlg.querySelectorAll(`.s-cascader__${level}-level li`)).filter(isVisible);
const hasChildren = (o: Element) => !!o.querySelector('.s-cascader__option-icon, .v-skill__container-left-item--icon, [class*="youcejiantou"]');

// ---------------- 地区 ----------------

const HMT: Record<string, string> = { 香港: '港澳台', 澳门: '港澳台', 台湾: '港澳台' };
const sameKey = (a: string, b: string) => !!a && !!b && (regionKey(a) === regionKey(b) || norm(a) === norm(b));

async function clickWait(o: Element, ms = 250): Promise<void> {
  safeClick(o);
  await sleep(ms);
}

/** 在打开的地区弹窗里点选一个地区。返回 'done'（已选中）或失败原因。 */
async function pickRegion(dlg: Element, path: string[]): Promise<'done' | string> {
  const province = path[0];
  const municipality = ['北京', '上海', '天津', '重庆'].includes(regionKey(province));
  const pk = regionKey(province);
  const firstWanted = HMT[pk] ?? pk;
  // 城市：直辖市就是它自己；港澳台下一级是香港/澳门/台湾
  const city = municipality || HMT[pk] ? province : path[1];
  const district = municipality || HMT[pk] ? path[1] : path[2];

  let first = levelOptions(dlg, 'first').find((o) => sameKey(optionText(o), firstWanted));
  if (!first && municipality) first = levelOptions(dlg, 'first').find((o) => optionText(o) === '热门');
  if (!first) return `第一列没有“${firstWanted}”`;
  await clickWait(first);
  if (!city) return '档案只到省，页面要求选到城市';
  const second = await waitFor(() => levelOptions(dlg, 'second').find((o) => sameKey(optionText(o), city)) ?? null, 1500, '城市列表').catch(() => null);
  if (!second) return `“${firstWanted}”下没有“${regionKey(city)}”`;
  await clickWait(second, 350);
  // 点市即选中（允许选到市，或城市没有下一级）：单选弹窗已关闭
  if (!dlg.isConnected || !isVisible(dlg)) return 'done';
  if (!hasChildren(second)) return 'done';
  const leaves = await waitFor(() => {
    const l = levelOptions(dlg, 'third');
    return l.length ? l : null;
  }, 1500, '区县列表').catch(() => null);
  if (!leaves) return 'done';
  if (!district) return `页面要求选到区县（档案只到${regionKey(city)}），请在页面上补选`;
  const leaf = leaves.find((o) => sameKey(text(o), district));
  if (!leaf) return `“${regionKey(city)}”下没有“${district}”`;
  await clickWait(leaf, 350);
  return 'done';
}

function regionShown(el: Element): string {
  return (inputOf(el) as HTMLInputElement | null)?.value?.trim() ?? '';
}

export async function fillSRegion(el: Element, value: Extract<FillValue, { t: 'cascade' | 'cascade-multi' }>): Promise<DriverResult> {
  const paths = value.t === 'cascade' ? [value.path] : value.paths;
  const dlg = await openDialog(el, visibleOverlay);
  if (!dlg) return fail('timeout', '点了这一栏，但城市选择框没有弹出来');
  const multi = value.t === 'cascade-multi';
  // 多选上限：底部“已选: 0 / 3”
  const max = Number(text(dlg.querySelector('.s-cascader__footer-label')).match(/\/\s*(\d+)/)?.[1] ?? paths.length);
  const errors: string[] = [];
  for (const p of paths.slice(0, multi ? max : 1)) {
    const r = await pickRegion(dlg, p);
    if (r !== 'done') errors.push(r);
    if (!multi) break;
  }
  if (multi && visibleOverlay(el.ownerDocument) === dlg) {
    const ok = Array.from(dlg.querySelectorAll('.s-cascader__footer-button, .s-dialog__footer button')).find((b) => /确\s*定/.test(text(b)) && !(b as HTMLButtonElement).disabled);
    if (ok) safeClick(ok);
    await settle(300);
  }
  if (visibleOverlay(el.ownerDocument) === dlg) await closeSDialog(dlg);
  if (errors.length) return fail('no-option', errors.join('；'));
  const shown = regionShown(el);
  const wantCities = paths.map((p) => regionKey(['北京', '上海', '天津', '重庆'].includes(regionKey(p[0])) ? p[0] : p[1] ?? p[0]));
  if (!shown) return fail('verify-failed', '选了，但这一栏还是空的');
  return wantCities.every((c) => norm(shown).includes(c)) ? OK : fail('verify-failed', `页面显示“${shown}”`);
}

// ---------------- 按名称在弹窗树里查找（语言证书、技能） ----------------

interface Tree {
  levels: Array<() => Element[]>;
  leaves: () => Element[];
  close: () => Promise<void>;
  isOpen: () => boolean;
}

function sCascaderTree(dlg: Element): Tree {
  return {
    levels: [() => levelOptions(dlg, 'first'), () => levelOptions(dlg, 'second')],
    leaves: () => levelOptions(dlg, 'third'),
    close: () => closeSDialog(dlg),
    isOpen: () => dlg.isConnected && isVisible(dlg),
  };
}

function skillTree(dlg: Element): Tree {
  const all = (sel: string) => Array.from(dlg.querySelectorAll(sel)).filter(isVisible);
  return {
    levels: [() => all('.v-skill__container-left-item'), () => all('.v-skill__container-main-item')],
    leaves: () => all('.v-skill__container-right-item'),
    close: () => closeElDialog(dlg),
    isOpen: () => dlg.isConnected && isVisible(dlg),
  };
}

const nameOf = (o: Element) => text(o.querySelector('[title], [class*="--name"]') ?? o);

/** 深度优先：只展开有下一级的分类，在最后一级里找名称完全一致的项。 */
/** 名称一致：规整后相等，或去掉括号说明后相等（“大学英语六级(CET6)”与“大学英语六级”）。 */
function nameMatcher(names: string[]): (s: string) => boolean {
  const wanted = new Set(names.flatMap((n) => [norm(n), coreLabel(n)]).filter(Boolean));
  return (s: string) => wanted.has(norm(s)) || wanted.has(coreLabel(s));
}

/** 在弹窗树里找一项并点选，返回点中的名称。 */
async function searchTree(tree: Tree, isWanted: (s: string) => boolean, seen: string[]): Promise<string | undefined> {
  let picked: string | undefined;
  const check = async (): Promise<boolean> => {
    const leaves = tree.leaves();
    seen.push(...leaves.map(text));
    // 多个都对得上时取名称最短的（“SQL”与“SQL Server”）
    const hit = leaves.filter((l) => isWanted(text(l))).sort((a, b) => text(a).length - text(b).length)[0];
    if (hit) {
      picked = text(hit);
      await clickWait(hit, 400);
      return true;
    }
    return false;
  };
  const walk = async (depth: number): Promise<boolean> => {
    const opts = tree.levels[depth]?.() ?? [];
    for (let i = 0; i < opts.length; i++) {
      const o = (tree.levels[depth]() ?? [])[i];
      if (!o || !tree.isOpen()) return false;
      // 分类本身名称一致且没有下一级：选它
      if (!hasChildren(o)) {
        if (isWanted(nameOf(o))) {
          picked = nameOf(o);
          await clickWait(o, 400);
          return true;
        }
        continue;
      }
      await clickWait(o, 250);
      if (depth + 1 < tree.levels.length && (tree.levels[depth + 1]() ?? []).length) {
        if (await walk(depth + 1)) return true;
      } else if (await check()) return true;
    }
    return false;
  };
  if ((await check()) || (await walk(0))) return picked;
  return undefined;
}

export async function fillSitePopup(el: Element, value: Extract<FillValue, { t: 'popup-pick' }>): Promise<DriverResult> {
  const dlg = await openDialog(el, (d) => visibleOverlay(d) ?? visibleSkillDialog(d));
  if (!dlg) return fail('timeout', '点了这一栏，但选择弹窗没有弹出来');
  const tree = dlg.classList.contains('v-skill') ? skillTree(dlg) : sCascaderTree(dlg);
  const seen: string[] = [];
  // 先找名称一致的（证书按全称、括号里的缩写都算）；找不到再找名称包含的（真实技能字典写“MS Excel”，档案写“Excel”）
  const exact = nameMatcher(value.names);
  const isExact = (s: string) => exact(s) || matchCertLeaves([{ category: '', name: s }], value.names).exact.length > 0;
  let found = await searchTree(tree, isExact, seen);
  let loose = false;
  if (!found && tree.isOpen()) {
    found = await searchTree(tree, looseMatcher(value.names), seen);
    loose = !!found;
  }
  await settle(250);
  if (tree.isOpen()) await tree.close();
  if (!found) {
    const want = value.names.map(norm);
    const near = [...new Set(seen)].filter((s) => want.some((w) => norm(s).includes(w) || w.includes(norm(s)))).slice(0, 8);
    return fail('no-option', `弹窗里没有名称为“${value.names[0]}”的项`, near);
  }
  const shown = (inputOf(el) as HTMLInputElement | null)?.value?.trim() ?? '';
  if (!shown) return fail('verify-failed', '选了，但这一栏还是空的');
  return loose ? { ok: true, detail: `网页上没有和档案一模一样的“${value.names[0]}”，选了最接近的“${found}”，请核对` } : OK;
}

/** 名称包含：网页项包含档案名（至少 2 个字），或档案名包含网页项（至少 3 个字）。 */
function looseMatcher(names: string[]): (s: string) => boolean {
  const wanted = names.map(norm).filter((w) => w.length >= 2);
  return (s: string) => {
    const n = norm(s);
    return wanted.some((w) => n.includes(w) || (n.length >= 3 && w.includes(n)));
  };
}
