/*
 * Gera src/theme-dark.css a partir das folhas de estilo do app.
 *
 * As folhas antigas usam cores escritas à mão. Em vez de reescrever cada uma,
 * este script lê todas, encontra as cores de fundo, texto e borda e escreve a
 * versão escura de cada regra sob :root[data-theme="dark"]. Mantém o matiz
 * (verdes continuam verdes) e inverte só a luminosidade: fundos claros viram
 * superfícies escuras, textos escuros viram claros, e os verdes escuros da
 * marca (botões, cabeçalhos com foto) ficam como estão.
 *
 * Rodar depois de mudar cores em qualquer .css:  npm run tema:escuro
 * Usa o postcss que já vem com o Vite (nenhuma dependência nova).
 */
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";

const files = [
  "src/style.css",
  "src/catalog.css",
  "src/explore/explore.css",
  "src/etapa16.css",
  "src/travel-mode.css",
  "src/extensions.css",
  "src/photos.css",
];
const DARK = ':root[data-theme="dark"]';

// Variáveis da raiz: resolvidas para o valor literal antes de converter.
const vars = {};
for (const f of files)
  postcss.parse(readFileSync(f, "utf8")).walkRules(":root", (r) =>
    r.walkDecls(/^--/, (d) => (vars[d.prop] = d.value)),
  );
const resolveVars = (v, depth = 0) =>
  depth > 4 ? v : v.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (m, name, fb) => (vars[name] ? resolveVars(vars[name], depth + 1) : fb ?? m));

const named = { white: "#ffffff", black: "#000000" };
const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;

function parse(c) {
  c = named[c] ?? c;
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = c.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith("%") ? (parseFloat(x) / 100) * 255 : parseFloat(x)));
  if (p.length < 3 || p.some(Number.isNaN)) return null;
  return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] > 1 ? p[3] / 255 : p[3] };
}
function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
const fmt = ({ h, s, l }, a) => {
  const hsl = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return a < 1 ? `hsl(${hsl} / ${Math.round(a * 100) / 100})` : `hsl(${hsl})`;
};

// Como cada papel de cor muda no escuro.
const roles = {
  bg: (c) => (c.l > 0.5 ? { ...c, s: c.s * 0.55, l: Math.min(0.3, 0.1 + (1 - c.l) * 0.9) } : null),
  text: (c) => (c.l < 0.55 ? { ...c, s: Math.min(c.s, 0.5) * 0.8, l: 0.93 - c.l * 0.55 } : null),
  line: (c) => (c.l > 0.5 ? { ...c, s: c.s * 0.5, l: 0.2 + (1 - c.l) * 0.35 } : null),
};
const roleOf = (prop) =>
  /^background|^--/.test(prop) ? "bg" : /^(color|caret-color|fill|stroke|text-decoration-color|-webkit-text-fill-color)$/.test(prop) ? "text" : /^(border|outline|box-shadow|column-rule)/.test(prop) ? "line" : null;

function convert(value, role) {
  let changed = false;
  const out = value.replace(colorRe, (c) => {
    const rgb = parse(c.toLowerCase());
    if (!rgb) return c;
    const next = roles[role](toHsl(rgb));
    if (!next) return c;
    changed = true;
    return fmt(next, rgb.a);
  });
  return changed ? out : null;
}

const prefix = (sel) =>
  sel
    .split(",")
    .map((s) => s.trim())
    .map((s) => (/^(:root|html)\b/.test(s) ? s.replace(/^(:root|html)/, DARK) : `${DARK} ${s}`))
    .join(",\n");

const result = postcss.root();
result.append(postcss.comment({ text: " Gerado por scripts/gerar-tema-escuro.mjs. Não edite à mão: ajustes finos vão em theme.css. " }));
let count = 0;
for (const f of files) {
  const src = postcss.parse(readFileSync(f, "utf8"), { from: f });
  src.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const decls = [];
    rule.each((d) => {
      if (d.type !== "decl" || d.prop.startsWith("--")) return;
      const role = roleOf(d.prop);
      if (!role) return;
      const v = convert(resolveVars(d.value), role);
      if (v) decls.push(postcss.decl({ prop: d.prop, value: v, important: d.important }));
    });
    if (!decls.length) return;
    const copy = postcss.rule({ selector: prefix(rule.selector) });
    copy.append(decls);
    count += decls.length;
    // Recria @media/@supports em volta da regra.
    let node = copy;
    for (let p = rule.parent; p && p.type === "atrule"; p = p.parent) {
      const wrap = postcss.atRule({ name: p.name, params: p.params });
      wrap.append(node);
      node = wrap;
    }
    result.append(node);
  });
}
writeFileSync("src/theme-dark.css", result.toString() + "\n");
console.log(`theme-dark.css: ${count} declarações`);
