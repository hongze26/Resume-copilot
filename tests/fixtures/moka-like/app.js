// 本地夹具：按公开可见的页面结构重建的“自研组件申请表”（区块 > 记录 > 表单项 > 标题 + 控件）。
// 不含任何网站的代码或样式；类名后缀是随手写的。?plain=1 换成一套中性类名，并把弹层预先渲染、切换显示。
(function () {
  const PLAIN = new URLSearchParams(location.search).has('plain');
  // ?preset=1：第一份实习预先填成“2025 年 1 月 ~ 至今”
  const PRESET = new URLSearchParams(location.search).has('preset');
  const C = PLAIN
    ? { block: 'fm-block', btitle: 'fm-head', fields: 'fm-group', field: 'fm-item', title: 'fm-title', ctrl: 'fm-ctrl', wrap: 'x-wrap', input: 'x-input', select: 'x-select', display: 'x-value', pop: 'x-pop', opt: 'x-opt', range: 'x-range', check: 'x-check' }
    : {
        block: 'apply-block-aa11', btitle: 'blockTitle-bb22', fields: 'apply-fields-cc33', field: 'apply-field-dd44', title: 'title-ee55', ctrl: 'ctrl-ff66',
        wrap: 'sd-Dropdown-container-g1', input: 'sd-Input-container-h2', select: 'sd-Select-container-i3', display: 'sd-Input-display-value-j4', pop: 'sd-Dropdown-dropdown-k5', opt: 'sd-Menu-content-item-l6', range: 'month-range-select-m7', check: 'sd-Checkbox-container-n8',
      };
  const fx = (window.__fixture = { values: {}, submits: 0, plain: PLAIN });
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const YEARS = Array.from({ length: 60 }, (_, i) => String(2035 - i));
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const NATIONS = ['汉族', '满族', '回族', '蒙古族', '藏族', '维吾尔族', '苗族', '壮族', '土家族', '朝鲜族'];
  const SCHOOLS = ['示例财经大学（主校区）', '示例财经学院', '示例商学院大学', '华东示例大学'];
  const MAJORS = ['会计学', '会计', '财务管理', '审计学'];

  let openSelect = null;
  document.addEventListener('mousedown', (e) => {
    if (openSelect && !openSelect.wrap.contains(e.target) && !openSelect.pop.contains(e.target)) openSelect.close();
  });

  /** 自绘下拉。search：输入过滤；remote：输入后 300ms 才给候选，失焦时没从候选里选就清空。 */
  function makeSelect({ opts = [], ph = '请选择', search = false, remote = false, req = false, onChange }) {
    const wrap = el('div', C.wrap);
    const label = el('label', `${C.input} ${C.select}`);
    const disp = el('span', C.display);
    const input = el('input');
    input.type = 'text';
    input.placeholder = ph;
    input.readOnly = !search && !remote;
    input.autocomplete = 'nope';
    label.append(disp, input);
    wrap.append(label);
    const pop = el('div', C.pop);
    pop.style.cssText = 'position:fixed;z-index:50;background:#fff;border:1px solid #bbb;max-height:220px;overflow:auto;min-width:160px';
    const api = { wrap, pop, value: '', disabled: false, close, set };
    let timer;
    function render(list) {
      pop.replaceChildren();
      const menu = el('div', PLAIN ? 'x-menu' : 'sd-Select-menu-o9');
      if (list.length === 0) menu.append(el('div', 'empty-tip', remote ? '没有找到相关内容' : '暂无数据'));
      for (const o of list) {
        const item = el('div', C.opt);
        item.append(el('span', '', o));
        item.addEventListener('click', () => {
          set(o);
          close();
        });
        menu.append(item);
      }
      pop.append(menu);
    }
    function place() {
      const r = label.getBoundingClientRect();
      pop.style.left = r.left + 'px';
      pop.style.top = r.bottom + 2 + 'px';
    }
    function open() {
      if (api.disabled || openSelect === api) return;
      if (openSelect) openSelect.close();
      openSelect = api;
      render(remote ? [] : opts);
      place();
      if (PLAIN) pop.style.display = 'block';
      else wrap.append(pop);
    }
    function close() {
      if (openSelect === api) openSelect = null;
      if (PLAIN) pop.style.display = 'none';
      else pop.remove();
      input.value = '';
      showError(req && !api.value);
    }
    const error = el('div', PLAIN ? 'x-msg x-error' : 'sd-Input-message-p0 sd-Input-error-q1', '必填项未填写');
    error.style.cssText = 'position:absolute;left:0;top:100%;color:#d00;font-size:12px;white-space:nowrap';
    function showError(on) {
      if (on) label.append(error);
      else error.remove();
    }
    function set(v) {
      api.value = v;
      if (v) showError(false);
      disp.textContent = v;
      input.placeholder = v ? '' : ph;
      onChange && onChange(v);
    }
    if (PLAIN) {
      pop.style.display = 'none';
      document.body.append(pop);
    }
    label.addEventListener('mousedown', open);
    input.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (openSelect !== api) open();
      if (!remote) return render(opts.filter((o) => o.includes(q)));
      clearTimeout(timer);
      // 远程候选：名字前两个字相同的都算候选（故意不要求完全相等）
      timer = setTimeout(() => openSelect === api && render(q.length < 2 ? [] : opts.filter((o) => o.slice(0, 2) === q.slice(0, 2))), 300);
    });
    input.addEventListener('blur', () => setTimeout(() => openSelect !== api && (input.value = ''), 150));
    api.setDisabled = (d) => {
      api.disabled = d;
      label.style.opacity = d ? '0.4' : '1';
      input.disabled = d;
      if (d) set('');
    };
    return api;
  }

  function textInput(ph, onChange, tag = 'input') {
    const label = el('label', C.input);
    const input = el(tag);
    if (tag === 'input') input.type = 'text';
    input.placeholder = ph;
    input.addEventListener('input', () => onChange(input.value));
    label.append(input);
    return { label, input };
  }

  /** 年 + 月（count=1）或 起 年月 ~ 止 年月（count=2，可带“至今”）。 */
  function ymControl(count, present, onChange) {
    const box = el('div', C.range);
    const sels = [];
    let now = false;
    const emit = () => {
      const part = (i) => (sels[i].value || sels[i + 1].value ? `${sels[i].value}-${sels[i + 1].value}` : '');
      onChange(count === 1 ? part(0) : part(0) || part(2) || now ? `${part(0)}~${now ? '至今' : part(2)}` : '');
    };
    // 结束那一半（分隔符 + 年 + 月）：勾“至今”后从页面上拿掉，取消后放回（真实页面 2026-11-12 的诊断报告如此）
    const endParts = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        const sep = el('span', 'sep', '-');
        box.append(sep);
        endParts.push(sep);
      }
      for (const [ph, opts] of [['年', YEARS], ['月', MONTHS]]) {
        const s = makeSelect({ opts, ph, onChange: emit });
        sels.push(s);
        box.append(s.wrap);
        if (i > 0) endParts.push(s.wrap);
      }
    }
    if (present) {
      const lab = el('label', C.check);
      const cb = el('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', () => {
        now = cb.checked;
        if (now) {
          sels[2].set('');
          sels[3].set('');
          for (const n of endParts) n.remove();
        } else lab.before(...endParts);
        emit();
      });
      lab.append(cb, el('span', '', '至今'));
      box.append(lab);
      // 网站解析简历后预先填好“某年某月 ~ 至今”
      box.preset = (y, m) => {
        sels[0].set(y);
        sels[1].set(m);
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
      };
    }
    return box;
  }

  function fieldEl(f, key) {
    const item = el('div', `${C.field}${PLAIN ? '' : ` ${f.cls}-zz99`}`);
    const title = el('div', C.title);
    title.append(el('span', '', f.t));
    if (f.req) title.append(el('span', 'required-asterisk', ''));
    const ctrl = el('div', C.ctrl);
    const rec = (v) => (fx.values[key] = v);
    switch (f.type) {
      case 'select':
        ctrl.append(makeSelect({ opts: f.opts, ph: f.ph, search: f.search, req: f.req, onChange: rec }).wrap);
        break;
      case 'search':
        ctrl.append(makeSelect({ opts: f.pool, ph: f.ph, remote: true, onChange: rec }).wrap);
        break;
      case 'ym':
        ctrl.append(ymControl(1, false, rec));
        break;
      case 'ymrange': {
        const box = ymControl(2, f.present, rec);
        ctrl.append(box);
        if (PRESET && key === '实习经历#0.起止时间') box.preset('2025', '1');
        break;
      }
      case 'phone': {
        const row = el('div', 'phone-wrapper');
        const code = makeSelect({ opts: ['+86', '+852', '+1'], ph: '' });
        code.set('+86');
        const t = textInput('请输入手机号', rec);
        row.append(code.wrap, t.label);
        ctrl.append(row);
        break;
      }
      case 'day':
      case 'location': {
        const t = textInput(f.type === 'day' ? f.t : `请输入${f.t}`, rec);
        t.input.readOnly = true;
        ctrl.append(t.label);
        break;
      }
      case 'file': {
        const i = el('input');
        i.type = 'file';
        ctrl.append(el('span', 'upload-btn', '上传'), i);
        break;
      }
      case 'confirm': {
        const lab = el('label', C.check);
        const cb = el('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => rec(cb.checked));
        lab.append(cb, el('span', '', f.text));
        ctrl.append(lab);
        break;
      }
      case 'textarea':
        ctrl.append(textInput(f.ph || '内容', rec, 'textarea').label);
        break;
      default:
        ctrl.append(textInput(f.ph || f.t, rec).label);
    }
    item.append(title, ctrl);
    return item;
  }

  const S = (t, opts, extra = {}) => ({ t, type: 'select', cls: 'select_info', opts, ...extra });
  const T = (t, extra = {}) => ({ t, type: 'text', cls: 'string_info', ...extra });
  const BLOCKS = [
    { title: '个人信息', fields: [
      T('姓名', { req: true }),
      { t: '手机号码', type: 'phone', cls: 'string_info', req: true },
      T('邮箱'),
      S('性别', ['男', '女'], { cls: 'Select', req: true }),
      { t: '出生日期 (年龄)', type: 'day', cls: 'day_info' },
      S('证件类型', ['身份证', '护照', '港澳台通行证', '其他']),
      T('证件号码'),
      S('民族', NATIONS, { cls: 'Select', search: true, ph: '请输入民族' }),
      { t: '籍贯', type: 'location', cls: 'location_info' },
      S('政治面貌', ['中共党员', '中共预备党员', '共青团员', '群众', '其他'], { cls: 'Select', req: true }),
      S('最高学历', ['博士研究生', '硕士研究生', '本科', '大专', '其他'], { cls: 'Select' }),
      { t: '毕业时间', type: 'ym', cls: 'date_info' },
      T('紧急联系人姓名'),
      T('紧急联系人电话'),
    ] },
    { title: '求职意向', fields: [T('期望薪资'), T('期望城市')] },
    { title: '教育背景', multi: true, tip: '请从第一学历开始填起', fields: [
      S('学历', ['博士研究生', '硕士研究生', '本科', '大专'], { cls: 'Select' }),
      S('是否全日制', ['是', '否']),
      { t: '就读时间', type: 'ymrange', cls: 'date_info' },
      { t: '学校名称', type: 'search', cls: 'string_info', ph: '请输入就读学校', pool: SCHOOLS },
      { t: '专业名称', type: 'search', cls: 'string_info', ph: '请输入专业名称', pool: MAJORS },
      S('专业排名', ['前10%', '前20%', '前30%', '前50%', '其他']),
      S('挂科情况', ['未挂科', '挂1科', '挂1-3科', '挂4-6科']),
      { t: '此学历阶段毕业证、学位证', type: 'file', cls: 'file_info' },
    ] },
    { title: '实习经历', multi: true, fields: [
      { t: '起止时间', type: 'ymrange', cls: 'date_info', present: true },
      T('公司名称'),
      T('职位名称'),
      { t: '工作职责', type: 'textarea', cls: 'text_info' },
    ] },
    { title: '项目经验', multi: true, fields: [
      { t: '起止时间', type: 'ymrange', cls: 'date_info', present: true },
      T('项目名称'),
      T('职务'),
      { t: '项目描述', type: 'textarea', cls: 'text_info' },
    ] },
    { title: '语言能力', multi: true, fields: [T('语言类型'), S('语言证书', ['CET-4', 'CET-6', 'TEM-4', 'TEM-8', '雅思', '托福', '其他']), T('外语成绩得分')] },
    { title: '获奖经历', multi: true, fields: [{ t: '获奖时间', type: 'ym', cls: 'date_info' }, T('奖项名称')] },
    { title: '自我描述', fields: [{ t: '自我描述', type: 'textarea', cls: 'text_info', ph: '请输入自我描述' }] },
    { title: '直系亲属信息', multi: true, fields: [S('与本人关系', ['父亲', '母亲', '配偶', '子女']), T('姓名'), T('工作单位'), T('职务')] },
    { title: '其他', fields: [S('是否有亲属在本集团内工作？', ['是', '否']), T('姓名'), T('任职公司'), T('职务'), T('与本人关系')] },
    { title: '本人承诺', fields: [{ t: '本人承诺', type: 'confirm', cls: 'confirm_info', text: '本人所填写和提供的个人信息、证明资料、证件等真实、准确、有效。' }] },
  ];

  const form = document.getElementById('form');
  for (const b of BLOCKS) {
    const block = el('div', C.block);
    const head = el('div', C.btitle);
    head.append(el('span', '', b.title));
    const groups = [];
    const addGroup = () => {
      const g = el('div', C.fields);
      const gi = groups.length;
      for (const f of b.fields) g.append(fieldEl(f, `${b.title}#${gi}.${f.t}`));
      groups.push(g);
      block.append(g);
    };
    if (b.multi) {
      const add = el('span', 'add-btn', '添加');
      add.setAttribute('role', 'button');
      add.addEventListener('click', addGroup);
      head.append(add);
    }
    if (b.tip) head.append(el('div', 'tip', b.tip));
    block.append(head);
    addGroup();
    form.append(block);
  }
  const submit = el('button', 'submit-btn', '预览并提交');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    fx.submits++;
  });
})();
