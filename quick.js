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
function qSlot(){if(!view.quickSlot){const h=Number(new Intl.DateTimeFormat('en',{hour:'numeric',hourCycle:'h23',timeZone:'Asia/Tokyo'}).format(new Date()));view.quickSlot=h<11?'breakfast':h<15?'lunch':'dinner'}return view.quickSlot}
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
// 献立→記録。クイック記録が自動で作った枠は除き、この日の献立を出す。押すとその枠に切り替えて食材を入れ、量の選択を開く。
// クイック記録は同じ日・枠の献立に紐づいて保存されるので（local-store の quickLog）、記録後は献立側も「記録済み」になる。
function qPlanNames(p){return (p.foodIds||[]).map(id=>food(id)?.name).filter(Boolean)}
// 献立から入れた下書きは、そのときの献立（id・食材）を覚えておく（planSig）。献立の内容が変わったら、外した食材が黙って記録されないよう、その枠の下書きを破棄して知らせる。
function qPlanSig(p){return p?JSON.stringify([p.id,[...p.foodIds].sort()]):''}
function qDraftStale(key,d){if(!d?.planSig)return false;const [date,slot]=key.split('|');return qPlanSig(state().plans.find(p=>p.date===date&&p.slot===slot))!==d.planSig}
function qDropStaleDrafts(){const gone=[];for(const [key,d] of [...quickDrafts]){if(!qDraftStale(key,d))continue;quickDrafts.delete(key);const [date,slot]=key.split('|');gone.push(dateLabel(date)+'・'+slots[slot]);if(key===qKey()){quickAmountRow=null;if($('#dialog').dataset.quickAmount){delete $('#dialog').dataset.quickAmount;$('#dialog').close()}}}if(gone.length)quickStaleNote=`献立の内容が変わったため、${gone.join('、')}の入力途中の食材を消しました。今の献立から選び直してください。`;return gone.length>0}
function qPlanSection(){const list=meals(view.date).filter(p=>!p.quickCreated);if(!list.length)return '';return `<section class="qPlans" aria-labelledby="qPlansTitle"><h2 id="qPlansTitle">${view.date===jstDate()?'今日':esc(dateLabel(view.date))}の献立</h2>${list.map(p=>{const r=record(p),changed=r&&planRecordChanged(p,r),names=qPlanNames(p),body=`<span class="qPlanSlot">${slots[p.slot]}</span><span class="qPlanBody"><b>${esc(p.title)}</b><small>${names.length?esc(names.join('・')):'食材が未登録です。下の「献立・在庫から記録」から記録できます。'}</small></span><span class="pill ${r&&!changed?'green':''}">${r?status(p):names.length?'押して記録':'予定'}</span>`;return names.length?`<button class="qPlan ${r&&!changed?'done':''}" data-q="plan" data-id="${p.id}" aria-label="${esc(p.title)}（${slots[p.slot]}）の食材と量を記録${r?'・'+status(p):''}" data-edit>${body}</button>`:`<div class="qPlan empty">${body}</div>`}).join('')}</section>`}
// 名前の食材を下書きに入れ（入っていればそのまま）、最初の食材の量の選択を開く。初期の量・単位は qDefaults に従う。
function qAddAndOpen(names){const d=qDraft();let first=null;for(const name of names){let n=d.items.findIndex(i=>i.name===name);if(n<0){d.items.push(qDefaults(name));n=d.items.length-1}if(first===null)first=n}quickSearch='';quickSearchOpen=false;quickAmountRow=null;render();if(first!==null)qOpenAmount(first);return first}
// 在庫→記録。既存の個数修正（adjust）で理由付きで1個減らし、今日のクイック入力にその食材を入れて量の選択を開く。減らしたくなければ通知の「取り消す」で戻せる。
function qStockNames(b){const names=(b.foodIds||[]).map(id=>food(id)?.name).filter(Boolean);return names.length?names:[b.name.slice(0,60)]}
async function qUseStock(b){const names=qStockNames(b),moved=view.page!=='today';const ok=await mutate('adjust',{id:b.id,delta:-1,reason:'今日の記録に使う'},b.name+'を1個減らしました。量を選んで記録してください。');if(!ok)return false;view.page='today';view.todayMode='quick';if(view.date!==jstDate()){view.date=jstDate();view.selected=null}qAddAndOpen(names);if(moved)$('#main').scrollTo(0,0);return true}
function qContext(){return `<div class="qContext"><label class="dateControl"><span aria-hidden="true">${dateLabel(view.date)}</span><input type="date" id="viewDate" value="${view.date}" aria-label="表示する日付"></label><div class="qSlots" role="group" aria-label="記録する食事">${Object.entries(slots).map(([k,v])=>`<button data-q="slot" data-slot="${k}" aria-pressed="${qSlot()===k}">${v}${quickDrafts.get(view.date+'|'+k)?.items.length?'<span class="qDraftDot" aria-label="入力途中">・</span>':''}</button>`).join('')}</div>${view.date!==jstDate()?'<button class="linkButton" data-action="todayDate">今日</button>':''}</div>`}
function qFoodResultsMarkup(){const draft=qDraftView(),selected=new Set(draft.items.map(i=>i.name)),catalog=qCatalog(),eaten=qEatenFoods();return `<div class="qFoods">${catalog.map(name=>{const d=draft.items.find(i=>i.name===name)||qDefaults(name);return `<div class="qFoodTile ${selected.has(name)?'selected':''}"><button class="qFood" data-q="food" data-name="${esc(name)}" aria-pressed="${selected.has(name)}" data-edit><b>${esc(name)}</b>${eaten.has(name)?'':'<span class="qFirstBadge">はじめて</span>'}</button><button class="qFoodDose" data-q="food-amount" data-name="${esc(name)}" aria-label="${esc(name)}の量を変更" data-edit>${selected.has(name)?esc(qAmount(d)):d.fromPrevious?'<small>前回</small><span>'+esc(qAmount(d))+'</span>':'量＋'}</button></div>`}).join('')}</div>${!quickSearch&&qCatalog(true).length>12?`<button class="linkButton qCatalogMore" data-q="catalog">${quickCatalogExpanded?'少なく表示':'ほかの食材を見る（'+(qCatalog(true).length-12)+'）'}</button>`:''}${!catalog.length?`<button class="full" data-q="add-search" data-edit>「${esc(quickSearch)}」を追加</button>`:''}`}
function quickTodayPage(){
 qDropStaleDrafts();
 const draft=qDraftView(),r=qRecord();
 return `<header class="qHead"><h1>食事を記録</h1><button class="linkButton qWeekJump" data-q="week-jump">一週間を見る</button></header><section class="qWorkspace" aria-label="食事の入力">${qContext()}${qPlanSection()}${qRepeats()}<section class="qComposer">${quickStaleNote?`<p class="qNewFoodNote qStaleNote" role="status">${esc(quickStaleNote)}</p>`:''}<div class="sectionhead"><h2>${draft.replace?'食材・量を訂正':'食材を選ぶ'}</h2><button class="linkButton" data-q="search" aria-expanded="${quickSearchOpen}" data-edit>${quickSearchOpen?'検索を閉じる':'探す・追加'}</button></div>${quickSearchOpen?`<div class="qSearchArea"><input id="quickSearch" type="search" maxlength="60" aria-label="食材を探す" placeholder="食材名を入力" value="${esc(quickSearch)}"><button class="linkButton" data-q="custom" data-edit>新しい食材を追加</button></div>`:''}<div id="quickFoodResults">${qFoodResultsMarkup()}</div>${draft.items.length?`<div class="qBasket"><div class="sectionhead"><h3>${draft.items.length}食材を選択中</h3><button class="linkButton" data-q="clear" data-edit>クリア</button></div><details ${draft.replace?'open':''}><summary>量の一覧・訂正</summary>${draft.items.map((i,n)=>`<div class="qBasketItem"><div class="qBasketLine"><b>${esc(i.name)}</b><button class="qAmount ${i.amount==null?'empty':''}" data-q="amount" data-row="${n}" data-edit>${esc(qAmount(i))}</button><button class="qRemove" data-q="remove" data-row="${n}" aria-label="${esc(i.name)}を外す" data-edit>外す</button></div></div>`).join('')}<button class="linkButton" data-q="pin-draft" data-edit>この組み合わせを固定</button></details></div>`:''}${qNotesMarkup()}</section></section>${r?`<section class="qCurrent qCurrentActions"><div class="sectionhead"><h3>${slots[qSlot()]}ごはん・記録済み</h3><button class="linkButton" data-q="edit-record" data-id="${r.id}" data-edit>食材・量を訂正</button></div><button class="linkButton" data-action="detail" data-id="${r.planId}" data-edit>様子・症状のメモ</button>${r.items?.length&&qSupportedItems(r.items)?`<button class="linkButton" data-q="pin-record" data-id="${r.id}" data-edit>この一食を固定</button>`:''}</section>`:''}${qWeekSection()}<aside class="qSupport">${state().note?`<section class="paperNote"><span class="eyebrow">家族のメモ</span><p>${esc(state().note)}</p><button class="linkButton" data-action="note" data-edit>メモを書く</button></section>`:`<section class="qEmptyNote"><button class="linkButton" data-action="note" data-edit>家族へメモを書く</button></section>`}<section class="qOptional"><button class="full" data-q="legacy" aria-controls="legacySection">献立・在庫から記録する</button><button class="linkButton full" data-action="newBatch" data-edit>冷凍ストックを登録</button></section></aside>${qLegacySection()}<details class="qHelp"><summary>入力について</summary><p class="screenFoot">食材を押して量を選び、下のボタンで保存します。前回の量を使うときはボタンに明示します。量のボタンは推奨量ではありません。未入力の量は推定せず、在庫も自動で減らしません。</p></details>`;
}
// 献立・在庫からの記録。画面を切り替えず、入力画面の下に独立したセクションとして置く。呼び名が未設定なら見出しを出さず案内だけ。
function qLegacySection(){const named=Boolean(state().child.name);return `<section class="qLegacy" id="legacySection" ${named?'aria-labelledby="legacyTitle"':'aria-label="献立・在庫から記録"'}>${named?`<div class="qLegacyHead"><h2 id="legacyTitle">献立・在庫から記録</h2><p><b class="qLegacyMeal">${dateLabel(view.date)}・${slots[qSlot()]}ごはん</b>（上で選んだ食事）の献立・冷凍庫の取り出し・食べた様子</p></div>`:''}${legacyTodayPage(true)}</section>`}
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
const qFoodGroups={grains:['おかゆ'],vegfruit:['にんじん','かぼちゃ','ほうれん草','小松菜','ブロッコリー','じゃがいも','さつまいも','玉ねぎ','大根','かぶ','キャベツ','トマト','ピーマン','なす','きゅうり','バナナ','りんご','みかん','いちご','キウイ','梨','桃','アボカド'],fish:['白身魚','鯛','ひらめ','たら','かれい','しらす','まぐろ','かつお','鮭','あじ','さば','いわし'],meat:['鶏肉','鶏ささみ','鶏ひき肉','牛肉','豚肉','合いびき肉','レバー','鶏レバー'],tofu:['豆腐'],dairy:['ヨーグルト','牛乳']};
const qGuideTable={'中期':{grains:[50,80],vegfruit:[20,30],fish:[10,15],meat:[10,15],tofu:[30,40],dairy:[50,70]},'後期':{vegfruit:[30,40],fish:[15],meat:[15],tofu:[45],dairy:[80]},'完了期':{vegfruit:[40,50],fish:[15,20],meat:[15,20],tofu:[50,55],dairy:[100]}};
const qGuideLabels={grains:'全がゆ',vegfruit:'野菜・果物の合計量',fish:'魚',meat:'肉',tofu:'豆腐',dairy:'乳製品'};
const qPeriods=['初期','中期','後期','完了期'];
// 保存済みの「今の時期」。未保存・想定外の値は「選んでいない」として扱う（補わない）。
function qSavedPeriod(){const v=state().child?.period;return qPeriods.includes(v)?v:''}
function qStageKey(){const saved=qSavedPeriod();if(saved)return saved;const s=String(state().child?.stage||'');return ['完了期','後期','中期','初期'].find(k=>s.includes(k))||''}
function qFoodGroup(name){const n=String(name||'').trim();for(const [k,list] of Object.entries(qFoodGroups))if(list.includes(n))return k;return null}
function qGuideText(name){const stage=qStageKey(),group=qFoodGroup(name);if(!stage||!group)return null;if(stage==='初期')return '初期の目安：小さじ1から、様子を見ながら少しずつ';const range=qGuideTable[stage]?.[group];return range?stage+'の1回量の目安（'+qGuideLabels[group]+'）：'+range.join('〜')+'g':null}
// 増量候補。前回食べた量と同じ単位のときだけ、少し多い量を選べるボタンを出す（自動では変えない）。
function qPrevAmount(name){for(const r of qByMealDesc()){const i=r.items?.find(i=>qName(i)===name&&qHasAmount(i));if(i)return {amount:String(i.amount),unit:i.unit}}return null}
function qBumpAmount(row){const i=qDraft().items[row];if(!i)return null;const prev=qPrevAmount(i.name);if(!prev||!quickUnits.includes(prev.unit)||i.unit!==prev.unit)return null;const next=Math.round((Number(prev.amount)+(prev.unit==='小さじ'?1:5))*100)/100;return Number.isFinite(next)&&next<=9999?{prev,amount:String(next),unit:prev.unit}:null}
// 良い組み合わせのヒント。主要な食材だけの小さな栄養タグ表。前向きな一言を最大1つ返す。
const qNutrientTags={iron:['レバー','鶏レバー','牛肉','まぐろ','かつお','あじ','さば','いわし','小松菜','ほうれん草','豆腐','高野豆腐','納豆','卵黄','ひじき'],vitaminC:['ブロッコリー','かぼちゃ','ピーマン','カリフラワー','じゃがいも','さつまいも','いちご','みかん','キウイ','キャベツ']};
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
function qWeekSummaryMarkup(start,end){const s=qWeekSummary(start,end);return `<p class="qWeekSummary">${s.kinds?`食べた食材 ${s.kinds}種類${s.newFoods.length?`・はじめての食材 ${s.newFoods.length}種類（${esc(s.newFoods.join('・'))}）`:'・はじめての食材はありません'}`:'この期間に食べた記録はまだありません'}</p>`}
function qWeekEntries(){return state().records.map(r=>({record:r,plan:state().plans.find(p=>p.id===r.planId)})).filter(x=>x.plan).map(x=>({...x,date:qRecordDay(x.record,x.plan)}))}
function qWeekLines(r){if(r.items?.length)return r.items.map(i=>({name:qName(i),amount:i.intake==='not_eaten'?(i.amount!=null?qAmount(i):'食べず'):qAmount(i),notEaten:i.intake==='not_eaten'}));if(r.foodIds?.length)return r.foodIds.map(id=>({name:food(id)?.name||'食材名未登録',amount:'量未入力',notEaten:r.result==='食べなかった'}));return [{name:r.actualTitle||'食事の記録',amount:r.result==='食べなかった'?'食べなかった':'量未入力',notEaten:r.result==='食べなかった'}]}
function qWeekRecordMarkup(r){return `<button class="qWeekMeal" data-q="week-record" data-id="${r.id}" aria-label="${esc(r.actualTitle||'食事')}の記録を見る">${qWeekLines(r).map(i=>`<span class="qWeekItem ${i.notEaten?'notEaten':''}"><span class="qWeekFood">${esc(i.name)}</span><strong class="qWeekAmount">${esc(i.amount)}</strong>${i.notEaten&&i.amount!=='食べなかった'&&i.amount!=='食べず'?'<small>食べず</small>':''}</span>`).join('')}</button>`}
function qWeekSection(){const end=view.date>jstDate()?jstDate():view.date;const days=Array.from({length:7},(_,i)=>plusDate(end,-i));const entries=qWeekEntries();const weekday=d=>new Intl.DateTimeFormat('ja-JP',{weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(d+'T12:00:00+09:00'));return `<section class="qWeek" id="weekHistory" aria-labelledby="weekTitle"><div class="qWeekHeader"><div><h2 id="weekTitle">一週間の食事</h2><p>${Number(days[6].slice(5,7))}/${Number(days[6].slice(8))}〜${Number(end.slice(5,7))}/${Number(end.slice(8))}・食べたものと量</p></div><button class="linkButton" data-q="input-jump">入力へ戻る</button></div>${qWeekSummaryMarkup(days[6],end)}<table class="qWeekTable"><caption class="srOnly">${esc(end)}を含む過去七日間の食事記録</caption><colgroup><col class="qWeekDateCol"><col><col><col></colgroup><thead><tr><th scope="col">日付</th><th scope="col">朝</th><th scope="col">昼</th><th scope="col">夕</th></tr></thead><tbody>${days.map(d=>`<tr class="${d===jstDate()?'today':''}"><th scope="row"><time datetime="${d}">${Number(d.slice(5,7))}/${Number(d.slice(8))}<small>${weekday(d)}</small>${d===jstDate()?'<em>今日</em>':''}</time></th>${Object.keys(slots).map(slot=>{const list=entries.filter(x=>x.date===d&&x.plan.slot===slot).sort((a,b)=>(a.record.eatenAt||a.record.recordedAt||'').localeCompare(b.record.eatenAt||b.record.recordedAt||''));return `<td data-week-date="${d}" data-week-slot="${slot}" data-meal-label="${slots[slot]}" class="${view.date===d&&qSlot()===slot?'currentMeal':''}">${list.length?list.map(x=>qWeekRecordMarkup(x.record)).join(''):'<span class="qWeekEmpty">未記録</span>'}</td>`}).join('')}</tr>`).join('')}</tbody></table></section>`}
function qWeekDetail(r){const p=state().plans.find(p=>p.id===r.planId);openDialog(`<h2>${dateLabel(qRecordDay(r,p))}・${slots[p.slot]}ごはん</h2><div class="qWeekDetail">${qWeekLines(r).map(i=>`<div><b>${esc(i.name)}</b><strong>${esc(i.amount)}${i.notEaten?'（食べず）':''}</strong></div>`).join('')}</div>${r.memo?`<p class="hint">${esc(r.memo)}</p>`:''}${r.symptom?`<p class="hint">観察メモ：${esc(r.symptom)}</p>`:''}<p class="formHint">${esc(r.actor)}が記録。${r.eatenAt?'食事時刻 '+dateTimeLabel(r.eatenAt):'食事時刻は未入力'}</p>${editable()?`<div class="buttonrow"><button data-q="edit-record" data-id="${r.id}">食材・量を訂正</button><button data-action="detail" data-id="${p.id}">様子を補足</button></div>`:''}`)}
function qAmountMarkup(row){const i=qDraft().items[row],unit=i.unit||qDefaultUnit(),first=qFirstEatenOn(i.name),guide=qGuideText(i.name),bump=qBumpAmount(row);return `<h2>${esc(i.name)}の量</h2><p class="formHint">実際に食べた量を選びます。</p><p class="qFoodNote">${first?'はじめて食べた日：'+esc(dateLabel(first)):'はじめての食材です。様子を見ながら少しずつ。'}</p>${guide?`<p class="qGuide">${esc(guide)}</p>`:''}${bump?`<div class="qBumpRow"><span>前回 ${esc(qAmount(bump.prev))} を食べました。</span><button class="qBump" data-q="bump" data-row="${row}" data-amount="${esc(bump.amount)}">少し増やす：${esc(qAmount(bump))}</button></div>`:''}<div class="qAmountPicker"><div class="qUnitRow" role="group" aria-label="単位">${quickUnits.map(u=>`<button data-q="unit" data-unit="${u}" data-row="${row}" aria-pressed="${i.unit===u}">${u}</button>`).join('')}</div><div class="qQuantities">${(unit==='小さじ'?['0','0.5','1','2','3','4','5']:['0','5','10','15','20','30','40','50','60','80','100']).map(v=>`<button data-q="quantity" data-row="${row}" data-amount="${v}" aria-pressed="${String(i.amount)===v}">${esc(qAmount({amount:v,unit}))}</button>`).join('')}</div><div class="qExact"><label for="qExact${row}">ほかの量</label><input id="qExact${row}" data-q-exact="${row}" type="number" min="0" max="9999" step="0.01" inputmode="decimal" value="${i.amount??''}" aria-label="${esc(i.name)}の量"><button data-q="exact-done">この量にする</button></div><button class="linkButton full" data-q="unknown" data-row="${row}">量を入力せず続ける</button></div>`}
function qOpenAmount(row){quickAmountRow=row;const html=qAmountMarkup(row);if($('#dialog').open&&$('#dialog').dataset.quickAmount){$('#dialogBody').innerHTML='<div id="dialogError" class="dialogError" role="alert"></div>'+html}else{openDialog(html);$('#dialog').dataset.quickAmount='yes'}}
function qCloseAmount(){if($('#dialog').dataset.quickAmount){delete $('#dialog').dataset.quickAmount;closeDialog()}quickAmountRow=null}
function quickRecovered(operation){if(operation.action==='quickLog'){quickAmountRow=null;render()}}
function quickDock(){const d=qDraftView();if(!d.items.length)return '';return `<section class="dock qDock"><div class="qDraftSummary"><b>${esc(qSummary(d.items))}</b><small>未保存・${dateLabel(view.date)}・${slots[qSlot()]}ごはん${d.items.some(i=>i.amount==null)?' ／ 量未入力あり':''}</small></div><button class="primary" data-q="save" data-edit ${busy||pendingMutation?'disabled':''}>${d.replace?'この内容に訂正':qApplied(d.items)?'おかわりとして追加':qRecord()?'この食材・量を追加':'この食材・量で記録'}</button></section>`}
function qSetItems(source,id){return source==='template'?state().templates.find(t=>t.id===id)?.items:state().records.find(r=>r.id===id)?.items}
function qFill(items){const d=qDraft();d.items=qEditableItems(items).map(i=>({...i,fromPrevious:true}));quickAmountRow=null;render();document.querySelector('.qBasket')?.scrollIntoView({block:'nearest',behavior:'instant'})}
async function qSave(items,options={}){const date=view.date,slot=qSlot(),key=qKey();if(options.fromDraft&&qDraftStale(key,quickDrafts.get(key))){qDropStaleDrafts();render();showError('献立の内容が変わったため、記録しませんでした。今の献立から選び直してください。');return false}const ok=await mutate('quickLog',{date,slot,items:qItems(items),replace:Boolean(options.replace),recordId:options.recordId||undefined,allowRepeat:Boolean(options.allowRepeat),expectedRecord:options.replace?options.baseRecord:undefined},options.replace?'食材と量を訂正しました。在庫は変えていません。':'食材と量をまとめて記録しました。',{draftKey:options.fromDraft?key:null,draftValue:options.fromDraft?JSON.stringify(qDraft()):null});if(ok){if(options.fromDraft)quickDrafts.delete(key);quickAmountRow=null;render()}return ok}
async function qPin(items){const data=qItems(items);if(state().templates.some(t=>qSignature(t.items)===qSignature(data))){showStatus('この組み合わせは固定済みです。');return}await mutate('template',{items:data},'いつもの一食に固定しました。次回はカード一回で記録できます。')}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-q]');if(!b||b.disabled)return;const a=b.dataset.q;if(!current)return;
 if(a==='week-jump'){qJump($('#weekHistory'));return}if(a==='input-jump'){$('#main').scrollTo(0,0);return}if(a==='week-record'){const r=state().records.find(r=>r.id===b.dataset.id);if(r)qWeekDetail(r);return}
 if(a==='legacy'){qJump($('#legacySection'));return}if(a==='quick'){view.todayMode='quick';render();$('#main').scrollTo(0,0);return}
 if(a==='catalog'){quickCatalogExpanded=!quickCatalogExpanded;render();return}
 if(a==='search'){quickSearchOpen=!quickSearchOpen;if(!quickSearchOpen)quickSearch='';render();if(quickSearchOpen)$('#quickSearch').focus();return}
 if(a==='slot'){view.quickSlot=b.dataset.slot;quickAmountRow=null;render();return}
 quickStaleNote='';
 if(a==='plan'){const p=state().plans.find(x=>x.id===b.dataset.id);if(p){view.quickSlot=p.slot;qDropStaleDrafts();quickStaleNote='';const d=qDraft();if(!d.replace)d.planSig=qPlanSig(p);qAddAndOpen(qPlanNames(p))}return}
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
 if(a==='edit-record'){const r=state().records.find(r=>r.id===b.dataset.id);const p=r&&state().plans.find(p=>p.id===r.planId);if(r&&p){if($('#dialog').open)closeDialog();view.page='today';view.todayMode='quick';view.date=p.date;view.quickSlot=p.slot;const draft=qDraft();draft.items=qEditableItems(r.items||r.foodIds.map(foodId=>({foodId,amount:null,unit:''})));draft.replace=true;draft.recordId=r.id;draft.baseRecord=JSON.parse(JSON.stringify(r));quickAmountRow=null;render();document.querySelector('.qBasket')?.scrollIntoView({block:'nearest'})}}
 if(a==='custom'){openDialog(`<h2>食材を自由に追加</h2><form id="quickCustomForm"><label class="field">食材名<input name="name" required maxlength="60" value="${esc(quickSearch)}" placeholder="市販品や家庭の呼び名でも"></label><p class="formHint">追加後、量はボタンで選べます。</p>${formActions('食材に追加')}</form>`)}
});
document.addEventListener('input',e=>{if(e.target.id==='quickSearch'){quickSearch=e.target.value;if(!e.isComposing&&!composingInputs.has(e.target))qRefreshSearch()}if(e.target.dataset.qExact!==undefined){const n=Number(e.target.dataset.qExact);qDraft().items[n].amount=e.target.value===''?null:e.target.value;qDraft().items[n].fromPrevious=false;if(!qDraft().items[n].unit)qDraft().items[n].unit=qDefaultUnit();$('#actionbar').innerHTML=quickDock()}});
document.addEventListener('submit',e=>{if(e.target.id==='quickCustomForm'){e.preventDefault();if([...composingInputs].some(input=>e.target.contains(input)))return;const name=new FormData(e.target).get('name').trim();if(!name)return;if(name&&!qDraft().items.some(i=>i.name===name)){qDraft().items.push(qDefaults(name));quickAmountRow=qDraft().items.length-1}const row=quickAmountRow;draftFormSaved();closeDialog();quickSearch='';render();if(row!==null)qOpenAmount(row)}});

function qRefreshSearch(){const results=$('#quickFoodResults');if(results){results.innerHTML=qFoodResultsMarkup();if(pendingMutation||!editable())results.querySelectorAll('[data-edit]').forEach(b=>b.disabled=true)}}

// 使い切り提案。決め打ちのルールで、表示のたびに今の在庫・献立・記録から作り直す（保存しない）。
// 区分は量の目安と同じ食材分類表（qFoodGroups）から：穀類＝主食、魚・肉・豆腐・乳製品＝主菜、野菜・果物＝副菜。分類表にない食材だけのロットは組み合わせに入れない。
// 1日の食数は時期（qStageKey）から。時期が分からなければ2回を目安にする。初めての食材は記録からの導出（qEatenFoods）で判定し、1日1種類まで。
const qSuggestRoles=[['主食',['grains']],['主菜',['fish','meat','tofu','dairy']],['副菜',['vegfruit']]];
const qSuggestMeals={'初期':1,'中期':2,'後期':3,'完了期':3};
const qSuggestSlots={1:['breakfast'],2:['breakfast','dinner'],3:['breakfast','lunch','dinner']};
function qLotRole(b){for(const n of qStockNames(b)){const g=qFoodGroup(n);if(g)return qSuggestRoles.find(r=>r[1].includes(g))[0]}return null}
// 献立が使う食材名。食材の紐づけ（foodIds）に加えて、使うストックからも数える。紐づけのないストックは、名前が食材名（登録済みの食材か分類表）と一致するときだけ数える。
function qPlanFoodNames(p){const known=new Set(state().foods.map(f=>f.name)),out=new Set(qPlanNames(p));for(const u of p.uses||[]){const b=batch(u.batchId);if(!b)continue;if((b.foodIds||[]).length)qStockNames(b).forEach(n=>out.add(n));else{const n=b.name.slice(0,60);if(known.has(n)||qFoodGroup(n))out.add(n)}}return [...out]}
// 予定として差し引く個数。日付を問わず、まだ取り出しておらず記録もない献立が対象（過去日の取り忘れも含む）。
// その日に「今日の記録に使う」で同じロットを減らし済みなら、実在庫に反映済みなので重ねて差し引かない（二重減らし防止と同じ判定）。
function qSuggestReserved(){const reserved=new Map();for(const p of state().plans){if(p.prepared||record(p))continue;for(const u of p.uses){if(stockUsedForRecord(u.batchId,p.date))continue;reserved.set(u.batchId,(reserved.get(u.batchId)||0)+u.quantity)}}return reserved}
// 提案の品ごとの量の目安。ロットの食材がすべて同じ1分類のときだけ、量表（qGuideTable）の値を短く返す。表に無い時期・分類や複数分類のロットは空（数値を作らない）。
function qSuggestGuide(names,stage){const groups=[...new Set(names.map(qFoodGroup))];if(!stage||groups.length!==1||!groups[0])return '';if(stage==='初期')return '小さじ1から、様子を見ながら少しずつ';const range=qGuideTable[stage]?.[groups[0]];return range?range.join('〜')+'g（'+qGuideLabels[groups[0]]+'）':''}
function qSuggest(today=jstDate()){
 const stage=qStageKey(),count=qSuggestMeals[stage]||2,start=plusDate(today,1),reserved=qSuggestReserved();
 const lots=stockSorted(state().batches,today).map(b=>({b,e:stockExpiry(b,today),left:b.quantity-(reserved.get(b.id)||0),role:qLotRole(b),names:qStockNames(b)})).filter(x=>x.e&&x.left>0&&x.e.due>=start);
 if(!lots.length)return null;
 const usable=lots.filter(x=>x.role),last=usable.reduce((m,x)=>x.e.due>m?x.e.due:m,''),end=[plusDate(start,6),last].sort()[0],days=[];
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
  const dayUsed=new Set();
  for(const slot of qSuggestSlots[count]){
   if(planned.some(p=>p.slot===slot)){list.push({slot,taken:true,items:[],add:[]});continue}
   const items=[];
   for(const [role] of qSuggestRoles){
    const can=x=>{if(x.role!==role||x.left<=0||x.e.due<d)return false;const n=x.names.filter(isNew);return n.every(k=>fresh.has(k)||k===allow)&&new Set([...fresh,...n]).size<=1};
    const x=usable.find(x=>can(x)&&!x.names.some(n=>dayUsed.has(n)))||usable.find(can);
    if(!x)continue;
    x.left--;const first=x.names.filter(isNew);first.forEach(n=>fresh.add(n));x.names.forEach(n=>dayUsed.add(n));
    items.push({batchId:x.b.id,name:x.b.name,role,names:x.names,first:first.length>0,due:x.e.due,baseNew:x.names.filter(n=>!seen(base,n,d)),guide:qSuggestGuide(x.names,stage),portion:String(x.b.portion||'')});
   }
   list.push({slot,taken:false,items,add:[]});
  }
  // この日だけ献立に入れる場合の数え直し。前の日の提案を食べた前提の食材で初めてが2種類になるなら、その品を除いて入れる。
  const allowed=new Set(fixed),dropped=new Set(),order=list.flatMap(m=>m.items.map(i=>({m,i}))).sort((a,b)=>(b.i.first?1:0)-(a.i.first?1:0));
  for(const {m,i} of order){if(i.baseNew.every(k=>allowed.has(k))||new Set([...allowed,...i.baseNew]).size<=1){i.baseNew.forEach(k=>allowed.add(k));m.add.push(i)}else i.baseNew.forEach(k=>dropped.add(k))}
  for(const m of list)m.add.sort((a,b)=>m.items.indexOf(a)-m.items.indexOf(b));
  for(const n of fresh)mark(sim,n,d);
  for(const n of fixed)mark(base,n,d);
  days.push({date:d,meals:list,dropped:[...dropped]});
 }
 const kinds=new Set(usable.flatMap(x=>x.names));
 return {stage,count,guess:!qSuggestMeals[stage],onlyName:kinds.size===1?[...kinds][0]:'',days,leftovers:usable.filter(x=>x.left>0).map(x=>({name:x.b.name,left:x.left,due:x.e.due})),unknown:lots.filter(x=>!x.role).map(x=>x.b.name)};
}
// 提案の1食を、通常の献立（local-store の plan と同じ形）にする。在庫は減らさない（取り出しは従来どおり「今日」から）。
// 入れるのは数え直し後の品（m.add）。前の日の提案を入れていなくても、その日の初めての食材は1種類までになる。
function qSuggestPlan(date,m){const items=m.add||m.items;return {date,slot:m.slot,title:items.map(i=>i.name).join('・').slice(0,100),note:'使い切り提案から入れた献立です。',foods:[...new Set(items.flatMap(i=>i.names))],uses:items.map(i=>({batchId:i.batchId,quantity:1}))}}
function qSuggestSection(){
 const s=qSuggest();if(!s)return '';
 const meal=m=>`<li class="qSuggestMeal"><span class="qSuggestSlot">${slots[m.slot]}</span><span class="qSuggestItems">${m.taken?'<span class="muted">献立があるので、そのままにします</span>':m.items.length?m.items.map(i=>`<span class="qSuggestItem"><small>${i.role}</small>${esc(i.name)}${i.first?'<span class="qFirstBadge">はじめて</span>':''}${i.guide?`<small class="qSuggestMeta">目安：${esc(i.guide)}</small>`:''}${i.portion?`<small class="qSuggestMeta">1個＝${esc(i.portion)}</small>`:''}</span>`).join(''):'<span class="muted">使えそうなストックはありません</span>'}</span></li>`;
 return `<section class="qSuggest" id="useupSection" aria-labelledby="useupTitle"><h2 id="useupTitle">使い切り提案</h2><p class="small muted">冷凍ストックを期限の目安（作った日から7日）までに使い切るための、組み合わせの一例です。1日${s.count}回${s.guess?'（今の時期が未設定のため、2回を目安にしています）':'（'+esc(s.stage)+'の目安）'}で、主食・主菜・副菜を在庫にある分だけ組み合わせています。はじめての食材は1日1種類までにしています。</p>${s.onlyName?`<p class="small muted qSuggestOnly">いまのストックは「${esc(s.onlyName)}」だけなので、提案は${esc(s.onlyName)}中心です。他のストックを入れると組み合わせが広がります。</p>`:''}${s.days.map(day=>{const can=day.meals.some(m=>!m.taken&&m.add.length);return `<div class="qSuggestDay"><div class="sectionhead"><h3>${dateLabel(day.date)}</h3>${can?`<button class="linkButton" data-action="suggestPlan" data-date="${day.date}" data-edit>この日の提案を献立に入れる</button>`:''}</div><ul>${day.meals.map(meal).join('')}</ul>${day.dropped.length?`<p class="small muted qSuggestAssume">前の日の提案を食べた前提の組み合わせです。前の日を献立に入れずにこの日だけ入れるときは、はじめての食材が1日1種類になるよう${esc(day.dropped.join('・'))}を除いて入れます。</p>`:''}</div>`}).join('')}${s.leftovers.length?`<p class="qSuggestNote">期限までに使い切れないかも：${esc(s.leftovers.map(x=>x.name+'（あと'+x.left+'個）').join('・'))}</p>`:''}${s.unknown.length?`<p class="small muted">主食・主菜・副菜の区分が分からないため、組み合わせに入れていないストック：${esc(s.unknown.join('・'))}</p>`:''}<p class="small muted">あくまで目安です。食べる様子に合わせて自由に変えてください。献立に入れても在庫は減りません。</p></section>`;
}
