import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await b.newPage();
await page.goto('http://localhost:6007/iframe.html?id=primitives-button--variants&viewMode=story',{waitUntil:'networkidle'});
await page.waitForTimeout(600);
for(const dark of [false,true]){
  for(const skin of ['orangecheck','midnight','phosphor']){
    await page.evaluate(({skin,dark})=>{const h=document.documentElement;h.setAttribute('data-oc-theme',skin);h.classList.toggle('dark',dark);},{skin,dark});
    await page.waitForTimeout(450); // let transition-all settle
    const r = await page.evaluate(()=>{
      const btn=document.querySelector('#storybook-root button');
      const cs=getComputedStyle(btn);
      return {radius:cs.borderTopLeftRadius, bg:cs.backgroundColor, font:getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g,'')};
    });
    console.log(`${dark?'dark ':'light'} ${skin.padEnd(11)} radius=${r.radius.padEnd(5)} font=${r.font.padEnd(16)} primaryBg=${r.bg}`);
  }
}
await b.close();
