// Developer helper: only replaces known static UI literals. Never translates user values.
const fs=require('fs'),ts=require('typescript');
const dictionaries=fs.readdirSync('src/locales').filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync('src/locales/'+n,'utf8')));
const known=new Set(dictionaries.flatMap(d=>Object.keys(d)));
for(const name of fs.readdirSync('src').filter(n=>n.endsWith('.tsx')&&!n.endsWith('.test.tsx')&&n!=='LanguagePicker.tsx')){
 let text=fs.readFileSync('src/'+name,'utf8');const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function visit(n){
  if(ts.isJsxText(n)){const key=n.text.replace(/\s+/g,' ').trim();if(known.has(key)){const inline=!n.text.includes('\n');edits.push([n.pos,n.end,(inline&&/^\s/.test(n.text)?'{" "}':'')+'{tr('+JSON.stringify(key)+')}' +(inline&&/\s$/.test(n.text)?'{" "}':'')]);return}}
  if(ts.isStringLiteral(n)&&known.has(n.text)){
   const p=n.parent;
   if(ts.isJsxAttribute(p)&&['placeholder','title','aria-label','alt'].includes(p.name.text))edits.push([n.getStart(source),n.end,'{tr('+JSON.stringify(n.text)+')}']);
   else if(ts.isJsxExpression(p)||ts.isConditionalExpression(p)||(ts.isBinaryExpression(p)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)))edits.push([n.getStart(source),n.end,'tr('+JSON.stringify(n.text)+')']);
  }
  ts.forEachChild(n,visit);
 }
 visit(source);if(!edits.length)continue;
 edits.sort((a,b)=>b[0]-a[0]).forEach(([start,end,replacement])=>{text=text.slice(0,start)+replacement+text.slice(end)});
 if(!text.includes('t as tr')&&!/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*["']\.\/i18n["']/.test(text))text='import {t as tr} from "./i18n";\n'+text;
 fs.writeFileSync('src/'+name,text);
}
