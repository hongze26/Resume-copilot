import { AI_IMAGE_PROMPT, AI_PROMPT, MAX_IMAGES, MAX_IMAGE_CHARS, apiUrl, parseAiImageResult, parseAiResult, type AiConfig, type EnumLabels } from '../../core/resume/ai';
import { postChat, type ChatMessage } from '../shared/ai-chat';
import { SECTIONS } from './form-spec';

/** 模型常用的其他说法，补在表单的中文选项之外（“大专”“省级”“已获得”）。 */
const EXTRA_LABELS: EnumLabels = {
  'education.level': [['master', '研究生'], ['junior-college', '大专'], ['junior-college', '高职'], ['secondary-vocational', '中专'], ['secondary-vocational', '中技']],
  'education.degree': [['none', '无']],
  'certificates.status': [['obtained', '已获得'], ['obtained', '已通过'], ['obtained', '获得'], ['in-progress', '备考']],
  'honors.level': [['international', '国际'], ['national', '国家'], ['provincial', '省级'], ['provincial', '省'], ['city', '市级'], ['school', '校级'], ['department', '院级']],
  'basic.hukouType': [['urban', '非农'], ['urban', '城市'], ['rural', '农业'], ['collective', '集体']],
  'work.kind': [['full-time', '正式'], ['full-time', '工作']],
};

/** 表单定义里全部可选值字段的中文说法，供大模型结果规整。 */
export function aiEnumLabels(): EnumLabels {
  const out: EnumLabels = {};
  for (const sec of SECTIONS) for (const f of sec.fields) if (f.options) out[`${sec.key}.${f.key}`] = [...f.options, ...(EXTRA_LABELS[`${sec.key}.${f.key}`] ?? [])];
  return out;
}

/** “education.0.level” → “教育经历 第 1 条 · 学历”。 */
export function aiPathLabel(path: string): string {
  const [top, ...rest] = path.split('.');
  const sec = SECTIONS.find((s) => s.key === top);
  if (!sec) return path;
  if (sec.kind === 'array' && /^\d+$/.test(rest[0] ?? '')) {
    const f = rest.length > 1 ? sec.fields.find((x) => x.key === rest.slice(1).join('.')) : undefined;
    return `${sec.title} 第 ${Number(rest[0]) + 1} 条${f ? ` · ${f.label}` : rest.length > 1 ? ` · ${rest.slice(1).join('.')}` : ''}`;
  }
  const f = sec.fields.find((x) => x.key === rest.join('.'));
  return `${sec.title}${f ? ` · ${f.label}` : rest.length ? ` · ${rest.join('.')}` : ''}`;
}

/** 唯一外发入口：档案页明确确认发送后调用，不接受网页消息。 */
function callApi(messages: ChatMessage[], config: AiConfig, signal: AbortSignal): Promise<string> {
  return postChat(config, messages, signal, '请使用输出额度更大的模型或缩短简历');
}

export async function recognizeWithAi(text: string, config: AiConfig, signal: AbortSignal) {
  if (!text.trim()) throw new Error('请先选择简历文件');
  return parseAiResult(await callApi([{ role: 'system', content: AI_PROMPT }, { role: 'user', content: text }], config, signal), text, aiEnumLabels(), aiPathLabel);
}

/** 截图识别：图片只以 data URL 随请求发出，不落盘；extraText 是本人补充的文字。 */
export async function recognizeImagesWithAi(images: string[], extraText: string, config: AiConfig, signal: AbortSignal) {
  if (!images.length) throw new Error('请先粘贴或选择截图');
  if (images.length > MAX_IMAGES) throw new Error(`一次最多识别 ${MAX_IMAGES} 张截图`);
  if (images.some((u) => !/^data:image\/(png|jpeg|webp);base64,/.test(u))) throw new Error('只支持 PNG、JPG、WebP 图片');
  if (images.reduce((n, u) => n + u.length, 0) > MAX_IMAGE_CHARS) throw new Error('截图总大小超出限制，请减少张数或裁剪后再试');
  const user: ChatMessage = { role: 'user', content: [{ type: 'text', text: `用户补充的文字：\n${extraText.trim() || '（无）'}` }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))] };
  return parseAiImageResult(await callApi([{ role: 'system', content: AI_IMAGE_PROMPT }, user], config, signal), extraText, aiEnumLabels(), aiPathLabel);
}
