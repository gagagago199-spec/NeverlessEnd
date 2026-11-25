'use strict';
const crypto=require('node:crypto');
const {SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags}=require('discord.js');
const core=require('./core');
const arena=require('./arena');
const store=require('./data');
const roles=core.ROLES.map(x=>({name:x.toUpperCase(),value:x}));
const ranks=['warrior','elite','master','grandmaster','epic','legend','mythic','honor','glory','immortal'].map(x=>({name:x.toUpperCase(),value:x}));
const flag=MessageFlags?.Ephemeral||64;
const verifyPending=new Map(),verifyCooldown=new Map(),quizSessions=new Map();
const helpText=[
  '**NEVERLESS • MLBB LAB**',
  '/mlbb link ربط Game ID + Zone ID (غير موثق)',
  '/mlbb verify و/mlbb confirm تحقق اختياري بالبريد داخل اللعبة عبر Rone Arena',
  '/mlbb profile بطاقة حسابك • /mlbb update بيانات الرانك ونسبة الفوز',
  '/mlbb rate تقييم تقريبي للمستوى • /mlbb progress عدد الانتصارات المطلوبة',
  '/mlbb match سجّل مباراة وحلل القرارات • `/mlbb coach` خطة تحسين شخصية',
  '/mlbb mastery احفظ إحصائيات بطلك • /mlbb hero معلومات البطل',
  '/mlbb meta ترتيب الميتا • /mlbb draft كاونترات حسب البيانات المجتمعية',
  '/mlbb roulette بطل عشوائي حسب الخط • /mlbb quiz أسئلة درافت وماكرو',
  '/mlbb challenge مهمة يومية • /mlbb collection مجموعتك',
  '/mlbb leaderboard ترتيب XP لمن فعّل العرض • /mlbb privacy الخصوصية',
  '`/mlbb unlink` حذف حسابك وبياناته • /mlbb help المساعدة',
  '\n**مهم:** بيانات اللاعب المدخلة يدوياً ليست بيانات رسمية. بيانات الميتا من Rone Arena (غير رسمي). لا ترسل كلمة مرور أو رموز تحقق في الشات العام.',
].join('\n');

function rankChoices(o){return o.addChoices(...ranks);}
function laneChoices(o){return o.addChoices(...roles);}
function nopt(name,desc,min=0,max=100000){return o=>o.setName(name).setDescription(desc).setMinValue(min).setMaxValue(max).setRequired(true);}
const mlbbSlash=new SlashCommandBuilder().setName('mlbb').setDescription('NeverLess MLBB: الحساب والميتا والتدريب والتحديات')
.addSubcommand(s=>s.setName('help').setDescription('دليل نظام MLBB'))
.addSubcommand(s=>s.setName('link').setDescription('ربط ID وZone - غير موثّق').addStringOption(o=>o.setName('id').setDescription('Game ID').setMinLength(5).setMaxLength(15).setRequired(true)).addStringOption(o=>o.setName('zone').setDescription('Zone ID').setMinLength(2).setMaxLength(8).setRequired(true)).addStringOption(o=>o.setName('name').setDescription('اسم داخل اللعبة (اختياري)').setMaxLength(60)))
.addSubcommand(s=>s.setName('verify').setDescription('إرسال رمز التحقق داخل اللعبة عبر خدمة Rone Arena'))
.addSubcommand(s=>s.setName('confirm').setDescription('تأكيد رمز البريد داخل اللعبة (خاص)').addStringOption(o=>o.setName('code').setDescription('رمز التحقق 4 أرقام').setMinLength(4).setMaxLength(4).setRequired(true)))
.addSubcommand(s=>s.setName('unlink').setDescription('حذف حسابك وبيانات MLBB نهائياً'))
.addSubcommand(s=>s.setName('profile').setDescription('بطاقة حساب MLBB').addUserOption(o=>o.setName('member').setDescription('عضو فعّل مشاركة ملفه')))
.addSubcommand(s=>s.setName('update').setDescription('تسجيل إحصائياتك يدوياً').addIntegerOption(nopt('matches','عدد مباريات الرانك',1,200000)).addIntegerOption(nopt('wins','عدد الانتصارات',0,200000)).addStringOption(o=>rankChoices(o.setName('rank').setDescription('الرانك الحالي').setRequired(true))).addIntegerOption(o=>o.setName('stars').setDescription('النجوم الحالية').setMinValue(0).setMaxValue(2000)).addStringOption(o=>laneChoices(o.setName('role').setDescription('اللين الأساسي'))))
.addSubcommand(s=>s.setName('rate').setDescription('تقييم تقريبي من بياناتك المتاحة'))
.addSubcommand(s=>s.setName('progress').setDescription('كم فوز تحتاج للـWin Rate المستهدف').addIntegerOption(o=>o.setName('target').setDescription('النسبة المستهدفة (30-95)').setMinValue(30).setMaxValue(95).setRequired(true)))
.addSubcommand(s=>s.setName('mastery').setDescription('تسجيل إحصائيات شخصية').addStringOption(o=>o.setName('hero').setDescription('اسم الشخصية').setMinLength(2).setMaxLength(45).setRequired(true)).addIntegerOption(nopt('matches','مباريات الشخصية',1,200000)).addIntegerOption(nopt('wins','انتصارات الشخصية',0,200000)))
.addSubcommand(s=>s.setName('hero').setDescription('تحليل شخصية وإحصائياتك معها').addStringOption(o=>o.setName('name').setDescription('اسم الشخصية').setMinLength(2).setMaxLength(45).setRequired(true)))
.addSubcommand(s=>s.setName('match').setDescription('سجّل نتيجة مباراة وتحليلها').addStringOption(o=>o.setName('hero').setDescription('الشخصية').setMinLength(2).setMaxLength(45).setRequired(true)).addStringOption(o=>o.setName('role').setDescription('اللين').setRequired(true).addChoices(...roles)).addStringOption(o=>o.setName('result').setDescription('النتيجة').setRequired(true).addChoices({name:'Win',value:'win'},{name:'Loss',value:'loss'})).addIntegerOption(nopt('kills','Kills',0,99)).addIntegerOption(nopt('deaths','Deaths',0,99)).addIntegerOption(nopt('assists','Assists',0,99)))
.addSubcommand(s=>s.setName('coach').setDescription('خطة تدريب بناءً على آخر مبارياتك'))
.addSubcommand(s=>s.setName('meta').setDescription('أفضل شخصيات الميتا ببيانات آخر 7 أيام').addStringOption(o=>o.setName('rank').setDescription('مستوى الرانك').addChoices({name:'Mythic',value:'mythic'},{name:'Honor',value:'honor'},{name:'Glory',value:'glory'},{name:'All',value:'all'})))
.addSubcommand(s=>s.setName('draft').setDescription('كاونترات مرشحة ضد شخصية من الخصم').addStringOption(o=>o.setName('enemy').setDescription('شخصية الخصم').setMinLength(2).setMaxLength(45).setRequired(true)).addStringOption(o=>laneChoices(o.setName('role').setDescription('اللين المطلوب'))))
.addSubcommand(s=>s.setName('roulette').setDescription('اختيار شخصية عشوائية حسب اللين').addStringOption(o=>o.setName('role').setDescription('اختار اللين').setRequired(true).addChoices(...roles)))
.addSubcommand(s=>s.setName('quiz').setDescription('اختبار تفاعلي ماكرو ودرافت وكسب XP'))
.addSubcommand(s=>s.setName('challenge').setDescription('المهمة اليومية + التقدم وXP'))
.addSubcommand(s=>s.setName('collection').setDescription('تسجيل مجموعة الأبطال والسكنات').addIntegerOption(nopt('heroes','عدد الأبطال',0,300)).addIntegerOption(nopt('skins','عدد السكنات',0,1500)).addIntegerOption(nopt('epic','Epic skins',0,1500)).addIntegerOption(nopt('collector','Collector skins',0,200)).addIntegerOption(nopt('legend','Legend skins',0,200)))
.addSubcommand(s=>s.setName('leaderboard').setDescription('ترتيب مجتمع NeverLess بنقاط التدريب المعلنة'))
.addSubcommand(s=>s.setName('privacy').setDescription('من يسمح له برؤية ملفك').addStringOption(o=>o.setName('setting').setDescription('مشاركة ملفك').setRequired(true).addChoices({name:'Public',value:'public'},{name:'Private',value:'private'})))
;

function embed(title,description,fields=[]){const b=new EmbedBuilder().setColor(0x29476a).setTitle(title).setDescription(String(description||'').slice(0,3900)).setFooter({text:'NeverLess MLBB • Rone Arena data is unofficial • يدوياً ما لم يذكر خلاف ذلك'});if(fields.length)b.addFields(fields.map(x=>({name:x.name,value:String(x.value).slice(0,1000),inline:!!x.inline})));return b;}
function round(n,d=1){return Number.isFinite(Number(n))?Number(n).toFixed(d):'—';}
function labelProfile(d){return d.verifiedAt?'موثّق عبر Rone Arena':'غير موثّق (بيانات مدخلة يدوياً)';}
function needsProfile(d){return !!d.roleId&&!!d.zoneId;}
function validateHero(name){return /^[\p{L}\p{N} .'-]{2,45}$/u.test(name);}
function asDate(ts){const t=Date.parse(ts||'');return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'—';}
function niceError(e){const v=String(e?.message||'');if(v.includes('RATE_LIMIT'))return 'الخدمة عليها ضغط، جرّب بعد فترة.';if(v.includes('API_')||v.includes('HTTP_')||v.includes('fetch')||v.includes('timeout')||v.includes('UNAVAILABLE'))return 'خدمة Rone Arena ما ردّت الآن. جرب لاحقاً؛ باقي أوامر MLBB تعمل بدونها.';if(v==='PROFILE_TOO_LARGE')return 'سجل الحساب كبير؛ حاول مجدداً بعد تقليل سجلات المباريات.';return 'تعذّر إكمال العملية. راجع سجلات البوت أو حاول مرة ثانية.';}
async function send(i,payload){return i.editReply(typeof payload==='string'?{content:payload,allowedMentions:{parse:[]}}:{...payload,allowedMentions:{parse:[]}});}
function profileText(d){const s=d.stats||{},rate=core.calculateRating(d),profile=[`**${core.cleanText(d.nickname||d.live?.name||'Player')}** • ${labelProfile(d)}`,`ID: ${d.roleId||'غير مربوط'} (${d.zoneId||'—'})`,`Rank (يدوي): ${s.rank||'—'}${s.stars!==null&&s.stars!==undefined?` • ${s.stars} ⭐`:''}`,`Win Rate (يدوي): ${core.percent(s.wins,s.matches)??'—'}% (${s.wins??0}/${s.matches??0})`,`أفضل لين: ${s.role||'—'} • سجل مباريات: ${(d.matches||[]).length}`,`تقدير NeverLess: ${rate.score??'—'}/100 • ثقة ${rate.confidence} • تغطية ${rate.coverage}%`,`Coach XP: ${d.xp||0} • عرض الملف: ${d.public?'عام':'خاص'}`];if(d.verifiedAt)profile.push(`تحقق هوية: ${asDate(d.verifiedAt)} • مستوى ${d.live?.level??'—'} • رتبة API الخام: ${d.live?.rankLevel??'—'}`);return profile.join('\n');}
function safeName(name){return core.cleanText(name,45);}
function memoInteraction(i){return `${i.user.id}:${i.guildId}`;}

async function runCommand(i){
  const sub=i.options.getSubcommand();
  await i.deferReply({flags:flag});
  await store.whenReady();
  const userId=i.user.id;
  const d=store.get(userId);
  if(sub==='help')return send(i,{embeds:[embed('Mobile Legends • NeverLess',helpText)]});
  if(sub==='link'){
    const roleId=i.options.getString('id'),zoneId=i.options.getString('zone');
    if(!core.validPlayerId(roleId)||!core.validZone(zoneId))return send(i,'Game ID أو Zone ID غير صالح. اكتب أرقام فقط.');
    if(d.verifiedAt&&(d.roleId!==roleId||d.zoneId!==zoneId))return send(i,'الحساب الحالي موثّق. استخدم `/mlbb unlink` إذا تريد تغييره.');
    await store.update(userId,x=>{const changed=Boolean(x.roleId)&&(x.roleId!==roleId||x.zoneId!==zoneId);return {...x,roleId,zoneId,nickname:safeName(i.options.getString('name')||x.nickname),verifiedAt:changed?null:x.verifiedAt,live:changed?null:x.live,stats:changed?{}:x.stats,matches:changed?[]:x.matches,heroes:changed?{}:x.heroes,collection:changed?{}:x.collection};});
    return send(i,'تم تسجيل ID وZone. **هذا ربط يدوي وليس إثبات ملكية.** للتوثيق: /mlbb verify ثم /mlbb confirm.');
  }
  if(sub==='verify'){
    if(!needsProfile(d))return send(i,'اربط حسابك أولاً باستخدام /mlbb link.');
    const cooldown=verifyCooldown.get(userId)||0;
    if(Date.now()-cooldown<5*60_000)return send(i,'سبق طلب رمز مؤخراً. انتظر 5 دقائق قبل إعادة الطلب.');
    verifyCooldown.set(userId,Date.now());
    try{await arena.requestCode(d.roleId,d.zoneId);}catch(e){verifyCooldown.delete(userId);return send(i,niceError(e));}
    verifyPending.set(userId,{roleId:d.roleId,zoneId:d.zoneId,expires:Date.now()+5*60_000});
    return send(i,'أُرسل طلب رمز إلى بريدك **داخل لعبة MLBB** عبر خدمة Rone Arena المجتمعية. خلال 5 دقائق استخدم /mlbb confirm وأدخل الرمز في خيار الأمر الخاص. **لا تنشر الرمز بالشات**؛ الربط يستخدم خدمة طرف ثالث غير تابعة لـMoonton.');
  }
  if(sub==='confirm'){
    const pending=verifyPending.get(userId),vc=i.options.getString('code');
    if(!pending||pending.expires<Date.now())return send(i,'انتهت مهلة التحقق. استخدم /mlbb verify من جديد.');
    if(!/^\d{4}$/.test(vc))return send(i,'الرمز يجب أن يكون 4 أرقام.');
    verifyPending.delete(userId);
    try{
      const result=await arena.authenticateOnce(pending.roleId,pending.zoneId,vc);
      const info=result.info||{};
      const saved=await store.update(userId,x=>({...x,roleId:pending.roleId,zoneId:pending.zoneId,nickname:core.cleanText(info.name||x.nickname,60),verifiedAt:new Date().toISOString(),live:{name:core.cleanText(info.name,60),level:Number(info.level)||null,rankLevel:Number(info.rank_level)||null,highestRankLevel:Number(info.history_rank_level)||null,country:core.cleanText(info.reg_country,8),lastSync:new Date().toISOString()}}));
      return send(i,`تم **التحقق من ملكية الحساب** وحفظ الاسم والرتبة والمستوى الظاهرين من Rone Arena، بدون حفظ JWT أو رموز الدخول.\n${profileText(saved)}`);
    }catch(err){return send(i,`لم يكتمل التحقق: ${niceError(err)}. اطلب رمزاً جديداً وحاول مرة أخرى.`);}
  }
  if(sub==='unlink'){
    await store.remove(userId);verifyPending.delete(userId);quizSessions.delete(userId);
    return send(i,'حُذف ملفك وإحصائياتك ومبارياتك ونقاط تدريب MLBB من تخزين NeverLess. هذا لا يحذف أي شيء داخل اللعبة نفسها.');
  }
  if(sub==='profile'){
    const target=i.options.getUser('member')||i.user,p=store.get(target.id);
    if(target.id!==userId&&!p.public)return send(i,'ملف هذا العضو خاص أو غير موجود.');
    return send(i,{embeds:[embed('MLBB Account Profile',profileText(p))]});
  }
  if(sub==='update'){
    const matches=i.options.getInteger('matches'),wins=i.options.getInteger('wins');
    if(wins>matches)return send(i,'الانتصارات لا يمكن أن تتجاوز عدد المباريات.');
    const rank=i.options.getString('rank'),stars=i.options.getInteger('stars'),role=i.options.getString('role');
    const next=await store.update(userId,x=>({...x,stats:{matches,wins,rank,stars,role:role||x.stats.role||null,source:'manual',updatedAt:new Date().toISOString()}}));
    return send(i,`تم تحديث الإحصائيات **المدخلة يدوياً**. Win Rate: **${core.percent(wins,matches)}%**.\n${profileText(next)}`);
  }
  if(sub==='rate'){
    const r=core.calculateRating(d);
    if(r.score===null)return send(i,'ما عندي بيانات كافية. ابدأ بـ/mlbb update وسجل مباريات بواسطة /mlbb match.');
    return send(i,{embeds:[embed(`NeverLess Rating • ${r.score}/100`,`**تقدير مستوى وليس تصنيفاً رسمياً.** ثقة: ${r.confidence} • تغطية: ${r.coverage}%\n`+r.parts.map(x=>`${x.name}: ${x.value}/100`).join('\n')+'\n\nلرفع دقة النتيجة سجل آخر مبارياتك وKDA.')]});
  }
  if(sub==='progress'){
    const s=d.stats||{},target=i.options.getInteger('target');
    const wins=core.winsToTarget(s.wins,s.matches,target);
    if(wins===null)return send(i,'سجّل إجمالي المباريات والانتصارات أولاً من /mlbb update.');
    return send(i,`نسبة الفوز الحالية **${core.percent(s.wins,s.matches)}%** (${s.wins}/${s.matches}).\nللوصول إلى **${target}%** تحتاج **${wins} فوز متتالٍ** إذا لم تخسر أي مباراة خلال ذلك. هذه حسبة وليست توقعاً للنتائج.`);
  }
  if(sub==='mastery'){
    const name=safeName(i.options.getString('hero')),matches=i.options.getInteger('matches'),wins=i.options.getInteger('wins');
    if(!validateHero(name)||wins>matches)return send(i,'تأكد من اسم الشخصية، وأن الانتصارات لا تتجاوز عدد المباريات.');
    await store.update(userId,x=>({...x,heroes:{...x.heroes,[name.toLowerCase()]:{name,matches,wins,source:'manual',updatedAt:new Date().toISOString()}}}));
    return send(i,`تم تسجيل **${name}**: ${matches} مباراة و${wins} فوز • **${core.percent(wins,matches)}% WR** (مدخل يدوياً).`);
  }
  if(sub==='hero'){
    const name=safeName(i.options.getString('name'));
    if(!validateHero(name))return send(i,'اسم الشخصية غير صالح.');
    const h=d.heroes[name.toLowerCase()];
    const note=h?`إحصائياتك: ${h.matches} مباراة • ${core.percent(h.wins,h.matches)}% WR (يدوي).`:'ما سجلت إحصائيات هذه الشخصية بعد. استخدم /mlbb mastery.';
    try{
      const res=await arena.hero(name);
      const rows=arena.heroesFrom(res),row=rows[0];
      const data=row?.win_rate?.[0]||row?.winRate||row?.data||{};
      const wr=data.win_rate!==undefined?arena.pct(data.win_rate):null;
      return send(i,`**${name} — MLBB Hero Lab**\n${note}\n${wr===null?'تم جلب بيانات الشخصية لكن صيغة إحصائياتها غير قابلة للقراءة حالياً.':`Win Rate بالمصدر المجتمعي: ${wr}% (7 أيام)`}\n**نصيحة:** قارِن قوة الشخصية بمدى إتقانك لها وبالتركيبة، مو بنسبة الفوز وحدها.\nالمصدر: https://arena.rone.dev`);
    }catch{return send(i,`**${name}**\n${note}\nخدمة إحصائيات الميتا غير متاحة مؤقتاً؛ بإمكانك استخدام سجل التدريب بدونها.`);}
  }
  if(sub==='match'){
    const hero=safeName(i.options.getString('hero')),role=i.options.getString('role'),result=i.options.getString('result');
    const kills=i.options.getInteger('kills'),deaths=i.options.getInteger('deaths'),assists=i.options.getInteger('assists');
    if(!validateHero(hero))return send(i,'اسم الشخصية غير صالح.');
    const sameDay=d.matches.filter(x=>x.date?.startsWith(core.todayUTC())).length;
    if(sameDay>=25)return send(i,'وصلت إلى حد تسجيل 25 مباراة لهذا اليوم.');
    const match={id:crypto.randomBytes(5).toString('hex'),date:new Date().toISOString(),hero,role,result,kills,deaths,assists,source:'manual'};
    const next=await store.update(userId,x=>{
      const previous=core.challengeProgress(x,userId);
      x.matches=[...(x.matches||[]),match].slice(-25);
      const current=core.challengeProgress(x,userId);
      const rewarded=x.challenge?.lastDate===core.todayUTC();
      if(!previous.completed&&current.completed&&!rewarded){x.xp=(x.xp||0)+25;const yesterday=new Date(Date.now()-86400_000).toISOString().slice(0,10); x.challenge={lastDate:core.todayUTC(),streak:(x.challenge?.lastDate===yesterday?(x.challenge?.streak||0)+1:1)};}
      // A few manual logs should not manufacture an unlimited leaderboard score.
      x.xp=(x.xp||0)+(sameDay<5?2:0);
      return x;
    });
    const review=core.matchAnalysis(match),challenge=core.challengeProgress(next,userId);
    return send(i,`**${result==='win'?'WIN':'LOSS'} • ${hero} (${role})**\nK/D/A: **${kills}/${deaths}/${assists}** • KDA: **${review.kda}**\n${review.tips.map(x=>'• '+x).join('\n')}\n\nتحدي اليوم: ${challenge.label} (${challenge.progress}/${challenge.target}) ${challenge.completed?'• مكتمل':''} • XP ${next.xp} \n*هذه مباراة سجلتها بنفسك، ليست مسحوبة آلياً.*`);
  }
  if(sub==='coach'){
    const c=core.coaching(d);
    return send(i,{embeds:[embed('NeverLess Coach • خطة تحسين',`دورك: **${c.role.toUpperCase()}** • آخر 10 مباريات مسجلة: ${c.wr??'—'}% WR • متوسط الوفيات ${c.deaths===null?'—':round(c.deaths)}\n\n${c.tips.map((x,idx)=>`${idx+1}. ${x}`).join('\n')}\n\n**هدف قابل للقياس:** ${c.goal}\n*التحليل بناءً على المباريات التي سجلتها، ولا يغني عن مراجعة الريپلاي.*`)]});
  }
  if(sub==='meta'){
    const rank=i.options.getString('rank')||'mythic';
    try{const rows=await arena.meta({rank});if(!rows.length)throw Error('EMPTY');return send(i,{embeds:[embed(`MLBB Meta • ${rank.toUpperCase()} • 7 days`,rows.slice(0,8).map((x,idx)=>`**${idx+1}. ${x.name}** • WR ${round(x.winRate)}% • Ban ${round(x.banRate)}%`).join('\n')+'\n\nتصنيف **حسب Win Rate فقط** وليس Tier List شاملة. المصدر: https://arena.rone.dev')]});}
    catch(e){return send(i,niceError(e));}
  }
  if(sub==='draft'){
    const enemy=safeName(i.options.getString('enemy')),lane=i.options.getString('role');
    if(!validateHero(enemy))return send(i,'اكتب اسم شخصية خصم صالح.');
    try{
      const [raw,names]=await Promise.all([arena.counters(enemy),arena.heroNames()]);
      const row=arena.heroesFrom(raw)[0];
      let pool=(row?.sub_hero||[]).map(x=>({name:names.get(Number(x.heroid))||null,impact:Number(x.increase_win_rate)||0})).filter(x=>x.name);
      if(lane){const allowed=await arena.roleHeroes(lane).catch(()=>[]);if(allowed.length)pool=pool.filter(x=>allowed.some(y=>y.toLowerCase()===x.name.toLowerCase()));}
      pool.sort((a,b)=>b.impact-a.impact);
      if(!pool.length)return send(i,`ما حصلت Counter موثوق${lane ? ' للـ'+lane : ''} ضد ${enemy} من الخدمة حالياً. جرب /mlbb meta أو لا تعتمد على كاونتر نظري لحاله.`);
      return send(i,{embeds:[embed(`Draft Lab • ضد ${enemy}`,pool.slice(0,5).map((x,idx)=>`${idx+1}. **${x.name}** • فرق WR مرتبط بالمواجهة ${round(x.impact*100)} نقطة`).join('\n')+'\n\n**قاعدة:** اختار البطل فقط إذا تتقنه ويناسب ضرر وCC فريقك. هذه بيانات ارتباطية غير رسمية، لا تعني ضمان الفوز.\nالمصدر: https://arena.rone.dev')]});
    }catch(e){return send(i,niceError(e));}
  }
  if(sub==='roulette'){
    const lane=i.options.getString('role');let pool,source='قائمة احتياطية محلية';
    try{pool=await arena.roleHeroes(lane);if(pool.length)source='Rone Arena • أبطال اللين';}catch{}
    return send(i,`**MLBB Roulette • ${lane.toUpperCase()}**\nاختيارك: **${core.chooseHero(lane,pool)}**\nالتحدي: العب مباراة، وبعدها سجّل KDA عبر /mlbb match.\n*المصدر: ${source}*`);
  }
  if(sub==='quiz')return sendQuiz(i,userId);
  if(sub==='challenge'){
    const c=core.challengeProgress(d,userId),streak=d.challenge?.streak||0;
    return send(i,{embeds:[embed('Daily MLBB Mission',`**${c.label}**\nالتقدم: **${c.progress}/${c.target}** • ${c.completed?'مكتمل':'قيد التنفيذ'}\nالمكافأة: **25 XP** عند الإكمال لمرة واحدة باليوم.\nسلسلة المهمات المكتملة: ${streak} • XP الحالي: ${d.xp||0}\n\nسجّل المباريات في /mlbb match؛ النتائج إدخال يدوي.`)]});
  }
  if(sub==='collection'){
    const values={heroes:i.options.getInteger('heroes'),skins:i.options.getInteger('skins'),epic:i.options.getInteger('epic'),collector:i.options.getInteger('collector'),legend:i.options.getInteger('legend')};
    if(values.epic+values.collector+values.legend>values.skins)return send(i,'مجموع فئات السكنات لا يمكن يكون أكثر من إجمالي السكنات.');
    const next=await store.update(userId,x=>({...x,collection:{...values,source:'manual'}}));
    const r=core.rateCollection(next.collection);
    return send(i,`**Collection Lab**\nالأبطال: ${values.heroes} • السكنات: ${values.skins}\nEpic: ${values.epic} • Collector: ${values.collector} • Legend: ${values.legend}\nتقييم **اتساع المجموعة**: ${r.score}/100 — ${r.tier}.\n*هذا ليس سعراً للبيع، والمعلومات لم يتم إثباتها آلياً.*`);
  }
  if(sub==='leaderboard'){
    const ranked=store.list().filter(({data})=>data.public).sort((a,b)=>(b.data.xp||0)-(a.data.xp||0)).slice(0,10);
    return send(i,{embeds:[embed('NeverLess • Training Leaderboard',ranked.length?ranked.map(({id,data},index)=>`${index+1}. <@${id}> • **${data.xp||0} XP**`).join('\n')+'\n\nXP مكتسبة من أسئلة وتسجيل مباريات ذاتي، ليست ترتيب MLBB الرسمي.':'ما في أحد مشارك ملفه حالياً. استخدم `/mlbb privacy public` للانضمام.')]});
  }
  if(sub==='privacy'){
    const isPublic=i.options.getString('setting')==='public';
    await store.update(userId,x=>({...x,public:isPublic}));
    return send(i,isPublic?'ملفك ونقاط التدريب ظاهرة لغيرك الآن. يمكنك العودة إلى Private بأي وقت.':'ملفك صار خاص. بياناتك لا تظهر في لوحة الترتيب.');
  }
  return send(i,'أمر غير معروف. استخدم /mlbb help.');
}

function quizButtons(q,sessionId){return [new ActionRowBuilder().addComponents(q.choices.map((v,index)=>new ButtonBuilder().setCustomId(`mlbb:q:${sessionId}:${index}`).setStyle(ButtonStyle.Secondary).setLabel(`${index+1}. ${core.cleanText(v,72)}`)))];}
async function sendQuiz(i,userId){
  const today=core.todayUTC(),data=store.get(userId),used=data.quiz?.date===today?(data.quiz?.seen||[]):[];
  const q=core.quizFor(userId,used);const sid=crypto.randomBytes(6).toString('hex');
  quizSessions.set(userId,{sid,questionId:q.id,expires:Date.now()+15*60_000,answered:false});
  return send(i,{embeds:[embed('MLBB Macro & Draft Quiz',`**${q.q}**\nاختر الإجابة الصحيحة من الأزرار. كل إجابة صحيحة تعطيك 5 XP (حتى 10 أسئلة يومياً).`)],components:quizButtons(q,sid)});
}
async function onButton(i){
  const [,type,sid,choiceStr]=i.customId.split(':');if(type!=='q')return;
  if(i.user?.bot)return;
  await i.deferReply({flags:flag});
  await store.whenReady();
  const session=quizSessions.get(i.user.id);const choice=Number(choiceStr);
  if(!session||session.sid!==sid||session.expires<Date.now()||session.answered||!Number.isInteger(choice)||choice<0||choice>2)return send(i,'هذا الاختبار انتهى أو تم الإجابة عليه. استخدم /mlbb quiz لجولة جديدة.');
  session.answered=true;
  const quiz=core.QUIZZES.find(x=>x.id===session.questionId);
  if(!quiz)return send(i,'السؤال لم يعد متاحاً.');
  const correct=choice===quiz.correct;
  let gained=0;
  await store.update(i.user.id,x=>{
    const today=core.todayUTC(),q=x.quiz?.date===today?x.quiz:{date:today,count:0,seen:[]};
    if(!q.seen.includes(quiz.id)){
      q.seen.push(quiz.id);q.count=(q.count||0)+1;
      if(correct&&q.count<=10){gained=5;x.xp=(x.xp||0)+5;}
    }
    x.quiz=q;return x;
  });
  return send(i,`${correct?'**صحيح!**':'**مو صحيح هالمرة.**'}\nالجواب: **${quiz.choices[quiz.correct]}**\n${quiz.why}\n${gained?`+${gained} XP`:'بدون نقاط إضافية'} • تبي جولة جديدة؟ استخدم /mlbb quiz.`);
}
let installed=false;
function installMlbb(client){
  if(installed)return;installed=true;
  client.once('ready',()=>{store.init(client).catch(e=>console.warn('[mlbb] storage init:',e.message));console.log('[mlbb] NeverLess MLBB Lab installed');});
  client.on('interactionCreate',i=>{
    if(i.isChatInputCommand?.()&&i.commandName==='mlbb')runCommand(i).catch(async e=>{console.warn('[mlbb] command error:',e?.code||e?.message);const message=niceError(e);if(i.deferred||i.replied)await i.editReply({content:message,components:[]}).catch(()=>{});else await i.reply({content:message,flags:flag}).catch(()=>{});});
    if(i.isButton?.()&&i.customId?.startsWith('mlbb:q:'))onButton(i).catch(async e=>{console.warn('[mlbb] quiz button error:',e?.message);if(i.deferred||i.replied)await i.editReply({content:niceError(e),components:[]}).catch(()=>{});else await i.reply({content:niceError(e),flags:flag}).catch(()=>{});});
  });
}
module.exports={mlbbSlash,installMlbb,runCommand,onButton,helpText};
