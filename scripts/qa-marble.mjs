// QA evidence only; no production/product asset mutations.
import sharp from '../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js';
const dir = 'C:/Users/winre/.codex/visualizations/2026/08/18/01a01444-10aa-7002-8058-d8cff1d51f38/';
const source = 'C:/Users/winre/.codex/generated_images/01a01444-10aa-7002-8058-d8cff1d51f38/exec-a5eaf4b1-65df-419f-b8ae-1d62b2454fff.png';
const capture = dir + 'marble-desktop-final.png';
const target = await sharp(source).resize({width:1000}).png().toBuffer();
const implementation = await sharp(capture).extract({left:67,top:96,width:1278,height:675}).resize({width:1000}).png().toBuffer();
const meta = await sharp(implementation).metadata();
await sharp({create:{width:1000,height:500+meta.height,channels:3,background:'#ffffff'}}).composite([{input:target,left:0,top:0},{input:implementation,left:0,top:500}]).png().toFile(dir+'marble-comparison-final.png');
const targetDetail = await sharp(source).extract({left:488,top:470,width:575,height:225}).resize({width:600}).png().toBuffer();
const actualDetail = await sharp(capture).extract({left:440,top:475,width:395,height:150}).resize({width:600}).png().toBuffer();
await sharp({create:{width:600,height:470,channels:3,background:'#061521'}}).composite([{input:targetDetail,left:0,top:0},{input:actualDetail,left:0,top:240}]).png().toFile(dir+'marble-contact-comparison.png');
console.log(await sharp(capture).metadata());
