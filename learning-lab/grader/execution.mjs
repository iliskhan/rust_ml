// Builds files for a NEW external sandbox. This module never launches learner code.
// Expected values, private bundle and credentials are deliberately absent.
import { orderedArguments } from './parameters.mjs'
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/
function rustString(value) {
  return '"' + [...value].map(char => char === '"' ? '\\"' : char === '\\' ? '\\\\' : char.codePointAt(0) < 32 ? `\\u{${char.codePointAt(0).toString(16)}}` : char).join('') + '"'
}
function rustValue(value, type) {
  if (type === '&str') { if (typeof value !== 'string') throw Error('invalid_input'); return rustString(value) }
  if (type === 'bool') { if (typeof value !== 'boolean') throw Error('invalid_input'); return String(value) }
  if (type.startsWith('&[')) {
    if (!Array.isArray(value)) throw Error('invalid_input')
    const element = type.slice(2, -1)
    if (element === 'Vec<f64>') return '&[' + value.map(row => {
      if (!Array.isArray(row)) throw Error('invalid_input')
      return 'vec![' + row.map(item => rustValue(item, 'f64')).join(',') + ']'
    }).join(',') + ']'
    return '&[' + value.map(item => rustValue(item, element)).join(',') + ']'
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('invalid_input')
  if (type === 'f64') return Object.is(value, -0) ? '-0.0f64' : Number.isInteger(value) ? value + '.0f64' : String(value) + 'f64'
  if (!['usize', 'u32', 'i32'].includes(type) || !Number.isSafeInteger(value) || (type !== 'i32' && value < 0)) throw Error('invalid_input')
  return String(value) + type
}
const serialization = `trait JsonValue { fn json(&self) -> String; }
impl JsonValue for f64 { fn json(&self)->String { assert!(self.is_finite()); self.to_string() } }
impl JsonValue for bool { fn json(&self)->String { self.to_string() } }
impl<T:JsonValue> JsonValue for Vec<T> { fn json(&self)->String { format!("[{}]",self.iter().map(|v|v.json()).collect::<Vec<_>>().join(",")) } }
`
export function rustCaseProgram(source, spec, test, moduleName = 'solution') {
  if (!identifier.test(spec.entrypoint) || !identifier.test(moduleName)) throw Error('invalid_adapter')
  const args = orderedArguments(spec, test.input)
  if (!Array.isArray(spec.parameters) || args.length !== spec.parameters.length) throw Error('input_signature_mismatch')
  const implementations = (spec.structs ?? []).map(({ name, fields }) => {
    if (!identifier.test(name) || fields.some(field => !identifier.test(field))) throw Error('invalid_adapter')
    return `impl JsonValue for ${moduleName}::${name} { fn json(&self)->String { let fields=vec![${fields.map(field => `format!("{}:{}",${rustString(JSON.stringify(field))},self.${field}.json())`).join(',')}]; format!("{{{}}}",fields.join(",")) } }`
  }).join('\n')
  const call = `${moduleName}::${spec.entrypoint}(${args.map((value, index) => rustValue(value, spec.parameters[index].type)).join(',')})`
  return { module: `mod ${moduleName} {\n${source}\n}\n${implementations}`, expression: call, serialization }
}

export function buildExecution(source, spec, test) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 65536) throw Error('source_limit')
  if (spec.protocol !== 1 || spec.adapter !== 'rustml-public-values-v1' || !identifier.test(spec.entrypoint) ||
    typeof test.id !== 'string' || test.id.length > 128 || !test.input || typeof test.input !== 'object' || Array.isArray(test.input)) throw Error('invalid_execution_request')
  // Copy ONLY the current input and opaque ID. Never copy expected or the bundle.
  const request = JSON.stringify({ protocol: 1, case_id: test.id, args: orderedArguments(spec, test.input) })
  const result_file = 'result.json'
  if (spec.language === 'javascript') {
    return { files: {
      'solution.mjs': source + `\nexport { ${spec.entrypoint} };\n`,
      'input.json': request,
      'run.mjs': `import {readFileSync,writeFileSync} from 'node:fs';
const input=JSON.parse(readFileSync('input.json','utf8'));
let result;try {const solution=await import('./solution.mjs');const value=await solution.${spec.entrypoint}(...input.args);result={protocol:1,case_id:input.case_id,value};}catch(error){result={protocol:1,case_id:input.case_id,error:'runtime_error'};}
writeFileSync('result.json',JSON.stringify(result));`,
    }, compile: ['node', '--check', 'solution.mjs'], run: ['node', 'run.mjs'], result_file }
  }
  if (spec.language === 'python') {
    return { files: {
      'solution.py': source, 'input.json': request,
      'run.py': `import json\nfrom pathlib import Path\nrequest=json.loads(Path('input.json').read_text())\nresult={'protocol':1,'case_id':request['case_id']}\ntry:\n    compiled=compile(Path('solution.py').read_text(),'solution.py','exec')\nexcept SyntaxError:\n    result['error']='compile_error'\nelse:\n    try:\n        scope={}\n        exec(compiled,scope)\n        result['value']=scope['${spec.entrypoint}'](*request['args'])\n    except BaseException:\n        result['error']='runtime_error'\ntry:\n    encoded=json.dumps(result,allow_nan=False)\nexcept (ValueError,TypeError):\n    encoded=json.dumps({'protocol':1,'case_id':request['case_id'],'error':'runtime_error'})\nPath('result.json').write_text(encoded)\n`,
    }, run: ['python3', '-I', 'run.py'], result_file }
  }
  if (spec.language === 'rust') {
    const program = rustCaseProgram(source, spec, test)
    const prefix = rustString(JSON.stringify({ protocol: 1, case_id: test.id }).slice(0, -1) + ',"value":')
    const error = rustString(JSON.stringify({ protocol: 1, case_id: test.id, error: 'runtime_error' }))
    return { files: { 'run.rs': `${program.serialization}\n${program.module}\nfn main(){let output=match ${program.expression}{Ok(value)=>format!("{}{}{}",${prefix},value.json(),"}"),Err(_)=>${error}.to_string()};std::fs::write("result.json",output).unwrap();}\n` },
      compile: ['rustc', '--edition=2021', 'run.rs', '-o', 'solution'], run: ['./solution'], result_file }
  }
  throw Error('unsupported_language')
}
