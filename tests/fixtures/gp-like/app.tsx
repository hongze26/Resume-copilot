// 本地夹具：按 basic-info 材料自行重建的“国聘申请简历页”同结构表单（React 18 + antd 5）。
// 只复用字段名、选项和结构，不复制国聘的 CSS/JS。
// 测试接口：window.__fixture（保存点击数、submit 次数、各表单的 React 状态、已保存记录）。
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Cascader, ConfigProvider, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Upload, Button } from 'antd';
import type { CascaderProps } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

const params = new URLSearchParams(location.search);
const VARIANT = params.get('variant') ?? '';
const PREFILL = params.has('prefill');

type Fx = {
  saveClicks: number;
  cancelClicks: number;
  submitEvents: number;
  values: Record<string, unknown>;
  records: Record<string, Array<Record<string, unknown>>>;
  remoteSearches: number;
};
const fx: Fx = { saveClicks: 0, cancelClicks: 0, submitEvents: 0, values: {}, records: {}, remoteSearches: 0 };
(window as unknown as { __fixture: Fx }).__fixture = fx;
document.addEventListener('submit', () => fx.submitEvents++, true);

// ---------------- 选项（来自材料截图） ----------------

const EDU_LEVELS = VARIANT === 'ambiguous' ? ['博士', '研究生', '本科', '专科'] : ['博士', '硕士', '本科', '专科', '高中', '中专/中技', '初中及以下'];
const YES_NO = ['是', '否'];
const ADMISSION = ['统招', '非统招', '非内地院校'];
const SCHOOL_SYSTEM = Array.from({ length: 16 }, (_, i) => `${(i + 1) / 2}年`);
const COMPANY_NATURE = ['国企', '民营企业', '事业单位', '上市公司', '中外合资', '外商独资', '民办非企业', '非营利组织', '政府机关', '社会团体', '其他'];
const WORK_KIND = ['全职', '兼职', '实习'];
const ENGLISH_CERTS = ['大学英语四级CET4', '大学英语六级CET6', '雅思IELTS', '托福TOEFL', 'GRE美国研究生入学考试', 'GMAT商科研究生入学考试', 'CATTI翻译专业资格(水平)认证考试', '英语专业四级TEM4', '英语专业八级TEM8', '其他'];
const POLITICAL = ['中共党员', '中共预备党员', '共青团员', '民主党派', '无党派人士', '群众'];
const MARRIAGE = ['未婚', '已婚', '离异', '丧偶'];
const COUNTRIES = ['中国', '中国香港', '中国澳门', '中国台湾', '美国', '英国', '日本', '韩国', '新加坡', '澳大利亚', '加拿大', '德国', '法国', '其他'];
const NATIONS = ['汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族', '满族', '侗族', '瑶族', '白族', '土家族', '哈尼族', '哈萨克族', '傣族', '黎族', '傈僳族', '佤族', '畲族', '高山族', '拉祜族', '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族', '其他'];
const PROVINCES = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川'];
const MAJOR_CATEGORIES: Record<string, string[]> = {
  本科: ['本科（普通教育）/ 法学 / 法学类', '本科（普通教育）/ 经济学 / 经济学类', '本科（普通教育）/ 管理学 / 工商管理类', '本科（普通教育）/ 管理学 / 公共管理类', '本科（普通教育）/ 工学 / 计算机类'],
  硕士: ['研究生 / 管理学 / 工商管理类', '研究生 / 经济学 / 应用经济学', '研究生 / 法学 / 法学'],
  研究生: ['研究生 / 管理学 / 工商管理类', '研究生 / 经济学 / 应用经济学'],
  博士: ['研究生 / 管理学 / 工商管理类'],
};
const MAJORS: Record<string, string[]> = {
  工商管理类: ['会计学', '财务管理', '工商管理', '审计学', '会计'],
  经济学类: ['经济学', '国际经济与贸易'],
  法学类: ['法学'],
};
const SCHOOLS = ['示例财经大学', '示例财经大学（分校）', '示例商学院大学', '示例理工大学', '示例师范大学'];

// 三级省市区，异步加载下一级
const REGION_TREE: Record<string, Record<string, string[]>> = {
  北京市: { 北京市: ['海淀区', '朝阳区', '东城区'] },
  上海市: { 上海市: ['浦东新区', '徐汇区', '黄浦区'] },
  湖南省: { 长沙市: ['岳麓区', '芙蓉区'], 岳阳市: ['岳阳楼区', '君山区'] },
  广东省: { 广州市: ['天河区', '越秀区'], 深圳市: ['南山区', '福田区'] },
};

type Opt = { value: string; label: string; isLeaf?: boolean; children?: Opt[]; loading?: boolean };

function useRegionOptions() {
  const [options, setOptions] = useState<Opt[]>(Object.keys(REGION_TREE).map((p) => ({ value: p, label: p, isLeaf: false })));
  const loadData: CascaderProps<Opt>['loadData'] = (selected) => {
    const target = selected[selected.length - 1];
    setTimeout(() => {
      if (selected.length === 1) {
        target.children = Object.keys(REGION_TREE[target.value]).map((c) => ({ value: c, label: c, isLeaf: false }));
      } else {
        target.children = REGION_TREE[selected[0].value][target.value].map((d) => ({ value: d, label: d, isLeaf: true }));
      }
      setOptions((o) => [...o]);
    }, 250);
  };
  return { options, loadData };
}

const opts = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

// ---------------- 区块外壳 ----------------

function SectionShell(props: { id: string; title: string; required?: boolean; op: '添加' | '编辑'; onOp?: () => void; children?: React.ReactNode; tip?: string }) {
  return (
    <div id={props.id} className="item-section">
      <div>
        <div className="section-title">
          <div className="section-title-container">
            <div className="section-title-content">
              <div className="title-info">
                <h2>{props.title}</h2>
                {props.required ? <span className="ant-tag required-tag">（必填）</span> : null}
              </div>
              <div className="title-operation">
                <span className="op-btn" onClick={props.onOp}>
                  <span className="op-icon">{props.op === '添加' ? '⊕' : '✎'}</span> <span>{props.op}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="description-and-example">
          <div className="empty-tip">
            <span className="description">{props.tip ?? `填写${props.title}的相关信息，让大家更了解你！`}</span>
          </div>
        </div>
        <div className="item-section-content item-section-content-multiple">{props.children}</div>
      </div>
    </div>
  );
}

function EditSection(props: { name: string; form: ReturnType<typeof Form.useForm>[0]; onSave: (v: Record<string, unknown>) => void; onCancel: () => void; children: React.ReactNode; initial?: Record<string, unknown> }) {
  return (
    <div id="edit-section" className={`edit-section ${props.name}-edit-section`}>
      <p id="edit-section-location">定位使用</p>
      <Form
        form={props.form}
        layout="vertical"
        initialValues={props.initial}
        onValuesChange={(_, all) => {
          fx.values[props.name] = JSON.parse(JSON.stringify(all));
        }}
        onFinish={(v) => props.onSave(v as Record<string, unknown>)}
      >
        {props.children}
        <div className="edit-btn-group">
          <Button
            className="btn cancel-btn"
            onClick={() => {
              fx.cancelClicks++;
              props.onCancel();
            }}
          >
            取 消
          </Button>
          <Button type="primary" htmlType="submit" className="btn submit-btn" onClick={() => fx.saveClicks++}>
            保 存
          </Button>
        </div>
      </Form>
    </div>
  );
}

const req = (label: string) => [{ required: true, message: `${label}缺失` }];

function fmtMonth(v: unknown): string {
  if (!v || !dayjs.isDayjs(v)) return '';
  return v.year() === 2099 ? '至今' : v.format('YYYY.MM');
}

// ---------------- 重复区块 ----------------

function useRecords(key: string) {
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const add = (r: Record<string, unknown>) => {
    const ser = JSON.parse(JSON.stringify(r));
    setRecords((x) => {
      const next = [...x, ser];
      fx.records[key] = next;
      return next;
    });
  };
  return { records, add };
}

function RecordList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((t, i) => (
        <div className="record-item" key={i}>
          <div className="record-main">{t}</div>
        </div>
      ))}
    </>
  );
}

function EducationSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { records, add } = useRecords('education');
  const level = Form.useWatch('education', form) as string | undefined;
  const category = Form.useWatch('major_category', form) as string | undefined;
  const [schoolOpts, setSchoolOpts] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const region = useRegionOptions();
  void region;
  const majorCats = MAJOR_CATEGORIES[level ?? ''] ?? [];
  const majors = useMemo(() => {
    const last = (category ?? '').split('/').pop()?.trim() ?? '';
    return MAJORS[last] ?? [];
  }, [category]);
  const onSchoolSearch = (q: string) => {
    fx.remoteSearches++;
    setSearching(VARIANT !== 'debounced-search');
    setTimeout(() => {
      setSchoolOpts(q ? SCHOOLS.filter((s) => s.includes(q)) : []);
      setSearching(false);
    }, VARIANT === 'debounced-search' ? 900 : 400);
  };
  return (
    <SectionShell id="education" title="教育经历" required op="添加" onOp={() => setOpen(true)} tip="请逐段填写高中以上的全部教育经历">
      <RecordList items={records.map((r) => `${r.school_cn ?? ''} ${r.education ?? ''} ${r.period_text ?? ''} ${r.major ?? ''}`)} />
      {open ? (
        <EditSection
          name="education"
          form={form}
          onCancel={() => {
            form.resetFields();
            setOpen(false);
          }}
          onSave={(v) => {
            const p = v.period as [Dayjs, Dayjs];
            add({ ...v, school_cn: v.school, period_text: `${fmtMonth(p[0])}-${fmtMonth(p[1])}` });
            form.resetFields();
            fx.values.education = {};
            setOpen(false);
          }}
        >
          <Form.Item className="resume-common-form-item select-education" label="学历" name="education" rules={req('学历')}>
            <Select showSearch allowClear placeholder="请选择学历" options={opts(EDU_LEVELS)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item checkbox-skip_edu" label="是否涉及该段学历（非本硕连读等情况请勾选有）" name="skip_edu" rules={req('是否涉及该段学历')}>
            <Radio.Group className="radio-num-2" optionType="button" options={[{ value: 'true', label: '本人不涉及该段学历' }, { value: 'false', label: '本人有该段学历' }]} />
          </Form.Item>
          {level === '本科' ? (
            <>
              <Form.Item className="resume-common-form-item" label="是否专升本" name="biz_zsb7Q2" rules={req('是否专升本')}>
                <Select showSearch allowClear placeholder="请选择是否专升本" options={opts(YES_NO)} />
              </Form.Item>
              <Form.Item className="resume-common-form-item" label="是否有双学位" name="biz_sxw9K1" rules={req('是否有双学位')}>
                <Select showSearch allowClear placeholder="请选择是否有双学位" options={opts(YES_NO)} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item className="resume-common-form-item select-biz_sC7kZ73FAM" label="统招" name="biz_sC7kZ73FAM" rules={req('统招')}>
            <Select showSearch allowClear placeholder="请选择统招" options={opts(ADMISSION)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item radio-is_fulltime" label="全日制" name="is_fulltime" rules={req('全日制')}>
            <Radio.Group optionType="button" options={[{ value: 1, label: '全日制' }, { value: 0, label: '非全日制' }]} />
          </Form.Item>
          <Form.Item className="resume-common-form-item rangepicker-period" label="就读年月" name="period" rules={req('就读年月')}>
            <DatePicker.RangePicker picker="month" placeholder={['开始时间', '结束时间']} />
          </Form.Item>
          <Form.Item
            className="resume-common-form-item form-item-autocomplete-field autocomplete-school_cn flex-wrap"
            label={
              <>
                学校名称<span className="tip">（此处仅填写完整学校名称，方便用人单位搜索）</span>
              </>
            }
            name="school"
            rules={req('学校名称')}
          >
            <Select
              id="school-fe-1601-customization"
              showSearch
              allowClear
              filterOption={false}
              placeholder="请输入学校名称"
              onSearch={onSchoolSearch}
              loading={searching}
              notFoundContent={searching ? '搜索中…' : null}
              options={opts(schoolOpts)}
            />
          </Form.Item>
          <Form.Item className="resume-common-form-item cascader-major_category" label="专业分类" name="major_category" rules={req('专业分类')}>
            <Select showSearch allowClear placeholder="请选择专业分类" options={opts(majorCats)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item form-item-autocomplete-field autocomplete-major_cn flex-wrap" label={<>专业名称</>} name="major" rules={req('专业名称')}>
            <Select id="major-fe-1601-customization" showSearch allowClear placeholder="请选择专业名称" options={opts(majors)} />
          </Form.Item>
          {level === '硕士' || level === '博士' || level === '研究生' ? (
            <Form.Item className="resume-common-form-item" label="研究方向" name="research" rules={req('研究方向')}>
              <Input placeholder="研究生请填写研究方向" />
            </Form.Item>
          ) : null}
          <Form.Item className="resume-common-form-item input-gpa_score" label="成绩（GPA）" name="gpa_score" rules={req('成绩（GPA）')}>
            <Input placeholder="请填写成绩（GPA）" />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-school_system" label="学制" name="school_system" rules={req('学制')}>
            <Select showSearch allowClear placeholder="请选择学制" options={opts(SCHOOL_SYSTEM)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-biz_6TQ8M4OkGL" label="是否是学生干部" name="biz_6TQ8M4OkGL" rules={req('是否是学生干部')}>
            <Select showSearch allowClear placeholder="请选择是否是学生干部" options={opts(YES_NO)} />
          </Form.Item>
          <div className="textarea-container one-line">
            <Form.Item className="resume-common-form-item resume-common-form-line-item textarea-experience" label="在校经历" name="experience" rules={req('在校经历')}>
              <Input.TextArea rows={5} showCount maxLength={1000} allowClear placeholder="1.在校担任职务…\n2. 获得荣誉…\n3. 所学主要课程…" />
            </Form.Item>
          </div>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

function PresentPicker(props: { id: string; value?: Dayjs; onChange?: (v: Dayjs | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <DatePicker
      id={props.id}
      picker="month"
      placeholder="结束时间"
      open={open}
      onOpenChange={setOpen}
      value={props.value}
      format={(v) => (v.year() === 2099 ? '至今' : v.format('YYYY-MM'))}
      onChange={(v) => props.onChange?.(v)}
      renderExtraFooter={() => (
        <a
          className="present-btn"
          onClick={() => {
            // 先关闭面板，再写入“至今”（rc-picker 关闭时会提交面板内部值）
            setOpen(false);
            setTimeout(() => props.onChange?.(dayjs('2099-12-31')), 0);
          }}
        >
          至今
        </a>
      )}
    />
  );
}

/**
 * 仿真国聘“结束时间”三件套（basic-info/项目经历.html）：
 * 隐藏的 period_end + 只读显示框 period_end_input（带清除与日历图标）+ 视觉上隐藏的 period_end_picker。
 * 点显示框时打开日期面板；variant=endfallback 时显示框不响应点击，只能通过面板输入框打开。
 */
function RealEndPicker(props: { value?: Dayjs | null; onChange?: (v: Dayjs | null) => void }) {
  const [open, setOpen] = useState(false);
  const v = props.value ?? null;
  const shown = v ? (v.year() === 2099 ? '至今' : v.format('YYYY-MM')) : '';
  const fallback = VARIANT === 'endfallback';
  return (
    <div className="ant-form-item period-item period-end" style={{ position: 'relative', display: 'inline-block', margin: 0 }}>
      <div className="ant-form-item ant-form-item-hidden" style={{ display: 'none' }}>
        <input id="period_end" className="ant-input" type="text" value={shown} readOnly />
      </div>
      <div className="ant-form-item period-end-temp" style={{ margin: 0 }}>
        <Input
          id="period_end_input-fe-1601-customization"
          readOnly
          placeholder="结束时间"
          value={shown}
          allowClear
          suffix={<span role="img" aria-label="calendar" className="anticon anticon-calendar">📅</span>}
          onClick={() => {
            if (!fallback) setOpen(true);
          }}
          onChange={(e) => {
            if (!e.target.value) props.onChange?.(null);
          }}
        />
      </div>
      <div className="ant-form-item period-end-date" style={fallback ? { margin: 0 } : { position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0, overflow: 'hidden', margin: 0 }}>
        <DatePicker
          id="period_end_picker-fe-1601-customization"
          picker="month"
          placeholder="结束时间"
          open={open}
          onOpenChange={setOpen}
          value={v}
          onChange={(d) => {
            props.onChange?.(d);
            setOpen(false);
          }}
          renderExtraFooter={() => (
            <a
              className="present-btn"
              onClick={() => {
                setOpen(false);
                setTimeout(() => props.onChange?.(dayjs('2099-12-31')), 0);
              }}
            >
              至今
            </a>
          )}
        />
      </div>
    </div>
  );
}

function WorkSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { records, add } = useRecords('work');
  const region = useRegionOptions();
  return (
    <SectionShell id="work" title="工作/实习经历" op="添加" onOp={() => setOpen(true)}>
      <RecordList items={records.map((r) => `${r.company_name ?? ''} ${r.job_name ?? ''} ${r.start_text ?? ''}-${r.end_text ?? ''}`)} />
      {open ? (
        <EditSection
          name="work"
          form={form}
          onCancel={() => {
            form.resetFields();
            setOpen(false);
          }}
          onSave={(v) => {
            add({ ...v, start_text: fmtMonth(v.period_start), end_text: fmtMonth(v.period_end) });
            form.resetFields();
            fx.values.work = {};
            setOpen(false);
          }}
        >
          <Form.Item className="resume-common-form-item input-company_name" label="单位名称" name="company_name" rules={req('单位名称')}>
            <Input placeholder="请填写单位名称" />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-company_nature" label="单位性质" name="company_nature" rules={req('单位性质')}>
            <Select showSearch allowClear placeholder="请选择单位性质" options={opts(COMPANY_NATURE)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-job_name" label="职位名称" name="job_name" rules={req('职位名称')}>
            <Input placeholder="请填写职位名称" />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-employee_type" label="工作性质" name="employee_type" rules={req('工作性质')}>
            <Select showSearch allowClear placeholder="请选择工作性质" options={opts(WORK_KIND)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item rangepicker-period" label="在职时间" required>
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item className="period-item" name="period_start" rules={req('开始时间')} noStyle>
                <DatePicker id="period_start" picker="month" placeholder="开始时间" />
              </Form.Item>
              <Form.Item name="period_end" rules={req('结束时间')} noStyle>
                {VARIANT === 'simple-end' ? <PresentPicker id="period_end_picker-fe-1601-customization" /> : <RealEndPicker />}
              </Form.Item>
            </div>
          </Form.Item>
          <Form.Item className="resume-common-form-item textarea-introduction" label="工作内容" name="introduction" rules={req('工作内容')}>
            <Input.TextArea rows={4} showCount maxLength={1000} placeholder="请清晰、简单的描述您的工作内容，重点突出工作业绩" />
          </Form.Item>
          <Form.Item className="resume-common-form-item flex-wrap" label="工作地区" name="location" rules={req('工作地区')}>
            <Cascader id="location-fe-1601-customization" changeOnSelect placeholder="请选择工作地区" options={region.options} loadData={region.loadData} />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-other_description" label="补充说明" name="other_description">
            <Input placeholder="请填写补充说明" />
          </Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

function ProjectSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { records, add } = useRecords('projects');
  return <SectionShell id="project" title="项目经历" op="添加" onOp={() => setOpen(true)}>
    <RecordList items={records.map((r) => String(r.project_name))} />
    {open ? <EditSection name="projects" form={form} onCancel={() => { form.resetFields(); setOpen(false); }} onSave={(v) => { add(v); form.resetFields(); setOpen(false); }}>
      <Form.Item label="项目名称" name="project_name" rules={req('项目名称')}><Input /></Form.Item>
      <Form.Item label="项目角色" name="role" rules={req('项目角色')}><Input /></Form.Item>
      <Form.Item label="所在单位" name="company_name"><Input /></Form.Item>
      <Form.Item className="rangepicker-period" label="起止时间" required>
        <Form.Item name="period_start" noStyle><DatePicker id="period_start" picker="month" placeholder="开始时间" /></Form.Item>
        <Form.Item name="period_end" noStyle>{VARIANT === 'simple-end' ? <PresentPicker id="period_end_picker-fe-1601-customization" /> : <RealEndPicker />}</Form.Item>
      </Form.Item>
      <Form.Item label="团队规模" name="teams_scale"><Select options={opts(['1-5人', '6-10人'])} /></Form.Item>
      <Form.Item label="项目介绍" name="introduction" rules={req('项目介绍')}><Input.TextArea /></Form.Item>
      <Form.Item label="项目职责" name="duty" rules={req('项目职责')}><Input.TextArea /></Form.Item>
      <Form.Item label="项目成果" name="achievement"><Input.TextArea /></Form.Item>
    </EditSection> : null}
  </SectionShell>;
}

function LanguageSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { records, add } = useRecords('languages');
  return (
    <SectionShell id="english" title="英语能力" required op="添加" onOp={() => setOpen(true)}>
      <RecordList items={records.map((r) => `${r.biz_KlznUxBiS5 ?? ''} ${r.biz_OzLemw6HvG ?? ''}`)} />
      {open ? (
        <EditSection
          name="languages"
          form={form}
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            add(v);
            form.resetFields();
            setOpen(false);
          }}
        >
          <Form.Item className="resume-common-form-item select-biz_KlznUxBiS5" label="证书名称" name="biz_KlznUxBiS5" rules={req('证书名称')}>
            <Select showSearch allowClear placeholder="请选择证书名称" options={opts(ENGLISH_CERTS)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-biz_OzLemw6HvG" label="成绩" name="biz_OzLemw6HvG" rules={req('成绩')}>
            <Input placeholder="请填写成绩" />
          </Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

// ---------------- 单表单区块 ----------------

function BasicSection() {
  const [open, setOpen] = useState(PREFILL);
  const [form] = Form.useForm();
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const region = useRegionOptions();
  const initial = {
    full_name: '林示例',
    gender: 'female',
    birthdate: dayjs('2003-05-01'),
    'telephone-x9': '139****0000',
    identified_type: '居民身份证',
    'identified_number-x9': '999***********0000',
    ...(PREFILL ? { email: 'keep.me@example.com' } : {}),
  };
  return (
    <SectionShell id="basic_info" title="基本信息" required op="编辑" onOp={() => setOpen(true)}>
      {saved && !open ? <div className="record-item basic-summary">{String(saved.email ?? '')}</div> : null}
      {open ? (
        <EditSection
          name="basic"
          form={form}
          initial={initial}
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            setSaved(v);
            fx.records.basic = [JSON.parse(JSON.stringify(v))];
            setOpen(false);
          }}
        >
          <Form.Item className="resume-common-form-item" label="上传照片" name="avatar">
            <Upload listType="picture-card" beforeUpload={() => false}>
              <div>上传</div>
            </Upload>
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="姓名" name="full_name">
            <Input disabled placeholder="请填写真实姓名" />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="性别" name="gender">
            <Radio.Group disabled optionType="button" options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="出生日期" name="birthdate">
            <DatePicker disabled placeholder="请选择出生日期" />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-telephone" label="手机号" name="telephone-x9">
            <Input disabled id="telephone-ab12cd34" />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="邮箱" name="email" rules={req('邮箱')}>
            <Input placeholder="请填写邮箱" maxLength={60} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="证件类型" name="identified_type">
            <Select disabled showSearch options={opts(['居民身份证', '护照'])} />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-identified_number" label="证件号" name="identified_number-x9">
            <Input disabled id="identified_number-ab12cd34" />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="国籍" name="country" rules={req('国籍')}>
            <Select showSearch allowClear placeholder="请选择国籍" options={opts(COUNTRIES)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="现居住地" name="location" rules={req('现居住地')}>
            <Cascader id="location-fe-1601-customization" placeholder="请选择现居住地" options={region.options} loadData={region.loadData} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="户口所在地" name="hukou" rules={req('户口所在地')}>
            <Cascader id="hukou-fe-1601-customization" placeholder="请选择户口所在地" options={region.options} loadData={region.loadData} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="籍贯" name="family_home" rules={req('籍贯')}>
            <Cascader id="family_home-fe-1601-customization" changeOnSelect placeholder="请选择籍贯" options={region.options} loadData={region.loadData} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="民族" name="nation" rules={req('民族')}>
            <Select showSearch allowClear placeholder="请选择民族" options={opts(NATIONS)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="政治面貌" name="political" rules={req('政治面貌')}>
            <Select showSearch allowClear placeholder="请选择政治面貌" options={opts(POLITICAL)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-marriage" label="婚姻状况" name="marriage">
            <Select showSearch allowClear placeholder="请选择婚姻状况" options={opts(MARRIAGE)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="最高学历毕业院校所属地区" name="biz_jXdEQlfwRU" rules={req('最高学历毕业院校所属地区')}>
            <Select showSearch allowClear placeholder="请选择最高学历毕业院校所属地区" options={opts(PROVINCES)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="最早可参加实习时间" name="biz_xWrGBR9LjR" rules={req('最早可参加实习时间')}>
            <DatePicker placeholder="请选择最早可参加实习时间" />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="紧急联系人姓名" name="contact_name" rules={req('紧急联系人姓名')}>
            <Input placeholder="请填写紧急联系人姓名" />
          </Form.Item>
          <Form.Item className="resume-common-form-item" label="紧急联系人电话" name="contact_telephone" rules={req('紧急联系人电话')}>
            <Input placeholder="请填写紧急联系人电话" />
          </Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

function IntentionSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <SectionShell id="intention" title="求职意向" required op="编辑" onOp={() => setOpen(true)}>
      {open ? (
        <EditSection name="intention" form={form} onCancel={() => setOpen(false)} onSave={() => setOpen(false)}>
          <Form.Item className="resume-common-form-item flex-wrap" label="期望工作城市" name="biz_Nc7ALejg3J" rules={req('期望工作城市')}>
            <Input readOnly placeholder="请填写期望工作城市" />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-number-biz_iKDY5E10uA" label="最低薪资（元/月）" name="biz_iKDY5E10uA" rules={req('最低薪资')}>
            <InputNumber precision={0} placeholder="请填写最低薪资（元/月）（整数）" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item className="resume-common-form-item input-number-biz_Ksd7n3QZHt" label="最高薪资（元/月）" name="biz_Ksd7n3QZHt" rules={req('最高薪资')}>
            <InputNumber precision={0} placeholder="请填写最高薪资（元/月）（整数）" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-biz_v9tuVxSj8f" label="是否接受岗位调剂" name="biz_v9tuVxSj8f" rules={req('是否接受岗位调剂')}>
            <Select showSearch allowClear placeholder="请选择是否接受岗位调剂" options={opts(YES_NO)} />
          </Form.Item>
          <Form.Item className="resume-common-form-item select-biz_D96MeJrh3G" label="是否接受单位调剂" name="biz_D96MeJrh3G" rules={req('是否接受单位调剂')}>
            <Select showSearch allowClear placeholder="请选择是否接受单位调剂" options={opts(YES_NO)} />
          </Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

const HONOR_LEVELS = ['国际级', '国家级', '省部级', '地市级', '企业级', '学校级', '院系级', '其他'];
const HONOR_GRADES = ['特等奖', '一等奖', '二等奖', '三等奖', '其他'];

function HonorSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { records, add } = useRecords('honors');
  return (
    <SectionShell id="honor" title="荣誉奖励" op="添加" onOp={() => setOpen(true)}>
      <RecordList items={records.map((r) => String(r.name ?? ''))} />
      {open ? (
        <EditSection name="honors" form={form} onCancel={() => { form.resetFields(); setOpen(false); }} onSave={(v) => { add(v); form.resetFields(); fx.values.honors = {}; setOpen(false); }}>
          <Form.Item className="resume-common-form-item input-name" label="奖励名称" name="name" rules={req('奖励名称')}><Input allowClear placeholder="请填写奖励名称" /></Form.Item>
          <Form.Item className="resume-common-form-item datepicker-issued_on" label="获得时间" name="issued_on" rules={req('获得时间')}><DatePicker picker="month" placeholder="请选择获得时间" /></Form.Item>
          <Form.Item className="resume-common-form-item select-level" label="奖励级别" name="level" rules={req('奖励级别')}><Select showSearch allowClear placeholder="请选择奖励级别" options={opts(HONOR_LEVELS)} /></Form.Item>
          <Form.Item className="resume-common-form-item select-grade" label="获奖等级" name="grade"><Select showSearch allowClear placeholder="请选择获奖等级" options={opts(HONOR_GRADES)} /></Form.Item>
          <Form.Item className="resume-common-form-item input-authority" label="颁发机构" name="authority"><Input allowClear placeholder="请填写颁发机构" /></Form.Item>
          <Form.Item className="resume-common-form-item textarea-description" label="描述" name="description"><Input.TextArea allowClear showCount maxLength={500} /></Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

// 证书信息：按 basic-info/证书信息/*.html 重建。“证书名称”是只读的 Cascader 外观，点开是“左侧分类、右侧证书项”的弹窗。
// 英语类证书项与材料一致；会计类、审计类、金融类在材料中没有截图，这里的证书名为测试用假设。
const CERT_TREE: Array<[string, string[]]> = [
  ['英语类', ['雅思IELTS', '托福TOEFL', 'TOEIC托业英语考试', 'GRE', 'GMAT', 'BEC剑桥商务英语', 'PETS全国英语等级考试', 'CATTI英语翻译资格证书', 'PTE Academic培生学术英语考试', '高等学校英语应用能力考试', '国际人才英语考试', '上海外语口译证书', 'ETTBL商务英语口译证书', 'ETTBL商务英语笔译证书', '全国性英语等级考试']],
  ['外语类', ['日语能力测试JLPT', '韩国语能力考试TOPIK', 'CATTI日语翻译资格证书']],
  ['IT类', ['全国计算机等级考试二级', '全国计算机等级考试三级', '软件设计师']],
  ['项目管理类', ['PMP项目管理专业人士资格认证']],
  ['会计类', ['初级会计职称', '中级会计职称', '注册会计师（CPA）', 'ACCA特许公认会计师']],
  ['审计类', ['注册会计师（CPA）', '国际注册内部审计师CIA', '审计师']],
  ['统计类', ['初级统计师', '中级统计师']],
  ['金融类', ['证券从业资格证', '基金从业资格证', '银行从业资格证', 'CFA特许金融分析师', 'FRM金融风险管理师']],
  ['法律类', ['法律职业资格证书']],
  ['教育类', ['教师资格证']],
  ['汉语类', ['普通话水平测试等级证书']],
];

function CertModalField(props: { id?: string; value?: string[]; onChange?: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(CERT_TREE[0][0]);
  const options = useMemo(() => CERT_TREE.map(([c, leaves]) => ({ value: c, label: c, children: leaves.map((l) => ({ value: l, label: l })) })), []);
  const leaves = CERT_TREE.find(([c]) => c === cat)?.[1] ?? [];
  return (
    <div data-testid="cascader-modal-field" onClick={() => setOpen(true)}>
      <Cascader id={props.id} open={false} allowClear value={props.value} options={options} displayRender={(labels) => labels[labels.length - 1]} placeholder="请选择证书名称" onChange={(v) => props.onChange?.((v as string[]) ?? [])} />
      <Modal open={open} width={769} className="cascader-modal my-cascader-modal" title="请选择" footer={null} onCancel={(e) => { e.stopPropagation(); setOpen(false); }} destroyOnClose>
        <div className="flat-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="flat-content">
            <div className="flat-left">
              {CERT_TREE.map(([c]) => (
                <div key={c} className={`level-item ${c === cat ? 'active' : ''}`} onClick={() => setCat(c)}>
                  <span className="item-txt">{c}</span>
                </div>
              ))}
            </div>
            <div className="flat-right">
              <div className="label-path"><span className="path-item"><span>{cat}</span><span className="flat-separator">/</span></span></div>
              <div className="flat-leaf">
                {leaves.map((l) => (
                  <div key={l} className="leaf-item item-txt " title={l} onClick={() => { props.onChange?.([cat, l]); setOpen(false); }}>{l}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CertificateSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { records, add } = useRecords('certificates');
  return (
    <SectionShell id="certificate" title="证书信息" op="添加" onOp={() => setOpen(true)}>
      <RecordList items={records.map((r) => { const n = r.name as string[] | undefined; return n?.[n.length - 1] ?? ''; })} />
      {open ? (
        <EditSection name="certificate_more" form={form} onCancel={() => { form.resetFields(); setOpen(false); }} onSave={(v) => { add(v); form.resetFields(); fx.values.certificate_more = {}; setOpen(false); }}>
          <Form.Item className="resume-common-form-item cascader-modal-field cascader-modal-name flex-wrap" label="证书名称" name="name" rules={req('证书名称')}>
            <CertModalField />
          </Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

function SelfEvalSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [saved, setSaved] = useState('');
  return (
    <SectionShell id="self_evaluation" title="自我评价" required op="编辑" onOp={() => setOpen(true)}>
      {saved && !open ? <div className="record-item"><div className="record-main">{saved}</div></div> : null}
      {open ? (
        <EditSection name="assessment" form={form} initial={{ assessment: saved }} onCancel={() => setOpen(false)} onSave={(v) => { setSaved(String(v.assessment ?? '')); setOpen(false); }}>
          <Form.Item className="resume-common-form-item textarea-assessment" label="自我评价" name="assessment" rules={req('自我评价')}>
            <Input.TextArea rows={5} allowClear showCount maxLength={1000} placeholder="为保护个人隐私，请不要填写手机号、微信、邮箱等联系方式" />
          </Form.Item>
        </EditSection>
      ) : null}
    </SectionShell>
  );
}

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#cf1322' } }}>
      <div className="page">
        <div className="resume-main">
          <BasicSection />
          <EducationSection />
          <LanguageSection />
          <IntentionSection />
          <WorkSection />
          <ProjectSection />
          <HonorSection />
          <CertificateSection />
          <SelfEvalSection />
          <SectionShell id="attachment" title="附件" op="编辑" />
          <SectionShell id="other" title="其他说明" required op="编辑" />
        </div>
      </div>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
