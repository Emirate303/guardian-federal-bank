const fs = require("fs");
const s = fs.readFileSync("src/App.tsx", "utf8");
const i = s.indexOf("function AppShell");
const j = s.indexOf("/** The exported root");
const s2 = s.slice(i, j);
let inS = null, esc = false;
const stack = [];
for (let k = 0; k < s2.length; k++) {
  const c = s2[k];
  if (esc) { esc = false; continue; }
  if (inS) { if (c === "\\") { esc = true; continue; } if (c === inS) inS = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
  if (c === "{" || c === "(") stack.push([c, k]);
  if (c === "}" || c === ")") {
    const top = stack.pop();
    if (!top) {
      console.log("UNMATCHED close", c, "at body index", k, JSON.stringify(s2.slice(Math.max(0, k - 100), k + 20)));
      break;
    }
  }
}
console.log("stack length:", stack.length);
for (const [c, k] of stack.slice(-8)) {
  console.log(c, "at body index", k, JSON.stringify(s2.slice(Math.max(0, k - 120), k + 80)));
}
