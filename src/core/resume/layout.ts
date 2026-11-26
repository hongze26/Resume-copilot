// PDF 文字项 → 阅读顺序的文本行。处理常见的“左侧个人信息栏 + 右侧经历栏”两栏简历：
// 先找一条几乎没有文字跨过的竖向空白带（栏间距），左右两栏分别从上到下排，再拼接。
import { isSectionHeading } from './parse';

export interface PdfItem {
  str: string;
  x: number; // 左下角 x
  y: number; // 基线 y（越大越靠上）
  w: number; // 宽度
  h?: number; // 字号（不知道时按 10 估）
}

const ROW_TOLERANCE = 3;

/** 同一行两段文字之间的空隙超过约一个字宽时，按“分栏”处理（两个空格），解析器据此切分表格和“日期  学校  专业”。 */
function gapText(prev: PdfItem | undefined, part: PdfItem): string {
  if (!prev || /\s$/.test(prev.str) || /^\s/.test(part.str)) return '';
  const gap = part.x - (prev.x + prev.w);
  if (gap <= 1) return '';
  const size = part.h || prev.h || 10;
  return gap >= Math.max(5, size * 0.9) ? '  ' : ' ';
}

function toRows(items: PdfItem[]): string[] {
  const rows: Array<{ y: number; parts: PdfItem[] }> = [];
  for (const it of items) {
    let row = rows.find((r) => Math.abs(r.y - it.y) < ROW_TOLERANCE);
    if (!row) {
      row = { y: it.y, parts: [] };
      rows.push(row);
    }
    row.parts.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const parts = r.parts.sort((a, b) => a.x - b.x);
    // PDF 字体切换会把同一个词拆成多个项；只在版面上确有空隙时补空格。
    return parts.map((part, i) => `${gapText(parts[i - 1], part)}${part.str}`).join('');
  });
}

/**
 * 找栏间距：在页面宽度 20%–75% 范围内，找被文字跨过次数最少、且左右两侧都有足够文字的竖线位置。
 * 返回 x；不是两栏时返回 undefined。
 */
export function findGutter(items: PdfItem[], pageWidth: number): number | undefined {
  const textItems = items.filter((i) => i.str.trim() && i.w > 0);
  if (textItems.length < 12 || pageWidth <= 0) return undefined;
  const step = 2;
  let best: { x: number; cross: number } | undefined;
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.75; x += step) {
    const cross = textItems.filter((i) => i.x < x && i.x + i.w > x).length;
    const left = textItems.filter((i) => i.x + i.w <= x).length;
    const right = textItems.filter((i) => i.x >= x).length;
    // 两侧都要有相当数量的文字，避免把页边空白当成栏间距
    if (left < textItems.length * 0.15 || right < textItems.length * 0.15) continue;
    if (!best || cross < best.cross) best = { x, cross };
  }
  if (!best) return undefined;
  // 允许极少数通栏行（顶部姓名、页眉）跨过栏间距
  if (best.cross > Math.max(2, textItems.length * 0.04)) return undefined;
  // 两侧文字在竖直方向上要有成段重叠，才是并排的两栏（而不是上下两段缩进不同的文字）。
  // 两栏行高通常不同，基线很少对齐，所以比较的是 y 范围而不是逐行对齐。
  const leftYs = textItems.filter((i) => i.x + i.w <= best!.x).map((i) => i.y);
  const rightYs = textItems.filter((i) => i.x >= best!.x).map((i) => i.y);
  const [rMin, rMax] = [Math.min(...rightYs), Math.max(...rightYs)];
  const [lMin, lMax] = [Math.min(...leftYs), Math.max(...leftYs)];
  const leftInRight = leftYs.filter((y) => y >= rMin && y <= rMax).length;
  const rightInLeft = rightYs.filter((y) => y >= lMin && y <= lMax).length;
  if (leftInRight < 3 || rightInLeft < 3) return undefined;
  // 表格式简历：左右两半逐行对齐在同一基线上（“姓名 王五 | 性别 男”），是一张表而不是两栏。
  // 真正的两栏简历两边各有区块标题；只有一边有标题时，按两栏拆开会把另一半内容接到错误的区块下。
  const leftRows = [...new Set(leftYs.map((y) => Math.round(y)))];
  const aligned = leftRows.filter((y) => rightYs.some((ry) => Math.abs(ry - y) < 1.5)).length;
  if (leftRows.length >= 3 && aligned / leftRows.length >= 0.4) {
    const left = textItems.filter((i) => i.x + i.w <= best!.x);
    const right = textItems.filter((i) => i.x >= best!.x);
    if (!(toRows(left).some(isSectionHeading) && toRows(right).some(isSectionHeading))) return undefined;
  }
  return best.x;
}

/** 一页的文字项 → 阅读顺序的文本（两栏时先左后右）。 */
export function pageText(items: PdfItem[], pageWidth: number): string {
  const clean = items.filter((i) => i.str.trim());
  const gutter = findGutter(clean, pageWidth);
  if (gutter === undefined) return toRows(clean).join('\n');
  // 跨过栏间距的通栏文字（顶部姓名、页眉等，只允许极少数）放在最前，然后先左栏、再右栏
  const spanning = clean.filter((i) => i.x < gutter && i.x + i.w > gutter);
  const left = clean.filter((i) => i.x + i.w <= gutter);
  const right = clean.filter((i) => i.x >= gutter);
  return [...toRows(spanning), ...toRows(left), ...toRows(right)].join('\n');
}
