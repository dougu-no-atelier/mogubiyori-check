'use strict';
// No HTTP API: all record reads and writes stay in this browser's IndexedDB.
window.MoguLocal = (() => {
 const base = new URL('./', document.currentScript.src), dbName = 'mogubiyori-web-v1:' + base.pathname;
 const clone = v => JSON.parse(JSON.stringify(v)), uid = () => crypto.randomUUID(), now = () => new Date().toISOString();
 const slots = ['breakfast','lunch','dinner'], results = ['食べた','少し食べた','食べなかった','量は不明'], periods = ['初期','中期','後期','完了期'];
 const empty = () => ({schemaVersion:2,household:{name:'わが家の食卓'},child:{name:'',stage:'',instructions:''},foods:[],plans:[],batches:[],records:[],stockEvents:[],shopping:[],note:'',templates:[]});
 function need(ok,msg='入力またはバックアップの形式を確認してください。',status=400){if(!ok){const e=new Error(msg);e.status=status;throw e}}
 function text(v,label,max=100,required=false){need(typeof v==='string'&&v.trim().length<=max&&(!required||v.trim()),label+'を確認してください。');return v.trim()}
 function day(v){need(typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'日付を確認してください。');return v}
 function count(v,zero=false){need(Number.isInteger(v)&&v>=(zero?0:1)&&v<=9999,'個数を確認してください。');return v}
 function amount(v){if(v===null||v===undefined||v==='')return null;need(['number','string'].includes(typeof v)&&/^\d{1,4}(?:\.\d{1,2})?$/.test(String(v))&&Number(v)<=9999,'量はゼロ以上、小数二桁までで入力してください。');return String(Number(v))}
 const unique = a => [...new Set(a)];
 function find(a,id){const v=a.find(v=>v.id===id);need(v,'対象が見つかりません。最新の記録を確認してください。');return v}
 const subset = (a,set) => Array.isArray(a)&&a.every(v=>set.has(v));
 function foodIds(s,names){need(Array.isArray(names)&&names.length<=40,'食材は四十種類以内にしてください。');return unique(names.map(name=>{name=text(name,'食材名',60,true);let f=s.foods.find(f=>f.name===name);if(!f){f={id:uid(),name,note:''};s.foods.push(f)}return f.id}))}
 function merge(old,items){const out=clone(old);for(const i of items){const same=out.find(x=>x.foodId===i.foodId&&x.unit===i.unit&&x.intake===i.intake&&(x.amount===null)===(i.amount===null));if(!same)out.push(clone(i));else if(i.amount!==null)same.amount=amount(String((Math.round(Number(same.amount)*100)+Math.round(Number(i.amount)*100))/100));}need(out.length<=40,'一食の食材は四十種類以内にしてください。');return out}
 function normalize(s,items){need(Array.isArray(items)&&items.length>0&&items.length<=40,'食材を一つ以上、四十種類以内で選んでください。');return merge([],items.map(i=>{const foodId=foodIds(s,[i.name])[0],a=amount(i.amount),unit=i.unit??'';need(['g','ml','小さじ',''].includes(unit)&&(a===null||unit!==''),'量の単位を選んでください。');return {foodId,amount:a,unit,intake:a==='0'?'not_eaten':'confirmed'}}))}
 function checkItems(items,foods){need(Array.isArray(items)&&items.length>0&&items.length<=40);for(const i of items){need(i&&foods.has(i.foodId)&&['g','ml','小さじ','個','口',''].includes(i.unit)&&['confirmed','not_eaten'].includes(i.intake));const a=amount(i.amount);need((a===null||i.unit!=='')&&(a!=='0'||i.intake==='not_eaten'));}}
 // 2026-10-30: 在庫ロットの作った日（madeOn）が無い・空のデータも通す（受け入れ範囲を広げるだけ。日付があれば従来どおり検証）。
 function validate(s){
  need(s&&JSON.stringify(s).length<=2000000,'保存件数が多いため、バックアップして記録を整理してください。');
  need(s&&s.schemaVersion===2&&JSON.stringify(Object.keys(s).sort())===JSON.stringify(Object.keys(empty()).sort()));
  text(s.household.name,'家庭名',60,true);for(const k of ['name','stage','instructions'])text(s.child[k],'お子さんの設定',k==='instructions'?2000:60);text(s.note,'メモ',2000);
  for(const key of ['foods','plans','batches','records','stockEvents','shopping','templates']){need(Array.isArray(s[key])&&s[key].length<=20000,'保存件数を確認してください。');const ids=new Set();for(const v of s[key]){need(v&&typeof v.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)&&!ids.has(v.id),'記録番号または重複を確認してください。');ids.add(v.id)}}
  const foods=new Set(s.foods.map(f=>f.id)),batches=new Set(s.batches.map(b=>b.id)),plans=new Set(s.plans.map(p=>p.id));
  for(const f of s.foods){text(f.name,'食材名',60,true);text(f.note,'食材メモ',2000);for(const flag of ['quickHidden','quickPinned'])need(f[flag]===undefined||typeof f[flag]==='boolean')}
  for(const t of s.templates){text(t.title,'セット名',100,true);checkItems(t.items,foods)}
  for(const b of s.batches){text(b.name,'ストック名',100,true);count(b.quantity,true);if(b.madeOn!==undefined&&b.madeOn!==null&&b.madeOn!=='')day(b.madeOn);if(b.checkOn)day(b.checkOn);for(const k of ['portion','location','shape'])text(b[k],'ストックの補足',100);need(subset(b.foodIds,foods))}
  const mealKeys=new Set();for(const p of s.plans){day(p.date);need(slots.includes(p.slot)&&typeof p.prepared==='boolean');text(p.title,'献立名',100,true);text(p.note,'献立メモ',2000);need(subset(p.foodIds,foods)&&Array.isArray(p.uses));const key=p.date+'|'+p.slot;need(!mealKeys.has(key),'同じ食事枠に献立が重複しています。');mealKeys.add(key);const used=new Set();for(const u of p.uses){need(batches.has(u.batchId)&&!used.has(u.batchId));used.add(u.batchId);count(u.quantity)}}
  const recorded=new Set();for(const r of s.records){need(r.items===undefined||Array.isArray(r.items));need(r.quickApplied===undefined||(Array.isArray(r.quickApplied)&&r.quickApplied.every(x=>typeof x==='string'&&x.length<=20000)));if(r.quickSources!==undefined){need(Array.isArray(r.quickSources)&&r.quickSources.length<=20000);for(const source of r.quickSources){need(source&&typeof source==='object');checkItems(source.items,foods)}}for(const k of ['recordedAt','updatedAt'])if(r[k]!==undefined)text(r[k],'記録時刻',60);need(plans.has(r.planId)&&!recorded.has(r.planId)&&results.includes(r.result));recorded.add(r.planId);const offered=new Set(r.offeredFoodIds??find(s.plans,r.planId).foodIds);need(subset([...offered],foods)&&subset(r.foodIds,offered)&&(r.result!=='食べなかった'||r.foodIds.length===0));if(r.items?.length){checkItems(r.items,foods);need(r.items.filter(i=>i.intake==='confirmed').every(i=>r.foodIds.includes(i.foodId)))}text(r.actualTitle??'','食事名',100);for(const k of ['memo','symptom','observedAt','actor','eatenAt'])text(r[k],'食事の補足',2000);if(r.eatenAt)need(!Number.isNaN(Date.parse(r.eatenAt)),'食事時刻を確認してください。')}
  for(const e of s.stockEvents){need(batches.has(e.batchId)&&Number.isInteger(e.delta));text(e.at,'履歴の日時',60,true);text(e.kind,'変更理由',100,true);text(e.actor,'記録者',100)}
  for(const b of s.batches)need(s.stockEvents.filter(e=>e.batchId===b.id).reduce((n,e)=>n+e.delta,0)===b.quantity,'在庫数と履歴が一致しません。');
  for(const i of s.shopping){text(i.name,'買い物',100,true);need(typeof i.done==='boolean')}
 }
 // 2026-10-30: 1個分の量（任意の追加項目）。portionAmount は数値、portionUnit は 'tsp'（小さじ）|'g'|'ml'|'whole'（食材そのまま・量は持たない）。
 // どちらも未入力なら項目自体を置かない。validate はこの2項目を見ないので、既存（旧版）の検証もそのまま通る。
 const portionUnits = ['tsp','g','ml','whole'];
 function portion(d){const unit=d.portionUnit??'',raw=d.portionAmount??'';need(unit===''||portionUnits.includes(unit),'1個分の量の単位を選び直してください。');if(unit==='whole')return {portionUnit:unit};if(raw===''||raw===null){need(unit==='','1個分の量を数字で入力してください。');return {}}need(unit!=='','1個分の量の単位を選んでください。');const a=amount(raw);need(Number(a)>0,'1個分の量はゼロより大きい数で入力してください。');return {portionAmount:Number(a),portionUnit:unit}}
 function event(s,b,delta,kind,actor,operationId,planId=null){count(b.quantity+delta,true);b.quantity+=delta;s.stockEvents.push({id:uid(),batchId:b.id,delta,kind,actor,operationId,planId,at:now()})}
 function quick(s,d,actor){
  day(d.date);need(slots.includes(d.slot),'食事枠を選んでください。');const items=normalize(s,d.items),names=new Map(s.foods.map(f=>[f.id,f.name]));
  const signature=JSON.stringify(items.map(i=>[names.get(i.foodId),i.amount,i.unit]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  let p=s.plans.find(p=>p.date===d.date&&p.slot===d.slot);if(!p){p={id:uid(),date:d.date,slot:d.slot,title:items.map(i=>names.get(i.foodId)).join('・').slice(0,100),foodIds:[],uses:[],note:'',prepared:false,quickCreated:true};s.plans.push(p)}
  let r=s.records.find(r=>r.planId===p.id);need(d.replace===undefined||typeof d.replace==='boolean');need(d.allowRepeat===undefined||typeof d.allowRepeat==='boolean');
  if(d.replace){need(r&&r.id===d.recordId,'訂正する食事を確認してください。');need(!d.expectedRecord||JSON.stringify(d.expectedRecord)===JSON.stringify(r),'別のタブで変更されています。最新の記録から訂正を開き直してください。',409)}
  if(!r){r={id:uid(),planId:p.id,foodIds:[],memo:'',symptom:'',observedAt:'',eatenAt:'',recordedAt:now(),actualTitle:'',offeredFoodIds:[],items:[],quickApplied:[]};s.records.push(r)}
  if(!d.replace&&!d.allowRepeat&&(r.quickApplied??[]).includes(signature))return;
  const old=r.items?.length?r.items:r.foodIds.map(foodId=>({foodId,amount:null,unit:'',intake:'confirmed'}));
  const combined=d.replace?items:merge(old,items);
  Object.assign(r,{items:combined,foodIds:unique(combined.filter(i=>i.intake==='confirmed').map(i=>i.foodId)),offeredFoodIds:unique([...(r.offeredFoodIds??[]),...combined.map(i=>i.foodId)]),result:combined.some(i=>i.intake==='confirmed')?'食べた':'食べなかった',actualTitle:unique(combined.map(i=>names.get(i.foodId))).join('・').slice(0,100),actor,updatedAt:now()});
  r.quickApplied=d.replace?[signature]:[...(r.quickApplied??[]),signature];r.quickSources=d.replace?[{items:clone(items)}]:[...(r.quickSources??[]),{items:clone(items)}];if(p.quickCreated){p.title=r.actualTitle;p.foodIds=[...r.offeredFoodIds];if(Array.isArray(p.foodIdsAtRecord))p.foodIdsAtRecord=[...p.foodIds]}
 }
 // 献立の登録・編集。記録・準備済みの献立も編集できる。ただし日付・時間帯は変えず（記録の日付が動くため。日付は「移動」から）、
 // 取り出し済みなら使う個数と取り出し済みの状態はそのまま残す。献立の食材を直しても記録の「出した食材」が変わらないよう、未保存なら今の食材を記録側に残す。
 function savePlan(s,d){
  const old=d.id?find(s.plans,d.id):null,rec=old&&s.records.find(r=>r.planId===old.id),fixed=old&&(old.prepared||Boolean(rec));
  day(d.date);need(slots.includes(d.slot));need(!fixed||(d.date===old.date&&d.slot===old.slot),'準備・記録済みの食事の日付・時間帯は「移動」から変えられます。');need(!s.plans.some(p=>p!==old&&p.date===d.date&&p.slot===d.slot),'その食事枠には献立があります。');
  let ids=foodIds(s,d.foods??[]);const uses=(old?.prepared?old.uses:(d.uses??[])).map(u=>{const b=find(s.batches,u.batchId);ids=unique([...ids,...b.foodIds]);return {batchId:b.id,quantity:count(u.quantity)}});
  const p={id:old?.id??uid(),date:d.date,slot:d.slot,title:text(d.title,'献立名',100,true),note:text(d.note??'','献立メモ',2000),foodIds:ids,uses,prepared:Boolean(old?.prepared)};
  if(rec&&rec.offeredFoodIds===undefined)rec.offeredFoodIds=[...old.foodIds];
  // 記録済みの献立を初めて編集するとき、記録した時点の食材を献立側に残す（任意項目。表示で「内容変更あり」を判定するだけで、記録は書き換えない）。
  if(rec&&!Array.isArray(old.foodIdsAtRecord))old.foodIdsAtRecord=[...old.foodIds];
  // 食事名（actualTitle）が無い旧記録は献立名を表示名にしているので、献立名を直しても記録の表示名が変わらないよう、記録時の献立名も献立側に残す（記録は書き換えない）。
  if(rec&&!rec.actualTitle&&typeof old.titleAtRecord!=='string')old.titleAtRecord=old.title;
  if(old)Object.assign(old,p);else s.plans.push(p);
 }
 function apply(s,action,d,actor,op){
  switch(action){
   case 'quickLog':quick(s,d,actor);break;
   case 'template':{const items=normalize(s,d.items),title=text(d.title||items.map(i=>find(s.foods,i.foodId).name).join('・').slice(0,100),'セット名',100,true);if(d.id)Object.assign(find(s.templates,d.id),{items,title});else{need(s.templates.length<100,'固定セットは百件以内にしてください。');s.templates.push({id:uid(),items,title})}break}
   case 'removeTemplate':s.templates=s.templates.filter(t=>t.id!==find(s.templates,d.id).id);break;
   case 'replaceShortcut':{const old=find(s.foods,d.id);need(old.name!==d.replacement);old.quickHidden=true;find(s.foods,foodIds(s,[d.replacement])[0]).quickPinned=true;break}
   // 今の時期（child.period）は任意の追加項目。validate は child の name/stage/instructions しか見ないので既存の検証を通る。選ばないときは項目自体を置かない。
   // 2026-11-01: 離乳食を始めた日（child.startedOn・YYYY-MM-DD）も同じ扱いの任意の追加項目。送られなければ今の値を保ち、空なら項目ごと外す。validate は変えない。
   case 'profile':{const kept=periods.includes(s.child.period)?s.child.period:'',period='period'in d?d.period??'':kept;need(period===''||periods.includes(period),'今の時期を選び直してください。');const isDay=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,keptStart=isDay(s.child.startedOn)?s.child.startedOn:'',startedOn='startedOn'in d?d.startedOn??'':keptStart;need(startedOn===''||isDay(startedOn),'離乳食を始めた日を確認してください。');s.household.name=text(d.household||'わが家の食卓','家庭名',60,true);s.child={name:text(d.name??'','呼び名',60,true),stage:text(d.stage??'','段階メモ',60),instructions:text(d.instructions??'','個別の指示',2000)};if(period)s.child.period=period;if(startedOn)s.child.startedOn=startedOn;break}
   case 'note':s.note=text(d.note??'','家族メモ',2000);break;
   case 'foodNote':find(s.foods,d.id).note=text(d.note??'','食材メモ',2000);break;
   case 'batch':{const b={id:uid(),name:text(d.name,'ストック名',100,true),quantity:0,madeOn:day(d.madeOn),checkOn:d.checkOn?day(d.checkOn):'',portion:text(d.portion??'','一個の量',100),location:text(d.location??'','保存場所',100),shape:text(d.shape??'','形状',100),foodIds:foodIds(s,d.foods??[]),...portion(d)};s.batches.push(b);event(s,b,count(d.quantity),'補充',actor,op);break}
   // 既存ロットの1個分の量を設定・変更・未設定に戻す。個数・履歴は変えない。
   case 'batchPortion':{const b=find(s.batches,d.id),p=portion(d);delete b.portionAmount;delete b.portionUnit;Object.assign(b,p);break}
   case 'adjust':{need(Number.isInteger(d.delta)&&d.delta!==0&&Math.abs(d.delta)<=9999);event(s,find(s.batches,d.id),d.delta,text(d.reason||'数え直し','変更理由',100,true),actor,op);break}
   case 'plan':savePlan(s,d);break;
   // 使い切り提案の「この日の提案を献立に入れる」。1日分（最大3食）を1回の操作でまとめて登録する（取り消しも1回で戻る）。中身は通常の献立と同じ。
   case 'planMany':{need(Array.isArray(d.plans)&&d.plans.length>=1&&d.plans.length<=3);for(const x of d.plans){need(x&&!x.id);savePlan(s,x)}break}
   case 'prepare':{const p=find(s.plans,d.id);if(p.prepared)break;need(p.uses.length,'取り出すストックがありません。');for(const u of p.uses)need(find(s.batches,u.batchId).quantity>=u.quantity,'ストックが不足しています。');for(const u of p.uses)event(s,find(s.batches,u.batchId),-u.quantity,'食事の準備',actor,op,p.id);p.prepared=true;break}
   case 'record':{
    const p=find(s.plans,d.id);need(results.includes(d.result));let r=s.records.find(r=>r.planId===p.id);if(!r){r={id:uid(),planId:p.id,foodIds:[],memo:'',symptom:'',observedAt:'',eatenAt:'',recordedAt:now(),actualTitle:p.title,offeredFoodIds:[...p.foodIds]};s.records.push(r)}Object.assign(r,{result:d.result,actor,updatedAt:now()});if('actualTitle'in d)r.actualTitle=text(d.actualTitle,'食事名',100,true);
    const extras=foodIds(s,d.extraFoods??[]),offered=unique([...(r.offeredFoodIds??p.foodIds),...extras]);r.offeredFoodIds=offered;
    if(d.result==='食べなかった'){r.foodIds=[];if(r.items){r.items=r.items.map(i=>({...i,amount:i.unit?'0':null,intake:'not_eaten'}));r.quickApplied=[];r.quickSources=[]}}
    if('foodIds'in d){need(subset(d.foodIds,new Set(offered))&&(d.result!=='食べなかった'||d.foodIds.length===0));r.foodIds=unique(d.foodIds);if(r.items){r.items=r.items.filter(i=>d.foodIds.includes(i.foodId)||i.intake==='not_eaten');r.quickApplied=[];r.quickSources=[]}}
    if(extras.length){need(d.result!=='食べなかった');r.foodIds=unique([...r.foodIds,...extras])}
    if(r.items){r.items=r.items.map(i=>r.foodIds.includes(i.foodId)&&i.intake==='not_eaten'?{...i,amount:null,intake:'confirmed'}:i);for(const id of r.foodIds)if(!r.items.some(i=>i.foodId===id))r.items.push({foodId:id,amount:null,unit:'',intake:'confirmed'})}
    for(const k of ['memo','symptom','observedAt'])if(k in d)r[k]=text(d[k],'食事の補足',2000);if('eatenAt'in d){need(!d.eatenAt||!Number.isNaN(Date.parse(d.eatenAt)),'食事時刻を確認してください。');r.eatenAt=d.eatenAt?new Date(d.eatenAt).toISOString():''}break;
   }
   // 記録・準備済みの献立は、食事の記録（日付は献立の日付から決まる）と取り出し済みの在庫を動かさないよう、元の枠に残したまま同じ献立を移動先に入れる（移動先が空いているときだけ）。
   // 記録・準備済みの献立の写しは、ストックの使用（uses）を引き継がない（在庫連動なし）。引き継ぐと元と写しの両方から同じロットを取り出せてしまうため。
   case 'move':{const p=find(s.plans,d.id),free=p=>!p.prepared&&!s.records.some(r=>r.planId===p.id);day(d.date);need(slots.includes(d.slot));const other=s.plans.find(x=>x!==p&&x.date===d.date&&x.slot===d.slot);if(!free(p)){need(d.date!==p.date||d.slot!==p.slot,'移動先を別の日・時間帯にしてください。');need(!other,'移動先には献立があります。記録・準備済みの食事は、空いている枠に同じ献立を入れられます。');s.plans.push({id:uid(),date:d.date,slot:d.slot,title:p.title,note:p.note,foodIds:[...p.foodIds],uses:[],prepared:false});break}if(other){need(free(other),'移動先は準備・記録済みです。');other.date=p.date;other.slot=p.slot}p.date=d.date;p.slot=d.slot;break}
   case 'shopping':if(d.id){need(typeof d.done==='boolean');find(s.shopping,d.id).done=d.done}else s.shopping.push({id:uid(),name:text(d.name,'買うもの',100,true),done:false});break;
   case 'restore':{const restored=clone(d.state);if(restored.schemaVersion===1){restored.schemaVersion=2;restored.templates=[]}validate(restored);for(const k of Object.keys(s))delete s[k];Object.assign(s,restored);break}
   default:need(false,'対応していない操作です。');
  }
  validate(s);
 }
 let connection;
 function db(){if(!connection)connection=new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('このブラウザでは記録を保存できません。通常のSafariまたはChromeで開いてください。'));return}const request=indexedDB.open(dbName,1);request.onupgradeneeded=()=>{request.result.createObjectStore('main');request.result.createObjectStore('operations')};request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};request.onerror=()=>reject(new Error('端末内の保存先を開けません。プライベートモードやブラウザの保存設定を確認してください。'));request.onblocked=()=>reject(new Error('別のタブを閉じてから開き直してください。'))});return connection}
 function initial(){return {state:empty(),revision:0,storageId:uid(),session:{id:uid(),name:'この端末',role:'admin'},undo:null,recovery:null}}
 const response=e=>({state:clone(e.state),revision:e.revision,storageId:e.storageId,session:clone(e.session),sharing:{enabled:false,noInvite:false,addresses:[]},canUndo:!!e.undo});
 async function transact(fn){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(['main','operations'],'readwrite'),store=tx.objectStore('main');let value,error;tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error||Object.assign(new Error('端末に保存できませんでした。空き容量とブラウザの保存設定を確認してください。入力は残っています。'),{status:503}));tx.onerror=()=>{};const request=store.get('household');request.onsuccess=()=>{try{const envelope=request.result??initial();fn(envelope,tx,(result,write=true)=>{value=result;if(write)store.put(envelope,'household')},e=>{error=e.status?e:Object.assign(new Error(e.name==='QuotaExceededError'?'端末の空き容量が足りず保存できませんでした。入力は残しています。':'端末に保存できませんでした。保存設定と空き容量を確認してください。'),{status:503});tx.abort()})}catch(e){error=e.status?e:Object.assign(new Error(e.name==='QuotaExceededError'?'端末の空き容量が足りず保存できませんでした。入力は残しています。':'端末に保存できませんでした。保存設定と空き容量を確認してください。'),{status:503});tx.abort()}}})}
 async function request(path,options={}){
  let data={};try{if(options.body)data=JSON.parse(options.body)}catch{need(false)}
  if(path==='/api/state')return transact((e,tx,done)=>done(response(e)));
  if(path==='/api/export'||path==='/api/recovery')return transact((e,tx,done)=>{const state=path==='/api/recovery'?e.recovery:e.state;need(state,'復元前のコピーはありません。');done({app:'mogubiyori',exportedAt:now(),state:clone(state),revision:e.revision})});
  if(path==='/api/session')return transact((e,tx,done)=>{e.session.name=text(data.name,'記録者の呼び名',40,true);done(response(e))});
  need(path==='/api/action','このウェブ版では家族の自動共有は使えません。');
  text(data.operationId,'操作番号',100,true);
  return transact((e,tx,done,fail)=>{const op=tx.objectStore('operations').get(data.operationId);op.onsuccess=()=>{try{
   if(op.result){done({...response(e),duplicate:true},false);return}
   need(data.revision===e.revision,'別のタブで更新されました。入力を残しています。最新の内容を確認してから保存してください。',409);
   const before=clone(e.state);
   if(data.action==='undo'){
    need(e.undo,'取り消せる直前の操作がありません。');const prior=clone(e.undo),events=clone(e.state.stockEvents);
    for(const b of e.state.batches){let old=prior.batches.find(x=>x.id===b.id);if(!old){old={...clone(b),quantity:0};prior.batches.push(old);for(const id of b.foodIds)if(!prior.foods.some(f=>f.id===id))prior.foods.push(clone(find(e.state.foods,id)))}const delta=old.quantity-b.quantity;if(delta)events.push({id:uid(),batchId:b.id,delta,kind:'取り消しによる訂正',actor:e.session.name,at:now(),operationId:data.operationId,planId:null})}
    prior.stockEvents=events;validate(prior);e.state=prior;e.undo=null;
   }else{apply(e.state,data.action,data.data??{},e.session.name,data.operationId);e.undo=data.action==='restore'?null:before;if(data.action==='restore')e.recovery=before}
   e.revision++;tx.objectStore('operations').put({revision:e.revision},data.operationId);done(response(e));
  }catch(err){if(err instanceof TypeError||err instanceof SyntaxError||err instanceof RangeError){err=new Error('入力またはバックアップの形式を確認してください。');err.status=400}fail(err)}};
  });
 }
 return {request,validate,base:base.href};
})();
