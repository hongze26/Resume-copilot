// 用 Ajv 预编译档案 Schema 校验器（standalone）。
// 原因：MV3 扩展页禁止 eval/new Function，Ajv 运行时编译不可用，所以在构建期生成纯 JS 代码。
import { readFileSync, writeFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

const schema = JSON.parse(readFileSync(new URL('../schema/profile.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020.default({
  strict: false, // Schema 中有 x-sensitivity / x-match 等自定义注解
  allErrors: true,
  validateFormats: false, // email / date-time 在 validate.ts 中单独检查
  code: { source: true, esm: false },
});
const validate = ajv.compile(schema);
const code = standaloneCode.default(ajv, validate);
writeFileSync(new URL('../src/core/profile/validate.generated.cjs', import.meta.url), '// 自动生成，请勿手改。来源：schema/profile.schema.json\n' + code);
console.log('validator generated');
