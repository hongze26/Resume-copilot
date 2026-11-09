// 简历区块标题的通用知识：哪些文字像区块标题，以及区块对应档案的哪一类信息。
// 纯函数，Content Script（找标题）和侧边栏（决定区块填哪类记录）共用。
import type { RecordCollection } from '../profile/types';

/** 区块标题后面常见的括号说明：“(必填)”“(笔试、面试等信息会通过以下联系方式进行通知…)” */
const TRAILING_NOTE = /\s*[(（][^()（）]{0,60}[)）]\s*$/;

/** 去掉尾部括号说明、星号、冒号和空白。 */
export function sectionCore(title: string | undefined): string {
  return (title ?? '').replace(/\s+/g, '').replace(/[*＊:：]/g, '').replace(TRAILING_NOTE, '');
}

/**
 * 招聘网站常见的简历区块标题（完全相等，去掉尾部括号说明后比较）。
 * 网站常用 div/span 而不是 h 标签写标题，所以按文字识别；新增网站上的叫法加在这里即可。
 */
const TITLES = [
  // 基本
  '基本信息', '个人信息', '基本资料', '个人资料', '个人基本信息', '基础信息', '联系方式', '联系信息', '求职意向', '求职期望', '意向信息', '应聘信息', '报名信息',
  // 经历
  '教育经历', '教育背景', '学习经历', '教育信息', '学历信息', '工作经历', '工作履历', '实习经历', '工作/实习经历', '实习/工作经历', '工作经验', '实践经历', '社会实践', '校园经历', '在校经历', '学生干部经历', '社团经历', '项目经历', '项目经验', '科研经历', '科研成果', '培训经历',
  // 能力、证书、奖励
  '英语能力', '语言能力', '外语能力', '外语水平', '工作技能', '专业技能', '技能特长', '技能', '证书信息', '证书', '资格证书', '职业资格', '执业资格', '职(执)业资格', '职称信息', '荣誉奖励', '获奖情况', '获奖经历', '奖惩情况', '奖励情况', '荣誉称号',
  // 其他
  '自我评价', '自我描述', '个人评价', '自我介绍', '家庭成员', '家庭情况', '家庭信息', '主要社会关系', '附件', '附件上传', '附加信息', '其他信息', '其他说明', '其他',
];
const TITLE_SET = new Set(TITLES.map((t) => sectionCore(t)));

export function isResumeSectionTitle(raw: string | undefined): boolean {
  const core = sectionCore(raw);
  return core.length >= 2 && core.length <= 16 && TITLE_SET.has(core);
}

export type SectionKind = RecordCollection | 'single' | 'manual';

export interface SectionGuess {
  collection: SectionKind;
  manualNote?: string;
}

/**
 * 区块标题 → 档案信息类别。按“完整叫法”判断，避免“工作技能”被当成工作经历、“第一外语”被当成语言证书。
 * 家庭成员、附件等需要本人填写的区块返回 manual（不填写）：家庭成员表里的“姓名”不能填成申请人自己的姓名。
 */
export function guessSection(title: string | undefined): SectionGuess {
  const t = sectionCore(title);
  if (/家庭|社会关系|亲属/.test(t)) return { collection: 'manual', manualNote: '家庭成员信息请本人填写' };
  if (/附件|上传|签名|承诺|声明/.test(t)) return { collection: 'manual', manualNote: '附件、签名、声明需本人完成' };
  if (/(教育|学习|求学|在读)(经历|背景|情况|信息)|学历信息/.test(t)) return { collection: 'education' };
  if (/(工作|实习|任职|从业)(经历|履历|经验|情况)|实践经历|社会实践|工作\/实习|实习\/工作/.test(t)) return { collection: 'work' };
  if (/项目(经历|经验)|科研经历/.test(t)) return { collection: 'projects' };
  if (/^(英语|语言|外语)(能力|水平|证书|情况)$/.test(t)) return { collection: 'languages' };
  if (/荣誉|获奖|奖励|奖惩/.test(t)) return { collection: 'honors' };
  if (/^专业技能|^技能(特长|信息|情况)?$/.test(t)) return { collection: 'skills' };
  if (/证书|资格|职称/.test(t)) return { collection: 'certificates' };
  return { collection: 'single' };
}
