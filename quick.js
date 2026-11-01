'use strict';
const quickDrafts=new Map();
const quickUnits=['小さじ','g','ml'];
const starterFoods=['ほうれん草','おかゆ','にんじん','かぼちゃ','豆腐','ブロッコリー','白身魚','うどん','じゃがいも'];
let quickSearch='',quickAmountRow=null,quickSearchOpen=false,quickCatalogExpanded=false,quickStaleNote='';
// 最後に確定した量の単位。前回記録のない食材の初期単位に使う。保存できない環境ではメモリ内だけで引き継ぐ。
const QUICK_UNIT_KEY='mogubi-quick-unit:'+new URL('./',document.currentScript.src).pathname;
let quickLastUnit=null;
function qDefaultUnit(){if(quickLastUnit===null){quickLastUnit='';try{quickLastUnit=localStorage.getItem(QUICK_UNIT_KEY)||''}catch{}}return quickUnits.includes(quickLastUnit)?quickLastUnit:'小さじ'}
function qRememberUnit(unit){if(!quickUnits.includes(unit))return;quickLastUnit=unit;try{localStorage.setItem(QUICK_UNIT_KEY,unit)}catch{}}
function qSlot(){if(!view.quickSlot){const h=Number(new Intl.DateTimeFormat('en',{hour:'numeric',hourCycle:'h23',timeZone:'Asia/Tokyo'}).format(new Date()));view.quickSlot=qPickSlot(h<11?'breakfast':h<15?'lunch':'dinner')}return view.quickSlot}
// 1.2.1: 時刻から決めた食事が「使う食事」に無いときは、それより前の使う食事（無ければ最初の使う食事）にする。朝だけのときに夕方の記録が晩に入らないように。
function qPickSlot(t){if(!current)return t;const set=qMealSlots(qStartInfo(view.date)),order=Object.keys(slots);if(set.includes(t))return t;return [...set].reverse().find(k=>order.indexOf(k)<order.indexOf(t))||set[0]||t}
function qKey(){return view.date+'|'+qSlot()}
function qDraft(){if(!quickDrafts.has(qKey()))quickDrafts.set(qKey(),{items:[],replace:false,recordId:null});return quickDrafts.get(qKey())}
// 表示用。下書きが無ければ作らずに空を返す（描画で、破棄した枠に空の下書きを作り直さない）。
function qDraftView(){return quickDrafts.get(qKey())||{items:[],replace:false,recordId:null}}
function qRecord(){const p=state().plans.find(p=>p.date===view.date&&p.slot===qSlot());return p?record(p):null}
function qName(item){return item.name||food(item.foodId)?.name||''}
function qSupportedItems(items){return items.every(i=>quickUnits.includes(i.unit)||(!i.unit&&i.amount==null))}
function qEditableItems(items){return qItems(items).map(i=>quickUnits.includes(i.unit)?i:{...i,amount:null,unit:qDefaultUnit()})}
function qItems(items){return items.map(i=>({name:qName(i),amount:i.amount??null,unit:i.unit||''}))}
function qAmount(i){if(i.amount===null||i.amount===undefined||i.amount==='')return '量未入力';return i.unit==='小さじ'?'小さじ'+String(i.amount):String(i.amount)+i.unit}
function qSummary(items){return items.map(i=>qName(i)+' '+qAmount(i)).join('・')}
function qSignature(items){return JSON.stringify(qItems(items).map(i=>[i.name,i.amount==null?null:String(Number(i.amount)),i.unit]).sort((a,b)=>a[0].localeCompare(b[0])||String(a[1]).localeCompare(String(b[1]))||a[2].localeCompare(b[2])))}
function qApplied(items){return (qRecord()?.quickSources||[]).some(s=>qSignature(s.items)===qSignature(items))}
function qRecent(){return state().records.slice().sort((a,b)=>(b.updatedAt||b.recordedAt||'').localeCompare(a.updatedAt||a.recordedAt||'')).find(r=>r.items?.some(i=>i.intake==='confirmed')&&qSupportedItems(r.items))}
// 「前回」「直近」の基準。実際に食べた日（qRecordDay）→朝昼夕→食事時刻・入力時刻の順で新しい記録から並べ、量が記録された（0より大きい）項目だけを使う。
function qByMealDesc(){const plans=new Map(state().plans.map(p=>[p.id,p]));return state().records.map(r=>({r,p:plans.get(r.planId)})).filter(x=>x.p).map(x=>({...x,day:qRecordDay(x.r,x.p)})).sort((a,b)=>b.day.localeCompare(a.day)||slotOrder[b.p.slot]-slotOrder[a.p.slot]||(b.r.eatenAt||b.r.recordedAt||'').localeCompare(a.r.eatenAt||a.r.recordedAt||'')).map(x=>x.r)}
function qHasAmount(i){return i.intake==='confirmed'&&i.amount!=null&&i.amount!==''&&Number(i.amount)>0}
function qDefaults(name){for(const r of qByMealDesc()){const i=r.items?.find(i=>qName(i)===name&&qHasAmount(i)&&quickUnits.includes(i.unit));if(i)return {name,amount:i.amount,unit:i.unit,fromPrevious:true}}const unit=qDefaultUnit();return {name,amount:unit==='小さじ'?'1':null,unit,fromPrevious:false}}
function qCatalog(all=false){const hidden=new Set(state().foods.filter(f=>f.quickHidden).map(f=>f.name));const pinned=state().foods.filter(f=>f.quickPinned&&!f.quickHidden).map(f=>f.name);const names=[...qDraftView().items.map(i=>i.name),...pinned,...starterFoods,...state().foods.map(f=>f.name),...state().records.slice().reverse().flatMap(r=>(r.items||[]).map(qName)),...qDraftView().items.map(i=>i.name)];return [...new Set(names)].filter(n=>!hidden.has(n)&&n.includes(quickSearch)).slice(0,all||quickSearch||quickCatalogExpanded?undefined:12)}
function qPreset(items,title,source,id){const applied=qApplied(items);return `<article class="qSet"><button class="qSetLog" data-q="log-set" data-source="${source}" data-id="${id}" data-edit ${applied?'disabled':''}><span class="qSetEyebrow">${esc(title)}</span><strong>${esc(qSummary(items))}</strong><span class="qSetBottom">${applied?'この食事に記録済み':slots[qSlot()]+'ごはんに'+(qRecord()?'追加で':'')+'記録'}</span></button><button class="qSetAdjust" data-q="adjust-set" data-source="${source}" data-id="${id}" aria-label="${esc(title)}の食材・量を変更" data-edit>変更</button>${source==='template'?`<button class="linkButton qUnpin" data-q="unpin" data-id="${id}" data-edit>固定を外す</button>`:''}</article>`}
function qRepeats(){const last=qRecent();const sources=state().templates.filter(t=>qSupportedItems(t.items)).map(t=>({items:t.items,title:t.title,source:'template',id:t.id}));if(last&&!sources.some(s=>qSignature(s.items)===qSignature(last.items)))sources.unshift({items:last.items,title:'前回と同じ一食',source:'recent',id:last.id});if(!sources.length)return '';const first=sources.find(s=>!qApplied(s.items));const others=sources.filter(s=>s!==first);return `<section class="qRepeat" aria-label="一食をまとめて記録">${first?qPreset(first.items,first.title,first.source,first.id):''}${others.length?`<details class="qOtherSets"><summary>${first?'ほかのセット':'記録済みのセット'}（${others.length}）</summary>${others.map(s=>qPreset(s.items,s.title,s.source,s.id)).join('')}</details>`:''}</section>`}
// 献立の食材名。クイック記録は同じ日・枠の献立に紐づいて保存されるので（local-store の quickLog）、記録後は献立側も「記録済み」になる。
function qPlanNames(p){return (p.foodIds||[]).map(id=>food(id)?.name).filter(Boolean)}
// 献立から入れた下書きは、そのときの献立（id・食材）を覚えておく（planSig）。献立の内容が変わったら、外した食材が黙って記録されないよう、その枠の下書きを破棄して知らせる。
function qPlanSig(p){return p?JSON.stringify([p.id,[...p.foodIds].sort()]):''}
function qDraftStale(key,d){if(!d?.planSig)return false;const [date,slot]=key.split('|');return qPlanSig(state().plans.find(p=>p.date===date&&p.slot===slot))!==d.planSig}
function qDropStaleDrafts(){const gone=[];for(const [key,d] of [...quickDrafts]){if(!qDraftStale(key,d))continue;quickDrafts.delete(key);const [date,slot]=key.split('|');gone.push(dateLabel(date)+'・'+slots[slot]);if(key===qKey()){quickAmountRow=null;if($('#dialog').dataset.quickAmount){delete $('#dialog').dataset.quickAmount;$('#dialog').close()}}}if(gone.length)quickStaleNote=`献立の内容が変わったため、${gone.join('、')}の入力途中の食材を消しました。今の献立から選び直してください。`;return gone.length>0}
// 名前の食材を下書きに入れ（入っていればそのまま）、最初の食材の量の選択を開く。初期の量・単位は qDefaults に従う。
function qAddAndOpen(names){const d=qDraft();let first=null;for(const name of names){let n=d.items.findIndex(i=>i.name===name);if(n<0){d.items.push(qDefaults(name));n=d.items.length-1}if(first===null)first=n}quickSearch='';quickSearchOpen=false;quickAmountRow=null;render();if(first!==null)qOpenAmount(first);return first}
// 在庫→記録。既存の個数修正（adjust）で理由付きで1個減らし、今日のクイック入力にその食材を入れて量の選択を開く。減らしたくなければ通知の「取り消す」で戻せる。
function qStockNames(b){const names=(b.foodIds||[]).map(id=>food(id)?.name).filter(Boolean);return names.length?names:[b.name.slice(0,60)]}
async function qUseStock(b){const names=qStockNames(b),moved=view.page!=='today';const ok=await mutate('adjust',{id:b.id,delta:-1,reason:'今日の記録に使う'},b.name+'を1個減らしました。量を選んで記録してください。');if(!ok)return false;view.page='today';view.todayMode='quick';if(view.date!==jstDate()){view.date=jstDate();view.selected=null}qAddAndOpen(names);if(moved)$('#main').scrollTo(0,0);return true}
// 「食材を選んで記録」の朝・昼・夕の切り替え。日付は「今日」画面の上の日付バー（#viewDate は1つだけ）で選ぶ。
// 1.2.1: 並べるのは「使う食事」と、いま選んでいる食事（使う食事の外の記録を直すとき）だけ。
function qSlotsMarkup(){const use=qMealSlots(qStartInfo(view.date));return `<div class="qContext"><div class="qSlots" role="group" aria-label="記録する食事">${Object.entries(slots).filter(([k])=>use.includes(k)||qSlot()===k).map(([k,v])=>`<button data-q="slot" data-slot="${k}" aria-pressed="${qSlot()===k}">${v}${quickDrafts.get(view.date+'|'+k)?.items.length?'<span class="qDraftDot" aria-label="入力途中">・</span>':''}</button>`).join('')}</div></div>`}
function qFoodResultsMarkup(){const draft=qDraftView(),selected=new Set(draft.items.map(i=>i.name)),catalog=qCatalog(),eaten=qEatenFoods();return `<div class="qFoods">${catalog.map(name=>{const d=draft.items.find(i=>i.name===name)||qDefaults(name);return `<div class="qFoodTile ${selected.has(name)?'selected':''}"><button class="qFood" data-q="food" data-name="${esc(name)}" aria-pressed="${selected.has(name)}" data-edit><b>${esc(name)}</b>${eaten.has(name)?'':'<span class="qFirstBadge">はじめて</span>'}</button><button class="qFoodDose" data-q="food-amount" data-name="${esc(name)}" aria-label="${esc(name)}の量を変更" data-edit>${selected.has(name)?esc(qAmount(d)):d.fromPrevious?'<small>前回</small><span>'+esc(qAmount(d))+'</span>':'量＋'}</button></div>`}).join('')}</div>${!quickSearch&&qCatalog(true).length>12?`<button class="linkButton qCatalogMore" data-q="catalog">${quickCatalogExpanded?'少なく表示':'ほかの食材を見る（'+(qCatalog(true).length-12)+'）'}</button>`:''}${!catalog.length?`<button class="full" data-q="add-search" data-edit>「${esc(quickSearch)}」を追加</button>`:''}`}
// ===== 「今日」画面（1.2.0）=====
// 上から「今日のメニュー」「これからのメニュー」「期限が近いストック」の3ブロックだけ（1.1.x の「明日のおすすめ」は「これからのメニュー」に統合）。
// ほかの操作（食材を選んで記録・献立ごとに記録・献立の追加と一週間の献立・家族メモ）は下の「ほかの記録・操作」の奥に置く。
// ストックが1つも無く、その日の献立・記録も無いときは、3ブロックの代わりに初回案内のカードだけを出す（フラグは持たず、状態で判定）。
function quickTodayPage(){
 qDropStaleDrafts();
 const head=`<header class="qHead tHead"><h1>${view.date===jstDate()?'今日':esc(dateLabel(view.date))}</h1></header>${datebar()}`;
 if(tNeedsStock(view.date))return `${head}${todayWelcomeCard()}${view.todayFree?qFreeComposer():''}${todayMoreMarkup()}`;
 return `${head}${tSetupLine()}${todayMealsBlock()}${view.todayFree?qFreeComposer():''}${todayUpcomingBlock()}${todayStockBlock()}${todayMoreMarkup()}`;
}
// 初回案内。冷凍庫に残りのあるストックが無く、表示中の日に献立・記録も無いとき（使い切った後もここに戻る）。
function tNeedsStock(d){return !state().batches.some(b=>b.quantity>0)&&!meals(d).length}
function todayWelcomeCard(){return `<section class="tBlock tWelcome" id="todayWelcome" aria-labelledby="welcomeTitle"><h2 id="welcomeTitle">まず、冷凍庫にストックを入れましょう</h2><ol class="tWelcomeSteps"><li>冷凍庫にストックを入れる</li><li>日ごとのメニューが自動で出ます</li><li>食べたら「食べた」を押すだけ</li></ol><button class="primary full" data-action="newBatch" data-edit>ストックを入れる</button></section>`}
// 呼び名・時期が未設定のときだけの1行。時期で食事の回数と量の目安が決まるため。
function tSetupLine(){return state().child.name&&qStageKey()?'':`<p class="tSetup">${state().child.name?'時期':'呼び名と時期'}を設定すると、回数と量の目安が合います。<button class="linkButton" data-action="profile" data-edit>設定する</button></p>`}
// その日に並べる食事。枠は使い切り提案と同じ決め方（qMealSlots）。
// 1.2.1: 使う食事の外の枠は、献立・記録があっても主役（ふつうのカード・行）には出さない。消さずに tOutsideSlots で畳んだ1行にする（症状1「朝だけなのに晩が出る」の修正）。
function tSlots(d){const set=new Set(qMealSlots(qStartInfo(d)));return Object.keys(slots).filter(s=>set.has(s))}
function tOutsideSlots(d){const use=tSlots(d);return Object.keys(slots).filter(s=>!use.includes(s)&&meals(d).some(p=>p.slot===s))}
const tOutsideLabel='（使う食事に入っていません）';
function tOutsideName(d,slot){const p=meals(d).find(x=>x.slot===slot);if(!p)return '';const n=tMealNames(p,record(p));return n.length?n.join('・'):p.title}
// 使い切り提案の在庫の差し引き・はじめての食材の数えに入れる献立か。今日以降の使う食事の外の献立は、取り出し・記録が無ければ入れない（食べない前提）。
function qPlanCounts(p,today=jstDate()){return p.prepared||Boolean(record(p))||p.date<today||qMealSlots(qStartInfo(p.date)).includes(p.slot)}
// その日（明日以降も可）の使い切り提案。提案エンジン（qSuggest）は変えず、前の日を基準日として呼ぶと最初の日がその日になる。
function tSuggestFor(d){if(d<jstDate())return null;return qSuggest(plusDate(d,-1))?.days.find(x=>x.date===d)||null}
// 「食べた」1タップの量。①その子の前回の量（qDefaults と同じ基準）②今の時期の目安の幅の中央（g・初期は小さじ1）③どちらも無ければ量を入れない（推定しない）。
// ただし目安が「区分の合計」で決まる食材（野菜・果物）は、単品の量が決まらないので②を使わない。合計の中央値を食材ごとに保存すると、2品で合計の2倍になってしまうため。
function qGuideMid(name){const stage=qStageKey(),n=String(name||'').trim(),group=qFoodGroup(n);if(!stage||!group||qNoGuideFoods.has(n))return null;if(stage==='初期')return {amount:'1',unit:'小さじ'};if(qGuideTotalGroups.has(group))return null;const r=qGuideTable[stage]?.[group];if(!r)return null;return {amount:String(Math.round((r[0]+(r[1]??r[0]))/2*100)/100),unit:'g'}}
function qOneTap(name){const d=qDefaults(name);if(d.fromPrevious)return {name,amount:String(d.amount),unit:d.unit,source:'previous'};const g=qGuideMid(name);return g?{name,...g,source:'guide'}:{name,amount:null,unit:'',source:'none'}}
// 記録済みの食材の項目。items の無い旧記録（献立からの記録）は、食べたと確認した食材（foodIds）を量なしの「食べた」とみなす。
function tRecordedItem(r,name){if(!r)return null;if(r.items?.length)return r.items.find(i=>qName(i)===name)||null;return r.foodIds.some(id=>food(id)?.name===name)?{amount:null,unit:'',intake:'confirmed'}:null}
function tMealNames(p,r){return [...new Set([...(p?qPlanNames(p):[]),...(r?(r.items?.length?r.items.map(qName):r.foodIds.map(id=>food(id)?.name)):[])])].filter(Boolean)}
function tRowMarkup(d,slot,name,r){const done=tRecordedItem(r,name),t=done?null:qOneTap(name),sub=done?(done.intake==='not_eaten'?'食べなかった':'食べた・'+qAmount(done)):t.amount==null?'':(t.source==='previous'?'前回 ':'目安 ')+qAmount(t);return `<div class="tRow ${done?'done':''}"><button class="tRowMain" data-t="adjust" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="${esc(name)}の量・様子を変える" data-edit><b>${esc(name)}</b>${qIsFirstFood(name)&&!done?'<span class="qFirstBadge">はじめて</span>':''}<small>${esc(sub)}</small></button>${done?'<span class="tDone">記録済み</span>':`<button class="tAte" data-t="ate" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="${esc(name)}を食べたで記録" data-edit>食べた</button>`}</div>`}
function tMealMarkup(d,slot,day){
 const p=meals(d).find(x=>x.slot===slot),r=p&&record(p),names=tMealNames(p,r),m=!p&&day?day.meals.find(x=>x.slot===slot):null;
 // 題名が食材名の列挙そのもの（提案から入れた献立など）なら、カード内の食材名と重複するので見出しには出さない。食材未登録のときは本文側で題名を出す。
 const headTitle=p&&!p.quickCreated&&names.length&&p.title&&p.title!==qPlanNames(p).join('・')?`<span class="tMealTitle">${esc(p.title)}</span>`:'',pill=r?`<span class="pill ${planRecordChanged(p,r)?'':'green'}">${esc(status(p))}</span>`:'';
 let body;
 if(p&&names.length)body=names.map(n=>tRowMarkup(d,slot,n,r)).join('');
 else if(p)body=`<div class="tRow ${r?'done':''}"><span class="tRowMain"><b>${esc(p.title)}</b><small>${r?esc(r.result):'食材は未登録'}</small></span>${r?'<span class="tDone">記録済み</span>':`<button class="tAte" data-action="quickRecord" data-id="${p.id}" data-result="食べた" aria-label="${esc(p.title)}を食べたで記録" data-edit>食べた</button>`}</div>`;
 else if(m&&!m.taken&&m.add.length)body=`<div class="tEmpty"><small>おすすめ：${esc(m.add.map(i=>i.name).join('・'))}</small><button class="primary" data-action="suggestMeal" data-date="${d}" data-slot="${slot}" data-edit>おすすめを入れる</button></div>`;
 else body=`<div class="tEmpty"><small>${d>=jstDate()?'ストックが足りません':'献立はまだありません。'}</small></div>`;
 const rep=p&&!r&&!p.prepared&&!planStockConflict(p).length?tReplaceMeal(d,slot,p.id):null;
 const foot=[r?`<button class="linkButton" data-action="detail" data-id="${p.id}" data-edit>様子・メモ</button>`:'',rep?`<button class="linkButton" data-action="suggestReplace" data-date="${d}" data-slot="${slot}" data-id="${p.id}" data-edit>おすすめに変える</button>`:'',p&&p.uses.length&&!p.prepared&&!planStockConflict(p).length?`<button class="linkButton" data-action="prepare" data-id="${p.id}" data-edit>冷凍庫から出す</button>`:'',!p?`<button class="linkButton" data-t="free-slot" data-slot="${slot}" data-edit>自分で選んで記録</button>`:''].filter(Boolean).join('');
 // 1.2.1: 食材の追加・変更の入口を常に見える形に（1.2.0 の「献立を直す」リンクを置き換え）。開くのは既存の食事編集（tEditMeal）。
 return `<article class="tMeal" data-meal-slot="${slot}"><div class="tMealHead"><h3>${slots[slot]}</h3>${headTitle}${pill}</div>${body}${tEditMealButton(d,slot)}${foot?`<div class="tMealFoot">${foot}</div>`:''}</article>`;
}
function tEditMealButton(d,slot){return `<button class="tEditMeal" data-t="edit-meal" data-date="${d}" data-slot="${slot}" aria-label="${esc(slots[slot])}の食材を足す・変える" data-edit>＋ 食材を足す／変える</button>`}
// 「食材を足す／変える」。記録済みならその記録の訂正（食材を選んで記録の訂正モード）、献立があれば献立の編集、無ければその日・その食事の献立の追加を開く。
// 品数が日数の目安（qMealLimit）に達していたら、開く前に短く伝える（開くのは止めない）。
function tEditMeal(date,slot){
 const p=meals(date).find(x=>x.slot===slot),r=p&&record(p),info=qStartInfo(date),cap=qMealLimit(info).cap,n=p?tMealNames(p,r).length:0;
 if(info.day!==null&&n>=cap)showStatus(`いまは1食${cap}品が目安です。`);
 if(r){if($('#dialog').open)closeDialog();view.page='today';view.todayMode='quick';view.todayFree=true;view.date=p.date;view.quickSlot=p.slot;qEditDraft(r);quickAmountRow=null;render();qJump($('#freeComposer'));return 'record'}
 if(p){planForm(p);return 'plan'}
 planForm(null,date,slot);return 'new';
}
// その日の食事がすべて同じ1種類の食材だけのとき（ストックが1種類だけのとき等）、並びが間違いに見えないよう1行の注記を出す。組み立てや提案の内容は変えない。
function tSameFoodNote(d){const withNames=meals(d).map(p=>tMealNames(p,record(p))).filter(n=>n.length);if(withNames.length<2)return '';const food=withNames[0].length===1?withNames[0][0]:null;if(!food||!withNames.every(n=>n.length===1&&n[0]===food))return '';return '<p class="small muted tSameFoodNote">ストックが1種類だけなので、同じ食材が並んでいます</p>'}
// 使う食事（朝・昼・晩）の切り替え（1.2.0、1.1.x の「1日の回数」を置き換え）。押すとプロフィールの mealSlots として保存され（data-action="mealSlot"）、
// 今日のメニュー・これからのメニュー・使い切り提案・ストック追加時の自動反映に反映される。押された状態は qMealSlots の結果（自動のときも今の枠）を表示する。
function tMealSlotsBar(d){const cur=qMealSlots(qStartInfo(d));const btns=Object.entries(slots).map(([k,v])=>`<button data-action="mealSlot" data-slot="${k}" aria-pressed="${cur.includes(k)}" data-edit>${v}</button>`).join('');return `<div class="tMealCount"><span class="tMealCountLabel">使う食事</span><span class="tMealCountBtns">${btns}</span></div>`}
// 1.2.1: 使う食事の外の枠にある献立・記録。消さずに、畳んだ1行（開くと従来のカード）で出す。
function tOutsideMarkup(d){return tOutsideSlots(d).map(slot=>`<details class="tOutside" data-outside-slot="${slot}"><summary>${slots[slot]}：${esc(tOutsideName(d,slot))}<small>${tOutsideLabel}</small></summary>${tMealMarkup(d,slot,null)}</details>`).join('')}
// 1.2.1: 今日のメニューの下の1行。始めてからの日数の区分（qMealSteps と同じ 6・20・30日目）ごとに、品数と食事の回数の目安を短く伝える。日数が分からなければ汎用の1行。
function tStepLine(d){
 const info=qStartInfo(d),day=info.day;let t;
 if(info.source==='period'||day===null||day<1)t='進み具合に合わせて、品数と回数が少しずつ増えます。';
 else if(day<=6)t=`いまは始めて${day}日目です。最初のうちは1食1品（主食だけ）が目安なので、メニューはおかゆ中心になります。`;
 else if(day<=20)t=`いまは始めて${day}日目です。1日1回、1食2品（主食と野菜・果物）までが目安です。`;
 else if(day<=30)t=`いまは始めて${day}日目です。1日1回、1食3品（主食・主菜・副菜）までが目安です。主菜は豆腐・白身魚などから。`;
 else t=`いまは始めて${day}日目です。1食3品（主食・主菜・副菜）までが目安で、食事は1日${qSuggestMeals[info.stage]||(day<=120?2:3)}回が目安です。`;
 return `<p class="small muted tStepLine">${t}</p>`;
}
// 「おすすめに変える」用：対象の献立が無いものとして計算した、その日のその食事の提案。エンジン（qSuggest）の組み立ては変えず、同期計算の間だけ献立を外して戻す（画面には出ない）。記録済み・準備済みの食事には使わない。
function tReplaceMeal(d,slot,planId){const plans=state().plans,i=plans.findIndex(p=>p.id===planId);if(i<0)return null;const removed=plans[i];plans.splice(i,1);try{return tSuggestFor(d)?.meals.find(m=>m.slot===slot&&!m.taken&&m.add.length)||null}finally{plans.splice(i,0,removed)}}
function todayMealsBlock(){const d=view.date,day=tSuggestFor(d);return `<section class="tBlock tMeals" id="todayMeals" aria-labelledby="todayMealsTitle"><h2 id="todayMealsTitle">${d===jstDate()?'今日':'この日'}のメニュー</h2>${tMealSlotsBar(d)}${tSameFoodNote(d)}${quickStaleNote?`<p class="qNewFoodNote qStaleNote" role="status">${esc(quickStaleNote)}</p>`:''}${tSlots(d).map(slot=>tMealMarkup(d,slot,day)).join('')}${tOutsideMarkup(d)}${tStepLine(d)}</section>`}
// これからのメニュー（1.2.0）。明日〜6日後を日ごとに、日付と各食事の食材名だけ。献立があればその食材、無ければ使い切り提案（qSuggest、明日から）のプレビュー。
// 「入れる」は従来の suggestPlan（その日の提案を planMany で一度に入れる。プレビューと同じ qSuggest の結果を使う）。
// 提案が作れない食事がある日は「ストックが足りません」の1行だけ（理由の長文は出さない）。提案の決め方は折りたたみの中に残す。
// 1.2.1: 日付を押すとその日がその場で開き（view.upOpen）、食事ごとに「おすすめに変える／おすすめを入れる」「食材を足す／変える」が押せる（開く→押すだけ）。
// 使う食事の外の枠の献立は、畳んだ1行（使う食事に入っていません）だけ。
function tUpActions(d,slot,p,m){
 let rec='';
 if(p){if(!record(p)&&!p.prepared&&!planStockConflict(p).length&&tReplaceMeal(d,slot,p.id))rec=`<button class="linkButton" data-action="suggestReplace" data-date="${d}" data-slot="${slot}" data-id="${p.id}" data-edit>おすすめに変える</button>`}
 else if(m&&!m.taken&&m.add.length)rec=`<button class="linkButton" data-action="suggestMeal" data-date="${d}" data-slot="${slot}" data-src="up" data-edit>おすすめを入れる</button>`;
 return `<span class="tUpActions">${rec}${tEditMealButton(d,slot)}</span>`;
}
function tUpcomingDay(d,s){
 const day=s?.days.find(x=>x.date===d),ps=meals(d),open=view.upOpen===d;let short=false;
 const rows=tSlots(d).map(slot=>{
  const p=ps.find(x=>x.slot===slot),m=p?null:day?.meals.find(x=>x.slot===slot),act=()=>open?tUpActions(d,slot,p,m):'';
  if(p){const n=tMealNames(p,record(p));return `<li class="tUpSlot"><span class="tUpLabel">${slots[slot]}</span><span class="tUpNames">${esc(n.length?n.join('・'):p.title)}</span>${act()}</li>`}
  if(m&&!m.taken&&m.add.length)return `<li class="tUpSlot tUpSuggest"><span class="tUpLabel">${slots[slot]}</span><span class="tUpNames"><small>おすすめ</small>${m.add.map(i=>esc(i.name)+(i.first?'<span class="qFirstBadge">はじめて</span>':'')).join('・')}</span>${act()}</li>`;
  if(!m||!m.items.length)short=true;return open?`<li class="tUpSlot"><span class="tUpLabel">${slots[slot]}</span><span class="tUpNames"><small>まだありません</small></span>${act()}</li>`:'';
 }).join('')+tOutsideSlots(d).map(slot=>`<li class="tUpSlot tUpOutside"><small>${slots[slot]}：${esc(tOutsideName(d,slot))}${tOutsideLabel}</small></li>`).join('');
 const can=Boolean(day?.meals.some(m=>!m.taken&&m.add.length));
 return `<li class="tUpDay${open?' open':''}" data-up-date="${d}"><div class="tUpHead"><button class="tUpDate" data-t="up-open" data-date="${d}" aria-expanded="${open}" aria-label="${esc(dateLabel(d))}のメニューを${open?'閉じる':'開いて直す'}"><b>${esc(dateLabel(d))}</b><small>${open?'閉じる':'直す'}</small></button>${can?`<button class="tUpAdd" data-action="suggestPlan" data-date="${d}" aria-label="${esc(dateLabel(d))}のおすすめを献立に入れる" data-edit>入れる</button>`:''}</div>${rows?`<ul class="tUpSlots">${rows}</ul>`:''}${short?'<p class="small muted tUpShort">ストックが足りません</p>':''}</li>`;
}
function todayUpcomingBlock(){
 const s=qSuggest(),days=Array.from({length:6},(_,i)=>plusDate(jstDate(),i+1));
 return `<section class="tBlock tUpcoming" id="todayUpcoming" aria-labelledby="upcomingTitle"><h2 id="upcomingTitle">これからのメニュー</h2><ul class="tUpDays">${days.map(d=>tUpcomingDay(d,s)).join('')}</ul>${s&&s.unknown.length?`<p class="small muted tUpUnknown">主食・主菜・副菜が分からず、メニューに使っていないストック：${esc(s.unknown.join('・'))}（冷凍庫のカードの「含まれる食材を直す」で使えます）</p>`:''}${s?`<details class="tUpWhy"><summary>おすすめの決め方</summary>${qSuggestFactsMarkup(s,true)}</details>`:''}</section>`;
}
// 期限が近いストック。冷凍庫から期限が近い順に最大3件、名前と「あと○日」だけ。押すとカードの詳細が開く。
function todayStockBlock(){const list=stockSorted(state().batches.filter(b=>b.quantity>0&&stockExpiry(b))).slice(0,3);return `<section class="tBlock tStock" id="todayStock" aria-labelledby="todayStockTitle"><h2 id="todayStockTitle">期限が近いストック</h2>${list.length?list.map(b=>`<button class="tStockRow" data-action="stockDetail" data-id="${b.id}"><span>${esc(b.name)}</span>${stockBadge(b)}</button>`).join('')+'<p class="small muted">「あと○日」は作った日から7日の目安です。</p>':'<p class="small muted">期限の近いストックはありません。</p>'}</section>`}
// 奥にしまった操作。どれも従来の機能・操作（quickLog・legacy 画面・plan・note）をそのまま使う。
function todayMoreMarkup(){return `<details class="tMore"><summary>ほかの記録・操作</summary><div class="tMoreList"><button data-t="free" aria-expanded="${Boolean(view.todayFree)}" data-edit>${view.todayFree?'「食材を選んで記録」を閉じる':'食材を選んで記録する（いつもの一食・検索）'}</button><button data-q="legacy">献立ごとに記録する（取り出し・食べた様子）</button><button data-action="newPlan" data-edit>献立を追加</button><button data-nav="plan">一週間の献立を見る・動かす</button><button data-action="note" data-edit>家族へのメモ</button></div>${state().note?`<p class="tNote"><b>家族のメモ：</b>${esc(state().note)}</p>`:''}</details>`}
// 食材を選んで記録（従来のクイック入力）。いつもの一食・食材の一覧と検索・選択中の一覧・記録済みの訂正をここにまとめる。
function qFreeComposer(){
 const draft=qDraftView(),r=qRecord();
 return `<section class="qWorkspace tFree" id="freeComposer" aria-label="食材を選んで記録"><div class="sectionhead"><h2>食材を選んで記録</h2><button class="linkButton" data-t="free">閉じる</button></div>${qSlotsMarkup()}${qRepeats()}<section class="qComposer"><div class="sectionhead"><h2>${draft.replace?'食材・量を訂正':'食材を選ぶ'}</h2><button class="linkButton" data-q="search" aria-expanded="${quickSearchOpen}" data-edit>${quickSearchOpen?'検索を閉じる':'探す・追加'}</button></div>${quickSearchOpen?`<div class="qSearchArea"><input id="quickSearch" type="search" maxlength="60" aria-label="食材を探す" placeholder="食材名を入力" value="${esc(quickSearch)}"><button class="linkButton" data-q="custom" data-edit>新しい食材を追加</button></div>`:''}<div id="quickFoodResults">${qFoodResultsMarkup()}</div>${draft.items.length?`<div class="qBasket"><div class="sectionhead"><h3>${draft.items.length}食材を選択中</h3><button class="linkButton" data-q="clear" data-edit>クリア</button></div><details ${draft.replace?'open':''}><summary>量の一覧・訂正</summary>${draft.items.map((i,n)=>`<div class="qBasketItem"><div class="qBasketLine"><b>${esc(i.name)}</b><button class="qAmount ${i.amount==null?'empty':''}" data-q="amount" data-row="${n}" data-edit>${esc(qAmount(i))}</button><button class="qRemove" data-q="remove" data-row="${n}" aria-label="${esc(i.name)}を外す" data-edit>外す</button></div></div>`).join('')}<button class="linkButton" data-q="pin-draft" data-edit>この組み合わせを固定</button></details></div>`:''}${qNotesMarkup()}</section>${r?`<section class="qCurrent qCurrentActions"><div class="sectionhead"><h3>${slots[qSlot()]}ごはん・記録済み</h3><button class="linkButton" data-q="edit-record" data-id="${r.id}" data-edit>食材・量を訂正</button></div><button class="linkButton" data-action="detail" data-id="${r.planId}" data-edit>様子・症状のメモ</button>${r.items?.length&&qSupportedItems(r.items)?`<button class="linkButton" data-q="pin-record" data-id="${r.id}" data-edit>この一食を固定</button>`:''}</section>`:''}</section>`;
}
function qJump(el){const main=$('#main');if(el)main.scrollTo({top:main.scrollTop+el.getBoundingClientRect().top-main.getBoundingClientRect().top-12})}
function qRecordDay(r,p){if(r.eatenAt){const time=new Date(r.eatenAt);if(!Number.isNaN(time.getTime()))return jstDate(time)}return p.date}
// 新しい食材のサポート。保存形式は変えず、記録履歴から「食べた食材 → 初めて食べた日」を毎回導出する。
// items のある記録は confirmed の食材、items の無い記録（献立からの記録）は foodIds を食べた食材とみなす。
function qEatenNames(r){return (r.items?.length?r.items.filter(i=>i.intake==='confirmed').map(qName):(r.foodIds||[]).map(id=>food(id)?.name)).filter(Boolean)}
function qEatenFoods(){const plans=new Map(state().plans.map(p=>[p.id,p])),out=new Map();for(const r of state().records){const p=plans.get(r.planId);if(!p)continue;const day=qRecordDay(r,p);for(const n of qEatenNames(r))if(!out.has(n)||day<out.get(n))out.set(n,day)}return out}
function qIsFirstFood(name){return !qEatenFoods().has(name)}
function qFirstEatenOn(name){return qEatenFoods().get(name)??null}
// 表示中の日に初めて食べる食材（保存済み＋入力中の下書き）を数え、2種類以上なら一言だけ返す。入力は止めない。
// 日付は献立の予定日ではなく実際に食べた日で数える。量0（食べなかった）は数えない。
function qNewFoodNotice(){const eaten=qEatenFoods(),plans=new Map(state().plans.map(p=>[p.id,p])),names=new Set();for(const r of state().records){const p=plans.get(r.planId);if(!p)continue;const day=qRecordDay(r,p);if(day!==view.date)continue;for(const n of qEatenNames(r))if(eaten.get(n)===day)names.add(n)}for(const i of qDraftView().items){if(!i.name||(i.amount!=null&&i.amount!==''&&Number(i.amount)===0))continue;const first=eaten.get(i.name);if(!first||first>=view.date)names.add(i.name)}return names.size>=2?`はじめての食材が${names.size}種類あります。新しい食材は1日1種類が目安です。`:null}
// 時期ごとの1回量の目安（厚労省「授乳・離乳の支援ガイド」の量表、単位 g）。アプリに月齢判定が無いので、時期は設定で選んだ「今の時期」を最優先し、未選択なら段階メモの語句から読む。
// 分類の値は、その分類を代表する形の食材にだけ出す（穀類は中期のおかゆ＝全がゆ、豆類は豆腐、乳製品はヨーグルト・牛乳）。食パン・納豆・チーズなど分類の値と食品別の値が違う食材や、
// 後期・完了期の穀類（全がゆ／軟飯で値が違い、形が分からない）は、分類一律の値を出さない（食品別の値を確認して追加するまで目安なし）。
// レバー・鶏レバーはビタミンA（レチノール）が極めて多く、肉の分類一律の量では多すぎることがあるので、同じ方針で目安を出さない（区分＝主菜には残す）。
const qNoGuideFoods=new Set(['レバー','鶏レバー']);
const qFoodGroups={grains:['おかゆ'],vegfruit:['にんじん','かぼちゃ','ほうれん草','小松菜','ブロッコリー','じゃがいも','さつまいも','玉ねぎ','大根','かぶ','キャベツ','トマト','ピーマン','なす','きゅうり','バナナ','りんご','みかん','いちご','キウイ','梨','桃','アボカド'],fish:['白身魚','鯛','ひらめ','たら','かれい','しらす','まぐろ','かつお','鮭','あじ','さば','いわし'],meat:['鶏肉','鶏ささみ','鶏ひき肉','牛肉','豚肉','合いびき肉','レバー','鶏レバー'],tofu:['豆腐'],dairy:['ヨーグルト','牛乳']};
const qGuideTable={'中期':{grains:[50,80],vegfruit:[20,30],fish:[10,15],meat:[10,15],tofu:[30,40],dairy:[50,70]},'後期':{vegfruit:[30,40],fish:[15],meat:[15],tofu:[45],dairy:[80]},'完了期':{vegfruit:[40,50],fish:[15,20],meat:[15,20],tofu:[50,55],dairy:[100]}};
const qGuideLabels={grains:'全がゆ',vegfruit:'野菜・果物の合計量',fish:'魚',meat:'肉',tofu:'豆腐',dairy:'乳製品'};
// 目安が「区分の合計」で定義される区分。この区分の食材は単品の量が決まらないので、1タップ記録でも使い切り提案でも量を自動で出さない。
const qGuideTotalGroups=new Set(['vegfruit']);
const qPeriods=['初期','中期','後期','完了期'];
// 保存済みの「今の時期」。未保存・想定外の値は「選んでいない」として扱う（補わない）。
function qSavedPeriod(){const v=state().child?.period;return qPeriods.includes(v)?v:''}
function qStageKey(){const saved=qSavedPeriod();if(saved)return saved;const s=String(state().child?.stage||'');return ['完了期','後期','中期','初期'].find(k=>s.includes(k))||''}
function qFoodGroup(name){const n=String(name||'').trim();for(const [k,list] of Object.entries(qFoodGroups))if(list.includes(n))return k;return null}
function qGuideText(name){const stage=qStageKey(),group=qFoodGroup(name);if(!stage||!group||qNoGuideFoods.has(String(name||'').trim()))return null;if(stage==='初期')return '初期の目安：小さじ1から、様子を見ながら少しずつ';const range=qGuideTable[stage]?.[group];return range?stage+'の1回量の目安（'+qGuideLabels[group]+'）：'+range.join('〜')+'g':null}
// 増量候補。前回食べた量と同じ単位のときだけ、少し多い量を選べるボタンを出す（自動では変えない）。
function qPrevAmount(name){for(const r of qByMealDesc()){const i=r.items?.find(i=>qName(i)===name&&qHasAmount(i));if(i)return {amount:String(i.amount),unit:i.unit}}return null}
function qBumpAmount(row){const i=qDraft().items[row];if(!i)return null;const prev=qPrevAmount(i.name);if(!prev||!quickUnits.includes(prev.unit)||i.unit!==prev.unit)return null;const next=Math.round((Number(prev.amount)+(prev.unit==='小さじ'?1:5))*100)/100;return Number.isFinite(next)&&next<=9999?{prev,amount:String(next),unit:prev.unit}:null}
// 良い組み合わせのヒント。主要な食材だけの小さな栄養タグ表。前向きな一言を最大1つ返す。
// ひじき（八訂で鉄が大幅に下方修正・無機ヒ素）とあじ（1回量では鉄が少ない）は鉄に入れない。
const qNutrientTags={iron:['レバー','鶏レバー','牛肉','まぐろ','かつお','さば','いわし','小松菜','ほうれん草','豆腐','高野豆腐','納豆','卵黄'],vitaminC:['ブロッコリー','かぼちゃ','ピーマン','カリフラワー','じゃがいも','さつまいも','いちご','みかん','キウイ','キャベツ']};
function qComboHint(names){const list=(names||[]).map(n=>String(n||'').trim());const iron=list.some(n=>qNutrientTags.iron.includes(n)),vitaminC=list.some(n=>qNutrientTags.vitaminC.includes(n));if(iron&&vitaminC)return 'ビタミンCと一緒だと、鉄分が吸収されやすくなります。';if(iron)return '鉄分のある食材です。ビタミンCのある野菜や果物と合わせると、鉄分が吸収されやすくなります。';return null}
// 組み合わせは、下書きに鉄・ビタミンCの食材があるときだけ、同じ食事に記録済みの食材（訂正中を除く）も含めて判定する（記録済みの食材をもう一度すすめない）。
function qNotesMarkup(){const d=qDraftView(),r=qRecord(),notice=qNewFoodNotice(),names=d.items.map(i=>i.name),tagged=names.some(n=>qNutrientTags.iron.includes(n)||qNutrientTags.vitaminC.includes(n)),hint=tagged?qComboHint([...names,...(r&&!d.replace?qEatenNames(r):[])]):null;return notice||hint?`<div class="qNotes">${notice?`<p class="qNewFoodNote">${esc(notice)}</p>`:''}${hint?`<p class="qComboHint">${esc(hint)}</p>`:''}</div>`:''}
// 食材ごとの見返し。記録から毎回導出する（保存形式は変えない）。食べ具合は食事全体の結果を、その食材を食べた記録だけで数える。
// 出したが食べたと確認していない食材は、食事が「食べなかった」か食材が not_eaten のときだけ「食べなかった」に数え、それ以外は推定しない。
function qFoodReview(name){
 const plans=new Map(state().plans.map(p=>[p.id,p])),id=state().foods.find(f=>f.name===name)?.id,amounts=[],seq=[],intake={ate:0,little:0,none:0};let times=0;
 const list=state().records.map(r=>({r,p:plans.get(r.planId)})).filter(x=>x.p).map(x=>({...x,day:qRecordDay(x.r,x.p)})).sort((a,b)=>a.day.localeCompare(b.day)||slotOrder[a.p.slot]-slotOrder[b.p.slot]||(a.r.eatenAt||a.r.recordedAt||'').localeCompare(b.r.eatenAt||b.r.recordedAt||''));
 for(const {r,p} of list){const items=(r.items||[]).filter(i=>qName(i)===name),eaten=qEatenNames(r).includes(name);if(!eaten&&!items.length&&!(id&&(r.offeredFoodIds||p.foodIds||[]).includes(id)))continue;
  if(eaten){times++;const i=items.find(qHasAmount);if(i)amounts.push({amount:String(i.amount),unit:i.unit});seq.push(Boolean(i));if(r.result==='食べた')intake.ate++;else if(r.result==='少し食べた')intake.little++}
  else if(items.some(i=>i.intake==='not_eaten')||r.result==='食べなかった'){intake.none++;seq.push(false)}}
 // 直近の量は量0・食べなかった回を除いた最新。増減は直近2回がどちらも量ありのときだけ比べ、間やその後に量なしの回があれば比べない。単位が違っても比べない。
 const last=amounts.at(-1)||null,prev=amounts.at(-2)||null,adjacent=seq.length>=2&&seq.at(-1)&&seq.at(-2);
 const trend=last&&prev&&adjacent&&last.unit===prev.unit?(Number(last.amount)>Number(prev.amount)?'増えている':Number(last.amount)<Number(prev.amount)?'減っている':'同じくらい'):null;
 return {first:qFirstEatenOn(name),times,last,trend,intake};
}
function qFoodReviewMarkup(name){const v=qFoodReview(name),n=v.intake,intake=n.ate+n.little+n.none?`<span class="qReviewIntake">食べた ${n.ate}回・少し食べた ${n.little}回・食べなかった ${n.none}回</span>`:'';if(!v.times)return `<span class="qReview"><span class="qReviewNone">まだ食べていない</span>${intake}</span>`;return `<span class="qReview"><span>はじめて ${esc(dateLabel(v.first))}・食べた回数 ${v.times}回</span>${v.last?`<span>直近 ${esc(qAmount(v.last))}${v.trend?'・'+v.trend:''}</span>`:''}${intake}</span>`}
// 週のまとめ。期間内に食べた食材の種類数と、初めて食べた日が期間内にある食材。
function qWeekSummary(start,end){const kinds=new Set();for(const x of qWeekEntries())if(x.date>=start&&x.date<=end)for(const n of qEatenNames(x.record))kinds.add(n);const newFoods=[...qEatenFoods()].filter(([,d])=>d>=start&&d<=end).sort((a,b)=>a[1].localeCompare(b[1])||a[0].localeCompare(b[0])).map(([n])=>n);return {kinds:kinds.size,newFoods}}
function qWeekSummaryMarkup(start,end,full=true){const s=qWeekSummary(start,end);return `<p class="qWeekSummary">${s.kinds?`食べた食材 ${s.kinds}種類${s.newFoods.length?`・はじめての食材 ${s.newFoods.length}種類${full?`（${esc(s.newFoods.join('・'))}）`:''}`:'・はじめての食材はありません'}`:'この期間に食べた記録はまだありません'}</p>`}
function qWeekEntries(){return state().records.map(r=>({record:r,plan:state().plans.find(p=>p.id===r.planId)})).filter(x=>x.plan).map(x=>({...x,date:qRecordDay(x.record,x.plan)}))}
function qWeekLines(r){if(r.items?.length)return r.items.map(i=>({name:qName(i),amount:i.intake==='not_eaten'?(i.amount!=null?qAmount(i):'食べず'):qAmount(i),notEaten:i.intake==='not_eaten'}));if(r.foodIds?.length)return r.foodIds.map(id=>({name:food(id)?.name||'食材名未登録',amount:'量未入力',notEaten:r.result==='食べなかった'}));return [{name:r.actualTitle||'食事の記録',amount:r.result==='食べなかった'?'食べなかった':'量未入力',notEaten:r.result==='食べなかった'}]}
function qWeekRecordMarkup(r){return `<button class="qWeekMeal" data-q="week-record" data-id="${r.id}" aria-label="${esc(r.actualTitle||'食事')}の記録を見る">${qWeekLines(r).map(i=>`<span class="qWeekItem ${i.notEaten?'notEaten':''}"><span class="qWeekFood">${esc(i.name)}</span><strong class="qWeekAmount">${esc(i.amount)}</strong>${i.notEaten&&i.amount!=='食べなかった'&&i.amount!=='食べず'?'<small>食べず</small>':''}</span>`).join('')}</button>`}
// 一週間の表。1.1.0 から「記録」の「くわしく見る」の奥に置く（jump=false のときは「入力へ戻る」を出さない）。
function qWeekSection(jump=true){const end=view.date>jstDate()?jstDate():view.date;const days=Array.from({length:7},(_,i)=>plusDate(end,-i));const entries=qWeekEntries();const weekday=d=>new Intl.DateTimeFormat('ja-JP',{weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(d+'T12:00:00+09:00'));return `<section class="qWeek" id="weekHistory" aria-labelledby="weekTitle"><div class="qWeekHeader"><div><h2 id="weekTitle">一週間の食事</h2><p>${Number(days[6].slice(5,7))}/${Number(days[6].slice(8))}〜${Number(end.slice(5,7))}/${Number(end.slice(8))}・食べたものと量</p></div>${jump?'<button class="linkButton" data-q="input-jump">入力へ戻る</button>':''}</div>${qWeekSummaryMarkup(days[6],end)}<table class="qWeekTable"><caption class="srOnly">${esc(end)}を含む過去七日間の食事記録</caption><colgroup><col class="qWeekDateCol"><col><col><col></colgroup><thead><tr><th scope="col">日付</th><th scope="col">朝</th><th scope="col">昼</th><th scope="col">夕</th></tr></thead><tbody>${days.map(d=>`<tr class="${d===jstDate()?'today':''}"><th scope="row"><time datetime="${d}">${Number(d.slice(5,7))}/${Number(d.slice(8))}<small>${weekday(d)}</small>${d===jstDate()?'<em>今日</em>':''}</time></th>${Object.keys(slots).map(slot=>{const list=entries.filter(x=>x.date===d&&x.plan.slot===slot).sort((a,b)=>(a.record.eatenAt||a.record.recordedAt||'').localeCompare(b.record.eatenAt||b.record.recordedAt||''));return `<td data-week-date="${d}" data-week-slot="${slot}" data-meal-label="${slots[slot]}" class="${view.date===d&&qSlot()===slot?'currentMeal':''}">${list.length?list.map(x=>qWeekRecordMarkup(x.record)).join(''):'<span class="qWeekEmpty">未記録</span>'}</td>`}).join('')}</tr>`).join('')}</tbody></table></section>`}
function qWeekDetail(r){const p=state().plans.find(p=>p.id===r.planId);openDialog(`<h2>${dateLabel(qRecordDay(r,p))}・${slots[p.slot]}ごはん</h2><div class="qWeekDetail">${qWeekLines(r).map(i=>`<div><b>${esc(i.name)}</b><strong>${esc(i.amount)}${i.notEaten?'（食べず）':''}</strong></div>`).join('')}</div>${r.memo?`<p class="hint">${esc(r.memo)}</p>`:''}${r.symptom?`<p class="hint">観察メモ：${esc(r.symptom)}</p>`:''}<p class="formHint">${esc(r.actor)}が記録。${r.eatenAt?'食事時刻 '+dateTimeLabel(r.eatenAt):'食事時刻は未入力'}</p>${editable()?`<div class="buttonrow"><button data-q="edit-record" data-id="${r.id}">食材・量を訂正</button><button data-action="detail" data-id="${p.id}">様子を補足</button><button data-q="record-remove" data-id="${r.id}">この食事の記録を消す</button></div>`:''}`)}
// 記録を消して「未記録」に戻す確認。削除そのものは local-store の removeRecord（取り出し済みなら在庫も戻す）。直後は通知の「取り消す」で復元できる。
function qRemoveRecordConfirm(r){const p=state().plans.find(p=>p.id===r.planId);if(!p)return;openDialog(`<h2>記録を消しますか</h2><p>${esc(dateLabel(qRecordDay(r,p)))}・${slots[p.slot]}ごはん（${esc(r.actualTitle||p.title)}）の記録を消して、未記録に戻します。</p>${p.prepared?'<p>冷凍庫から取り出した分は、在庫に戻します。</p>':''}<p class="formHint">消した直後は、画面下の「取り消す」でもとに戻せます。</p><div class="buttonrow"><button data-action="close">やめる</button><button class="primary" data-q="record-remove-do" data-id="${r.id}">記録を消す</button></div>`)}
function qAmountMarkup(row){const i=qDraft().items[row],unit=i.unit||qDefaultUnit(),first=qFirstEatenOn(i.name),guide=qGuideText(i.name),bump=qBumpAmount(row);return `<h2>${esc(i.name)}の量</h2><p class="formHint">実際に食べた量を選びます。</p><p class="qFoodNote">${first?'はじめて食べた日：'+esc(dateLabel(first)):'はじめての食材です。様子を見ながら少しずつ。'}</p>${guide?`<p class="qGuide">${esc(guide)}</p>`:''}${bump?`<div class="qBumpRow"><span>前回 ${esc(qAmount(bump.prev))} を食べました。</span><button class="qBump" data-q="bump" data-row="${row}" data-amount="${esc(bump.amount)}">少し増やす：${esc(qAmount(bump))}</button></div>`:''}<div class="qAmountPicker"><div class="qUnitRow" role="group" aria-label="単位">${quickUnits.map(u=>`<button data-q="unit" data-unit="${u}" data-row="${row}" aria-pressed="${i.unit===u}">${u}</button>`).join('')}</div><div class="qQuantities">${(unit==='小さじ'?['0','0.5','1','2','3','4','5']:['0','5','10','15','20','30','40','50','60','80','100']).map(v=>`<button data-q="quantity" data-row="${row}" data-amount="${v}" aria-pressed="${String(i.amount)===v}">${esc(qAmount({amount:v,unit}))}</button>`).join('')}</div><div class="qExact"><label for="qExact${row}">ほかの量</label><input id="qExact${row}" data-q-exact="${row}" type="number" min="0" max="9999" step="0.01" inputmode="decimal" value="${i.amount??''}" aria-label="${esc(i.name)}の量"><button data-q="exact-done">この量にする</button></div><button class="linkButton full" data-q="unknown" data-row="${row}">量を入力せず続ける</button></div>`}
function qOpenAmount(row){quickAmountRow=row;const html=qAmountMarkup(row);if($('#dialog').open&&$('#dialog').dataset.quickAmount){$('#dialogBody').innerHTML='<div id="dialogError" class="dialogError" role="alert"></div>'+html}else{openDialog(html);$('#dialog').dataset.quickAmount='yes'}}
function qCloseAmount(){if($('#dialog').dataset.quickAmount){delete $('#dialog').dataset.quickAmount;closeDialog()}quickAmountRow=null}
function quickRecovered(operation){if(operation.action==='quickLog'){quickAmountRow=null;render()}}
function quickDock(){const d=qDraftView();if(!d.items.length)return '';return `<section class="dock qDock"><div class="qDraftSummary"><b>${esc(qSummary(d.items))}</b><small>未保存・${dateLabel(view.date)}・${slots[qSlot()]}ごはん${d.items.some(i=>i.amount==null)?' ／ 量未入力あり':''}</small><button class="linkButton" data-q="clear" data-edit>やめる</button></div><button class="primary" data-q="save" data-edit ${busy||pendingMutation?'disabled':''}>${d.replace?'この内容に訂正':qApplied(d.items)?'おかわりとして追加':qRecord()?'この食材・量を追加':'この食材・量で記録'}</button></section>`}
function qSetItems(source,id){return source==='template'?state().templates.find(t=>t.id===id)?.items:state().records.find(r=>r.id===id)?.items}
function qFill(items){const d=qDraft();d.items=qEditableItems(items).map(i=>({...i,fromPrevious:true}));quickAmountRow=null;render();document.querySelector('.qBasket')?.scrollIntoView({block:'nearest',behavior:'instant'})}
async function qSave(items,options={}){const date=view.date,slot=qSlot(),key=qKey();if(options.fromDraft&&qDraftStale(key,quickDrafts.get(key))){qDropStaleDrafts();render();showError('献立の内容が変わったため、記録しませんでした。今の献立から選び直してください。');return false}const ok=await mutate('quickLog',{date,slot,items:qItems(items),replace:Boolean(options.replace),recordId:options.recordId||undefined,allowRepeat:Boolean(options.allowRepeat),expectedRecord:options.replace?options.baseRecord:undefined},options.replace?'食材と量を訂正しました。在庫は変えていません。':'食材と量をまとめて記録しました。',{draftKey:options.fromDraft?key:null,draftValue:options.fromDraft?JSON.stringify(qDraft()):null});if(ok){if(options.fromDraft)quickDrafts.delete(key);quickAmountRow=null;render()}return ok}
async function qPin(items){const data=qItems(items);if(state().templates.some(t=>qSignature(t.items)===qSignature(data))){showStatus('この組み合わせは固定済みです。');return}await mutate('template',{items:data},'いつもの一食に固定しました。次回はカード一回で記録できます。')}
// 記録済みの一食を、訂正用の下書き（replace）にする。保存は従来どおり quickLog の replace（expectedRecord で別タブの変更を検出）。
function qEditDraft(r){const draft=qDraft();draft.items=qEditableItems(r.items||r.foodIds.map(foodId=>({foodId,amount:null,unit:''})));draft.replace=true;draft.recordId=r.id;draft.baseRecord=JSON.parse(JSON.stringify(r));return draft}
// 「食べた」1タップ。従来のクイック記録と同じ操作（quickLog）・同じ形の1食材で保存する（独自の形式は作らない）。結果は quickLog の決まりどおり「食べた」。
// 同じ食事を訂正の途中なら保存しない（訂正の下書きが古くなるため）。入力途中の下書きに同じ食材があれば、二重に記録しないよう下書きから外す。
async function tAte(date,slot,name){
 const key=date+'|'+slot,draft=quickDrafts.get(key);
 const p=meals(date).find(x=>x.slot===slot);if(p&&tRecordedItem(record(p),name)){showStatus(name+'はこの食事に記録済みです。直すときは行を押してください。');render();return false}
 if(draft?.replace&&draft.items.length){showError('この食事は訂正の途中です。下の「この内容に訂正」で保存するか、「やめる」を押してから記録してください。');return false}
 const t=qOneTap(name),ok=await mutate('quickLog',{date,slot,items:[{name,amount:t.amount,unit:t.amount==null?'':t.unit}],replace:false,allowRepeat:false},`${name}を「食べた」で記録しました（${qAmount(t)}）。量は行を押して、様子は「様子・メモ」から直せます。在庫は変えていません。`);
 if(ok){const d=quickDrafts.get(key);if(d&&!d.replace){d.items=d.items.filter(i=>i.name!==name);if(!d.items.length)quickDrafts.delete(key)}draftPersist();render()}
 return ok;
}
// 行を押したときの調整。従来の量の選択（qOpenAmount）を開き、保存は下の「この食材・量で記録」（未記録）／「この内容に訂正」（記録済み）で行う。
function tAdjust(date,slot,name){
 view.quickSlot=slot;quickStaleNote='';const p=meals(date).find(x=>x.slot===slot),r=p&&record(p);let d=qDraft();
 if(r&&tRecordedItem(r,name)&&!(d.replace&&d.recordId===r.id)){const pending=d.replace?[]:d.items.slice();d=qEditDraft(r);for(const i of pending)if(!d.items.some(x=>x.name===i.name))d.items.push(i)}
 let n=d.items.findIndex(i=>i.name===name);
 if(n<0){const t=qOneTap(name);d.items.push({name,amount:t.amount,unit:t.unit||qDefaultUnit(),fromPrevious:t.source==='previous'});n=d.items.length-1}
 if(!d.replace&&p&&!p.quickCreated&&!d.planSig)d.planSig=qPlanSig(p);
 quickAmountRow=null;render();qOpenAmount(n);
}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-t]');if(!b||b.disabled||!current)return;const a=b.dataset.t;
 if(a==='free'){view.todayFree=!view.todayFree;render();if(view.todayFree)qJump($('#freeComposer'));return}
 if(a==='free-slot'){view.quickSlot=b.dataset.slot;view.todayFree=true;quickAmountRow=null;render();qJump($('#freeComposer'));return}
 if(a==='up-open'){view.upOpen=view.upOpen===b.dataset.date?null:b.dataset.date;render();return}
 if(a==='edit-meal'){if(slots[b.dataset.slot])tEditMeal(b.dataset.date,b.dataset.slot);return}
 // 古い表示（別の日付）のボタンでは記録しない。
 if((a==='ate'||a==='adjust')&&b.dataset.date!==view.date){showError('表示している日と違うため記録しませんでした。表示を更新しました。');render();return}
 if(a==='ate')await tAte(b.dataset.date,b.dataset.slot,b.dataset.name);
 if(a==='adjust')tAdjust(b.dataset.date,b.dataset.slot,b.dataset.name);
});
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-q]');if(!b||b.disabled)return;const a=b.dataset.q;if(!current)return;
 if(a==='input-jump'){$('#main').scrollTo(0,0);return}if(a==='week-record'){const r=state().records.find(r=>r.id===b.dataset.id);if(r)qWeekDetail(r);return}
 if(a==='record-remove'){const r=state().records.find(r=>r.id===b.dataset.id);if(r)qRemoveRecordConfirm(r);return}
 if(a==='record-remove-do'){const r=state().records.find(r=>r.id===b.dataset.id);if(r){const removed=await mutate('removeRecord',{id:r.planId},'記録を消しました。未記録に戻しました。');if(removed)closeDialog()}return}
 if(a==='legacy'){view.todayMode='legacy';render();$('#main').scrollTo(0,0);return}if(a==='quick'){view.todayMode='quick';render();$('#main').scrollTo(0,0);return}
 if(a==='catalog'){quickCatalogExpanded=!quickCatalogExpanded;render();return}
 if(a==='search'){quickSearchOpen=!quickSearchOpen;if(!quickSearchOpen)quickSearch='';render();if(quickSearchOpen)$('#quickSearch').focus();return}
 if(a==='slot'){view.quickSlot=b.dataset.slot;quickAmountRow=null;render();return}
 quickStaleNote='';
 const d=qDraft(),row=Number(b.dataset.row);
 if(a==='food'||a==='add-search'){const name=a==='food'?b.dataset.name:quickSearch.trim();if(!name)return;if(name.length>60){showError('食材名は六十文字以内で入力してください。');return;}const found=d.items.findIndex(i=>i.name===name);if(found>=0){d.items.splice(found,1);quickAmountRow=null}else{const item=qDefaults(name);d.items.push(item);quickAmountRow=item.amount==null?d.items.length-1:null}quickSearch='';quickSearchOpen=false;render();if(quickAmountRow!==null)qOpenAmount(quickAmountRow)}
 if(a==='food-amount'){let n=d.items.findIndex(i=>i.name===b.dataset.name);if(n<0){d.items.push(qDefaults(b.dataset.name));n=d.items.length-1}render();qOpenAmount(n)}
 if(a==='amount')qOpenAmount(row)
 if(a==='unit'){if(d.items[row].unit!==b.dataset.unit){d.items[row].unit=b.dataset.unit;d.items[row].amount=null;d.items[row].fromPrevious=false}qOpenAmount(row)}
 if(a==='quantity'){d.items[row].amount=b.dataset.amount;if(!d.items[row].unit)d.items[row].unit=qDefaultUnit();d.items[row].fromPrevious=false;qRememberUnit(d.items[row].unit);qCloseAmount();render()}
 if(a==='bump'){const n=qBumpAmount(row);if(n){d.items[row].amount=n.amount;d.items[row].unit=n.unit;d.items[row].fromPrevious=false;qRememberUnit(n.unit);qCloseAmount();render()}}
 if(a==='unknown'){d.items[row].amount=null;d.items[row].fromPrevious=false;qCloseAmount();render()}
 if(a==='remove'){d.items.splice(row,1);quickAmountRow=null;render()}
 if(a==='clear'){quickDrafts.delete(qKey());quickAmountRow=null;render()}
 if(a==='save')await qSave(d.items,{...d,fromDraft:true,allowRepeat:!d.replace&&qApplied(d.items)});
 if(a==='exact-done'){const i=d.items[quickAmountRow];if(i.amount!=null&&(!/^\d{1,4}(?:\.\d{1,2})?$/.test(String(i.amount))||Number(i.amount)>9999)){showError('量をゼロ以上、小数二桁までで入力してください。');return}if(i.amount!=null)qRememberUnit(i.unit);qCloseAmount();render()}
 if(a==='log-set'){const items=qSetItems(b.dataset.source,b.dataset.id);if(items)await qSave(items)}
 if(a==='adjust-set'){const items=qSetItems(b.dataset.source,b.dataset.id);if(items)qFill(items)}
 if(a==='pin-draft'&&d.items.length)await qPin(d.items);
 if(a==='pin-record'){const r=state().records.find(r=>r.id===b.dataset.id);if(r?.items)await qPin(r.items)}
 if(a==='unpin')await mutate('removeTemplate',{id:b.dataset.id},'固定を外しました。食事記録は残っています。');
 // 記録の訂正（食材の追加・外すも含む）は「食材を選んで記録」を開いて選択中の一覧で行う。
 if(a==='edit-record'){const r=state().records.find(r=>r.id===b.dataset.id);const p=r&&state().plans.find(p=>p.id===r.planId);if(r&&p){if($('#dialog').open)closeDialog();view.page='today';view.todayMode='quick';view.todayFree=true;view.date=p.date;view.quickSlot=p.slot;qEditDraft(r);quickAmountRow=null;render();document.querySelector('.qBasket')?.scrollIntoView({block:'nearest'})}}
 if(a==='custom'){openDialog(`<h2>食材を自由に追加</h2><form id="quickCustomForm"><label class="field">食材名<input name="name" required maxlength="60" value="${esc(quickSearch)}" placeholder="市販品や家庭の呼び名でも"></label><p class="formHint">追加後、量はボタンで選べます。</p>${formActions('食材に追加')}</form>`)}
});
document.addEventListener('input',e=>{if(e.target.id==='quickSearch'){quickSearch=e.target.value;if(!e.isComposing&&!composingInputs.has(e.target))qRefreshSearch()}if(e.target.dataset.qExact!==undefined){const n=Number(e.target.dataset.qExact);qDraft().items[n].amount=e.target.value===''?null:e.target.value;qDraft().items[n].fromPrevious=false;if(!qDraft().items[n].unit)qDraft().items[n].unit=qDefaultUnit();$('#actionbar').innerHTML=quickDock()}});
document.addEventListener('submit',e=>{if(e.target.id==='quickCustomForm'){e.preventDefault();if([...composingInputs].some(input=>e.target.contains(input)))return;const name=new FormData(e.target).get('name').trim();if(!name)return;if(name&&!qDraft().items.some(i=>i.name===name)){qDraft().items.push(qDefaults(name));quickAmountRow=qDraft().items.length-1}const row=quickAmountRow;draftFormSaved();closeDialog();quickSearch='';render();if(row!==null)qOpenAmount(row)}});

function qRefreshSearch(){const results=$('#quickFoodResults');if(results){results.innerHTML=qFoodResultsMarkup();if(pendingMutation||!editable())results.querySelectorAll('[data-edit]').forEach(b=>b.disabled=true)}}

// 使い切り提案。決め打ちのルールで、表示のたびに今の在庫・献立・記録から作り直す（保存しない）。
// 区分は量の目安と同じ食材分類表（qFoodGroups）から：穀類＝主食、魚・肉・豆腐・乳製品＝主菜、野菜・果物＝副菜。分類表にない食材だけのロットは組み合わせに入れない。
// 1日の食数は時期（qStageKey）から。時期が分からなければ2回を目安にする。ただし開始日数が分かり30日目までの日は1回（qEarly）。初めての食材は記録からの導出（qEatenFoods）で判定し、1日1種類まで。
const qSuggestRoles=[['主食',['grains']],['主菜',['fish','meat','tofu','dairy']],['副菜',['vegfruit']]];
const qSuggestMeals={'初期':1,'中期':2,'後期':3,'完了期':3};
const qSuggestSlots={1:['breakfast'],2:['breakfast','dinner'],3:['breakfast','lunch','dinner']};
// 使う食事の枠（1.2.0）。優先順：①プロフィールの mealSlots（選ばれた枠のキー配列）②mealsPerDay（1→朝、2→朝・晩、3→朝・昼・晩）
// ③自動（qMealCount の回数から同じ読み替え。開始30日目までは朝のみ）。今日の食事・提案・自動反映はすべてこれを使う。
function qSetSlots(){const a=state().child?.mealSlots;return Array.isArray(a)?Object.keys(slots).filter(k=>a.includes(k)):[]}
function qMealSlots(info){const set=qSetSlots();return set.length?set:qSuggestSlots[qMealCount(info)]}
// 1.2.1: 使う食事が明示設定（mealSlots か mealsPerDay）かどうか。どちらも無ければ「自動」。
function qSlotsExplicit(){return qSetSlots().length>0||[1,2,3].includes(state().child?.mealsPerDay)}
// 1.2.1: 今日画面のトグルを押したときの次の枠。自動のときに「付いている」枠を押すのは「その食事だけにする」として扱う
// （自動で朝・晩が付いて見える状態で朝を押すと晩だけが残り、「朝しか押していないのに晩が出る」と誤解されるため）。
// 自動で「付いていない」枠を押したら通常どおり足し、明示設定があるときは常に通常の足し引きにする。
function qSlotTap(cur,k){if(!qSlotsExplicit()&&cur.includes(k))return [k];return Object.keys(slots).filter(x=>x===k?!cur.includes(x):cur.includes(x))}
// 量の目安の分類表（qFoodGroups）に無いが、提案の区分だけは分かる食材。量の目安は出さない（qSuggestGuide は分類表だけを見る）。
const qSuggestExtraRoles={'うどん':'主食','卵黄':'主菜','10倍がゆ':'主食','5倍がゆ':'主食','7倍がゆ':'主食','軟飯':'主食'};
function qLotRole(b){for(const n of qStockNames(b)){const g=qFoodGroup(n);if(g)return qSuggestRoles.find(r=>r[1].includes(g))[0];const extra=qSuggestExtraRoles[String(n||'').trim()];if(extra)return extra}return null}
// 離乳食を始めてからの日数（開始日＝1日目、開始日が対象日より後なら0）。保存はしない。
// 開始日の決め方：①設定の「離乳食を始めた日」 ②一番古い食事記録の日 ③時期。記録の日は「この日までには始めていた」という下限なので、
// 時期が中期以降（開始から1か月ほど過ぎた頃）のときは時期を優先する（アプリを使い始めた日を開始日と取り違えないため）。
function qStartedOn(){const v=state().child?.startedOn;return validDay(v)?v:''}
function qOldestRecordDay(){const plans=new Map(state().plans.map(p=>[p.id,p]));let min='';for(const r of state().records){const p=plans.get(r.planId);if(!p)continue;const d=qRecordDay(r,p);if(validDay(d)&&(!min||d<min))min=d}return min}
function qDaysSince(start,d){const n=Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;return n<1?0:n}
function qStartInfo(d=jstDate()){const set=qStartedOn(),stage=qStageKey();if(set)return {source:'profile',start:set,day:qDaysSince(set,d),stage};if(['中期','後期','完了期'].includes(stage))return {source:'period',start:'',day:null,stage};const first=qOldestRecordDay();if(first)return {source:'record',start:first,day:qDaysSince(first,d),stage};return {source:'',start:'',day:null,stage}}
// 1回の品数の目安（使い切り提案の1食あたりの上限）。日数区分は厚労省「授乳・離乳の支援ガイド」の進め方
// （つぶしがゆ1品から→慣れたら野菜→たんぱく質→2回食の頃から主食・主菜・副菜）をもとにした目安で、断定しない。日数も時期も分からなければ従来どおり3品まで。
const qMealSteps=[[6,1,['主食']],[20,2,['主食','副菜']],[30,3,['主食','主菜','副菜']],[Infinity,3,['主食','主菜','副菜']]];
function qMealLimit(info){if(info.day===null)return {cap:3,roles:['主食','主菜','副菜']};const s=qMealSteps.find(s=>info.day<=s[0]);return {cap:s[1],roles:s[2]}}
// 開始30日目まで（開始日数が分かるときだけ）は、食事を1日1回にし、主菜は初期向けの食材（豆腐・白身魚・卵黄・しらす）に限る。31日目からと日数不明のときは従来どおり。
const qEarlyDays=30,qEarlyMains=['豆腐','白身魚','鯛','ひらめ','たら','かれい','卵黄','しらす'];
function qEarly(info){return info.day!==null&&info.day<=qEarlyDays}
function qEarlyMainOk(x){return x.names.length>0&&x.names.every(n=>qEarlyMains.includes(String(n||'').trim()))}
// 1日の食事の回数の決め方と、その根拠。優先順：①プロフィールの明示設定（child.mealsPerDay）②開始日数が分かり30日目以内なら1回（開始直後の実態・従来の批判役対応を維持）③時期（初期1・中期2・後期3・完了期3）④開始日数（31〜120日目=2回、121日目以降=3回）⑤どれも無ければ1回。
// 1.2.0: 使う食事の枠（child.mealSlots）が選ばれていれば、それが①より先に来る（回数はその枠の数）。
function qMealCountSource(info){if(qSetSlots().length)return 'set';const set=state().child?.mealsPerDay;if(set===1||set===2||set===3)return 'set';if(info.day!==null&&info.day<=qEarlyDays)return 'early';if(qSuggestMeals[info.stage])return 'stage';if(info.day!==null)return 'days';return 'default'}
function qMealCount(info){const src=qMealCountSource(info);if(src==='set')return qSetSlots().length||state().child.mealsPerDay;if(src==='early')return 1;if(src==='stage')return qSuggestMeals[info.stage];if(src==='days')return info.day<=120?2:3;return 1}
// 鉄・ビタミンCのタグ（使い切り提案の組み合わせ用）。日本食品標準成分表（八訂）で含有が確かめられる食材だけに絞り、分からない食材は入れない。
// 入力画面のヒント（qNutrientTags）とは別の表。
const qSuggestTags={iron:['卵黄','まぐろ','かつお','小松菜','ほうれん草'],vitaminC:['ブロッコリー','小松菜','さつまいも','いちご','みかん','キウイ']};
const qTagged=(names,t)=>names.find(n=>qSuggestTags[t].includes(n))||'';
// 足りない区分のおすすめの例。時期に合わせ、提案の区分が分かる食材だけ（買って登録すれば提案に入る）。完了期は後期と同じ。
const qShortExamples={'初期':{主食:['おかゆ'],主菜:['豆腐','白身魚'],副菜:['にんじん','かぼちゃ','ほうれん草']},'中期':{主食:['おかゆ','うどん'],主菜:['豆腐','白身魚','鶏ささみ'],副菜:['にんじん','ブロッコリー','小松菜']},'後期':{主食:['おかゆ','うどん'],主菜:['豆腐','まぐろ','鶏ささみ'],副菜:['ブロッコリー','小松菜','かぼちゃ']}};
function qShortStage(info){if(qEarly(info))return '初期';const s=info.stage;if(s)return s==='完了期'?'後期':s;return info.day!==null&&info.day>30?'中期':'初期'}
// 献立が使う食材名。食材の紐づけ（foodIds）に加えて、使うストックからも数える。紐づけのないストックは、名前が食材名（登録済みの食材か分類表）と一致するときだけ数える。
function qPlanFoodNames(p){const known=new Set(state().foods.map(f=>f.name)),out=new Set(qPlanNames(p));for(const u of p.uses||[]){const b=batch(u.batchId);if(!b)continue;if((b.foodIds||[]).length)qStockNames(b).forEach(n=>out.add(n));else{const n=b.name.slice(0,60);if(known.has(n)||qFoodGroup(n))out.add(n)}}return [...out]}
// 予定として差し引く個数。日付を問わず、まだ取り出しておらず記録もない献立が対象（過去日の取り忘れも含む）。
// その日に「今日の記録に使う」で同じロットを減らし済みなら、実在庫に反映済みなので重ねて差し引かない（二重減らし防止と同じ判定）。
// 1.2.1: 今日以降の使う食事の外の献立（取り出し・記録なし）は差し引かない（qPlanCounts）。外した晩の献立がストックを押さえて、朝のおすすめが足りなくなるのを防ぐ。
function qSuggestReserved(){const reserved=new Map(),today=jstDate();for(const p of state().plans){if(p.prepared||record(p)||!qPlanCounts(p,today))continue;for(const u of p.uses){if(stockUsedForRecord(u.batchId,p.date))continue;reserved.set(u.batchId,(reserved.get(u.batchId)||0)+u.quantity)}}return reserved}
// 提案の品ごとの量の目安。ロットの食材がすべて同じ1分類のときだけ、量表（qGuideTable）の値を短く返す。表に無い時期・分類や複数分類のロットは空（数値を作らない）。
function qSuggestGuide(names,stage){const groups=[...new Set(names.map(qFoodGroup))];if(!stage||groups.length!==1||!groups[0]||names.some(n=>qNoGuideFoods.has(String(n||'').trim())))return '';if(stage==='初期')return '小さじ1から、様子を見ながら少しずつ';if(qGuideTotalGroups.has(groups[0]))return '';const range=qGuideTable[stage]?.[groups[0]];return range?range.join('〜')+'g（'+qGuideLabels[groups[0]]+'）':''}
function qSuggest(today=jstDate()){
 const stage=qStageKey(),mealCount=info=>qMealCount(info),start=plusDate(today,1),reserved=qSuggestReserved();
 const lots=stockSorted(state().batches,today).map(b=>({b,e:stockExpiry(b,today),left:b.quantity-(reserved.get(b.id)||0),role:qLotRole(b),names:qStockNames(b)})).filter(x=>x.e&&x.left>0&&x.e.due>=start);
 if(!lots.length)return null;
 const usable=lots.filter(x=>x.role),last=usable.reduce((m,x)=>x.e.due>m?x.e.due:m,''),end=[plusDate(start,6),last].sort()[0],days=[];
 // 説明と不足のおすすめは提案の最初の日（明日）で数える。不足は、その日数で使う区分のうち使える個数が0〜1個のものを、主食→主菜→副菜の順に最大2つ。
 // 30日目までの主菜は、初期向けの食材のロットだけを数える。
 const startInfo=qStartInfo(start),startLimit=qMealLimit(startInfo),exStage=qShortStage(startInfo),count=mealCount(startInfo);
 const short=qSuggestRoles.map(([role])=>role).filter(role=>startLimit.roles.includes(role)).map(role=>({role,left:usable.filter(x=>x.role===role&&(role!=='主菜'||!qEarly(startInfo)||qEarlyMainOk(x))).reduce((n,x)=>n+x.left,0),examples:qShortExamples[exStage][role]})).filter(x=>x.left<=1).slice(0,2);
 // 初めて食べた日（記録から導出）で判定し、対象日より前に食べた食材だけを経験済みにする（先の日付の記録は数えない）。
 // sim は提案どおり前の日から順に食べた前提、base は登録済みの献立と記録だけの前提（その日だけ献立に入れたときの数え直しに使う）。
 const real=qEatenFoods(),sim=new Map(real),base=new Map(real),seen=(m,n,d)=>m.has(n)&&m.get(n)<d,mark=(m,n,d)=>{if(!m.has(n)||d<m.get(n))m.set(n,d)},roleAt=x=>qSuggestRoles.findIndex(r=>r[0]===x.role);
 for(let d=start;usable.length&&d<=end;d=plusDate(d,1)){
  const planned=meals(d),dayNames=[...new Set([...planned.flatMap(qPlanFoodNames),...[...real].filter(([,x])=>x===d).map(([n])=>n)])],isNew=n=>!seen(sim,n,d);
  const fresh=new Set(dayNames.filter(isNew)),fixed=new Set(dayNames.filter(n=>!seen(base,n,d))),list=[];
  // その日にまだ初めての食材がなければ、初めての食材同士は区分の順ではなく期限が近いものを先に選ぶ。
  let allow=null;
  if(!fresh.size){const c=usable.filter(x=>x.left>0&&x.e.due>=d).map(x=>({x,n:x.names.filter(isNew)})).filter(c=>c.n.length===1).sort((a,b)=>a.x.e.due.localeCompare(b.x.e.due)||roleAt(a.x)-roleAt(b.x))[0];if(c)allow=c.n[0]}
  // その日の提案ですでに選んだ食材。同じ区分にほかに使える候補があれば、まだ使っていない食材を先にする（無ければ従来どおり繰り返す）。
  // 品数の目安（qMealLimit）に入らない区分は選ばない。鉄とビタミンCの食材が両方使える日は、1日1回は同じ食事に組み合わせる（主菜で鉄→副菜でビタミンC）。
  const dayUsed=new Set(),info=qStartInfo(d),limit=qMealLimit(info),early=qEarly(info),dayCount=mealCount(info);let dayPaired=false;
  for(const slot of qMealSlots(info)){
   if(planned.some(p=>p.slot===slot)){list.push({slot,taken:true,items:[],add:[]});continue}
   const items=[];
   for(const [role] of qSuggestRoles){
    if(!limit.roles.includes(role))continue;
    const canFor=r=>x=>{if(x.role!==r||x.left<=0||x.e.due<d)return false;if(r==='主菜'&&early&&!qEarlyMainOk(x))return false;const n=x.names.filter(isNew);return n.every(k=>fresh.has(k)||k===allow)&&new Set([...fresh,...n]).size<=1};
    const can=canFor(role),unused=x=>!x.names.some(n=>dayUsed.has(n));
    let pref=null;
    if(!dayPaired&&limit.roles.includes('主菜')&&limit.roles.includes('副菜')){
     if(role==='主菜'&&!items.some(i=>i.iron)&&usable.some(y=>canFor('副菜')(y)&&qTagged(y.names,'vitaminC')))pref=x=>qTagged(x.names,'iron');
     if(role==='副菜'&&items.some(i=>i.iron)&&!items.some(i=>i.vitaminC))pref=x=>qTagged(x.names,'vitaminC');
    }
    const x=(pref&&(usable.find(x=>can(x)&&pref(x)&&unused(x))||usable.find(x=>can(x)&&pref(x))))||usable.find(x=>can(x)&&unused(x))||usable.find(can);
    if(!x)continue;
    x.left--;const first=x.names.filter(isNew);first.forEach(n=>fresh.add(n));x.names.forEach(n=>dayUsed.add(n));
    items.push({batchId:x.b.id,name:x.b.name,role,names:x.names,first:first.length>0,due:x.e.due,baseNew:x.names.filter(n=>!seen(base,n,d)),guide:qSuggestGuide(x.names,stage),portion:String(x.b.portion||''),size:stockPortion(x.b)?stockPortionText(x.b):'',iron:qTagged(x.names,'iron'),vitaminC:qTagged(x.names,'vitaminC')});
   }
   // 鉄の品とビタミンCの品（別の品）がそろった食事には、理由を小さく添える。
   const ironItem=items.find(i=>i.iron),cItem=items.find(i=>i!==ironItem&&i.vitaminC),pair=ironItem&&cItem?{iron:ironItem.iron,vitaminC:cItem.vitaminC}:null;
   if(pair)dayPaired=true;
   list.push({slot,taken:false,items,add:[],pair});
  }
  // この日だけ献立に入れる場合の数え直し。前の日の提案を食べた前提の食材で初めてが2種類になるなら、その品を除いて入れる。
  const allowed=new Set(fixed),dropped=new Set(),order=list.flatMap(m=>m.items.map(i=>({m,i}))).sort((a,b)=>(b.i.first?1:0)-(a.i.first?1:0));
  for(const {m,i} of order){if(i.baseNew.every(k=>allowed.has(k))||new Set([...allowed,...i.baseNew]).size<=1){i.baseNew.forEach(k=>allowed.add(k));m.add.push(i)}else i.baseNew.forEach(k=>dropped.add(k))}
  for(const m of list)m.add.sort((a,b)=>m.items.indexOf(a)-m.items.indexOf(b));
  for(const n of fresh)mark(sim,n,d);
  for(const n of fixed)mark(base,n,d);
  days.push({date:d,meals:list,dropped:[...dropped],cap:limit.cap,count:dayCount,early,roles:limit.roles});
 }
 const kinds=new Set(usable.flatMap(x=>x.names));
 return {stage,count,guess:qMealCountSource(startInfo)==='default',countSource:qMealCountSource(startInfo),onlyName:kinds.size===1?[...kinds][0]:'',days,leftovers:usable.filter(x=>x.left>0).map(x=>({name:x.b.name,left:x.left,due:x.e.due})),unknown:lots.filter(x=>!x.role).map(x=>x.b.name),from:start,start:startInfo,limit:startLimit,short};
}
// 提案の1食を、通常の献立（local-store の plan と同じ形）にする。在庫は減らさない（取り出しは従来どおり「今日」から）。
// 入れるのは数え直し後の品（m.add）。前の日の提案を入れていなくても、その日の初めての食材は1種類までになる。
function qSuggestPlan(date,m){const items=m.add||m.items;return {date,slot:m.slot,title:items.map(i=>i.name).join('・').slice(0,100),note:'使い切り提案から入れた献立です。',foods:[...new Set(items.flatMap(i=>i.names))],uses:items.map(i=>({batchId:i.batchId,quantity:1}))}}
// ストックの新規登録が成功したあと、今日から最大7日の空いている食事枠へおすすめを自動で入れる（1.1.4）。提案の窓は今日からにするため、qSuggest には前日を渡す（tSuggestFor と同じやり方）。
// 記録・準備済み・手入力の献立がある枠は提案側で taken になるので触らない。在庫は減らない（献立に入れるだけ）。
// 取り消し（直前の操作の復元）で自動で入れた分だけが戻るよう、反映は planMany の1回にまとめる。入る枠が無ければ何もしない（通知も出さない）。
// 1.2.1: 前に自動で入れたおすすめ（qAutoPlan）も、新しいストックを含めて組み立て直す（症状4「ストックを足しても10倍がゆしか出ない」の修正）。
// 計算の間だけその献立を外して提案を作り（tReplaceMeal と同じやり方・画面には出ない）、中身が変わる枠だけ同じ id で入れ直す。入れ直しも同じ planMany の1回なので、取り消しで一緒に戻る。
function qAutoPlan(p,today){if(p.date<=today||p.prepared||record(p)||p.note!=='使い切り提案から入れた献立です。'||!p.uses.length||!p.uses.every(u=>u.quantity===1&&batch(u.batchId)))return false;return p.title===p.uses.map(u=>batch(u.batchId).name).join('・').slice(0,100)&&qMealSlots(qStartInfo(p.date)).includes(p.slot)}
async function qAutoApplySuggest(){
 const today=jstDate(),all=state().plans,auto=all.filter(p=>qAutoPlan(p,today)),at=auto.map(p=>all.indexOf(p));let s;
 for(let k=at.length-1;k>=0;k--)all.splice(at[k],1);
 try{s=qSuggest(plusDate(today,-1))}finally{for(let k=0;k<at.length;k++)all.splice(at[k],0,auto[k])}
 if(!s)return false;const plans=[],key=x=>JSON.stringify(x.uses.map(u=>u.batchId).sort());let redo=0;
 for(const day of s.days)for(const m of day.meals){if(m.taken||!m.add.length)continue;const x=qSuggestPlan(day.date,m),old=auto.find(p=>p.date===day.date&&p.slot===m.slot);if(old){if(key(old)===key(x))continue;x.id=old.id;redo++}plans.push(x)}
 if(!plans.length)return false;const from=plans[0].date,to=plans[plans.length-1].date,range=from===to?dateLabel(from):`${dateLabel(from)}〜${dateLabel(to)}`;
 return mutate('planMany',{plans},plans.length>redo?`ストックに合わせて、${range}の空いている食事におすすめを入れました。${redo?`前に自動で入れたおすすめ${redo}食も入れ直しました。`:''}`:`ストックに合わせて、${range}の自動で入れたおすすめを入れ直しました。`)}
// 提案の根拠は、文章の塊にせず「見出し：短い本文」の行に分ける。補足（切り替わりの日・数え方）は本文の下に小さく残す。どれも「目安」と書く。
function qSuggestFact(label,body,notes=[]){const n=notes.filter(Boolean);return `<li class="qSuggestFact"><b class="qFactLabel">${label}</b><span class="qFactBody">${body}${n.length?`<small class="qFactNote">${n.join('／')}</small>`:''}</span></li>`}
// 品数（開始からの日数・時期）・回数・主菜の範囲・組み合わせの決まり。数え方の元が分からないときは、設定の場所を1行で案内する。
function qSuggestFactsMarkup(s,near=false){
 const i=s.start,c=s.limit.cap,what='1回'+c+'品'+(c===1?'（主食）':c===2?'（主食・副菜）':'')+'まで（目安）';
 const later=s.days.find(d=>d.cap!==s.limit.cap),change=near?'':(later?`${esc(dateLabel(later.date))}からは1回${later.cap}品まで`:'');
 const guide=!i.start&&!qOldestRecordDay()?`<p class="small muted qSuggestStart">設定で「離乳食を始めた日」を入れると、日数に合わせた品数・回数で組み立てます。<button class="linkButton" data-action="profile" data-edit>設定する</button></p>`:'';
 let step;
 if(i.source==='period')step=qSuggestFact('品数：',`今の時期（${esc(i.stage)}）→ ${what}`);
 else if(i.source==='')step=qSuggestFact('品数：','始めた日が分からない → 1回3品まで（目安）');
 else if(i.day===0)step=qSuggestFact('品数：',`始める日（${esc(dateLabel(i.start))}）より前 → ${what}`,[change]);
 else step=qSuggestFact('品数：',`開始${i.day}日目（${esc(dateLabel(s.from))}）→ ${what}`,[change,i.source==='record'?'始めた日は、一番古い食事の記録の日から数えています':'']);
 const moreMeals=s.days.find(d=>d.count!==s.count);
 const meals=qSuggestFact('回数：',`1日${s.count}回`+(s.countSource==='set'?'（設定した回数）':s.countSource==='early'?'（開始30日目まで）':s.countSource==='stage'?'（'+esc(s.stage)+'の目安）':s.countSource==='days'?'（始めてからの日数から）':'（仮の目安）'),[near?'':(moreMeals?`${esc(dateLabel(moreMeals.date))}からは1日${moreMeals.count}回`:'')]);
 const mains=s.days.some(d=>d.early&&d.roles.includes('主菜'))?qSuggestFact('主菜：','開始30日目までは 豆腐・白身魚・卵黄・しらす',near?['白身魚は鯛・ひらめ・たら・かれい']:['白身魚は鯛・ひらめ・たら・かれい','31日目からはほかの主菜も使います']):'';
 const paired=s.days.some(d=>d.meals.some(m=>m.pair));
 const combo=qSuggestFact('組み合わせ：',`${s.limit.roles.join('・')}を在庫にある分だけ`,['はじめての食材は1日1種類まで',paired?'「鉄＋ビタミンC」は、鉄の吸収を助ける組み合わせです':'']);
 return `<ul class="qSuggestFacts">${step}${meals}${mains}${combo}</ul>${guide}`;
}
// 足りない区分のおすすめ。「足りないもの：区分 → 例」を1行ずつ。例ごとに既存の買い物メモへ追加するボタン（在庫は作らない）。未完了の買い物メモに同じ名前があればボタンの代わりに一言。
function qSuggestShortMarkup(s){
 if(!s.short.length)return '';const listed=new Set(state().shopping.filter(x=>!x.done).map(x=>x.name));
 return `<ul class="qSuggestShort">${s.short.map(x=>`<li class="qShortLine"><b class="qFactLabel">足りないもの：${x.role}</b><span class="qFactBody">${x.left?'残り1個':'ストックなし'} → 例：${esc(x.examples.join('・'))}</span><span class="qShortList">${x.examples.map(n=>listed.has(n)?`<span class="qShortDone">${esc(n)}は買い物リストにあります</span>`:`<button class="linkButton qShortAdd" data-action="suggestShop" data-name="${esc(n)}" aria-label="${esc(n)}を買い物リストに追加" data-edit>${esc(n)}を買い物に追加</button>`).join('')}</span></li>`).join('')}</ul>`;
}
function qSuggestSection(){
 const s=qSuggest();if(!s)return '';
 // 提案に出た品のうち、1個の量（構造化・メモとも）が無いもの。品ごとには出さず、まとめて1行で設定の場所を案内する。
 const unset=[...new Set(s.days.flatMap(d=>d.meals.flatMap(m=>m.items.filter(i=>!i.size&&!i.portion).map(i=>i.name))))];
 return qSuggestBrief(s,unset);
}
// 提案の1食の表示（冷凍庫のくわしい提案。「今日」の「これからのメニュー」は食材名だけの tUpcomingDay）。
function qSuggestMealMarkup(m){return `<li class="qSuggestMeal"><span class="qSuggestSlot">${slots[m.slot]}</span><span class="qSuggestItems">${m.taken?'<span class="muted">献立があるので、そのままにします</span>':m.items.length?m.items.map(i=>`<span class="qSuggestItem"><small>${i.role}</small>${esc(i.name)}${i.first?'<span class="qFirstBadge">はじめて</span>':''}${i.size?`<small class="qSuggestMeta">${esc(i.size)}${i.guide?`<span class="qSuggestSub">／目安：${esc(i.guide)}</span>`:''}</small>`:`${i.guide?`<small class="qSuggestMeta">目安：${esc(i.guide)}</small>`:''}${i.portion?`<small class="qSuggestMeta">1個＝${esc(i.portion)}</small>`:''}`}</span>`).join('')+(m.pair?`<small class="qSuggestWhy">鉄＋ビタミンC の組み合わせ：${esc(m.pair.iron)}＋${esc(m.pair.vitaminC)}</small>`:''):'<span class="muted">使えそうなストックはありません</span>'}</span></li>`}
// 冷凍庫の使い切り提案。日ごとの食材名は「今日」の「これからのメニュー」に出すので、ここは明日の1行の要約だけにし、
// くわしい内容（日ごとの品の量・目安・組み合わせ・足りないもの・使い切れない見込み・1個の量の未設定・区分の分からないストック）は折りたたみの中に置く。判定（qSuggest）は変えない。
// 1.2.0: 今日画面の「明日のおすすめ」カードを廃止したので、明日の分のくわしい表示もこの折りたたみに含める（1.1.x はあさって以降だけ）。
function qSuggestBrief(s,unset){
 const [first]=s.days,rest=s.days,firstMeals=first?first.meals.filter(m=>!m.taken&&m.items.length):[],itemCount=firstMeals.reduce((n,m)=>n+m.items.length,0);
 const summary=first?(itemCount?`<b>明日：</b>${firstMeals.length}食・${itemCount}品のおすすめ`:first.meals.every(m=>m.taken)?'明日の食事には献立が入っています。':'明日に入れられるおすすめはありません。'):'主食・主菜・副菜の分かるストックがまだありません。';
 return `<section class="qSuggest qSuggestBrief" id="useupSection" aria-labelledby="useupTitle"><h2 id="useupTitle">使い切り提案</h2><p class="small muted qSuggestLead">作った日から7日の目安までに使い切る、組み合わせの一例です。</p><p class="qSuggestBriefLine">${summary}</p>${first?'<p class="small muted">日ごとの分は「今日」の「これからのメニュー」から入れられます。</p>':''}<details class="qSuggestMore"><summary>日ごとのくわしい提案・足りないもの</summary>${qSuggestFactsMarkup(s)}${qSuggestShortMarkup(s)}${s.onlyName?`<p class="small muted qSuggestOnly"><b>ストック1種類：</b>いまのストックは「${esc(s.onlyName)}」だけなので、提案は${esc(s.onlyName)}中心です。他のストックを入れると組み合わせが広がります。</p>`:''}${rest.map(day=>{const can=day.meals.some(m=>!m.taken&&m.add.length);return `<div class="qSuggestDay"><div class="sectionhead"><h3>${dateLabel(day.date)}</h3>${can?`<button class="linkButton" data-action="suggestPlan" data-date="${day.date}" data-edit>この日の提案を献立に入れる</button>`:''}</div><ul>${day.meals.map(qSuggestMealMarkup).join('')}</ul>${day.dropped.length?`<p class="small muted qSuggestAssume"><b>この日だけ入れるとき：</b>はじめての食材が1日1種類になるよう${esc(day.dropped.join('・'))}を除いて入れます（前の日の提案を食べた前提の組み合わせのため）</p>`:''}</div>`}).join('')}${s.leftovers.length?`<p class="qSuggestNote">期限までに使い切れないかも：${esc(s.leftovers.map(x=>x.name+'（あと'+x.left+'個）').join('・'))}</p>`:''}${unset.length?`<p class="small muted qSuggestUnset">1個の量は未設定：${esc(unset.join('・'))}。冷凍庫のカードを押して「1個の量を設定」から入れられます。</p>`:''}${s.unknown.length?`<p class="small muted qSuggestUnknown">区分（主食・主菜・副菜）が分からず使っていないストック：${esc(s.unknown.join('・'))}</p>`:''}<p class="small muted">あくまで目安です。献立に入れても在庫は減りません。</p></details></section>`;
}
