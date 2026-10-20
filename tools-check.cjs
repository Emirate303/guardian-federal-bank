const fs = require('fs');
const s = fs.readFileSync('src/App.tsx', 'utf8');
let depth = 0, inS = null, esc = false;
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (esc) { esc = false; continue; }
  if (inS) { if (c === '\\') { esc = true; continue; } if (c === inS) inS = null; continue; }
  if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
  if (c === '{' || c === '(') depth++;
  if (c === '}' || c === ')') { depth--; if (depth < 0) { console.log('extra close at line', line); depth = 0; } }
}
console.log('FINALDEPTH', depth);

// find AppShell body end
const fs2 = require('fs');
const s2 = fs2.readFileSync('src/App.tsx', 'utf8');
const i2 = s2.indexOf('function AppShell');
let depth2 = 0, inS2 = null, esc2 = false;
for (let k = i2; k < s2.length; k++) {
  const c = s2[k];
  if (esc2) { esc2 = false; continue; }
  if (inS2) { if (c === '\\') { esc2 = true; continue; } if (c === inS2) inS2 = null; continue; }
  if (c === '"' || c === "'" || c === '`') { inS2 = c; continue; }
  if (c === '{') depth2++;
  if (c === '}') { depth2--; if (depth2 === 0) { console.log('AppShell body ends at', k, 'of', s2.length); break; } }
}
