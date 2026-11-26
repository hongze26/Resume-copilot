// Word（.docx）经 mammoth 转出的 HTML → 按行的文字（纯函数，不依赖浏览器 DOM，单元测试可直接跑）。
// mammoth 的 extractRawText 会把表格的每个单元格拆成单独一行，表格式简历里“姓名 | 王五”的对应关系就丢了。
// 这里从 HTML 还原：只含一段文字的单元格按行拼成“姓名 | 王五 | 性别 | 男”；
// 排版用的大单元格（多段落、嵌套表格）逐段展开，免得整份简历挤成一行。

interface Node {
  tag: string;
  children: Array<Node | string>;
}

const VOID = new Set(['br', 'img', 'hr', 'col', 'input', 'meta', 'link', 'wbr']);
const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'div', 'blockquote', 'pre', 'dl', 'dt', 'dd', 'caption', 'section', 'article', 'header', 'footer', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'body', 'html']);

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (named[k] !== undefined) return named[k];
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

function parseHtml(html: string): Node {
  const root: Node = { tag: '#root', children: [] };
  const stack: Node[] = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      top.children.push(decode(m[4]));
      continue;
    }
    if (!m[2]) {
      // 注释，或孤立的“<”
      if (m[0] === '<') top.children.push('<');
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    if (tag === 'br') {
      top.children.push('\n');
      continue;
    }
    if (VOID.has(tag) || m[3]) continue;
    const node: Node = { tag, children: [] };
    top.children.push(node);
    stack.push(node);
  }
  return root;
}

const isNode = (c: Node | string): c is Node => typeof c !== 'string';
const containsBlock = (n: Node): boolean => n.children.some((c) => isNode(c) && (BLOCK.has(c.tag) || c.tag === 'table' || containsBlock(c)));
const containsTable = (n: Node): boolean => n.children.some((c) => isNode(c) && (c.tag === 'table' || containsTable(c)));
const inline = (n: Node): string => n.children.map((c) => (isNode(c) ? inline(c) : c)).join('');

/** 一个节点展开成若干行：块级元素各自成行，行内元素拼接，br 换行，表格按行拼接。 */
function linesOf(n: Node): string[] {
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    for (const l of buf.split('\n')) {
      const t = l.replace(/ /g, ' ').trim();
      if (t) out.push(t);
    }
    buf = '';
  };
  for (const c of n.children) {
    if (!isNode(c)) buf += c;
    else if (c.tag === 'table') {
      flush();
      out.push(...tableLines(c));
    } else if (BLOCK.has(c.tag) || containsBlock(c)) {
      flush();
      out.push(...linesOf(c));
    } else buf += inline(c);
  }
  flush();
  return out;
}

function rowsOf(table: Node): Node[] {
  const rows: Node[] = [];
  for (const c of table.children) {
    if (!isNode(c)) continue;
    if (c.tag === 'tr') rows.push(c);
    else if (c.tag === 'thead' || c.tag === 'tbody' || c.tag === 'tfoot') rows.push(...rowsOf(c));
  }
  return rows;
}

function tableLines(table: Node): string[] {
  const out: string[] = [];
  for (const row of rowsOf(table)) {
    let cells: string[] = [];
    const flush = () => {
      if (cells.length) out.push(cells.join(' | '));
      cells = [];
    };
    for (const cell of row.children.filter(isNode).filter((c) => c.tag === 'td' || c.tag === 'th')) {
      const ls = linesOf(cell);
      if (ls.length <= 1 && !containsTable(cell)) {
        if (ls[0]) cells.push(ls[0]);
        continue;
      }
      flush();
      out.push(...ls);
    }
    flush();
  }
  return out;
}

export function docxHtmlToText(html: string): string {
  return linesOf(parseHtml(html)).join('\n');
}
