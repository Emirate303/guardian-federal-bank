import fs from 'fs';
let s = fs.readFileSync('src/App.tsx', 'utf8');
// naive prettifier: break after ; { } and before keywords outside strings
let out = '';
let inStr = null, inTpl = false, prev = '';
for (let i = 0; i < s.length; i++) {
  const c = s[i], n = s[i + 1];
  if (inStr) {
    out += c;
    if (c === '\\') { out += n; i++; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
  if (c === ';') { out += ';\n'; continue; }
  if (c === '{') { out += ' {\n'; continue; }
  if (c === '}') { out += '\n}\n'; continue; }
  if (c === ',' && /[)\]"]/.test(prev)) { out += ',\n'; prev = c; continue; }
  out += c; prev = c;
}
fs.writeFileSync('App.readable.tsx', out);
