'use strict';
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {ChannelType,PermissionFlagsBits}=require('discord.js');
const {DATA_DIR}=require('../store');
const PREFIX='NLMLBB1|';
const FILE=path.join(DATA_DIR,'mlbb-profiles.json');
const users=new Map(),messageIds=new Map(),queues=new Map();
let channel=null,ready=Promise.resolve(),isPersistent=false;
const userKey=id=>String(id);
const clone=x=>JSON.parse(JSON.stringify(x));

function normalizeRecord(raw){
  if(!raw||typeof raw!=='object')return {};
  const data={
    roleId:String(raw.roleId||''),zoneId:String(raw.zoneId||''),nickname:String(raw.nickname||'').slice(0,60),
    verifiedAt:raw.verifiedAt||null,live:raw.live&&typeof raw.live==='object'?raw.live:null,
    stats:raw.stats&&typeof raw.stats==='object'?raw.stats:{},
    matches:Array.isArray(raw.matches)?raw.matches.slice(-25):[],
    heroes:raw.heroes&&typeof raw.heroes==='object'?Object.fromEntries(Object.entries(raw.heroes).slice(0,35)):{},
    collection:raw.collection&&typeof raw.collection==='object'?raw.collection:{},
    public:Boolean(raw.public),xp:Math.min(500000,Math.max(0,Number(raw.xp)||0)),
    quiz:raw.quiz&&typeof raw.quiz==='object'?raw.quiz:{date:'',count:0,seen:[]},
    challenge:raw.challenge&&typeof raw.challenge==='object'?raw.challenge:{lastDate:'',streak:0},
    updatedAt:raw.updatedAt||new Date().toISOString(),
  };
  return data;
}
function parseLine(text){
  if(!text?.startsWith(PREFIX))return null;
  const parts=String(text).split('|');
  if(parts.length!==4||!/^\d{15,22}$/.test(parts[1]))return null;
  try{
    const buf=zlib.inflateRawSync(Buffer.from(parts[3],'base64url'),{maxOutputLength:120_000});
    const raw=JSON.parse(buf.toString('utf8'));
    return {id:parts[1],timestamp:Number(parts[2])||0,data:normalizeRecord(raw)};
  }catch{return null;}
}
function pack(id,record){
  const text=Buffer.from(JSON.stringify(normalizeRecord(record)));
  return `${PREFIX}${id}|${Date.now()}|${zlib.deflateRawSync(text,{level:9}).toString('base64url')}`;
}
async function writeLocal(){
  await fs.promises.mkdir(DATA_DIR,{recursive:true});
  const next=FILE+'.tmp';
  await fs.promises.writeFile(next,JSON.stringify(Object.fromEntries(users)));
  await fs.promises.rename(next,FILE);
}
async function init(client){
  ready=(async()=>{
    try{let raw=JSON.parse(await fs.promises.readFile(FILE,'utf8'));for(const [id,value] of Object.entries(raw||{})){if(/^\d{15,22}$/.test(id))users.set(id,normalizeRecord(value));}}catch{}
    const guilds=[...client.guilds.cache.values()];
    for(const g of guilds){
      const found=g.channels.cache.find(x=>x.name==='neverless-data'&&x.type===ChannelType.GuildText);
      if(found){channel=found;break;}
    }
    if(!channel){console.warn('[mlbb] No Neverless private data channel: local fallback only');return;}
    if(channel.permissionsFor(channel.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)){
      channel=null;console.warn('[mlbb] Data channel is public; refusing to write player records');return;
    }
    try{
      let before,loaded=0;
      do{
        const batch=await channel.messages.fetch({limit:100,before});
        if(!batch.size)break;
        for(const msg of batch.values()){
          if(msg.author.id!==client.user.id)continue;
          const rec=parseLine(msg.content);
          if(!rec)continue;
          const prev=loadedRecords.get(rec.id);
          if(!prev||rec.timestamp>=prev.timestamp){loadedRecords.set(rec.id,rec);messageIds.set(rec.id,msg.id);}
        }
        loaded+=batch.size;before=batch.last()?.id;
        if(batch.size<100)break;
      }while(loaded<3000);
      for(const [id,rec] of loadedRecords){users.set(id,rec.data);}
      isPersistent=true;
      console.log(`[mlbb] loaded ${loadedRecords.size} profiles from private Discord data`);
      // Persist local-only entries if a user had data before Discord channel was available.
      for(const [id,rec] of users){if(!loadedRecords.has(id))await persist(id,rec);}
      await writeLocal().catch(()=>{});
    }catch(error){channel=null;console.warn('[mlbb] Discord storage unavailable:',error.message);}
  })();
  const loadedRecords=new Map();
  return ready;
}
async function whenReady(){return ready;}
function get(id){return clone(users.get(userKey(id))||normalizeRecord({}));}
function list(){return [...users.entries()].map(([id,data])=>({id,data:clone(data)}));}
async function persist(id,data){
  if(!channel)return;
  const content=pack(id,data);
  if(content.length>1950)throw new Error('PROFILE_TOO_LARGE');
  const prior=messageIds.get(id);
  let msg=prior?await channel.messages.fetch(prior).catch(()=>null):null;
  if(msg)await msg.edit({content});
  else{msg=await channel.send({content});messageIds.set(id,msg.id);}
}
async function update(id,fn){
  const key=userKey(id);
  const previous=queues.get(key)||Promise.resolve();
  const action=previous.catch(()=>{}).then(async()=>{
    const before=get(key),candidate=fn(clone(before))||before;
    const normalized=normalizeRecord({...candidate,updatedAt:new Date().toISOString()});
    // Persist first; don't falsely claim success when storage is not writable.
    await persist(key,normalized);
    users.set(key,normalized);
    await writeLocal();
    return clone(normalized);
  });
  queues.set(key,action);try{return await action;}finally{if(queues.get(key)===action)queues.delete(key);}
}
async function remove(id){
  const key=userKey(id);
  await whenReady();
  const old=queues.get(key);if(old)await old.catch(()=>{});
  const mid=messageIds.get(key);
  if(mid && channel){const m=await channel.messages.fetch(mid).catch(()=>null);if(m)await m.delete();messageIds.delete(key);}
  users.delete(key);await writeLocal();
}
function storage(){return {discord:isPersistent,local:FILE};}
module.exports={init,whenReady,get,list,update,remove,parseLine,pack,storage,normalizeRecord};
