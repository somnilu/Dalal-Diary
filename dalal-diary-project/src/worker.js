// Dalal Diary backend: guards your notes with a passphrase and talks to Supabase.
// Secrets (set in Cloudflare, never in this repo): APP_PASSPHRASE, SUPABASE_URL, SUPABASE_SECRET_KEY, UPSTOX_ANALYTICS_TOKEN
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const te=new TextEncoder();
async function same(a,b){const[x,y]=await Promise.all([crypto.subtle.digest('SHA-256',te.encode(a)),crypto.subtle.digest('SHA-256',te.encode(b))]);const u=new Uint8Array(x),v=new Uint8Array(y);let d=0;for(let i=0;i<u.length;i++)d|=u[i]^v[i];return d===0}
function sb(env,path,init={}){const k=env.SUPABASE_SECRET_KEY,h={apikey:k,'content-type':'application/json',...(init.headers||{})};if(k.startsWith('eyJ'))h.authorization='Bearer '+k;return fetch(env.SUPABASE_URL.replace(/\/+$/,'')+'/rest/v1/'+path,{...init,headers:h})}
const memo=new Map(),KEY=/^[A-Z_]{3,12}\|[A-Za-z0-9&._-]{1,30}$/;
const cmemo=new Map(),FU='https://api.upstox.com/v2/fundamentals/',fmemo=new Map();
async function up(env,isin,path){try{const r=await fetch(FU+isin+'/'+path,{headers:{accept:'application/json',authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN}});if(!r.ok)return{err:r.status};const b=await r.json();return b&&b.status==='success'&&b.data!=null?{d:b.data}:{err:'empty'}}catch(e){return{err:'failed'}}}
const okI=d=>d&&Array.isArray(d.income_statement)&&d.income_statement.some(c=>c&&c.history&&c.history.length),okB=d=>d&&Array.isArray(d.history)&&d.history.length;
// consolidated first; many smaller companies only report standalone, so fall back to that
async function both(env,isin,path,ok){const j=path.includes('?')?'&':'?',a=await up(env,isin,path+j+'type=consolidated');if(a.d&&ok(a.d))return a;const b=await up(env,isin,path+j+'type=standalone');return b.d&&ok(b.d)?b:a}
const UP={Prefer:'resolution=merge-duplicates,return=minimal'},SYM=/^[A-Za-z0-9&._-]{1,30}$/;
const done=r=>r.ok?J({ok:1}):J({error:'database error'},502);
export default{
  async fetch(req,env){
    const u=new URL(req.url),p=u.pathname;
    if(!p.startsWith('/api/'))return env.ASSETS?env.ASSETS.fetch(req):new Response('Not found',{status:404});
    if(!env.APP_PASSPHRASE||!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return J({error:'server not configured'},500);
    if(!(await same(req.headers.get('x-passphrase')||'',env.APP_PASSPHRASE))){await new Promise(r=>setTimeout(r,500));return J({error:'unauthorized'},401)}
    try{
      if(p==='/api/state'&&req.method==='GET'){
        const[a,b]=await Promise.all([sb(env,'stocks?select=symbol,cat,log&limit=10000'),sb(env,'settings?key=eq.cats&select=value')]);
        if(!a.ok||!b.ok)return J({error:'database error'},502);
        const s=await a.json(),c=await b.json();return J({stocks:s,cats:c[0]?c[0].value:null})}
      if(p==='/api/quotes'&&req.method==='GET'){
        if(!env.UPSTOX_ANALYTICS_TOKEN)return J({error:'prices not configured'},501);
        const ks=(u.searchParams.get('keys')||'').split(',').filter(Boolean).slice(0,100);
        if(!ks.length||!ks.every(k=>KEY.test(k)))return J({error:'bad keys'},400);
        const id=ks.slice().sort().join(','),hit=memo.get(id);
        if(hit&&Date.now()-hit.t<5000)return J(hit.d);
        const r=await fetch('https://api.upstox.com/v3/market-quote/ltp?instrument_key='+ks.map(encodeURIComponent).join(','),{headers:{accept:'application/json',authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN}});
        if(!r.ok)return J({error:'price service error',status:r.status},502);
        const b=await r.json(),q={};
        for(const k in b.data||{}){const d=b.data[k];q[d.instrument_token]=[d.last_price,d.cp,d.volume]}
        const out={q};memo.set(id,{t:Date.now(),d:out});if(memo.size>50)memo.delete(memo.keys().next().value);
        return J(out)}
      if(p==='/api/candles'&&req.method==='GET'){
        if(!env.UPSTOX_ANALYTICS_TOKEN)return J({error:'prices not configured'},501);
        const key=u.searchParams.get('key')||'';if(!KEY.test(key))return J({error:'bad key'},400);
        const hit=cmemo.get(key);if(hit&&Date.now()-hit.t<6e5)return J(hit.d);
        const ist=n=>new Date(Date.now()+19800000-n*864e5).toISOString().slice(0,10);
        const r=await fetch('https://api.upstox.com/v3/historical-candle/'+encodeURIComponent(key)+'/days/1/'+ist(0)+'/'+ist(372),{headers:{accept:'application/json',authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN}});
        if(!r.ok)return J({error:'price history error',status:r.status},502);
        const b=await r.json(),rows=((b.data&&b.data.candles)||[]).filter(x=>Array.isArray(x)&&x.length>=5&&isFinite(x[4])).map(x=>[String(x[0]).slice(0,10),+x[4],+x[2],+x[3]]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
        const out={c:rows};if(rows.length){cmemo.set(key,{t:Date.now(),d:out});if(cmemo.size>60)cmemo.delete(cmemo.keys().next().value)}
        return J(out)}
      if(p==='/api/fundamentals'&&req.method==='GET'){
        if(!env.UPSTOX_ANALYTICS_TOKEN)return J({error:'prices not configured'},501);
        const isin=u.searchParams.get('isin')||'';if(!/^IN[A-Z0-9]{10}$/.test(isin))return J({error:'bad isin'},400);
        const hit=fmemo.get(isin);if(hit&&Date.now()-hit.t<216e5)return J(hit.d);
        const[pr,kr,sh,inc,bs]=await Promise.all([up(env,isin,'profile'),up(env,isin,'key-ratios'),up(env,isin,'share-holdings'),both(env,isin,'income-statement?time_period=yearly',okI),both(env,isin,'balance-sheet',okB)]);
        const errs=[pr,kr,sh,inc,bs].map(x=>x.err).filter(Boolean);
        if(errs.length===5)return J({error:'fundamentals unavailable',status:errs[0]},502);
        const out={isin,t:Date.now(),
          prof:pr.d&&typeof pr.d==='object'?{t:pr.d.company_profile||'',sec:pr.d.sector||'',smc:pr.d.sector_market_cap_inr&&typeof pr.d.sector_market_cap_inr.value==='number'?{v:pr.d.sector_market_cap_inr.value}:null}:null,
          ratios:Array.isArray(kr.d)?kr.d.map(x=>({n:x.name,c:x.company_value,s:x.sector_value})):null,
          hold:Array.isArray(sh.d)?sh.d.map(x=>({k:x.category,h:(x.history||[]).slice(0,6).map(y=>({p:y.period,v:y.value}))})):null,
          inc:inc.d&&okI(inc.d)?{type:inc.d.type,rows:inc.d.income_statement.map(c=>({k:c.category,h:(c.history||[]).slice(0,5).map(y=>({p:y.period,v:y.value,ch:y.change||''}))}))}:null,
          bs:bs.d&&okB(bs.d)?{type:bs.d.type,h:bs.d.history.slice(0,5).map(y=>({p:y.period,a:y.total_asset,l:y.total_liability}))}:null};
        if(out.prof||out.ratios||out.hold||out.inc||out.bs){fmemo.set(isin,{t:Date.now(),d:out});if(fmemo.size>100)fmemo.delete(fmemo.keys().next().value)}
        return J(out)}
      if(p==='/api/settings'&&req.method==='PUT'){
        const b=await req.json();if(!Array.isArray(b.cats)||b.cats.length>40)return J({error:'bad body'},400);
        return done(await sb(env,'settings?on_conflict=key',{method:'POST',headers:UP,body:JSON.stringify({key:'cats',value:b.cats})}))}
      const m=p.match(/^\/api\/stock\/([^/]+)$/);
      if(m){const sym=decodeURIComponent(m[1]);if(!SYM.test(sym))return J({error:'bad symbol'},400);
        if(req.method==='PUT'){const b=await req.json();if(typeof b.cat!=='string'||b.cat.length>80||!Array.isArray(b.log)||b.log.length>5000)return J({error:'bad body'},400);
          return done(await sb(env,'stocks?on_conflict=symbol',{method:'POST',headers:UP,body:JSON.stringify({symbol:sym,cat:b.cat,log:b.log,updated_at:new Date().toISOString()})}))}
        if(req.method==='DELETE')return done(await sb(env,'stocks?symbol=eq.'+encodeURIComponent(sym),{method:'DELETE'}))}
      return J({error:'not found'},404)
    }catch(e){return J({error:'bad request'},400)}
  },
  // Daily ping so the free Supabase project never pauses from inactivity.
  async scheduled(_e,env){try{await sb(env,'settings?select=key&limit=1')}catch(e){}}
};
