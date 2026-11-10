// Checks the footstep analysis against simulated hunts (no app needed): node test/speed.test.js
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../web/finder.html", "utf8");
let js = src.split("<script>")[1].split("</script>")[0];
js = js.split("// difficulty modal")[0] + js.slice(js.indexOf("// ---------- footstep tapper"), js.indexOf("$(\"tapBtn\").onclick"));
const $ = () => ({ textContent: "", innerHTML: "", value: "", classList: { toggle() {} }, set onclick(f) {} });
const document = { addEventListener() {}, body: { classList: { toggle() {} } }, getElementById: $ };
const window = {};
const performance = { now: () => 0 };
const fn = new Function("document", "window", "performance", js + "\nreturn {S,G,analyzeHunt,speedScores,bestGuess,computeRows,setHunts:v=>{hunts=v}};");
const T = fn(document, window, performance);
const K = 55;
const steps = (...parts) => { const t = [0]; for (const [ms, n] of parts) for (let i = 0; i < n; i++) t.push(t[t.length - 1] + 60000 / (ms * K)); return t; };
const top = (hs) => { T.setHunts(hs.map((taps) => ({ t0: 0, taps }))); const g = T.bestGuess().list; return g.map((x) => x.g.n).join(", "); };
let fail = 0;
const expect = (name, got, want, anyOfTop = false) => { const ok = anyOfTop ? got.split(", ").includes(want) : got.split(", ")[0] === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${got || "(no guess)"}`); };
T.S.evi = 3;
expect("Revenant: crawls at 1.0 then 3.0 m/s", top([steps([1.0, 6], [3.0, 10])]), "Revenant");
expect("Deogen: 3.0 m/s then 0.4 m/s next to you", top([steps([3.0, 10], [0.4, 4])]), "Deogen");
expect("Dayan: 1.2 still, then 2.25 when you move", top([steps([1.2, 6], [2.25, 8])]), "Dayan");
expect("Twins: 1.5 one hunt, 1.9 the next (Gallu and Obambo switch speeds too)", top([steps([1.5, 8]), steps([1.9, 8])]), "The Twins", true);
const a = T.analyzeHunt(steps([1.0, 6], [3.0, 10]));
console.log(`${a.segs.length === 2 && a.changes[0] === "jump" ? "PASS" : (fail++, "FAIL")}  Revenant hunt splits into 2 stretches with a sudden jump`);
const n = T.analyzeHunt(steps([1.7, 12]));
console.log(`${n.segs.length === 1 && Math.abs(n.segs[0].ms - 1.7) < 0.05 ? "PASS" : (fail++, "FAIL")}  steady normal ghost reads one stretch at 1.7 m/s`);
// a gradual line-of-sight speed-up 1.7 -> 2.6 over 13 s should stay one stretch, marked as speeding up
const g = [0]; for (let i = 0; i < 24; i++) { const ms = Math.min(2.6, 1.7 + i * 0.05); g.push(g[g.length - 1] + 60000 / (ms * K)); }
const ga = T.analyzeHunt(g);
console.log(`${ga.segs.some((s) => s.gradual) && !ga.changes.includes("jump") ? "PASS" : (fail++, "FAIL")}  line-of-sight speed-up reads as gradual, not a jump (${ga.segs.length} stretch${ga.segs.length > 1 ? "es" : ""})`);
T.S.speedMod = 1.5;
const fast = T.analyzeHunt(steps([1.7 * 1.5, 10]));
console.log(`${Math.abs(fast.segs[0].ms - 1.7) < 0.05 ? "PASS" : (fail++, "FAIL")}  150% ghost speed setting is taken into account`);
process.exit(fail ? 1 : 0);
