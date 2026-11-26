// 简历文件本地提取文本：PDF 用 PDF.js，DOCX 用 mammoth。文件只在内存中处理，不保存原件、不联网。
import { docxHtmlToText } from '../../core/resume/docx-html';
import { pageText } from '../../core/resume/layout';

export interface ParsedText {
  text: string;
  pages?: number;
  warning?: string;
}

export async function extractText(file: File): Promise<ParsedText> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdf(buf);
  if (name.endsWith('.docx')) return extractDocx(buf);
  if (name.endsWith('.doc')) throw new Error('不支持旧版 .doc 格式，请在 Word 中“另存为 .docx”后再导入');
  throw new Error('只支持 PDF 和 DOCX 文件');
}

async function extractPdf(buf: ArrayBuffer): Promise<ParsedText> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    type Item = { str: string; transform: number[]; width?: number; height?: number };
    const items = (content.items as unknown[]).filter((i): i is Item => typeof (i as Item).str === 'string');
    // 按坐标重排为阅读顺序：先按 y（从上到下），同一行按 x；两栏简历先左栏后右栏
    const width = page.getViewport({ scale: 1 }).width;
    pageTexts.push(pageText(items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: Math.abs(it.transform[3]) || it.height || undefined })), width));
  }
  const text = pageTexts.join('\n\n').replace(/[ \t]+\n/g, '\n');
  const numPages = doc.numPages;
  await task.destroy();
  return {
    text,
    pages: numPages,
    warning: text.trim().length < 20 ? '没有提取到文字：这可能是扫描版（图片）PDF。当前版本不做 OCR，请手动录入。' : undefined,
  };
}

async function extractDocx(buf: ArrayBuffer): Promise<ParsedText> {
  const mod = (await import('mammoth')) as unknown as { default?: Mammoth } & Mammoth;
  const mammoth: Mammoth = typeof (mod as Partial<Mammoth>).extractRawText === 'function' ? mod : (mod.default as Mammoth);
  // 先转 HTML 保住表格结构（表格式简历“姓名 | 王五”同一行）；图片不转（证件照没用，也免得占内存）
  try {
    const html = await mammoth.convertToHtml({ arrayBuffer: buf }, { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) });
    const text = docxHtmlToText(html.value);
    if (text.trim().length >= 20) return { text };
  } catch {
    // 转 HTML 失败时退回纯文字提取
  }
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  const text = r.value.replace(/\n{3,}/g, '\n\n');
  return { text, warning: text.trim().length < 20 ? '没有提取到文字：这份 Word 里可能只有图片。当前版本不做 OCR，请手动录入，或截图后用“截图 / 补充内容识别”。' : undefined };
}

interface Mammoth {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: { convertImage?: unknown }): Promise<{ value: string }>;
  images: { imgElement(f: (image: unknown) => Promise<{ src: string }>): unknown };
}

/** 在原文中标出高敏感值（只用于提示，不自动写入档案）。 */
export function sensitiveRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const res = [/[0-9]{17}[0-9Xx]/g, /1[3-9][0-9]{9}/g];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
