'use strict';

// Rone Arena is a community service, not an official Moonton API.
// No JWT, OTP or session credential is persisted in Discord or on disk.
const BASES=['https://arena.fastapicloud.dev/api','https://arena.rone.dev/api'];
const cache=new Map();
const TTL=12*60*1000;

async function request(path, {method='GET', body=null, jwt=null, cacheMs=0}={}){
  if(!/^\/(?:heroes|user)\/[A-Za-z0-9_/?=&.,%-]+$/.test(path))throw new Error('INVALID_ARENA_PATH');
  if(cacheMs && cache.has(path) && Date.now()-cache.get(path).time<cacheMs)return cache.get(path).data;
  let last=new Error('ARENA_UNAVAILABLE');
  for(const base of BASES){
    try{
      const headers={'Accept':'application/json','User-Agent':'NeverLess-MLBB/1.0'};
      if(body)headers['Content-Type']='application/json';
      if(jwt)headers.Authorization=`Bearer ${jwt}`;
      const resp=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8500),redirect:'error'});
      if(resp.status===429)throw new Error('ARENA_RATE_LIMIT');
      if(!resp.ok)throw new Error(`ARENA_HTTP_${resp.status}`);
      const value=await resp.text();
      if(value.length>1_500_000)throw new Error('ARENA_RESPONSE_TOO_LARGE');
      const json=JSON.parse(value);
      if(json?.code!==0 && json?.code!=='0')throw new Error(`ARENA_API_${String(json?.code??'UNKNOWN').slice(0,12)}`);
      if(cacheMs)cache.set(path,{time:Date.now(),data:json.data});
      return json.data;
    }catch(error){last=error;if(!String(error?.message).startsWith('ARENA_HTTP_503') && !String(error?.message).includes('fetch failed')){
      // For auth failures, do not retry credentials against the mirror unless the first host is down.
      if(method!=='GET')break;
    }}
  }
  throw last;
}
function rankSafe(rank){return ['all','epic','legend','mythic','honor','glory'].includes(rank)?rank:'mythic';}
function pct(v){const n=Number(v);if(!Number.isFinite(n))return null;return Math.round((n<=1?n*100:n)*10)/10;}
function heroesFrom(data){return (Array.isArray(data?.records)?data.records:[]).map(x=>x.data||x).filter(Boolean);}
async function meta({rank='mythic',lane=null}={}){
  const rows=heroesFrom(await request(`/heroes/rank?days=7&rank=${rankSafe(rank)}&sort_field=win_rate&sort_order=desc&size=60`,{cacheMs:TTL}));
  const named=rows.map(r=>({name:r.main_hero?.data?.name || '',id:r.main_heroid,winRate:pct(r.main_hero_win_rate),banRate:pct(r.main_hero_ban_rate),pickRate:pct(r.main_hero_appearance_rate)})).filter(x=>x.name);
  // Ranked endpoint has no lane filter. Do not invent lane results.
  return named.slice(0,10);
}
async function hero(name,rank='mythic'){
  if(!/^[\p{L}\p{N} .'-]{1,45}$/u.test(name))throw new Error('INVALID_HERO');
  const path=`/heroes/${encodeURIComponent(name)}/stats?days=7&rank=${rankSafe(rank)}&lang=en`;
  return request(path,{cacheMs:TTL});
}
async function counters(name,rank='mythic'){
  if(!/^[\p{L}\p{N} .'-]{1,45}$/u.test(name))throw new Error('INVALID_HERO');
  return request(`/heroes/${encodeURIComponent(name)}/counters?days=7&rank=${rankSafe(rank)}&size=20&lang=en`,{cacheMs:TTL});
}
async function heroNames(){
  const rows=heroesFrom(await request('/heroes?size=200&index=1&lang=en',{cacheMs:TTL}));
  return new Map(rows.map(r=>[Number(r.hero_id),r.hero?.data?.name]).filter(([id,name])=>Number.isFinite(id)&&name));
}
async function roleHeroes(lane){
  if(!['mid','gold','roam','exp','jungle'].includes(lane))throw new Error('INVALID_LANE');
  const rows=heroesFrom(await request(`/heroes/positions?lane=${lane}&size=150&lang=en`,{cacheMs:TTL}));
  return [...new Set(rows.map(x=>x.hero?.data?.name).filter(Boolean))];
}
async function requestCode(roleId,zoneId){return request('/user/auth/send-vc',{method:'POST',body:{role_id:Number(roleId),zone_id:Number(zoneId)}});}
async function authenticateOnce(roleId,zoneId,vc){
  const login=await request('/user/auth/login',{method:'POST',body:{role_id:Number(roleId),zone_id:Number(zoneId),vc:Number(vc)}});
  const jwt=login?.jwt;
  if(typeof jwt!=='string'||jwt.length<30)throw new Error('ARENA_NO_JWT');
  try {
    const info=await request('/user/info?lang=en',{jwt});
    if(String(info?.roleId??info?.roleid)!==String(roleId)||String(info?.zoneId??info?.zoneid)!==String(zoneId))throw new Error('ARENA_IDENTITY_MISMATCH');
    // These routes are deprecated: best-effort only, never a requirement for linking.
    const stats=await request('/user/stats?lang=en',{jwt}).catch(()=>null);
    const matches=await request('/user/matches?limit=10&lang=en',{jwt}).catch(()=>null);
    return {info,stats,matches};
  } finally {
    await request('/user/auth/logout',{method:'POST',jwt}).catch(()=>null);
  }
}
module.exports={request,meta,hero,counters,roleHeroes,heroNames,requestCode,authenticateOnce,heroesFrom,pct};
