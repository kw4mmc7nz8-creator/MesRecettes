import puppeteer from '@cloudflare/puppeteer';
// Prototype Cloudflare Browser Rendering. Requires deployment and live tests.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
const fail=(status,message)=>new Response(JSON.stringify({error:message}),{status,headers:{...cors,'Content-Type':'application/json'}});
function isSafeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.')&&!/(^|\.)(localhost|local|internal)$/.test(u.hostname)&&!/^((10|127|0|192\.168|169\.254)\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname)&&!u.hostname.endsWith('.workers.dev')}catch{return false}}
export default {async fetch(request,env){
 if(request.method==='OPTIONS')return new Response(null,{headers:cors});
 if(new URL(request.url).pathname!=='/convert'||request.method!=='POST')return fail(404,'Introuvable');
 let url;try{const body=await request.json();url=body.url}catch{return fail(400,'JSON invalide')}
 if(typeof url!=='string'||url.length>2048||!isSafeURL(url))return fail(400,'Adresse HTTPS refusée');
 let browser;try{
 browser=await puppeteer.launch(env.MYBROWSER);const page=await browser.newPage();
 await page.setViewport({width:1100,height:1500});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
 // Try JSON-LD Recipe first. The page remains untouched for the faithful fallback.
 let recipe=null;try{recipe=await page.evaluate(()=>{for(const tag of document.querySelectorAll('script[type="application/ld+json"]')){try{const obj=JSON.parse(tag.textContent);const stack=[obj];while(stack.length){const item=stack.pop();if(Array.isArray(item)){stack.push(...item);continue}if(!item||typeof item!=='object')continue;if(item['@graph'])stack.push(item['@graph']);const types=[].concat(item['@type']||[]);if(types.includes('Recipe')&&item.recipeIngredient?.length&&item.recipeInstructions)return {name:item.name||'Recette',ingredients:item.recipeIngredient,instructions:item.recipeInstructions};}}catch{}}return null})}catch{}
 let pdf;
 if(recipe){try{const text=x=>typeof x==='string'?x:(x?.text||x?.name||'');const steps=(Array.isArray(recipe.instructions)?recipe.instructions:[recipe.instructions]).flatMap(x=>x?.itemListElement||x).map(text).filter(Boolean);if(steps.length&&recipe.ingredients.length){const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><style>body{font:15px/1.5 Arial,sans-serif;margin:42px;color:#222}h1{color:#d63e2c}li{margin:7px 0}</style><h1>${htmlEscape(recipe.name)}</h1><h2>Ingrédients</h2><ul>${recipe.ingredients.map(x=>`<li>${htmlEscape(x)}</li>`).join('')}</ul><h2>Préparation</h2><ol>${steps.map(x=>`<li>${htmlEscape(x)}</li>`).join('')}</ol><p>Source : ${htmlEscape(url)}</p></html>`;const p=await browser.newPage();await p.setContent(html);pdf=await p.pdf({format:'A4',printBackground:true});await p.close()}}catch{pdf=null}}
 if(!pdf){await page.emulateMediaType('screen');pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true})}
 if(!pdf||pdf.byteLength>35*1024*1024)return fail(422,'PDF trop volumineux ou vide');
 return new Response(pdf,{headers:{...cors,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="recette.pdf"'}});
 }catch(e){return fail(502,'Conversion impossible : '+String(e?.message||'erreur'))}finally{if(browser)await browser.close().catch(()=>{})}
 }};
