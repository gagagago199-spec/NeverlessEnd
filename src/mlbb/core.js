'use strict';

const ROLES = Object.freeze(['mid', 'gold', 'roam', 'exp', 'jungle']);
const FALLBACK_HEROES = Object.freeze({
  mid: ['Kagura', 'Lunox', 'Valentina', 'Pharsa', 'Yve', 'Xavier', 'Novaria', 'Zhuxin', 'Luo Yi', 'Vexana', 'Aurora', 'Cecilion', 'Gusion'],
  gold: ['Claude', 'Brody', 'Harith', 'Beatrix', 'Moskov', 'Bruno', 'Ixia', 'Melissa', 'Karrie', 'Wanwan', 'Lesley', 'Natan'],
  roam: ['Mathilda', 'Tigreal', 'Khufra', 'Lolita', 'Minotaur', 'Diggie', 'Kaja', 'Hylos', 'Chou', 'Angela', 'Floryn', 'Akai'],
  exp: ['Terizla', 'Yu Zhong', 'Arlott', 'Ruby', 'Benedetta', 'X.Borg', 'Cici', 'Lapu-Lapu', 'Edith', 'Phoveus', 'Guinevere'],
  jungle: ['Fredrinn', 'Ling', 'Nolan', 'Fanny', 'Hayabusa', 'Julian', 'Suyou', 'Lancelot', 'Akai', 'Martis', 'Roger', 'Gusion'],
});
const RANK_SCORE = Object.freeze({ warrior: 10, elite: 20, master: 30, grandmaster: 40, epic: 50, legend: 62, mythic: 75, honor: 84, glory: 92, immortal: 100 });
const TIPS = Object.freeze({
  mid: ['ادفع الموجة قبل الروتيشن، ولا تترك برجك والخط مليان.', 'قبل التيرتل: نظّف Mid وتأكد من مكان الجانقلر والروامر.', 'لا تدخل الفايت حتى يظهر مصدر الـCC الأساسي أو يصير عندكم أفضلية.'],
  gold: ['راقب موقع جانقلر العدو قبل ما تتقدم للبرج الثاني.', 'استخدم الفلاش/الباتل سبيل للنجاة من أول دخول وليس للتعويض بعد الموت.', 'انتبه لتوقيت أول عنصر ضرر قبل ما تدخل 2v2.'],
  roam: ['افتح الخريطة بالرؤية وليس بالموت؛ ادخل فقط إذا أحد يقدر يتبعك.', 'وزّع وقتك حسب objective والضغط، لا تتعلق بخط واحد.', 'قبل أي Engage تأكد أن مصدر الضرر عندكم قريب وعنده أدواته.'],
  exp: ['احسب من يملك أفضلية الموجة قبل التنقل للتيرتل.', 'ادخل من زاوية Flank ولا تستهلك مواردك على التانك بدون سبب.', 'بعد الفوز بالتبادل، حوّل الضغط إلى برج أو هدف.'],
  jungle: ['توقيت التيرتل واللورد أهم من مطاردة kill بلا هدف.', 'لا تبدأ objective إذا Retribution غير جاهز أو خصمك حر.', 'استخدم الوقت بين الكامبات لقراءة خطوط الخصم.'],
});

const QUIZZES = Object.freeze([
  { id: 'turtle-mid', lane: 'mid', q: 'التيرتل بعد 20 ثانية، وموجة Mid وصلت: شتسوي؟', choices: ['أروح التيرتل وأترك الموجة', 'أنظف Mid ثم أتحرك للتيرتل مع الروم', 'أدخل جانقل العدو لحالي'], correct: 1, why: 'تنظيف Mid يعطيك Tempo وتقدر توصل مع فريقك قبل بداية الهدف.' },
  { id: 'gold-jungle', lane: 'gold', q: 'أنت Gold والجانقلر المعادي مختفي، وين أفضل مكان لك؟', choices: ['أضغط لحد برج العدو بدون رؤية', 'ألعب قريب من برجي وأراقب الميني ماب', 'أقطع الموجة وحدي'], correct: 1, why: 'من دون رؤية للجانقلر، الضغط العميق مخاطرة كبيرة، حتى لو أنت متقدم بالذهب.' },
  { id: 'roam-engage', lane: 'roam', q: 'معاك Tigreal وأصحابك بعيدين، لقيت 3 خصوم: شتسوي؟', choices: ['أستخدم ألتي فوراً', 'أنتظر وصول الدامج وأجهز الرؤية', 'أدخل وحدي عشان تخويفهم'], correct: 1, why: 'الـEngage بدون Follow-up يهدر ألتيك ويعطي الخصم أفضلية.' },
  { id: 'draft-cc', lane: 'all', q: 'الخصم عنده 3 شخصيات CC ثقيل، شنو الأولوية بالدرافت؟', choices: ['أختار بدون النظر لتكوينهم', 'أوازن الفريق بأدوات نجاة أو Purify/مناعة عند الحاجة', 'أختار خامس Mage دائماً'], correct: 1, why: 'البقاء أثناء CC شرط أساسي قبل حساب الضرر النظري.' },
  { id: 'jungle-lord', lane: 'jungle', q: 'اللورد متاح وRetribution غير جاهز: القرار؟', choices: ['نبدأ مباشرة بدون رؤية', 'نحصل رؤية أو Pickoff وننتظر التوقيت الآمن', 'نطارد Gold في الطرف الآخر'], correct: 1, why: 'تأمين معلومات الخصم وتوقيت Retribution أهم من إجبار هدف غير مضمون.' },
  { id: 'mid-rotation', lane: 'mid', q: 'بعد تنظيف Mid، Gold لين عندكم عليه ضغط وتيرتل بعيد: وين تروح؟', choices: ['أساعد Gold بزاوية آمنة ثم أرجع للـWave', 'أثبت Mid بدون ما أراقب', 'أروح قاعدة العدو'], correct: 0, why: 'الروتيشن الصحيح يبدأ من الموجة وتحديد أين تقدر تغير نتيجة التبادل.' },
  { id: 'exp-wave', lane: 'exp', q: 'التيرتل بطرفك، وموجة EXP وصلت: أي تصرف أفضل؟', choices: ['أهمل الموجة دائماً', 'أنظف الموجة بسرعة وأتحرك قبل القتال', 'أستخدم ألتي على المينيون من غير داعٍ'], correct: 1, why: 'تحكم الموجة يمنع خسارة البرج ويعطيك مساحة للحضور عند التيرتل.' },
  { id: 'late-game', lane: 'all', q: 'بالدقيقة 20 فزتوا بقتال 4 ضد 2، شنو أفضل خطوة؟', choices: ['أرجع أفرم بدون هدف', 'أقيّم إنهاء المباراة أو لورد/أبراج حسب الموجات', 'أطارد الباقين بكل الخريطة'], correct: 1, why: 'كل انتصار بقتال لازم يتحول لهدف واضح حسب الوقت والموجات.' },
  { id: 'draft-counter', lane: 'all', q: 'كيف تقيّم Counter Pick مع فريقك؟', choices: ['علاقة Counter فقط', 'الـCounter + قدراتك بالبطل + تغطية احتياجات الفريق', 'أعلى باندريت دائماً'], correct: 1, why: 'كاونتر نظري ببطل ما تتقنه قد يكون أسوأ من اختيار متوازن تجيده.' },
  { id: 'gold-reset', lane: 'gold', q: 'خسرت تبادل وصرت بنصف HP وموجتك تحت برجك: شنو تسوي؟', choices: ['أكمل تبادل بأي ثمن', 'أؤمن الـLast Hits وأطلب مساعدة أو أرجع بأمان', 'أعمل Dive لحالي'], correct: 1, why: 'الحفاظ على الموارد والموجة أهم من محاولة تعويض الخسارة فوراً.' },
]);

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number(n) || 0)); }
function cleanText(s, max=80) { return String(s ?? '').replace(/[\r\n\t<>@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function validPlayerId(value) { return /^\d{5,15}$/.test(String(value || '')); }
function validZone(value) { return /^\d{2,8}$/.test(String(value || '')); }
function percent(wins, matches) { return matches > 0 ? Math.round((wins / matches) * 1000) / 10 : null; }
function winsToTarget(wins, matches, target) {
  if (!Number.isInteger(matches) || matches < 1 || !Number.isInteger(wins) || wins < 0 || wins > matches) return null;
  const p=Number(target)/100;
  if (!(p>0 && p<1)) return null;
  if (wins / matches >= p-1e-12) return 0;
  return Math.max(0, Math.ceil((p*matches-wins)/(1-p)-1e-9));
}
function rankValue(rank) { return RANK_SCORE[String(rank||'').toLowerCase()] ?? null; }
function calculateRating(data) {
  const stats=data?.stats || {}, history=Array.isArray(data?.matches)?data.matches:[];
  const parts=[];
  const r=rankValue(stats.rank);
  if(r!==null) parts.push({name:'الرانك',value:r,weight:25});
  if(Number.isInteger(stats.matches)&&stats.matches>=10&&stats.wins<=stats.matches){
    const observed=stats.wins/stats.matches;
    // Bayesian shrinkage: a handful of wins must not produce an artificial 100% rating.
    const adjusted=(stats.wins+0.5*40)/(stats.matches+40);
    parts.push({name:'نسبة الفوز',value:clamp((adjusted-0.3)/0.45*100,0,100),weight:35});
  }
  if(history.length>=3){
    const recent=history.slice(-20),winRate=recent.filter(x=>x.result==='win').length/recent.length;
    parts.push({name:'آخر المباريات',value:clamp((winRate-0.25)/0.55*100,0,100),weight:25});
    const deaths=recent.reduce((a,x)=>a+x.deaths,0)/recent.length;
    parts.push({name:'النجاة',value:clamp(100-deaths*12,0,100),weight:15});
  }
  if(!parts.length)return {score:null,coverage:0,parts:[],confidence:'غير كافٍ'};
  const weight=parts.reduce((a,x)=>a+x.weight,0);
  const coverage=weight;
  const score=Math.round(parts.reduce((a,x)=>a+x.value*x.weight,0)/weight);
  const confidence=coverage>=80&&stats.matches>=50?'متوسطة':coverage>=55?'محدودة':'أولية';
  return {score,coverage,parts:parts.map(x=>({...x,value:Math.round(x.value)})),confidence};
}
function matchAnalysis(match) {
  const {kills,deaths,assists,role}=match;
  const kda=Math.round((kills+assists)/Math.max(1,deaths)*100)/100;
  let tips=[];
  if(deaths>=7) tips.push('عدد الوفيات مرتفع: راجع آخر دخولين بدون رؤية أو بدون دعم.');
  else if(deaths<=2) tips.push('نجاتك ممتازة؛ تأكد أنك ما ضيّعت فرص القتال والأهداف بسبب الحذر الزائد.');
  if(assists===0&&role==='roam') tips.push('كـRoam راجع متى حضرت الـFights وكيف دعمت من يحمل الضرر.');
  if(kills+assists<4) tips.push('مشاركتك قليلة: راجع توقيت الحركة بعد تنظيف الموجة.');
  if(!tips.length) tips.push('راجع قرارك قبل أكبر Objective في المباراة: هل كانت الموجات والرؤية لصالحكم؟');
  tips.push((TIPS[role] || TIPS.mid)[(kills+assists+deaths)%3]);
  return {kda,tips};
}
function coaching(data){
  const role=ROLES.includes(data?.stats?.role)?data.stats.role:'mid';
  const recent=(data?.matches||[]).slice(-10);
  const deaths=recent.length?recent.reduce((a,x)=>a+x.deaths,0)/recent.length:null;
  const wr=recent.length?Math.round(recent.filter(x=>x.result==='win').length/recent.length*100):null;
  const tips=[];
  if(deaths!==null&&deaths>5) tips.push('الأولوية هذا الأسبوع: خفّض متوسط الوفيات إلى 4 أو أقل عبر مراجعة كل موتة بعد المباراة.');
  if(wr!==null&&wr<50) tips.push('قبل كل فايت اسأل: هل عندنا أرقام أو Ultimate أو Objective قريب؟ لا تدخل تلقائياً.');
  tips.push(...(TIPS[role]||TIPS.mid).slice(0,2));
  return {role,wr,deaths,tips,goal:'بعد 3 مباريات سجّل النتيجة وK/D/A، وراجع قراراً واحداً قبل Turtle أو Lord.'};
}
function todayUTC(now=new Date()){return now.toISOString().slice(0,10);}
function dailyChallenge(userId, date=todayUTC()){
  const seed=[...`${userId}:${date}`].reduce((a,c)=>(a*31+c.charCodeAt(0))%9973,7);
  const options=[
    {id:'games',target:2,label:'سجل مباراتين بعد لعبهما'},
    {id:'wins',target:1,label:'حقق فوزاً واحداً وسجله'},
    {id:'assists',target:12,label:'اجمع 12 Assist من مبارياتك المسجلة'},
    {id:'lowdeaths',target:1,label:'العب مباراة بحد أقصى 3 وفيات وسجلها'},
  ];
  return options[seed%options.length];
}
function challengeProgress(data,userId,date=todayUTC()){
  const spec=dailyChallenge(userId,date);
  const matches=(data?.matches||[]).filter(x=>String(x.date||'').startsWith(date));
  let n=0;
  if(spec.id==='games')n=matches.length;
  if(spec.id==='wins')n=matches.filter(x=>x.result==='win').length;
  if(spec.id==='assists')n=matches.reduce((s,x)=>s+x.assists,0);
  if(spec.id==='lowdeaths')n=matches.filter(x=>x.deaths<=3).length;
  return {...spec,progress:Math.min(n,spec.target),completed:n>=spec.target};
}
function quizFor(userId, used=[], now=Date.now()){
  const available=QUIZZES.filter(q=>!used.includes(q.id));
  const pool=available.length?available:QUIZZES;
  const seed=[...`${userId}:${now}`].reduce((a,c)=>(a*33+c.charCodeAt(0))>>>0,137);
  return pool[seed%pool.length];
}
function chooseHero(lane, candidates=null, random=Math.random){
  const valid=ROLES.includes(lane)?lane:'mid';
  const pool=Array.isArray(candidates)&&candidates.length?candidates:FALLBACK_HEROES[valid];
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))] || 'Kagura';
}
function rateCollection(collection={}){
  const {heroes=0,skins=0,epic=0,collector=0,legend=0}=collection;
  const score=Math.min(100,Math.round(clamp(heroes,0,200)*.14+clamp(skins,0,1000)*.09+clamp(epic,0,500)*.2+clamp(collector,0,100)*1.3+clamp(legend,0,100)*2));
  return {score,tier:score>=80?'واسعة جداً':score>=50?'واسعة':score>=25?'متوسطة':'محدودة'};
}
module.exports={ROLES,FALLBACK_HEROES,RANK_SCORE,QUIZZES,cleanText,validPlayerId,validZone,percent,winsToTarget,calculateRating,matchAnalysis,coaching,todayUTC,dailyChallenge,challengeProgress,quizFor,chooseHero,rateCollection};
