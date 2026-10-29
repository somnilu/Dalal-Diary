// Dalal Diary backend: guards your notes with a passphrase and talks to Supabase.
// Secrets (set in Cloudflare, never in this repo): APP_PASSPHRASE, SUPABASE_URL, SUPABASE_SECRET_KEY
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const te=new TextEncoder();
async function same(a,b){const[x,y]=await Promise.all([crypto.subtle.digest('SHA-256',te.encode(a)),crypto.subtle.digest('SHA-256',te.encode(b))]);const u=new Uint8Array(x),v=new Uint8Array(y);let d=0;for(let i=0;i<u.length;i++)d|=u[i]^v[i];return d===0}
function sb(env,path,init={}){const k=env.SUPABASE_SECRET_KEY,h={apikey:k,'content-type':'application/json',...(init.headers||{})};if(k.startsWith('eyJ'))h.authorization='Bearer '+k;return fetch(env.SUPABASE_URL.replace(/\/+$/,'')+'/rest/v1/'+path,{...init,headers:h})}
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
