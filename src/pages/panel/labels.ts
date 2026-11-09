// 侧边栏显示用的中文名称。
import type { Level } from '../../core/plan/types';

export const LEVEL_ZH: Record<Level, string> = { high: '高', medium: '中', low: '低', skip: '跳过' };
export const COLLECTION_ZH: Record<string, string> = { education: '教育经历', work: '工作/实习经历', languages: '英语能力', projects: '项目经历', honors: '荣誉奖励', certificates: '证书' };
export const CERT_STATUS_ZH: Record<string, string> = { partial: '部分通过', 'in-progress': '在考' };
export const EDU_ZH: Record<string, string> = { doctor: '博士', master: '硕士', bachelor: '本科', 'junior-college': '专科', 'high-school': '高中', 'secondary-vocational': '中专/中技', 'junior-high-or-below': '初中及以下' };
export const LANG_ZH: Record<string, string> = { CET4: '大学英语四级', CET6: '大学英语六级', TEM4: '英语专业四级', TEM8: '英语专业八级', IELTS: '雅思', TOEFL: '托福' };
