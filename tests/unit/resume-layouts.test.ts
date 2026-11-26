// 常见真实简历版式：模板标题、表格式简历、英文日期、Word 表格。都是之前“识别不出、填不进档案”的版式。
import { describe, expect, it } from 'vitest';
import { docxHtmlToText } from '../../src/core/resume/docx-html';
import { pageText } from '../../src/core/resume/layout';
import { parseResumeText } from '../../src/core/resume/parse';

type R = ReturnType<typeof parseResumeText>;
const field = (r: R, path: string) => r.fields.find((f) => f.path === path)?.value;
const recs = (r: R, col: string) => r.records.filter((x) => x.collection === col).map((x) => x.record);

describe('区块标题：模板里的写法', () => {
  it('中文标题后跟英文副标题（教育背景 EDUCATION）', () => {
    const r = parseResumeText(`张三
求职意向：财务分析师
电话：138 0013 8000 | 邮箱：zhangsan@example.com
教育背景 EDUCATION
2019.09 - 2023.06    湖南大学    会计学    本科
GPA：3.7/4.0  排名：前10%
实习经历 INTERNSHIP
2022.07 - 2022.09    普华永道中天会计师事务所    审计实习生
- 参与上市公司年报审计
荣誉奖励 HONORS
2021.10 国家奖学金
技能证书 SKILLS
英语六级（CET-6）、计算机二级
自我评价 ABOUT ME
认真负责，学习能力强。`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '湖南大学', major: '会计学', level: 'bachelor', start: '2019-09', end: '2023-06', gpa: '3.7/4.0', rank: '前10%' })]);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '普华永道中天会计师事务所', title: '审计实习生', kind: 'internship', start: '2022-07', end: '2022-09' })]);
    expect(recs(r, 'honors')).toEqual([expect.objectContaining({ name: '国家奖学金', date: '2021-10' })]);
    expect(recs(r, 'languages')).toEqual([expect.objectContaining({ language: '英语', certificate: 'CET6' })]);
    expect(recs(r, 'computerSkills')).toEqual([expect.objectContaining({ name: '计算机二级' })]);
    expect(recs(r, 'textTemplates')).toEqual([expect.objectContaining({ title: '自我评价', kind: 'self-assessment', body: '认真负责，学习能力强。' })]);
    expect(field(r, 'basic.name')).toBe('张三');
  });

  it('标题字间加空格（教 育 背 景）', () => {
    const r = parseResumeText(`李四
13800138000 / lisi@example.com
教 育 背 景
2019.09-2023.06 武汉大学 金融学 本科
实 习 经 历
2022.07-2022.09 招商银行武汉分行 对公业务实习生
负责客户资料整理
获 奖 情 况
2021.10 国家奖学金`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '武汉大学', major: '金融学', level: 'bachelor' })]);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '招商银行武汉分行', title: '对公业务实习生', description: '负责客户资料整理' })]);
    expect(recs(r, 'honors')).toHaveLength(1);
  });

  it('标题带图标、斜杠和英文（■ 教育背景 / Education）', () => {
    const r = parseResumeText(`孙七
手机：13900139000
■ 教育背景 / Education
2019.09–2023.06｜复旦大学｜经济学｜本科
■ 工作经历 / Work Experience
2023.07–至今｜中国银行上海分行｜客户经理`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '复旦大学', major: '经济学', level: 'bachelor' })]);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '中国银行上海分行', title: '客户经理', end: 'present' })]);
  });

  it('英文在前、编号在前的标题（EDUCATION 教育背景、01 实习经历）', () => {
    const r = parseResumeText(`王一
EDUCATION 教育背景
2019.09-2023.06 南京大学 法学 本科
01 实习经历
2022.07-2022.09 中国工商银行南京分行 柜员实习生`);
    expect(recs(r, 'education')).toHaveLength(1);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '中国工商银行南京分行' })]);
  });

  it('中英文用括号连写的标题（EDUCATION（教育背景）、实习经历（Internship））', () => {
    const r = parseResumeText(`王二
EDUCATION（教育背景）
2019.09-2023.06 南京大学 法学 本科
实习经历（Internship）
2022.07-2022.09 中国工商银行南京分行 柜员实习生`);
    expect(r.sections).toEqual(['教育背景', '实习经历']);
    expect(recs(r, 'work')).toHaveLength(1);
  });

  it('标题和内容在同一行（左侧标题栏）', () => {
    const r = parseResumeText(`赵六
电话：13800138000
教育背景  2019.09-2023.06 中山大学 计算机科学与技术 本科
实习经历  2022.07-2022.09 腾讯科技（深圳）有限公司 后端开发实习生
负责接口开发`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '中山大学', major: '计算机科学与技术', level: 'bachelor' })]);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '腾讯科技(深圳)有限公司', title: '后端开发实习生', description: '负责接口开发' })]);
  });

  it('以标题词开头的普通句子不拆成标题', () => {
    const r = parseResumeText(`自我评价
项目经验丰富，熟悉财务流程。
实习经历让我学会了沟通。`);
    expect(r.sections).toEqual(['自我评价']);
    expect(recs(r, 'textTemplates')[0]?.body).toBe('项目经验丰富，熟悉财务流程。\n实习经历让我学会了沟通。');
  });

  it('兴趣爱好单独存成文字模板，不混进技能', () => {
    const r = parseResumeText(`专业技能
熟练使用 Excel
兴趣爱好
篮球、摄影`);
    expect(recs(r, 'skills').map((s) => s.name)).toEqual(['Excel']);
    expect(recs(r, 'textTemplates')).toEqual([expect.objectContaining({ title: '兴趣爱好', kind: 'other', body: '篮球、摄影' })]);
  });
});

describe('表格式简历', () => {
  it('同一行“标签 值”没有冒号；姓名不会被识别成“姓名”', () => {
    const r = parseResumeText(`个人简历
姓名 王五 性别 男 出生年月 1999.05
民族 汉族 政治面貌 共青团员 籍贯 湖南长沙
联系电话 13800138000 电子邮箱 wangwu@example.com
教育经历
2019.09-2023.06 湖南大学 会计学 本科`);
    expect(field(r, 'basic.name')).toBe('王五');
    expect(field(r, 'basic.gender')).toBe('male');
    expect(field(r, 'basic.birthDate')).toBe('1999-05');
    expect(field(r, 'basic.ethnicity')).toBe('汉族');
    expect(field(r, 'basic.politicalStatus')).toBe('cyl-member');
    expect(field(r, 'basic.nativePlace')).toEqual({ province: '湖南省', city: '长沙市' });
    expect(field(r, 'contact.mobile')).toBe('13800138000');
    expect(field(r, 'contact.email')).toBe('wangwu@example.com');
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '湖南大学', major: '会计学', level: 'bachelor' })]);
  });

  it('标签和值各占一行（单元格逐行提取）', () => {
    const r = parseResumeText(`个人简历
姓名
王五
性别
男
出生年月
1999.05
籍贯
湖南长沙
联系电话
13800138000`);
    expect(field(r, 'basic.name')).toBe('王五');
    expect(field(r, 'basic.gender')).toBe('male');
    expect(field(r, 'basic.birthDate')).toBe('1999-05');
    expect(field(r, 'basic.nativePlace')).toEqual({ province: '湖南省', city: '长沙市' });
    expect(field(r, 'contact.mobile')).toBe('13800138000');
  });

  it('单元格逐行时，学校下一行的专业、单位下一行的职位也能认出', () => {
    const r = parseResumeText(`教育经历
2019.09-2023.06
湖南大学
会计学
本科
实习经历
2022.07-2022.09
普华永道
审计实习生`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '湖南大学', major: '会计学', level: 'bachelor' })]);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '普华永道', title: '审计实习生' })]);
    expect(recs(r, 'work')[0].description).toBeUndefined();
  });

  it('普通教育经历正文里的短句不会被当成专业', () => {
    const r = parseResumeText(`教育经历
2019.09-2023.06 湖南大学
荣获国家奖学金`);
    expect(recs(r, 'education')[0].major).toBeUndefined();
  });

  it('字间加空格的标签（姓  名：张三）', () => {
    const r = parseResumeText(`姓  名：张三    性  别：女
民  族：汉族    籍  贯：江苏南京`);
    expect(field(r, 'basic.name')).toBe('张三');
    expect(field(r, 'basic.gender')).toBe('female');
    expect(field(r, 'basic.ethnicity')).toBe('汉族');
    expect(field(r, 'basic.nativePlace')).toEqual({ province: '江苏省', city: '南京市' });
  });

  it('基本信息表里的毕业院校 / 专业 / 学历生成一条教育经历', () => {
    const r = parseResumeText(`姓名：张三  性别：女
毕业院校：湖南大学  专业：会计学  学历：本科  毕业时间：2023.06`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '湖南大学', major: '会计学', level: 'bachelor', end: '2023-06' })]);
    expect(r.records.find((x) => x.collection === 'education')?.notes.join('')).toContain('入学时间');
  });

  it('基本信息表的学校与教育经历里相同时不重复', () => {
    const r = parseResumeText(`毕业院校：湖南大学  专业：会计学  学历：本科
教育经历
2019.09-2023.06 湖南大学 会计学 本科`);
    expect(recs(r, 'education')).toHaveLength(1);
  });
});

describe('日期写法', () => {
  it('英文月份与 MM/YYYY', () => {
    const r = parseResumeText(`Zhang San
Email: zs@example.com
Education
Sep 2019 - Jun 2023  Hunan University  Accounting  Bachelor
Work Experience
07/2022 - 09/2022  PwC  Audit Intern
Mar. 2023 – Present  Deloitte  Tax Intern`);
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: 'Hunan University', major: 'Accounting', level: 'bachelor', start: '2019-09', end: '2023-06' })]);
    expect(recs(r, 'work')).toEqual([
      expect.objectContaining({ company: 'PwC', title: 'Audit Intern', start: '2022-07', end: '2022-09', kind: 'internship' }),
      expect.objectContaining({ company: 'Deloitte', start: '2023-03', end: 'present' }),
    ]);
  });
});

describe('Word（.docx）表格转成按行的文字', () => {
  it('简单单元格的一行拼成一行；多段落单元格逐段成行', () => {
    const html = '<h1>个人简历</h1><table><tr><td><p>姓名</p></td><td><p>王五</p></td><td><p>性别</p></td><td><p>男</p></td></tr>'
      + '<tr><td><p>出生年月</p></td><td><p>1999.05</p></td><td></td><td><p>籍贯</p></td><td><p>湖南长沙</p></td></tr></table>'
      + '<p><strong>教育经历</strong></p><table><tr><td><p>2019.09-2023.06</p></td><td><p>湖南大学</p></td><td><p>会计学</p></td><td><p>本科</p></td></tr></table>'
      + '<table><tr><td><p>工作内容</p></td><td><p>负责凭证录入；</p><p>协助月末结账。</p></td></tr></table>'
      + '<ul><li>熟练使用 Excel &amp; SQL</li></ul><p>A&lt;B 信息<br />第二行</p>';
    expect(docxHtmlToText(html)).toBe([
      '个人简历',
      '姓名 | 王五 | 性别 | 男',
      '出生年月 | 1999.05 | 籍贯 | 湖南长沙',
      '教育经历',
      '2019.09-2023.06 | 湖南大学 | 会计学 | 本科',
      '工作内容',
      '负责凭证录入；',
      '协助月末结账。',
      '熟练使用 Excel & SQL',
      'A<B 信息',
      '第二行',
    ].join('\n'));
  });

  it('转出的文字能识别出表格里的个人信息和经历', () => {
    const html = '<table><tr><td><p>姓名</p></td><td><p>王五</p></td><td><p>性别</p></td><td><p>男</p></td></tr></table><p>教育经历</p><table><tr><td><p>2019.09-2023.06</p></td><td><p>湖南大学</p></td><td><p>会计学</p></td><td><p>本科</p></td></tr></table>';
    const r = parseResumeText(docxHtmlToText(html));
    expect(field(r, 'basic.name')).toBe('王五');
    expect(field(r, 'basic.gender')).toBe('male');
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '湖南大学', major: '会计学', level: 'bachelor' })]);
  });

  it('排版用的大表格（整栏一个单元格）按段落展开，嵌套表格照常拼行', () => {
    const html = '<table><tr><td><p>张三</p><p>电话：13800138000</p></td><td><p>教育背景</p><table><tr><td><p>2019.09-2023.06</p></td><td><p>湖南大学</p></td></tr></table></td></tr></table>';
    expect(docxHtmlToText(html)).toBe(['张三', '电话：13800138000', '教育背景', '2019.09-2023.06 | 湖南大学'].join('\n'));
  });
});

describe('表格式 PDF', () => {
  const row = (y: number, cells: Array<[number, string]>) => cells.map(([x, str]) => ({ str, x, y, w: str.length * 10, h: 10 }));
  const items = [
    ...row(760, [[60, '个人简历']]),
    ...row(730, [[60, '姓 名'], [150, '王 五'], [320, '性 别'], [410, '男']]),
    ...row(712, [[60, '出生年月'], [150, '1999.05'], [320, '民 族'], [410, '汉族']]),
    ...row(694, [[60, '政治面貌'], [150, '共青团员'], [320, '籍 贯'], [410, '湖南长沙']]),
    ...row(676, [[60, '联系电话'], [150, '13800002222'], [320, '电子邮箱'], [410, 'a@example.com']]),
    ...row(650, [[60, '教育经历']]),
    ...row(632, [[60, '2019.09-2023.06'], [215, '湖南大学'], [330, '会计学'], [430, '本科']]),
    ...row(606, [[60, '实习经历']]),
    ...row(588, [[60, '2022.07-'], [215, '普华永道'], [330, '审计部'], [430, '审计实习生']]),
    ...row(574, [[60, '2022.09']]),
    ...row(550, [[60, '工作内容'], [215, '负责凭证核对；']]),
    ...row(536, [[215, '协助编制审计底稿。']]),
  ];

  it('表格左右两半逐行对齐在同一基线上：不当成两栏', async () => {
    const { findGutter } = await import('../../src/core/resume/layout');
    expect(findGutter(items, 596)).toBeUndefined();
    expect(pageText(items, 596).split('\n').slice(0, 3)).toEqual(['个人简历', '姓 名  王 五  性 别  男', '出生年月  1999.05  民 族  汉族']);
  });

  it('整页识别：个人信息、教育经历、窄单元格里折行的日期', () => {
    const r = parseResumeText(pageText(items, 596));
    expect(field(r, 'basic.name')).toBe('王五');
    expect(field(r, 'basic.gender')).toBe('male');
    expect(field(r, 'basic.nativePlace')).toEqual({ province: '湖南省', city: '长沙市' });
    expect(field(r, 'contact.email')).toBe('a@example.com');
    expect(recs(r, 'education')).toEqual([expect.objectContaining({ school: '湖南大学', major: '会计学', level: 'bachelor' })]);
    expect(recs(r, 'work')).toEqual([expect.objectContaining({ company: '普华永道', department: '审计部', title: '审计实习生', start: '2022-07', end: '2022-09', description: '负责凭证核对；\n协助编制审计底稿。' })]);
  });
});

describe('PDF 行内间距', () => {
  it('明显的空隙（表格分栏）用两个空格隔开，词间距仍是一个空格', () => {
    const text = pageText([
      { str: '姓名', x: 50, y: 700, w: 20, h: 10 }, { str: '王五', x: 110, y: 700, w: 20, h: 10 },
      { str: 'Spring', x: 50, y: 680, w: 30, h: 10 }, { str: 'Boot', x: 83, y: 680, w: 20, h: 10 },
    ], 600);
    expect(text).toBe('姓名  王五\nSpring Boot');
  });
});
