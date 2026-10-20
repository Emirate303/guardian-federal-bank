const fs = require("fs");
const s = fs.readFileSync("git-app.tsx", "utf8");
let d = 0, inS = null, esc = false;
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (esc) { esc = false; continue; }
  if (inS) { if (c === "\\") { esc = true; continue; } if (c === inS) inS = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
  if (c === "{" || c === "(") d++;
  if (c === "}" || c === ")") d--;
}
console.log("GIT VERSION DEPTH:", d, "LEN:", s.length);
