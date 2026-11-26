// Local release gate; no GitHub Actions, no production deployment.
// Usage: npm install --no-save playwright && npx playwright install chromium
//        node .github/cal-qa/smoke.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try { const p=new URL(req.url,"http://127.0.0.1").pathname;
 const file=resolve(root,"."+p+(p.endsWith("/")?"index.html":""));
 if(!file.startsWith(root+sep)){res.writeHead(403);return res.end()}
 const body=await readFile(file);
 const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript",".json":"application/json"}[extname(file)]||"application/octet-stream";
 res.writeHead(200,{"content-type":mime,"cache-control":"no-store"});res.end(body);
 }catch{res.writeHead(404);res.end("Not found")}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url="http://127.0.0.1:"+server.address().port+"/cal/";
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(url,{waitUntil:"load"});
 assert.equal(await page.locator(".calc-card").count(),11);
 assert.equal(await page.locator(".glyph").count(),11);
 const open=async id=>{const c=page.locator("#"+id);if(!(await c.getAttribute("open")!==null))await c.locator("summary").click();};
 const fill=async(id,v)=>page.locator("#"+id).fill(String(v));
 const select=async(id,v)=>page.locator("#"+id).selectOption(String(v));
 const click=async id=>page.locator("#"+id).click();
 const result=async(id,want)=>{await click(id+"-run");await page.waitForFunction(([id,want])=>document.getElementById(id+"-out").textContent.includes(want),[id,want],{timeout:15000});assert.equal(await page.locator("#"+id+"-out").evaluate(e=>e.classList.contains("error")),false)};
 for(const width of [320,360,390,768,1024,1440,1920]){
   await page.setViewportSize({width,height:900});
   for(const id of ["basic","date","estate","hotel","miles","time","age","unit","fx","interest","salary"]){
     await open(id);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+"px "+id+" overflow");
     await page.locator("#"+id+" summary").click();
   }
 }
 await open("basic");await fill("expr","sin(30)+sqrt(81)");await result("basic","9.5");
 await open("date");await select("date-mode","diff");await fill("date-a","2024-02-28");await fill("date-b","2024-03-01");await result("date","날짜 차이 2일");
 await select("date-mode","solar");await fill("date-a","2017-06-24");await result("date","음력 2017-05-01 (윤달)");
 await select("date-mode","lunar");await fill("date-a","1956-01-21");await select("leap","0");await result("date","양력 1956-03-03");
 await open("estate");await select("est-mode","buy");await fill("buy-price",600000000);await fill("buy-date","2026-11-26");await result("estate","취득세 6,000,000원");
 await select("houses","2");await page.locator("#temp-buy").check();await page.locator("#temp-both").check();await result("estate","처분기한 2년");
 await fill("buy-date","2026-09-30");await result("estate","처분기한 3년");
 await select("est-mode","broker");await fill("broker-price",100000000);await result("estate","중개보수 상한 500,000원");
 await select("est-mode","sell");await fill("sale-date","2026-11-26");await result("estate","257,010,000원");
 await select("est-mode","property");await result("estate","과세표준 420,000,000원");
 await select("est-mode","comprehensive");await result("estate","종부세 과세표준 360,000,000원");
 await select("est-mode","reg");await select("bond-mode","amount");await fill("bond-amount",2000000);await result("estate","공식 조회 고객부담금 2,000,000원");
 await open("hotel");await result("hotel","매입 단가 7원/P");
 await open("miles");await result("miles","1마일당 가치 28원");
 await open("time");await result("time","4시간 15분");await click("sw-start");await page.waitForTimeout(250);await click("sw-pause");assert.notEqual(await page.locator("#stop-watch").innerText(),"00:00.00");await click("sw-reset");assert.equal(await page.locator("#stop-watch").innerText(),"00:00.00");
 await open("age");await fill("birth","2000-12-01");await fill("age-at","2026-11-26");await result("age","만 나이 25세");
 await open("unit");await select("unit-kind","면적");await select("unit-from","평");await select("unit-to","㎡");await fill("unit-val",30);await result("unit","99.173554");
 await open("fx");await select("fx-currency","JPY");await fill("fx-amount",100);await fill("fx-manual",9);await result("fx","900 KRW");
 await select("fx-currency","USD");await fill("fx-manual",0);await click("fx-refresh");
 await page.waitForFunction(()=>/^기준일 \d{4}-\d{2}-\d{2}/.test(document.getElementById("fx-date").textContent),null,{timeout:15000});
 for(const c of ["USD","JPY","CNY","EUR"])assert.match(await page.locator("#fx-rate-"+c).innerText(),/원$/);
 await result("fx","KRW");
 await open("interest");await result("interest","세전 이자 400,000원");
 await open("salary");await fill("gross",3300000);await fill("exempt",200000);await result("salary","소득세 82,900원");assert.match(await page.locator("#salary-out").innerText(),/고용보험 27,900원/);
 await click("salary-reset");assert.equal(await page.locator("#gross").inputValue(),"4000000");
 await fill("search","마일리지");assert.equal(await page.locator(".calc-card:not([hidden])").count(),1);await fill("search","");
 assert.deepEqual(errors,[]);
 console.log("PASS: 77 viewport/card checks, actual lunar and FX network, all calculator smoke cases.");
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
