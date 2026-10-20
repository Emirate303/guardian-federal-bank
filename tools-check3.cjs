const s = require('fs').readFileSync('src/App.tsx', 'utf8');
let depth = 0, inS = null, esc = false, out = [];
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (esc) { esc = false; continue; }
  if (inS) { if (c === '\\') { esc = true; continue; } if (c === inS) inS = null; continue; }
  if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
  if (c === '{' || c === '(') depth++;
  if (c === '}' || c === ')') depth--;
  if (depth === 0 && i > 200) out.push(i);
}
console.log(JSON.stringify(out.slice(0, 30)));
