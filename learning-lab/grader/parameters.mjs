const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/
const rustTypes = new Set(['f64', 'usize', 'u32', 'i32', 'bool', '&str', '&[f64]', '&[usize]', '&[bool]', '&[Vec<f64>]'])

// Only the trusted, immutable published starter defines a function's signature.
export function signature(starter, language) {
  const pattern = { javascript: /function\s+(\w+)\s*\(([^)]*)\)/,
    python: /def\s+(\w+)\s*\(([^)]*)\)/, rust: /pub fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*Result</ }[language]
  const match = typeof starter === 'string' && pattern && starter.match(pattern)
  if (!match || !identifier.test(match[1])) throw Error('unsupported_signature')
  const parameters = match[2].split(',').map(parameter => {
    const part = parameter.trim().match(language === 'javascript' ? /^(\w+)$/ : /^(\w+)\s*:\s*(.+)$/)
    if (!part || !identifier.test(part[1]) || (language === 'rust' && !rustTypes.has(part[2].trim()))) throw Error('unsupported_parameter')
    return { name: part[1], ...(language === 'rust' ? { type: part[2].trim() } : {}) }
  })
  if (new Set(parameters.map(parameter => parameter.name)).size !== parameters.length) throw Error('unsupported_parameter')
  return { entrypoint: match[1], parameters }
}

export function orderedArguments(spec, input) {
  const names = spec.parameters?.map(parameter => parameter.name)
  if (!Array.isArray(names) || !input || typeof input !== 'object' || Array.isArray(input) ||
    names.some(name => !identifier.test(name) || !Object.hasOwn(input, name)) ||
    new Set(names).size !== names.length || Object.keys(input).length !== names.length) throw Error('input_signature_mismatch')
  return names.map(name => input[name])
}
