import { chromium } from '@playwright/test';
const BASE = process.env.BASE || 'https://stamp.ochk.io';
const PAGES = ['/', '/create', '/verify', '/signin', '/dashboard', '/v'];
const b = await chromium.launch();
let bad = 0;
for (const p of PAGES) {
  const page = await b.newPage();
  const errs = [];
  page.on('console', m => m.type()==='error' && errs.push(m.text()));
  page.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  let status = 0;
  try {
    const resp = await page.goto(BASE+p, { waitUntil:'domcontentloaded', timeout:45000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(2000);
  } catch(e){ errs.push('NAV: '+e.message); }
  const info = await page.evaluate(()=>{
    const root = document.getElementById('__next') || document.body;
    return { kids: root ? root.querySelectorAll('*').length : 0,
             primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() };
  }).catch(()=>({kids:0,primary:'?'}));
  const real = errs.filter(e => !/favicon|plausible|web-vitals|404|Failed to load resource|net::ERR/i.test(e));
  const ok = status===200 && info.kids>50 && real.length===0;
  if(!ok) bad++;
  console.log(`${ok?'ok ':'✗  '} ${p.padEnd(11)} http=${status} els=${info.kids} primary=${info.primary} ${real.length?('ERR: '+real.slice(0,2).join(' | ')):''}`);
  await page.close();
}
await b.close();
console.log(`\n${bad===0?'ALL PAGES OK':bad+' PAGE(S) WITH ISSUES'}`);
process.exitCode = bad?1:0;
