// 仿智联校园网申“我的简历”（xiaoyuan.zhaopin.com/scrd/resume2）。使用真实的 Vue 2 + Element UI 2.15。
// 结构依据：登录后页面编辑态的结构（2026-11-09 核对），自行重建，不含网站代码：
//   .apply-module 区块（一次只显示一个，右侧导航切换）、h6.form-content--title、标题栏“添加”、记录旁“编辑”（.icon-box）、
//   .apply-form > form.el-form--label-top、字段名在 label[for]（prop）、下拉浮层挂在控件内（popper-append-to-body=false）、
//   日期框只读（editable=false）、地区是只读输入框 + .s-region 自定义弹窗、表单底部 .btn-box“保 存/添 加 + 取 消”。
// 材料里没有的部分（地区弹窗、技能弹窗、选学历后出现哪些字段）是推测，见 notes。
// window.__fixture：saveClicks 记录本人点“保 存/添 加”的次数，values 为各表单当前值，records 为已保存记录。

const ETHNIC = ['汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族', '满族', '土家族', '其他'];
const SALARY = ['1千以下', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n}千`), ...Array.from({ length: 21 }, (_, i) => `${Math.round((1 + i * 0.1) * 10) / 10}万`), '3万以上'];
const O = {
  idType: ['身份证', '其他'],
  gender: ['男', '女'],
  nation: ETHNIC,
  health: ['健康', '良好', '有病史'],
  marital: ['未婚', '已婚', '离异', '保密'],
  politics: ['团员', '中共党员（含预备党员）', '民主党派', '无党派人士', '群众'],
  area: ['86', '852', '886', '853'],
  eduType: ['全日制统分统招', '海外留学', '成人教育', '定向', '非定向', '委培', '自费', '其他'],
  degree: ['博士', 'MBA', '硕士', '双学士', '学士', '其他', '无'],
  level: ['博士研究生', 'MBA/EMBA', '硕士研究生', '本科', '大专', '中专/中技', '高中', '初中及以下'],
  rank: ['前5%', '前10%', '前20%', '前30%', '其他'],
  hasNo: ['有', '无'],
  jobType: ['全职', '兼职', '实习'],
  yesNo: ['是', '否'],
  lang: ['英语', '汉语', '日语', '法语', '德语', '俄语', '韩语/朝鲜语'],
  skill: ['一般', '良好', '熟练', '精通'],
  salary: SALARY,
};
// 学校候选（真实校名；候选带 isOverseas，选中境外院校时网站自动设“海外留学/有”）
const SCHOOLS = [
  { value: '湖南大学' }, { value: '湖南师范大学' }, { value: '湖南财政经济学院' }, { value: '中南大学' },
  { value: '曼彻斯特大学', isOverseas: true }, { value: '曼彻斯特城市大学', isOverseas: true },
  { value: '示例商学院大学' }, { value: '示例财经大学' },
];

// ---------- 模板片段（m 为 v-model 前缀，如 f.basic） ----------
const req = (r) => (r ? ' required' : '');
const item = (prop, label, r, body, cls = '') => `<el-form-item label="${label}" prop="${prop}"${req(r)}${cls ? ` class="${cls}"` : ''}>${body}</el-form-item>`;
const input = (m, prop, label, ph, r, max = 40) =>
  item(prop, label, r, `<div class="apply-form-input"><el-input v-model="${m}.${prop}" class="apply-form-input__node" maxlength="${max}" placeholder="${ph}"></el-input></div>`);
const number = (m, prop, label, ph, r) =>
  item(prop, label, r, `<div class="apply-form-input-number"><el-input v-model="${m}.${prop}" class="apply-form-input__node" maxlength="3" placeholder="${ph}"></el-input></div>`);
const select = (m, prop, label, opts, ph, r, extra = '') =>
  item(prop, label, r, `<div class="apply-form-select"><el-select v-model="${m}.${prop}" class="apply-form-select__node" :popper-append-to-body="false" placeholder="${ph}"${extra}><el-option v-for="o in ${opts}" :key="o" :label="o" :value="o"></el-option></el-select></div>`);
const date = (m, prop, label, ph, r, type = 'date') =>
  item(prop, label, r, `<div class="apply-form-date"><el-date-picker v-model="${m}.${prop}" type="${type}" :editable="false" value-format="${type === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd'}" class="apply-form-date__node" placeholder="${ph}"></el-date-picker></div>`);
// 地区：只读输入框 + 网站自带的城市弹窗（点击输入框所在区域打开）。maxLevel：city 选到市即确认；district 要选到区县。max>1 为多选
const region = (m, prop, label, ph, r, maxLevel = 'city', max = 1) =>
  item(prop, label, r, `<div class="apply-form-input" @click="openRegion(${m}, '${prop}', '${maxLevel}', ${max})"><el-input :value="${m}.${prop}" readonly class="apply-form-input__node" maxlength="100" placeholder="${ph}"></el-input><div class="s-region"></div></div>`);
const textarea = (m, prop, label, ph) =>
  item(prop, label, false, `<div class="apply-form-textarea"><el-input type="textarea" v-model="${m}.${prop}" class="apply-form-textarea__node" maxlength="3000" show-word-limit placeholder="${ph}"></el-input></div>`, 'item-aline');

const title = (t, r, desc, addKey) => `
<div>
  <div class="form-content--title-box">
    <h6 class="form-content--title">${t}   ${r ? '<span class="form-content--required">必填</span>' : ''}</h6>
    ${addKey ? `<div class="icon-box" :class="{ 'icon-box-disabled': adding.${addKey} }" @click="add('${addKey}')"><i class="zl_font icon-plus-circle"></i><span class="icon-text">添加</span></div>` : ''}
  </div>
  <div class="title--description">${desc}</div>
</div>`;

const viewForm = (fields, src) => `
<el-form label-position="top" class="scrd-web--form scrd-web--form-edit scrd-web--form-resume">
  <el-form-item v-for="x in ${fields}" :key="x[0]" :label="x[1]" :prop="x[0]">
    <div v-if="show(${src}[x[0]])" class="labelOnly-text">{{ show(${src}[x[0]]) }}</div>
    <div v-else class="has-text-lighter has-text-weight-light">--</div>
  </el-form-item>
</el-form>`;

const FORM_CLS = 'label-position="top" class="scrd-web--form scrd-web--form-edit scrd-web--form-resume"';

function single(key, t, r, desc, body) {
  return `
<div class="apply-module" v-if="cur === '${key}'">
  <div class="apply-module__body">
    ${title(t, r, desc)}
    <div class="apply-module__form">
      <div class="apply-form">
        <el-form v-if="editing.${key}" :model="f.${key}" ${FORM_CLS}>
          ${body(`f.${key}`)}
          <div class="btn-box"><div><el-button type="primary" @click="save('${key}')">保 存</el-button><el-button @click="cancel('${key}')">取 消</el-button></div></div>
        </el-form>
        ${viewForm(`view.${key}`, `saved.${key}`).replace('<el-form ', `<el-form v-else `)}
        <div class="icon-box" :class="{ 'icon-box-disabled': editing.${key} }" @click="edit('${key}')"><i class="zl_font icon-ic_edit"></i><span class="icon-text">编辑</span></div>
      </div>
    </div>
  </div>
</div>`;
}

function repeat(key, t, r, desc, body) {
  return `
<div class="apply-module" v-if="cur === '${key}'">
  <div class="apply-module__body">
    ${title(t, r, desc, key)}
    <div class="apply-module__form">
      <div class="apply-form" v-if="adding.${key}">
        <el-form :model="n.${key}" :key="'nf-' + rerender" ${FORM_CLS}>
          ${body(`n.${key}`)}
          <div class="btn-box"><div><el-button type="primary" @click="commit('${key}')">添 加</el-button><el-button @click="adding.${key} = false">取 消</el-button></div></div>
        </el-form>
      </div>
      <div class="apply-form" v-for="(r, i) in records.${key}" :key="'${key}' + i">
        ${viewForm(`view.${key}`, 'r')}
        <div class="icon-box icon-box-disabled"><i class="zl_font icon-ic_edit"></i><span class="icon-text">编辑</span></div>
      </div>
    </div>
  </div>
</div>`;
}

// ---------- 网站弹窗（结构按 Zhilian/详细补充信息/弹窗/*.html） ----------
// 地区：第一列“热门”+各省简称（直辖市只在热门里），第二列城市简称，第三列区县
const city = (label, prov, districts = []) => ({ label, prov, children: districts });
const REGIONS = [
  { label: '热门', children: [city('北京', '北京', ['海淀区', '朝阳区']), city('上海', '上海', ['浦东新区', '徐汇区']), city('长沙', '湖南', ['芙蓉区', '天心区', '岳麓区', '开福区']), city('深圳', '广东', ['南山区', '福田区'])] },
  { label: '广东', children: [city('广州', '广东', ['天河区', '越秀区']), city('深圳', '广东', ['南山区', '福田区'])] },
  { label: '湖北', children: [city('武汉', '湖北', ['洪山区', '武昌区'])] },
  { label: '湖南', children: [city('长沙', '湖南', ['芙蓉区', '天心区', '岳麓区', '开福区']), city('岳阳', '湖南', ['岳阳楼区', '君山区']), city('湘潭', '湖南', ['雨湖区'])] },
  { label: '港澳台', children: [city('香港', '香港'), city('澳门', '澳门')] },
  { label: '国外', children: [city('英国', '国外', ['伦敦', '曼彻斯特'])] },
];
// 语言证书：考试 → 级别（真实页面 BEC 的级别写作“剑桥商务英语(BEC)初级”）
// 2026-11-09 从真实页面（Chrome，本人已登录）读到的英语证书弹窗：第一列考试、右侧证书全称
const CERTS = [
  { label: '剑桥商务英语（BEC）', children: ['剑桥商务英语(BEC)初级', '剑桥商务英语(BEC)中级', '剑桥商务英语(BEC)高级'] },
  { label: '全国大学英语考试（CET）', children: ['全国大学英语三级考试(CET3)', '全国大学英语四级考试(CET4)', '全国大学英语六级考试(CET6)'] },
  { label: '全国英语等级考试（PETS）', children: ['全国英语等级考试一级(PETS-1)', '全国英语等级考试二级(PETS-2)', '全国英语等级考试三级(PETS-3)'] },
  { label: '托福（TOEFL）', children: ['托福(TOEFL)'] },
  { label: '雅思（IELTS）', children: ['雅思(IELTS)'] },
  { label: '英语专业考试（TEM）', children: ['英语专业四级考试(TEM-4)', '英语专业八级考试(TEM-8)'] },
];
// 技能：大类 → 小类 → 技能；“其他技能”没有下一级，点了就会被选中
// 全部按真实页面的技能字典（2026-11-09 在本人已登录的 Chrome 里读取）
const SKILLS = [
  { label: 'IT技能', children: [
    { label: '大数据类', children: ['数据分析', '数据挖掘', '数据建模', 'Erwin', 'SAS', 'Hive', 'Hadoop', 'R语言', 'Access', 'DB2/database', 'Oracle', 'MySQL', 'SQL Server', 'SQL', 'Sybase', 'SPSS', 'OLAP', 'Cloud', 'Spark'] },
    { label: '开发编程类', children: ['Java', 'Python', 'C/C++', 'PHP', '.NET', 'C#', 'ActiveX', 'ASP.NET', 'ERP', 'HTML5', 'IOS', 'JavaScript', 'PERL', 'SEO', 'web前端', '移动前端', 'Android', 'Lua', 'Clojure', 'Ruby', 'Matlab', 'XML/XSLT', 'Linux', 'Visual Basic', 'VB.Net', 'TensorFlow', 'Unix/Linux development', 'Scala', 'Shell', 'Golang', 'J2EE', 'SAP'] },
    { label: '多媒体设计类', children: ['Adobe Illustrator', 'Photoshop', '3D Studio', '3D Studio MAX', 'Corel Draw', 'Director', 'Flash', 'PageMaker', 'Dreamweaver', 'Fireworks', 'FrontPage', 'GoLive', 'Lightwave', 'Maya', 'MS Publisher', 'Solid Works', 'AUTOCAD', 'CATIA'] },
    { label: '办公应用软件', children: ['MS Excel', 'MS VISIO', 'MS Project', 'MS Powerpoint', 'MS OneNote', 'MS WORD', 'OutLook Express'] },
    { label: '财务管理类', children: ['用友', '金蝶', 'Sun'] },
  ] },
  { label: '其他技能', children: [] },
];

const REGION_DIALOG = `
<div class="s-dialog__overlay" v-show="rg.open" style="z-index: 100;">
  <div class="s-dialog" role="dialog" aria-label="请选择行政区" style="width: 800px;">
    <div class="s-dialog__header"><span class="s-dialog__title">请选择行政区</span>
      <div class="s-region__search"><div class="s-input s-input--small"><input type="text" class="s-input__inner" placeholder="搜索城市名/区县"></div></div>
      <i class="s-dialog__icon s-icon s-icon-guanbi" @click="rg.open = false"></i></div>
    <div class="s-dialog__body"><div class="s-cascader">
      <div class="s-scrollbar"><div class="s-cascader__first-level s-scrollbar__wrap"><ul class="s-scrollbar__view s-cascader__options">
        <li v-for="(p, i) in REGIONS" :key="p.label" :class="['s-cascader__option', { 's-cascader__option--active': rg.p === i }]" @click="rg.p = i; rg.c = -1">
          <p class="s-cascader__option-content" :title="p.label">{{ p.label }}</p><span class="s-cascader__option-icon s-icon s-icon-zuojiantou"></span></li>
      </ul></div></div>
      <div class="s-scrollbar" v-if="rg.p >= 0"><div class="s-cascader__second-level s-scrollbar__wrap"><ul class="s-scrollbar__view s-cascader__options">
        <li v-for="(c, j) in REGIONS[rg.p].children" :key="c.label" :class="['s-cascader__option', { 's-cascader__option--active': rg.c === j }]" @click="rgCity(j)">
          <p class="s-cascader__option-content" :title="c.label">{{ c.label }}</p><span v-if="rg.maxLevel === 'district' && c.children.length" class="s-cascader__option-icon s-icon s-icon-zuojiantou"></span></li>
      </ul></div></div>
      <div class="s-cascader-horizontal-list" v-if="rg.c >= 0"><div class="s-scrollbar"><div class="s-cascader__third-level s-scrollbar__wrap"><ul class="s-scrollbar__view s-cascader__select-options">
        <div class="s-cascader__select-button-wrapper" v-for="d in REGIONS[rg.p].children[rg.c].children" :key="d"><li class="s-checkbutton__item" @click="rgDistrict(d)">{{ d }}</li></div>
      </ul></div></div></div>
      <div class="s-cascader__footer" v-if="rg.max > 1"><span class="s-cascader__footer-label">已选: <span class="s-cascader__footer--large">{{ rg.sel.length }}</span>/ {{ rg.max }}</span>
        <div class="s-cascader__footer-action"><button type="button" class="s-button s-cascader__footer-button s-button--default" @click="rg.open = false"><span>取消</span></button><button type="button" class="s-button s-cascader__footer-button s-button--primary" :disabled="!rg.sel.length" @click="rgConfirm"><span>确定</span></button></div></div>
    </div></div>
  </div>
</div>`;

const CERT_DIALOG = `
<div class="s-dialog__overlay" v-show="ct.open" style="z-index: 100;">
  <div class="s-dialog" role="dialog" aria-label="请选择证书" style="width: 800px;">
    <div class="s-dialog__header"><span class="s-dialog__title">请选择证书</span><i class="s-dialog__icon s-icon s-icon-guanbi" @click="ct.open = false"></i></div>
    <div class="s-dialog__body"><div class="s-cascader">
      <div class="s-scrollbar"><div class="s-cascader__first-level s-scrollbar__wrap"><ul class="s-scrollbar__view s-cascader__options">
        <li v-for="(e, i) in CERTS" :key="e.label" :class="['s-cascader__option', { 's-cascader__option--active': ct.i === i }]" @click="ct.i = i">
          <p class="s-cascader__option-content" :title="e.label">{{ e.label }}</p><span class="s-cascader__option-icon s-icon s-icon-zuojiantou"></span></li>
      </ul></div></div>
      <div class="s-cascader-horizontal-list"><div class="s-scrollbar"><div class="s-cascader__third-level s-scrollbar__wrap"><ul class="s-scrollbar__view s-cascader__select-options">
        <li v-for="c in CERTS[ct.i].children" :key="c" class="s-cascader__select-option" @click="certPick(c)"><p class="s-cascader__select-option-content" :title="c">{{ c }}</p></li>
      </ul></div></div></div>
    </div></div>
  </div>
</div>`;

const SKILL_DIALOG = `<el-dialog :visible.sync="sk.open" custom-class="v-skill" width="800px" title="专业技能">
  <div class="v-skill__container">
    <div class="v-skill__container-left">
      <div v-for="(a, i) in SKILLS" :key="a.label" :class="['v-skill__container-left-item', { 'v-skill__container-left-item--selected': sk.a === i }]" @click="skillLeft(i)">
        <div class="v-skill__container-left-item--name">{{ a.label }}</div><div v-if="a.children.length" class="zl_font icon-ic_youcejiantou v-skill__container-left-item--icon"></div></div>
    </div>
    <div class="v-skill__container-main">
      <div v-for="(b, j) in SKILLS[sk.a].children" :key="b.label" :class="['v-skill__container-main-item', { 'v-skill__container-main-item--selected': sk.b === j }]" @click="sk.b = j">
        <div class="v-skill__container-left-item--name">{{ b.label }}</div><div class="zl_font icon-ic_youcejiantou v-skill__container-left-item--icon"></div></div>
    </div>
    <div class="v-skill__container-right">
      <div v-for="c in (SKILLS[sk.a].children[sk.b] || { children: [] }).children" :key="c" class="v-skill__container-right-item" @click="skillPick(c)">{{ c }}</div>
    </div>
  </div>
</el-dialog>`;

const BASIC = (m) => [
  input(m, 'name', '姓名', '请填写您的真实姓名', true),
  select(m, 'id_card_type', '证件号码类型', 'O.idType', '请选择您的证件类型', true),
  date(m, 'birth', '出生日期', '请选择您的出生日期', true),
  select(m, 'gender', '性别', 'O.gender', '请选择您的性别', true),
  select(m, 'nation', '民族', 'O.nation', '请选择民族', false),
  select(m, 'healthiness_status', '健康状况', 'O.health', '请选择您的健康状况', false),
  select(m, 'marital_status', '婚姻状况', 'O.marital', '请选择您的婚姻状况', false),
  select(m, 'politics_bg', '政治面貌', 'O.politics', '请选择您的政治面貌', true),
  region(m, 'nowlocated_city', '现居住城市', '请选择您的现居住城市', true, 'district'),
  region(m, 'hukou_city', '入学前户口所在地', '请选择您入学前的户口所在地', true),
  item('mobile_number', '手机号码', true, `<div class="apply-form-input"><el-input v-model="${m}.mobile_number" class="apply-form-input__node" maxlength="11" placeholder="请准确填写您的手机号码"><el-select slot="prepend" v-model="${m}.area" :popper-append-to-body="false" placeholder="请选择" style="width: 90px"><el-option v-for="o in O.area" :key="o" :label="o" :value="o"></el-option></el-select></el-input></div>`),
  input(m, 'email', '电子邮箱', '请填写有效的电子邮箱地址', true),
  input(m, 'address', '通信地址', '请填写通信地址', false),
  number(m, 'stature', '身高(cm)', '身高最多只能填写3位数字（单位：CM）', true),
  number(m, 'avoirdupois', '体重(kg)', '体重最多只能填写2~3位数字（单位：KG）', true),
  region(m, 'FIELD1002_city', '高考生源地', '请填写高考生源地', true),
].join('\n');

const EDU = (m) => [
  item('school_name', '学校名称', true, `<div class="apply-form-school"><div class="apply-autocomplete"><el-autocomplete v-model="${m}.school_name" :fetch-suggestions="schools" :trigger-on-focus="false" :debounce="300" popper-class="apply-autocomplete__el" placeholder="请填写学校全称" @select="(it) => schoolPicked(${m}, it)"></el-autocomplete></div></div>`),
  date(m, 'edu_date_start', '入学时间', '请选择您的入学时间', true),
  date(m, 'edu_date_end', '毕业时间', '请选择您的毕业时间', true),
  select(m, 'edu_type', '受教育类型', 'O.eduType', '请选择您的所受教育类型', true),
  select(m, 'education_level', '学位', 'O.degree', '请选择您的学位', true),
  select(m, 'education_degree', '学历', 'O.level', '请选择您的学历', true),
  // 推测：选了学历后才出现研究方向（研究生）、院系、专业、专业课程
  `<template v-if="/研究生/.test(${m}.education_degree)">${input(m, 'education_degree_direction', '研究方向', '请填写您的研究方向', true)}</template>`,
  `<template v-if="${m}.education_degree">${input(m, 'college_name', '院系', '请填写您的院系', true)}${input(m, 'major_name', '专业', '请填写您的专业', true)}${input(m, 'main_course', '专业课程', '请填写您的专业课程', false)}</template>`,
  select(m, 'grade_rank', '年级排名', 'O.rank', '请选择您的年级排名', true),
  select(m, 'is_oversea', '是否有海外学习经历', 'O.hasNo', '请选择您是否有海外学习经历', false),
  `<template v-if="${m}.is_oversea === '有'">${input(m, 'oversea_experience', '海外学习经历年限', '请填写海外学习年限', false)}</template>`,
].join('\n');

const WORK = (m) => [
  input(m, 'company_name', '工作单位', '请填写您实习所在单位的名称', true),
  date(m, 'job_date_start', '入职时间', '请选择您实习单位的入职时间', true),
  // 离职时间：日期面板左侧有“至今”快捷项（网站代码 ApplyFormDateNow）；选“至今”后叠加的输入框显示“至今”
  item('job_date_end', '离职时间', true, `<div class="apply-form-date-now"><div class="apply-form-date-now__inner"><div class="apply-form-date-now__mask"></div><el-input readonly class="apply-form-input__node apply-form-date-now__ipt" :value="${m}.job_date_endTHISDAY === 0 ? '至今' : ''" v-show="${m}.job_date_endTHISDAY === 0"></el-input></div><el-date-picker v-model="${m}.job_date_end" type="date" :editable="false" value-format="yyyy-MM-dd" :picker-options="presentOptions(${m}, 'job_date_end')" popper-class="job_date_end-picker-popper" class="apply-form-date__node apply-form-date-now__node" placeholder="请选择您实习单位的离职时间"></el-date-picker></div>`),
  select(m, 'job_type', '工作类型', 'O.jobType', '请选择您在职期间的工作类型', true),
  number(m, 'salary', '职位月薪(税前)', '请填写您在职期间的职位月薪', false),
  input(m, 'job_title', '职务', '请填写您实习期间担任的职务', true),
  textarea(m, 'work_description', '工作描述', '请描述一下您在职期间的工作内容'),
  select(m, 'is_references', '是否有证明人', 'O.yesNo', '请选择您是否有工作证明人', false),
].join('\n');

const LANG = (m) => [
  select(m, 'language', '语种', 'O.lang', '请选择语种', false),
  // 选了语种后出现证书子表单：证书栏聚焦即打开“请选择证书”弹窗（考试 → 级别）
  // 真实结构：“语言证书”里嵌着一份小表单（.apply-form > form），“获得证书”可再“添加”多张
  `<el-form-item v-if="${m}.language" label="语言证书" prop="certificate_group" class="apply-form-sub-wrapper"><div class="apply-form"><el-form label-position="top" class="scrd-web--form-subloop scrd-web--form scrd-web--form-edit scrd-web--form-resume"><el-form-item label="获得证书" prop="certificate"><div class="apply-form-language"><div><el-input :value="${m}.certificate" @focus="openCert(${m})"></el-input><div class="s-language-certification"></div></div></div></el-form-item></el-form><span class="del-icon-box"><i class="sati sati-minus icon-del"></i></span></div><div class="add-box"><span class="add-icon-box"><i class="icon-plus sati sati-plus"></i></span><span class="icon-text">添加</span></div></el-form-item>`,
  select(m, 'language_skill_listen_say', '听说能力', 'O.skill', '请选择您的语言听说能力水平', false),
  select(m, 'language_skill_read_write', '读写能力', 'O.skill', '请选择您的语言读写能力水平', false),
].join('\n');

const HONOR = (m) => [
  input(m, 'awards', '奖励名称', '请填写您在校期间所获的奖励', false),
  date(m, 'award_time', '获得时间', '请选择奖励荣誉获得时间', false, 'month'),
  input(m, 'award_office', '颁奖机构', '请填写颁奖机构', false),
].join('\n');

const SKILL = (m) => [
  // 技能类型：聚焦打开 el-dialog .v-skill（大类 → 小类 → 技能）；没有下一级的分类点一下即被选中
  item('skill_type', '技能类型', false, `<div class="apply-form-input"><el-input :value="${m}.skill_type" class="apply-form-input__node" placeholder="请选择技能类型" @focus="openSkill(${m})"></el-input>${SKILL_DIALOG}</div>`),
  select(m, 'skill_level', '技能掌握程度', 'O.skill', '请选择您的技能掌握水平', false),
].join('\n');

const INTENT = (m) => [
  item('desired_employment_type', '期望工作性质', false, `<el-checkbox-group v-model="${m}.desired_employment_type"><el-checkbox label="全职"></el-checkbox><el-checkbox label="兼职"></el-checkbox><el-checkbox label="实习"></el-checkbox></el-checkbox-group>`, 'item-aline'),
  region(m, 'desired_city', '期望工作城市', '请选择您希望工作的城市', true, 'city', 3),
  select(m, 'desired_salary_minimum', '最低薪资', 'O.salary', '请选择', true),
  // 最高薪资的可选范围随最低薪资变化
  select(m, 'desired_salary_maximum', '最高薪资', 'maxSalary', '请选择', true),
].join('\n');

const OTHER = (m) => textarea(m, 'self_assessment', '自我评价', '详细罗列出您所拥有的专长、技能和实践经验');

const ATTACH = () =>
  [
    item('work_photo_path', '证件照', true, `<div class="apply-form-uploader"><el-upload action="#" :auto-upload="false" class="apply-form-uploader-default"><div class="apply-form-uploader-default-text">上传证件照</div></el-upload></div>`, 'item-aline'),
    item('attach_path', '简历附件', false, `<div class="apply-form-uploader"><el-upload action="#" :auto-upload="false" class="apply-form-uploader-default"><div class="apply-form-uploader-default-text">上传附件</div></el-upload></div>`, 'item-aline'),
  ].join('\n');

const NAV = [
  ['basic', '个人信息'],
  ['education', '教育经历'],
  ['intention', '求职意向'],
  ['work', '实习/工作经历'],
  ['languages', '语言能力'],
  ['skills', '专业技能'],
  ['honors', '奖励荣誉'],
  ['attachments', '附件'],
  ['other', '其他信息'],
];

const blank = {
  basic: () => ({ name: '', id_card_type: '', birth: '', gender: '', nation: '', healthiness_status: '', marital_status: '', politics_bg: '', nowlocated_city: '', hukou_city: '', area: '86', mobile_number: '', email: '', address: '', stature: '', avoirdupois: '', FIELD1002_city: '' }),
  intention: () => ({ desired_employment_type: [], desired_city: '', desired_salary_minimum: '', desired_salary_maximum: '' }),
  other: () => ({ self_assessment: '' }),
  attachments: () => ({}),
  education: () => ({ school_name: '', edu_date_start: '', edu_date_end: '', edu_type: '', education_level: '', education_degree: '', education_degree_direction: '', college_name: '', major_name: '', main_course: '', grade_rank: '', is_oversea: '', oversea_experience: '' }),
  work: () => ({ company_name: '', job_date_start: '', job_date_end: '', job_date_endTHISDAY: '', job_type: '', salary: '', job_title: '', work_description: '', is_references: '' }),
  languages: () => ({ language: '', certificate: '', language_skill_listen_say: '', language_skill_read_write: '' }),
  honors: () => ({ awards: '', award_time: '', award_office: '' }),
  skills: () => ({ skill_type: '', skill_level: '' }),
};

const VIEW = {
  basic: [['name', '姓名'], ['id_card_type', '证件号码类型'], ['birth', '出生日期'], ['gender', '性别'], ['nation', '民族'], ['politics_bg', '政治面貌'], ['nowlocated_city', '现居住城市'], ['mobile_number', '手机号码'], ['email', '电子邮箱'], ['stature', '身高(cm)'], ['avoirdupois', '体重(kg)']],
  intention: [['desired_employment_type', '期望工作性质'], ['desired_city', '期望工作城市'], ['desired_salary_minimum', '最低薪资'], ['desired_salary_maximum', '最高薪资']],
  other: [['self_assessment', '自我评价']],
  attachments: [['work_photo_path', '证件照'], ['attach_path', '简历附件']],
  education: [['school_name', '学校名称'], ['edu_date_start', '入学时间'], ['edu_date_end', '毕业时间'], ['education_degree', '学历'], ['major_name', '专业']],
  work: [['company_name', '工作单位'], ['job_date_start', '入职时间'], ['job_title', '职务']],
  languages: [['language', '语种'], ['language_skill_listen_say', '听说能力']],
  honors: [['awards', '奖励名称'], ['award_time', '获得时间']],
  skills: [['skill_type', '技能类型'], ['skill_level', '技能掌握程度']],
};

export function mount(Vue, ElementUI) {
  Vue.use(ElementUI);
  const fixture = { saveClicks: 0, cancelClicks: 0, submitEvents: 0, schoolPicks: 0, values: {}, records: {} };
  window.__fixture = fixture;
  document.addEventListener('submit', (e) => {
    fixture.submitEvents++;
    e.preventDefault();
  }, true);

  const singles = ['basic', 'intention', 'other', 'attachments'];
  const repeats = ['education', 'work', 'languages', 'honors', 'skills'];
  const start = (location.hash.replace('#', '') || 'basic');

  const vm = new Vue({
    el: '#app',
    template: `
<div class="page">
  <div class="banner">让每段经历都发光，照亮你的下一站</div>
  <div class="layout">
    <div class="resume-left">
      ${single('basic', '个人信息', true, '详尽的个人信息能让企业更快的了解您', BASIC)}
      ${repeat('education', '教育经历', true, '教育经历可以展示你的专业背景和学习能力，是HR筛选简历时的重要参考依据', EDU)}
      ${single('intention', '求职意向', true, '写下你希望从事的行业，及工作性质', INTENT)}
      ${repeat('work', '实习/工作经历', false, '实习/工作经历可以集中体现你的实践能力，是提升简历说服力的重要途径', WORK)}
      ${repeat('languages', '语言能力', false, '语言能力', LANG)}
      ${repeat('skills', '专业技能', false, '有一技之长可能会让你脱颖而出', SKILL)}
      ${repeat('honors', '奖励荣誉', false, '奖励荣誉', HONOR)}
      ${single('attachments', '附件', false, '附件', ATTACH)}
      ${single('other', '其他信息', false, '其他信息', OTHER)}
    </div>
    <div class="resume-right">
      <ul class="resume-nav">
        <li v-for="s in nav" :key="s[0]" :class="['resume-nav__item', { 'is-active': cur === s[0] }]" @click="go(s[0])">{{ s[1] }}</li>
      </ul>
      <div class="resume-actions"><el-button>预览</el-button><el-button type="primary" id="deliver" @click="deliver">立即投递</el-button></div>
    </div>
  </div>
  ${REGION_DIALOG}
  ${CERT_DIALOG}
</div>`,
    data: () => ({
      rerender: 0,
      O,
      REGIONS,
      CERTS,
      SKILLS,
      rg: { open: false, model: null, prop: '', maxLevel: 'city', max: 1, p: 0, c: -1, sel: [] },
      ct: { open: false, model: null, i: 0 },
      sk: { open: false, model: null, a: 0, b: 0 },
      nav: NAV,
      view: VIEW,
      cur: NAV.some((s) => s[0] === start) ? start : 'basic',
      regionOpen: '',
      editing: Object.fromEntries(singles.map((k) => [k, false])),
      adding: Object.fromEntries(repeats.map((k) => [k, false])),
      f: Object.fromEntries(singles.map((k) => [k, blank[k]()])),
      saved: Object.fromEntries(singles.map((k) => [k, blank[k]()])),
      n: Object.fromEntries(repeats.map((k) => [k, blank[k]()])),
      records: Object.fromEntries(repeats.map((k) => [k, []])),
    }),
    computed: {
      maxSalary() {
        const i = SALARY.indexOf(this.f.intention.desired_salary_minimum);
        return i < 0 ? SALARY : SALARY.slice(i);
      },
    },
    methods: {
      go(k) {
        this.cur = k;
        location.hash = k;
      },
      show(v) {
        return Array.isArray(v) ? v.join('、') : v;
      },
      edit(k) {
        if (this.editing[k]) return;
        this.f[k] = JSON.parse(JSON.stringify(this.saved[k]));
        this.editing[k] = true;
      },
      save(k) {
        fixture.saveClicks++;
        this.saved[k] = JSON.parse(JSON.stringify(this.f[k]));
        this.editing[k] = false;
      },
      cancel(k) {
        fixture.cancelClicks++;
        this.editing[k] = false;
      },
      add(k) {
        if (this.adding[k]) return;
        this.n[k] = blank[k]();
        this.adding[k] = true;
      },
      commit(k) {
        fixture.saveClicks++;
        this.records[k].push(JSON.parse(JSON.stringify(this.n[k])));
        this.adding[k] = false;
      },
      schools(q, cb) {
        cb(SCHOOLS.filter((s) => s.value.includes(q)));
      },
      schoolPicked(m, it) {
        fixture.schoolPicks++;
        if (it && it.isOverseas) {
          m.edu_type = '海外留学';
          m.is_oversea = '有';
        }
      },
      openRegion(model, prop, maxLevel, max) {
        const cur = String(model[prop] || '');
        this.rg = { open: true, model, prop, maxLevel, max, p: 0, c: -1, sel: max > 1 && cur ? cur.split(',') : [] };
      },
      rgChoose(label) {
        const rg = this.rg;
        if (rg.max === 1) {
          rg.model[rg.prop] = label;
          rg.open = false;
          return;
        }
        const i = rg.sel.indexOf(label);
        if (i >= 0) rg.sel.splice(i, 1);
        else if (rg.sel.length < rg.max) rg.sel.push(label);
      },
      rgCity(j) {
        const c = REGIONS[this.rg.p].children[j];
        if (this.rg.maxLevel === 'district' && c.children.length) {
          this.rg.c = j;
          return;
        }
        this.rgChoose([...new Set([c.prov, c.label])].join('-'));
      },
      rgDistrict(d) {
        const c = REGIONS[this.rg.p].children[this.rg.c];
        this.rgChoose([...new Set([c.prov, c.label, d])].join('-'));
      },
      rgConfirm() {
        this.rg.model[this.rg.prop] = this.rg.sel.join(',');
        this.rg.open = false;
      },
      presentOptions(m, prop) {
        return {
          // 真实网站选“至今”后整份表单重新渲染（原来的元素脱离页面），用 key 模拟
          shortcuts: [{ text: '至今', onClick: (picker) => { m[`${prop}THISDAY`] = 0; picker.$emit('pick', new Date()); this.$nextTick(() => this.rerender++); } }],
        };
      },
      openCert(m) {
        this.ct = { open: true, model: m, i: 0 };
      },
      certPick(c) {
        this.ct.model.certificate = c;
        this.ct.open = false;
      },
      openSkill(m) {
        this.sk = { open: true, model: m, a: 0, b: 0 };
      },
      skillLeft(i) {
        if (!SKILLS[i].children.length) {
          this.sk.model.skill_type = SKILLS[i].label;
          this.sk.open = false;
          return;
        }
        this.sk.a = i;
        this.sk.b = 0;
      },
      skillPick(c) {
        this.sk.model.skill_type = c;
        this.sk.open = false;
      },
      deliver() {
        fixture.submitEvents++;
      },
    },
  });

  // 测试读取：编辑中表单的当前值与已保存记录
  Object.defineProperty(fixture, 'values', { enumerable: true, get: () => JSON.parse(JSON.stringify({ ...vm.f, ...vm.n })) });
  Object.defineProperty(fixture, 'records', { enumerable: true, get: () => JSON.parse(JSON.stringify(vm.records)) });
}
