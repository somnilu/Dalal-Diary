// Builds public/stocks.json from Upstox's free public instrument files.
// Keeps only company shares (ISIN pattern INExxxxxx01xx) and merges NSE + BSE listings by ISIN.
import {gunzipSync} from 'node:zlib';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const BASE='https://assets.upstox.com/market-quote/instruments/exchange/';
const SRC={NSE_EQ:process.env.NSE_SRC||BASE+'NSE.json.gz',BSE_EQ:process.env.BSE_SRC||BASE+'BSE.json.gz'};
const OUT=process.env.OUT||'dalal-diary-project/public/stocks.json';
const EQ=/^INE[A-Z0-9]{6}01[A-Z0-9]{2}$/;
async function load(u){
  let b;if(/^https?:/.test(u)){const r=await fetch(u);if(!r.ok)throw new Error(u+' -> HTTP '+r.status);b=Buffer.from(await r.arrayBuffer())}else b=readFileSync(u);
  return JSON.parse(gunzipSync(b).toString());
}
const tc=s=>s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
const m=new Map();
for(const seg of ['NSE_EQ','BSE_EQ']){
  const rows=await load(SRC[seg]);let n=0;
  for(const r of rows){
    if(r.segment!==seg||!EQ.test(r.isin||''))continue;
    const e=m.get(r.isin)||{i:r.isin,n:'',ns:'',nk:'',bs:'',bk:''};
    const nm=r.short_name&&r.short_name!==r.trading_symbol?r.short_name:tc(r.name||r.trading_symbol);
    if(seg==='NSE_EQ'){e.ns=r.trading_symbol;e.nk=r.instrument_key;e.n=nm}else{e.bs=r.trading_symbol;e.bk=r.instrument_key;e.n=e.n||nm}
    m.set(r.isin,e);n++;
  }
  console.log(seg,'rows kept:',n);
}
const out=[...m.values()].sort((a,b)=>a.n.localeCompare(b.n)).map(e=>[e.i,e.n,e.ns,e.nk,e.bs,e.bk]);
console.log('companies:',out.length);
if(out.length<1000){console.error('Too few companies, refusing to overwrite stocks.json');process.exit(1)}
mkdirSync(dirname(OUT),{recursive:true});writeFileSync(OUT,JSON.stringify(out));
