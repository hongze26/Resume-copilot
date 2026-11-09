// 仿“企业招聘平台·我的简历”（简历中心分页面预填，之后统一投递）。使用真实的 Vue 2 + Element UI。
// 同一份页面分别用 Element UI 1.x（山东高速招聘平台使用 1.4.13）和 2.x 构建：/el1/ 与 /el2/。
// 结构依据：2026-11-08 对 zhaopin.sdhsg.com/#/resume/baseinfo 公开前端的只读核查（未登录）。
// window.__fixture 记录点击保存的次数与保存的数据，供测试断言“工具从不点保存/提交”。

const REGION = [
  { value: '湖南省', label: '湖南省', children: [
    { value: '长沙市', label: '长沙市', children: [{ value: '岳麓区', label: '岳麓区' }, { value: '芙蓉区', label: '芙蓉区' }] },
    { value: '岳阳市', label: '岳阳市', children: [{ value: '岳阳楼区', label: '岳阳楼区' }, { value: '君山区', label: '君山区' }] },
  ] },
  { value: '山东省', label: '山东省', children: [
    { value: '济南市', label: '济南市', children: [{ value: '历下区', label: '历下区' }] },
  ] },
  { value: '北京市', label: '北京市', children: [
    { value: '北京市', label: '北京市', children: [{ value: '海淀区', label: '海淀区' }, { value: '朝阳区', label: '朝阳区' }] },
  ] },
];

const opt = (xs) => xs.map((x) => ({ value: x, label: x }));

export function mount(Vue, ElementUI, major) {
  Vue.use(ElementUI);
  const fixture = { major, saveClicks: 0, submitEvents: 0, values: {}, records: { education: [], work: [] } };
  window.__fixture = fixture;
  document.addEventListener('submit', (e) => {
    fixture.submitEvents++;
    e.preventDefault();
  }, true);

  const BaseInfo = {
    template: `
<div>
  <div class="right_head">基本信息</div>
  <div class="tip">tip:申请职位时会以当前填写的简历快照进行申请，修改简历不会被之前申请的职位看到</div>
  <el-form ref="form" :model="f" label-width="140px" class="base-form">
    <div class="bar1">基本信息</div>
    <el-form-item label="应聘人员类型" required>
      <el-select v-model="f.type" placeholder="请选择"><el-option v-for="o in types" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select>
    </el-form-item>
    <el-form-item label="姓名" required><el-input v-model="f.name" disabled></el-input></el-form-item>
    <el-form-item label="曾用名"><el-input v-model="f.usedName"></el-input></el-form-item>
    <el-form-item label="性别">
      <el-radio-group v-model="f.gender"><el-radio label="1">男</el-radio><el-radio label="2">女</el-radio></el-radio-group>
    </el-form-item>
    <el-form-item label="出生日期" required>
      <el-date-picker v-model="f.birth" type="date" placeholder="选择日期" format="yyyy-MM-dd"></el-date-picker>
    </el-form-item>
    <el-form-item label="民族" required>
      <el-select v-model="f.ethnicity" filterable placeholder="请选择"><el-option v-for="o in ethnicities" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select>
    </el-form-item>
    <el-form-item label="籍贯" required>
      <el-cascader v-model="f.native" :options="region" placeholder="请选择"></el-cascader>
    </el-form-item>
    <el-form-item label="户口所在地" required>
      <el-cascader v-model="f.hukou" :options="region" placeholder="请选择"></el-cascader>
    </el-form-item>
    <el-form-item label="政治面貌" required>
      <el-select v-model="f.politics" placeholder="请选择"><el-option v-for="o in politics" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select>
    </el-form-item>
    <el-form-item label="婚姻状况">
      <el-select v-model="f.marital" placeholder="请选择"><el-option v-for="o in maritals" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select>
    </el-form-item>
    <el-form-item label="全日制最高学历" required>
      <el-select v-model="f.highest" placeholder="请选择"><el-option v-for="o in levels" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select>
    </el-form-item>
    <el-form-item label="个人评价"><el-input type="textarea" :rows="3" v-model="f.selfEval" placeholder="请输入内容"></el-input></el-form-item>
    <div class="bar1">联系方式(笔试、面试等信息会通过以下联系方式进行通知，请仔细填写并核对)</div>
    <el-form-item label="联系电话"><el-input v-model="f.mobile" disabled></el-input></el-form-item>
    <el-form-item label="联系邮箱"><el-input v-model="f.email"></el-input></el-form-item>
    <el-form-item label="紧急联系人"><el-input v-model="f.emergency"></el-input></el-form-item>
    <el-form-item label="家庭地址"><el-input v-model="f.address"></el-input></el-form-item>
    <div class="bar1">工作技能</div>
    <el-form-item label="第一外语"><el-input v-model="f.lang"></el-input></el-form-item>
    <div class="bar1">其他</div>
    <el-form-item label="参加工作日期"><el-date-picker v-model="f.workStart" type="date" placeholder="选择日期"></el-date-picker></el-form-item>
    <el-form-item label="现任单位"><el-input v-model="f.company"></el-input></el-form-item>
    <el-form-item>
      <el-button @click="reset">清空</el-button>
      <el-button type="primary" id="save-base" @click="save">保 存</el-button>
    </el-form-item>
  </el-form>
</div>`,
    data() {
      return {
        f: { type: '', name: '林示例', usedName: '', gender: '', birth: '', ethnicity: '', native: [], hukou: [], politics: '', marital: '', highest: '', selfEval: '', mobile: '13900000000', email: '', emergency: '', address: '', lang: '', workStart: '', company: '' },
        types: opt(['社会招聘', '校园招聘', '内部招聘']),
        ethnicities: opt(['汉族', '回族', '满族', '蒙古族', '壮族', '土家族']),
        politics: opt(['中共党员', '中共预备党员', '共青团员', '民主党派', '群众']),
        maritals: opt(['未婚', '已婚', '离异', '丧偶']),
        levels: opt(['博士研究生', '硕士研究生', '大学本科', '大学专科', '高中及以下']),
        region: REGION,
      };
    },
    watch: {
      f: { deep: true, handler(v) { fixture.values.base = JSON.parse(JSON.stringify(v)); } },
    },
    methods: {
      reset() { Object.keys(this.f).forEach((k) => { if (k !== 'name' && k !== 'mobile') this.f[k] = Array.isArray(this.f[k]) ? [] : ''; }); },
      save() { fixture.saveClicks++; this.$message({ message: '保存成功', type: 'success' }); },
    },
  };

  const recordPage = (kind, title, formTpl, empty, columns) => ({
    template: `
<div>
  <div class="right_head">${title}</div>
  <div class="list-head"><span class="bar1">${title}</span><el-button type="primary" size="small" class="add-btn" @click="add">添加</el-button></div>
  <table class="record-table">
    <thead><tr>${columns.map((c) => `<th>${c[1]}</th>`).join('')}<th>操作</th></tr></thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="i">${columns.map((c) => `<td>{{ r.${c[0]} }}</td>`).join('')}<td><a href="javascript:;" @click="edit(i)">编辑</a></td></tr>
      <tr v-if="rows.length === 0"><td colspan="${columns.length + 1}">暂无数据</td></tr>
    </tbody>
  </table>
  <el-dialog title="${title}" :visible.sync="show" size="small" width="640px">
    <el-form :model="f" label-width="110px" class="dialog-form">${formTpl}</el-form>
    <span slot="footer" class="dialog-footer">
      <el-button @click="show = false">取 消</el-button>
      <el-button type="primary" class="dialog-save" @click="save">保 存</el-button>
    </span>
  </el-dialog>
</div>`,
    data() {
      return { show: false, f: JSON.parse(JSON.stringify(empty)), rows: fixture.records[kind], editing: -1, levels: opt(['博士研究生', '硕士研究生', '大学本科', '大学专科']), modes: opt(['全日制', '非全日制']) };
    },
    watch: {
      f: { deep: true, handler(v) { fixture.values[kind] = JSON.parse(JSON.stringify(v)); } },
    },
    methods: {
      add() { this.editing = -1; this.f = JSON.parse(JSON.stringify(empty)); this.show = true; },
      edit(i) { this.editing = i; this.f = JSON.parse(JSON.stringify(this.rows[i])); this.show = true; },
      save() {
        fixture.saveClicks++;
        const row = JSON.parse(JSON.stringify(this.f));
        if (this.editing >= 0) this.rows.splice(this.editing, 1, row);
        else this.rows.push(row);
        this.show = false;
      },
    },
  });

  const fmtMonth = (d) => (d ? `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, '0')}` : '');
  const Edu = recordPage(
    'education',
    '教育背景',
    `
      <el-form-item label="学校名称" required><el-input v-model="f.school"></el-input></el-form-item>
      <el-form-item label="学历" required><el-select v-model="f.level" placeholder="请选择"><el-option v-for="o in levels" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select></el-form-item>
      <el-form-item label="专业" required><el-input v-model="f.major"></el-input></el-form-item>
      <el-form-item label="入学时间" required><el-date-picker v-model="f.start" type="month" placeholder="选择月"></el-date-picker></el-form-item>
      <el-form-item label="毕业时间" required><el-date-picker v-model="f.end" type="month" placeholder="选择月"></el-date-picker></el-form-item>
      <el-form-item label="学习形式"><el-select v-model="f.mode" placeholder="请选择"><el-option v-for="o in modes" :key="o.value" :label="o.label" :value="o.value"></el-option></el-select></el-form-item>`,
    { school: '', level: '', major: '', start: '', end: '', mode: '' },
    [['school', '学校名称'], ['level', '学历'], ['major', '专业']],
  );
  const Work = recordPage(
    'work',
    '工作履历',
    `
      <el-form-item label="单位名称" required><el-input v-model="f.company"></el-input></el-form-item>
      <el-form-item label="职位" required><el-input v-model="f.title"></el-input></el-form-item>
      <el-form-item label="起止时间" required><el-date-picker v-model="f.period" type="daterange" placeholder="选择日期范围"></el-date-picker></el-form-item>
      <el-form-item label="工作内容"><el-input type="textarea" :rows="3" v-model="f.desc"></el-input></el-form-item>`,
    { company: '', title: '', period: [], desc: '' },
    [['company', '单位名称'], ['title', '职位']],
  );

  const routes = { '/resume/baseinfo': BaseInfo, '/resume/addResumeEdu': Edu, '/resume/addResumeWork': Work };
  fixture.fmtMonth = fmtMonth;

  new Vue({
    el: '#app',
    data: { path: location.hash.slice(1) || '/resume/baseinfo' },
    computed: { view() { return routes[this.path] || BaseInfo; } },
    created() { window.addEventListener('hashchange', () => { this.path = location.hash.slice(1) || '/resume/baseinfo'; }); },
    template: `
<div class="layout">
  <div class="el-card left_menu"><div class="el-card__body">
    <div class="menu-title">个人中心</div>
    <ul class="option_list">
      <li><a href="#/resume/baseinfo" :class="{ 'router-link-exact-active router-link-active': path === '/resume/baseinfo' }">基本信息(必填)</a></li>
      <li><a href="#/resume/addResumeEdu" :class="{ 'router-link-exact-active router-link-active': path === '/resume/addResumeEdu' }">教育背景(必填)</a></li>
      <li><a href="#/resume/addResumeWork" :class="{ 'router-link-exact-active router-link-active': path === '/resume/addResumeWork' }">工作履历(必填)</a></li>
      <li><a href="#/resume/addResumeUpload">附件上传(必填)</a></li>
    </ul>
  </div></div>
  <div class="el-card right_menu"><div class="el-card__body"><div class="right_con"><component :is="view" :key="path"></component></div></div></div>
  <div class="chat-widget"><iframe src="http://localhost:4173/el-like/frame.html" title="在线客服"></iframe></div>
</div>`,
  });
}
