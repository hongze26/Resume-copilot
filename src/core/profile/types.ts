// 档案类型。与 schema/profile.schema.json 保持一致（修改 Schema 时同步修改这里）。

export type DateStr = string; // YYYY | YYYY-MM | YYYY-MM-DD
export type DateOrPresent = DateStr | 'present';
export type TriState = 'yes' | 'no' | 'unset';
export type Sensitivity = 'low' | 'medium' | 'high';

export type PoliticalStatus =
  | 'cpc-member'
  | 'cpc-probationary'
  | 'cyl-member'
  | 'democratic-party'
  | 'non-party'
  | 'masses'
  | 'other';

export type EducationLevel =
  | 'junior-high-or-below'
  | 'secondary-vocational'
  | 'high-school'
  | 'junior-college'
  | 'bachelor'
  | 'master'
  | 'doctor';

export interface Region {
  country?: string;
  province: string;
  city?: string;
  district?: string;
  code?: string;
}

export interface FileRef {
  fileName?: string;
  mime?: string;
  sizeBytes?: number;
  widthPx?: number;
  heightPx?: number;
  blobKey?: string;
}

export interface EducationRecord {
  id: string;
  level: EducationLevel;
  degree?: 'none' | 'bachelor' | 'master' | 'doctor' | 'other';
  school: string;
  schoolCountry?: string;
  schoolRegion?: Region;
  college?: string;
  majorCategory?: string;
  major?: string;
  researchDirection?: string;
  start: DateStr;
  end?: DateOrPresent;
  studyMode?: 'full-time' | 'part-time';
  admissionType?: 'unified' | 'non-unified' | 'non-mainland';
  durationYears?: number;
  /** 海外学习年限（年，可为小数）；只在境外就读时填写 */
  overseasYears?: number;
  isTransferFromJuniorCollege?: TriState;
  hasDoubleDegree?: TriState;
  gpa?: string;
  rank?: string;
  isStudentCadre?: TriState;
  mainCourses?: string[];
  trainingMode?: string;
  schoolExperience?: string;
}

export interface WorkRecord {
  id: string;
  kind: 'full-time' | 'part-time' | 'internship';
  company: string;
  companyNature?: string;
  department?: string;
  title: string;
  location?: Region;
  start: DateStr;
  end?: DateOrPresent;
  description?: string;
  /** 税前月薪（元） */
  salary?: number;
  /** 是否有工作证明人 */
  hasReferee?: TriState;
  note?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  role?: string;
  organization?: string;
  teamSize?: number;
  start: DateStr;
  end?: DateOrPresent;
  introduction?: string;
  duty?: string;
  achievement?: string;
}

export interface RoleRecord {
  id: string;
  organization: string;
  role: string;
  start?: DateStr;
  end?: DateOrPresent;
  description?: string;
}

export interface LanguageRecord {
  id: string;
  language: string;
  certificate: string;
  score?: string;
  date?: DateStr;
  /** 听说能力、读写能力（一般 / 良好 / 熟练 / 精通） */
  listenSpeak?: SkillLevel;
  readWrite?: SkillLevel;
}

export type SkillLevel = 'basic' | 'good' | 'proficient' | 'expert' | 'unspecified';

export interface ComputerSkill {
  id: string;
  name: string;
  level?: string;
  date?: DateStr;
}

export interface Certificate {
  id: string;
  category?: string;
  name: string;
  status: 'obtained' | 'partial' | 'in-progress';
  detail?: string;
  date?: DateStr;
  attachment?: FileRef;
}

export interface Skill {
  id: string;
  name: string;
  level?: SkillLevel;
  note?: string;
}

export interface Honor {
  id: string;
  name: string;
  date?: DateStr;
  level?: 'international' | 'national' | 'provincial' | 'city' | 'enterprise' | 'school' | 'department' | 'other';
  grade?: 'special' | 'first' | 'second' | 'third' | 'other';
  issuer?: string;
  description?: string;
}

export interface FamilyMember {
  id: string;
  relation: string;
  name: string;
  birthDate?: DateStr;
  employer?: string;
  position?: string;
  politicalStatus?: PoliticalStatus;
  mobile?: string;
}

export interface TextTemplate {
  id: string;
  title: string;
  kind?: 'self-assessment' | 'motivation' | 'why-company' | 'school-experience' | 'other';
  body: string;
}

export interface CustomField {
  id: string;
  label: string;
  aliases?: string[];
  value: string;
  sensitivity?: Sensitivity;
}

export interface Profile {
  schemaVersion: 1;
  meta: {
    createdAt: string;
    updatedAt: string;
    reviewedAt?: string | null;
    source?: 'manual' | 'json-import' | 'resume-parse';
  };
  basic: {
    name: string;
    nameEn?: string;
    gender?: 'male' | 'female';
    birthDate?: DateStr;
    idType?: 'resident-id' | 'passport' | 'hk-macau-pass' | 'taiwan-pass' | 'other';
    idNumber?: string;
    nationality?: string;
    ethnicity?: string;
    politicalStatus?: PoliticalStatus;
    partyJoinDate?: DateStr;
    maritalStatus?: 'unmarried' | 'married' | 'divorced' | 'widowed';
    healthStatus?: string;
    heightCm?: number;
    nativePlace?: Region;
    studentOrigin?: Region;
    hukou?: Region;
    hukouType?: 'urban' | 'rural' | 'collective' | 'unknown';
    currentResidence?: Region;
    photo?: FileRef;
  };
  contact: {
    mobile?: string;
    email?: string;
    address?: string;
    postalCode?: string;
    emergencyContact?: { name?: string; relation?: string; mobile?: string };
  };
  education: EducationRecord[];
  work?: WorkRecord[];
  projects?: ProjectRecord[];
  studentLeadership?: RoleRecord[];
  socialPractice?: RoleRecord[];
  languages?: LanguageRecord[];
  computerSkills?: ComputerSkill[];
  certificates?: Certificate[];
  skills?: Skill[];
  honors?: Honor[];
  family?: FamilyMember[];
  intention?: {
    jobTypes?: string[];
    cities?: Region[];
    salaryMin?: number;
    salaryMax?: number;
    acceptJobAdjustment?: TriState;
    acceptEmployerAdjustment?: TriState;
    earliestStartDate?: DateStr;
  };
  declarations?: { hasDisciplinaryRecord?: TriState; disciplinaryDetail?: string };
  textTemplates?: TextTemplate[];
  custom?: CustomField[];
}

/** 重复区块的档案集合名。 */
export type RecordCollection = 'education' | 'work' | 'projects' | 'languages' | 'honors' | 'certificates' | 'skills';

export const CURRENT_SCHEMA_VERSION = 1 as const;
