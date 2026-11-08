'use strict';
const quickDrafts=new Map();
const quickUnits=['小さじ','g','ml'];
const starterFoods=['ほうれん草','おかゆ','にんじん','かぼちゃ','豆腐','ブロッコリー','白身魚','うどん','じゃがいも'];
let quickSearch='',quickAmountRow=null,quickSearchOpen=false,quickCatalogExpanded=false,quickStaleNote='';
// 1.4.1（症状B）: 記録済みの食材の行から、その食材の量だけを直接直すときの対象（{recordId,date,slot,name,item}）。訂正の下書き（ドック）は経由しない。
let quickDirect=null;
// 1.4.4（要望1）: 記録済みの行の ＋ から食材を1つ足すときの量の選択の対象（{recordId,date,slot,name,item}）。quickDirect と同じく量の画面を共用し、決めたら記録へ即保存する。
let quickRecAdd=null;
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
// ===== 「今日」画面（1.2.0→1.4.0）=====
// 1.4.0: 「今日のメニュー」と「これからのメニュー」を1つの「メニュー」に統合した（今日〜6日後を日ごとに並べ、今日は開いた状態）。
// 構成は ①メニュー（冒頭に使う食事・1食の品数・一週間のおすすめの切り替え）②日数の説明行 ③期限が近いストック。
// ほかの操作（献立ごとに記録・献立の追加と一週間の献立・家族メモ）は下の「ほかの記録・操作」の奥に置く。
// ストックが1つも無く、その日の献立・記録も無いときは、メニューの代わりに初回案内のカードだけを出す（フラグは持たず、状態で判定）。
function quickTodayPage(){
 qDropStaleDrafts();
 const head=`<header class="qHead tHead"><h1>${view.date===jstDate()?'今日':esc(dateLabel(view.date))}</h1></header>${datebar()}`;
 if(tNeedsStock(view.date))return `${head}${todayWelcomeCard()}${view.todayFree?qFreeComposer():''}${todayMoreMarkup()}`;
 const day=tSuggestFor(view.date);
 return `${head}${tSuggestLead(view.date,day)}${tSetupLine()}${todayMenuBlock(day)}${view.todayFree?qFreeComposer():''}${tStepLine(view.date)}${todayStockBlock()}${todayMoreMarkup()}`;
}
// ===== 1.3.0: おすすめは食事の枠の中に／カードの上で直す／一週間のおすすめの出す・出さない =====
// おすすめ由来の献立（使い切り提案から入れたまま・未記録）。カードと一週間の行に小さな「おすすめ」印を付ける。
const qSuggestNote='使い切り提案から入れた献立です。',qEditedNote='おすすめをもとに直した献立です。';
function tFromSuggest(p){return Boolean(p)&&!record(p)&&p.note===qSuggestNote}
const tSuggestMark='<span class="tSuggestMark">おすすめ</span>';
// 空の枠のおすすめのプレビュー（今日のメニュー・一週間で同じ形）。食材は薄い表示で、ボタンは呼ぶ側が付ける。
function tPreviewMarkup(m){return `<span class="tPreview">${tSuggestMark}<span class="tPreviewNames">${m.add.map(i=>esc(i.name)+(i.first?'<span class="qFirstBadge">はじめて</span>':'')).join('・')}</span></span>`}
// 今日画面の冒頭の1行。表示中の日の使う食事に、おすすめ由来の献立かプレビューがあるときだけ。
function tSuggestLead(d,day){const has=tSlots(d).some(slot=>{const p=meals(d).find(x=>x.slot===slot);if(spineHolds(d,slot,p))return false;if(p)return tFromSuggest(p);const m=day?.meals.find(x=>x.slot===slot);return Boolean(m&&!m.taken&&m.add.length)});return has?'<p class="tLead">ストックから作ったおすすめが入っています。そのまま使っても、直しても大丈夫です</p>':''}
// 一週間のおすすめ（明日〜6日後）を出すか。プロフィールの任意項目 weekSuggest（false のときだけ出さない。未設定は出す）。今日の分はこの切替の対象外。
function qWeekSuggestOn(){return state().child?.weekSuggest!==false}
function tWeekToggle(){const on=qWeekSuggestOn();return `<div class="tMealCount tWeekToggle"><span class="tMealCountLabel">一週間のおすすめ</span><span class="tMealCountBtns" role="group" aria-label="一週間のおすすめ"><button data-action="weekSuggest" data-value="on" aria-pressed="${on}" data-edit>出す</button><button data-action="weekSuggest" data-value="off" aria-pressed="${!on}" data-edit>出さない</button></span></div>`}
// カードの上で足す・外せる献立か。記録済み・準備済みは従来の編集（食材・量を訂正／献立を編集）だけにする（記録と取り出し済みの在庫を守るため）。
function tInlineEditable(p){return !p||(!record(p)&&!p.prepared)}
function tAddOpenKey(d,slot){return d+'|'+slot}
function tAddButton(d,slot,label){const open=view.addOpen===tAddOpenKey(d,slot);return `<button class="tAddOpen" data-t="add-open" data-date="${d}" data-slot="${slot}" aria-expanded="${open}" data-edit>${label||'＋ 食材を足す'}</button>`}
// 1.4.6: 食材もストック使用も無い献立（カードの × で全部外した跡など）は、データは残したまま「空の枠」として扱う。
// 空の枠ではおすすめのプレビューが戻り、タップで入れ直せる（廃止した「おすすめに変える」の代わり）。記録済み・準備済みは対象外。
function tIsHusk(p){return Boolean(p)&&!record(p)&&!p.prepared&&!p.uses.length&&qPlanNames(p).length===0}
// 空の枠のおすすめは、プレビュー自体がボタン（タップ＝入れる）。「入れる」ボタンは別に置かない（1.4.6・最短経路に一本化）。
function tPreviewButton(m,d,slot,src,cls){return `<button class="${cls||'tPreviewBtn'}" data-action="suggestMeal" data-date="${d}" data-slot="${slot}"${src?` data-src="${src}"`:''} aria-label="${esc(slots[slot])}におすすめの献立を入れる" data-edit>${tPreviewMarkup(m)}<span class="tPreviewPlus" aria-hidden="true">＋</span></button>`}
function tRemoveButton(d,slot,name){return `<button class="tRemove" data-t="remove-food" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="${esc(name)}を外す" data-edit>×</button>`}
// 「＋ 食材を足す」で開く候補。ストック（残り個数つき・期限が近い順）を先に、次に食材の一覧（登録済みの食材→量の目安の分類表の食材）。入っている食材は出さない。
function tAddPicker(d,slot){
 if(view.addOpen!==tAddOpenKey(d,slot))return '';
 // 1.4.7: 候補は下書きに対して開く（下書きに入っている食材は出さない）。編集中でなければ保存済みの食材が基準。
 const p=meals(d).find(x=>x.slot===slot),dr=tPlanDraft(d,slot),have=new Set(dr?dr.names:(p?qPlanNames(p):[])),attrs=`data-date="${d}" data-slot="${slot}"`;
 const stock=stockSorted(state().batches.filter(b=>b.quantity>0)).filter(b=>!qStockNames(b).every(n=>have.has(n))),inStock=new Set(stock.flatMap(qStockNames));
 const hidden=new Set(state().foods.filter(f=>f.quickHidden).map(f=>f.name));
 const master=[...new Set([...state().foods.map(f=>f.name),...Object.values(qFoodGroups).flat(),...Object.keys(qSuggestExtraRoles)])].filter(n=>!have.has(n)&&!inStock.has(n)&&!hidden.has(n));
 return `<div class="tAddPick" data-add-pick="${d}|${slot}"><div class="tAddPickHead"><b>${esc(slots[slot])}に足す食材</b><button class="linkButton" data-t="add-open" ${attrs} aria-expanded="true">閉じる</button></div>${stock.length?`<p class="tAddHead">ストック</p><div class="tAddList">${stock.map(b=>`<button class="tAddItem tAddStock" data-t="add-food" ${attrs} data-batch="${b.id}" data-edit><span>${esc(b.name)}</span><small>残り${b.quantity}個</small></button>`).join('')}</div>`:''}<p class="tAddHead">食材</p><div class="tAddList">${master.map(n=>`<button class="tAddItem" data-t="add-food" ${attrs} data-name="${esc(n)}" data-edit>${esc(n)}</button>`).join('')}</div></div>`;
}
// 1.4.5（要望B）: 献立を手で編集（食材の追加・削除）したら、その保存に続けて、窓（今日〜+6日）の手つかずのおすすめ献立を
// 現在のストック残量・押さえで組み直す。編集でストックの押さえが変わると、ほかの日のおすすめも変わりうるため（「臨機応変に変化」）。
// 組み直し自体は既存の仕組み（qAutoApplySuggest・rebuildOnly）で、保存は planMany の1回にまとまり、通知もその1回だけ。
// 編集した本人（その食事）は excludeId で対象から外す。記録済み・取り出し済み・直した献立は従来どおり対象外。
// 設定変更・ストック追加・起動時の組み直しとは別トリガーだが、走る中身は同じ関数なので二重に保存が増えることはない（変わる分だけ・1回）。
async function qLinkedReplan(date,slot){const p=meals(date).find(x=>x.slot===slot);await qAutoApplySuggest({why:'編集',rebuildOnly:true,excludeId:p?p.id:null})}
// 足す・外すの保存。通常の献立保存（plan）1回なので、通知の「取り消す」で戻る。在庫は変えない。
// 題名が食材の列挙（提案から入れた献立・自動作成など）なら新しい食材で付け直し、手で付けた題名はそのまま。おすすめ由来の献立は「直した献立」の印に変える（自動の入れ直しの対象から外れる）。
function tPlanEdit(p,names){const was=p?qPlanNames(p):[],listTitle=!p||!was.length||p.note===qSuggestNote||p.title===was.join('・')||p.title===p.uses.map(u=>batch(u.batchId)?.name).join('・');return {title:(listTitle?names.join('・'):p.title).slice(0,100),note:p?(p.note===qSuggestNote?qEditedNote:p.note):''}}
// ===== 1.4.7: カードの上・開いた日の ×／＋ は「下書き」方式（押すまで保存しない） =====
// ユーザーの声（2026-11-03）:「ここ開いたら元に戻せないから、決定か戻るみたいなボタン欲しい」。
// ×／＋ は保存済みの献立には触らず、画面状態だけの下書き（planDrafts）を変える。下書きは保存データに一切混ぜない
// （localStorage/IndexedDB には書かず、再描画では render が下書きを読んで描くので消えない。ページ再読み込みでは消える＝未保存は保存されない）。
// 保存済みと下書きが違う間だけ「決定」「戻る」を出し（tPlanDraft が常に差分のある下書きだけを返す）、
// 決定＝最終内容から1回の献立保存（題名・印・ストック使用は tPlanEdit の規則）＋連動の組み直し1回、戻る＝下書きを捨てるだけ。
// 日を閉じる／別の日を開く／日付・画面を切り替えると、残っていた下書きは捨てる（tClearPlanDrafts を各遷移で呼ぶ）。
const planDrafts=new Map();
function tDraftBase(d,slot){const p=meals(d).find(x=>x.slot===slot);return {names:p?qPlanNames(p):[],uses:p?p.uses.map(u=>({batchId:u.batchId,quantity:u.quantity})):[]}}
function tDraftClean(d,slot){const k=tAddOpenKey(d,slot),dr=planDrafts.get(k);if(dr&&JSON.stringify(dr)===JSON.stringify(tDraftBase(d,slot)))planDrafts.delete(k)}
function tPlanDraft(d,slot){tDraftClean(d,slot);return planDrafts.get(tAddOpenKey(d,slot))||null}
function tDraftEnsure(d,slot){const k=tAddOpenKey(d,slot);if(!planDrafts.has(k))planDrafts.set(k,tDraftBase(d,slot));return planDrafts.get(k)}
function tClearPlanDrafts(){planDrafts.clear()}
const tDraftButtons=(d,slot)=>`<span class="tDraftBtns"><button class="dark" data-t="draft-ok" data-date="${d}" data-slot="${slot}" data-edit>決定</button><button data-t="draft-cancel" data-date="${d}" data-slot="${slot}" data-edit>戻る</button></span>`;
// 候補（ピッカー）で選ぶ＝下書きに足すだけ。保存は「決定」を押すまでしない。品数の上限は下書きの品数で見る。
async function tDraftAdd(date,slot,batchId,name){
 const p=meals(date).find(x=>x.slot===slot);
 if(!tInlineEditable(p)){showError('記録済み・準備済みの食事は、カードの下のボタンから直してください。表示を新しくしました。');render();return false}
 const b=batchId?batch(batchId):null;if(batchId&&(!b||b.quantity<=0)){showError('このストックは残りがありません。表示を新しくしました。');render();return false}
 const add=b?qStockNames(b):[String(name||'').trim()].filter(Boolean);if(!add.length)return false;
 const info=qStartInfo(date),cap=qMealLimit(info).cap,cur=planDrafts.get(tAddOpenKey(date,slot));
 // 品数の目安（tEditMeal と同じ判定）。下書きの品数で数え、上限なら足さずに短く伝える（下書きも作らない）。
 if(info.day!==null&&(cur?cur.names.length:(p?qPlanNames(p).length:0))>=cap){showStatus(`いまは1食${cap}品が目安です。`);return false}
 const dr=tDraftEnsure(date,slot);
 let changed=false;for(const n of add)if(!dr.names.includes(n)){dr.names.push(n);changed=true}
 if(!changed){showStatus(add.join('・')+'は入っています。');tDraftClean(date,slot);render();return true}
 if(b&&!dr.uses.some(u=>u.batchId===b.id))dr.uses.push({batchId:b.id,quantity:1});
 tDraftClean(date,slot);render();return true;
}
// × ＝下書きから外すだけ。外す食材を含むストックの使用も下書きの中でいっしょに外す（残すと決定の保存でその食材が戻るため）。
// 最後の1品も外せる（1.4.6 の扱いを下書きでも維持）。全部外れた下書きで決定すると、枠は空（tIsHusk）になる。
function tDraftRemove(date,slot,name){
 const p=meals(date).find(x=>x.slot===slot);
 if(!p||!tInlineEditable(p)){showError('記録済み・準備済みの食事は、カードの下のボタンから直してください。表示を新しくしました。');render();return false}
 const dr=tDraftEnsure(date,slot);
 if(!dr.names.includes(name)){tDraftClean(date,slot);render();return false}
 dr.names=dr.names.filter(n=>n!==name);
 dr.uses=dr.names.length?dr.uses.filter(u=>{const b=batch(u.batchId);return !(b&&qStockNames(b).includes(name))}):[];
 tDraftClean(date,slot);render();return true;
}
// 決定：下書きの最終内容で献立を1回だけ保存する（通知はその1回・取り消し可）。保存できたら下書きを捨て、連動の組み直しを1回走らせる。
// 空の下書きで決定したときは 1.4.6 の空の枠（殻）に一致させる（ストック使用も全部外し、題名は保存の必須条件のため今の題名を残す）。
async function tDraftCommit(date,slot){
 const k=tAddOpenKey(date,slot),dr=planDrafts.get(k);if(!dr)return false;
 const p=meals(date).find(x=>x.slot===slot);
 if(!tInlineEditable(p)){planDrafts.delete(k);showError('記録済み・準備済みの食事は、カードの下のボタンから直してください。表示を新しくしました。');render();return false}
 const names=[...dr.names];
 if(!p&&!names.length){planDrafts.delete(k);render();return false}
 const t=tPlanEdit(p,names);if(!names.length)t.title=p.title;
 const uses=names.length?dr.uses.map(u=>({batchId:u.batchId,quantity:u.quantity})):[];
 const ok=await mutate('plan',{id:p?.id,date,slot,title:t.title,note:t.note,foods:names,uses},p?`${dateLabel(date)}の${slots[slot]}の献立を直しました。在庫は変えていません。`:`${dateLabel(date)}の${slots[slot]}の献立を入れました。在庫は変えていません。`);
 if(!ok)return false; // 保存できなかったときは下書きを残す（直し直せるように）
 planDrafts.delete(k);if(view.addOpen===k)view.addOpen=null;
 await qLinkedReplan(date,slot);
 return true;
}
// 戻る：下書きを捨てて保存済みの表示に戻す。保存は一切しない。
function tDraftCancel(date,slot){const k=tAddOpenKey(date,slot);planDrafts.delete(k);if(view.addOpen===k)view.addOpen=null;render()}
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
function tMealNames(p,r){
 const recNames=r?(r.items?.length?r.items.map(qName):r.foodIds.map(id=>food(id)?.name)):[];let planNames=p?qPlanNames(p):[];
 // 1.4.4（要望1）: items を持つ記録では、記録に入っていたのに今は無い食材（記録から外した食材）は献立側の名前からも出さない。
 // offeredFoodIds は「一度でも記録に出した食材」の控えで、外した食材も残る。それが items に無ければ、行として出し直さない（外した直後に「未記録の行」として戻って見えるのを防ぐ）。
 // items の無い旧記録（foodIds で数える形）は従来どおり。
 if(r&&r.items){const offered=new Set((r.offeredFoodIds||[]).map(id=>food(id)?.name).filter(Boolean)),inRec=new Set(recNames);planNames=planNames.filter(n=>!offered.has(n)||inRec.has(n))}
 return [...new Set([...planNames,...recNames])].filter(Boolean)}
// 1.4.4（要望1）: 記録済みの行の − ＋。− はその食材を記録から外し、＋ はその食事に食材を足す（欄＝食材そのものの増減）。
// 1.4.2 で付けた「量のステッパー」はユーザーの意図と違ったため廃止した。量の変更は従来どおり行タップ→量の選択と「食材・量を訂正」に残る。
function tRowBtnsMarkup(d,slot,name){return `<span class="tStep"><button data-t="row-remove" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="${esc(name)}を記録から外す" data-edit>−</button><button data-t="row-add" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="この食事に食材を足す" data-edit>＋</button></span>`}
// 1.5.7: 予定の食材に量を添える（ユーザーの希望。登録した単位のまま出し、小さじ⇔g の換算はしない）。
// その献立が使うストックがあれば、その1個分の量×個数が優先。無ければ時期の目安（中央値）に「目安」を付ける。
// どちらも無い食材（目安を決めていない おかゆ類・食パンなど）は量を付けない（無い量は作らない）。
function tStockUseAmount(p,name){if(!p?.uses?.length)return '';const u=p.uses.find(x=>batch(x.batchId)?.name===name);if(!u)return '';const sp=stockPortion(batch(u.batchId));if(!sp||sp.unit==='whole')return '';const q=Number(u.quantity)||1;return portionAmountLabel(sp.unit,sp.amount*q,100)}
function tPlanAmount(p,name){const s=tStockUseAmount(p,name);if(s)return s;const g=qGuideMid(name);return g?'目安 '+qAmount(g):''}
// ===== 1.6.0: 本の進め方（初期）=====
// 初期の今日カードだけ、56日分の「順番」を仮想の行として出す。位置は records から毎回導出し、保存しない。
// 保存データ（local-store の形式）には触れない。ON/OFF と見送りは単独の localStorage キー（SEEN_VERSION_KEY と同じ流儀）。
const SPINE_ON_KEY='mogubi-spine-on:'+new URL('./',document.currentScript.src).pathname;
const SPINE_SKIP_KEY='mogubi-spine-skip:'+new URL('./',document.currentScript.src).pathname;
// 1日分＝[名前,本の量ラベル|null] の配列。1〜28日=5カ月目、29〜56日=6カ月目。量ラベルは表示専用（換算しない）。
const SPINE=[
 [['10倍がゆ','小さじ1']],
 [['10倍がゆ','小さじ1']],
 [['10倍がゆ','小さじ1〜2']],
 [['10倍がゆ','小さじ1〜2']],
 [['10倍がゆ','小さじ2〜3']],
 [['10倍がゆ','小さじ2〜3']],
 [['10倍がゆ','小さじ2〜3']],
 [['10倍がゆ','小さじ2〜4'],['にんじん','小さじ1']],
 [['10倍がゆ','小さじ2〜4'],['にんじん','小さじ1']],
 [['10倍がゆ','小さじ2〜4'],['かぼちゃ','小さじ1']],
 [['10倍がゆ','小さじ2〜4'],['かぼちゃ','小さじ1']],
 [['10倍がゆ','小さじ2〜4'],['りんご','小さじ1']],
 [['10倍がゆ','小さじ2〜4'],['りんご','小さじ1']],
 [['10倍がゆ','小さじ2〜4'],['りんご','小さじ1']],
 [['10倍がゆ','小さじ3〜5'],['かぼちゃ','小さじ2'],['豆腐','6g']],
 [['10倍がゆ','小さじ3〜5'],['かぼちゃ','小さじ2'],['豆腐','6g']],
 [['10倍がゆ','小さじ3〜5'],['かぼちゃ','小さじ2'],['しらす','小さじ1']],
 [['10倍がゆ','小さじ3〜5'],['にんじん','小さじ2'],['しらす','小さじ1']],
 [['10倍がゆ','小さじ3〜5'],['ほうれん草','小さじ1'],['にんじん','小さじ1'],['しらす','小さじ1']],
 [['10倍がゆ','小さじ3〜5'],['ほうれん草','小さじ1'],['にんじん','小さじ1'],['豆腐','6g']],
 [['10倍がゆ','小さじ3〜5'],['かぼちゃ','小さじ2'],['豆腐','6g']],
 [['10倍がゆ','小さじ4〜5'],['バナナ','小さじ1'],['かぼちゃ','小さじ1'],['豆腐','6g']],
 [['10倍がゆ','小さじ4〜5'],['ブロッコリー','小さじ1'],['バナナ','小さじ2'],['豆腐','6g']],
 [['10倍がゆ','小さじ4〜5'],['ブロッコリー','小さじ1'],['かぼちゃ','小さじ2'],['しらす','小さじ1']],
 [['10倍がゆ','小さじ4〜5'],['ブロッコリー','小さじ2'],['かぼちゃ','小さじ1'],['しらす','小さじ1']],
 [['10倍がゆ','小さじ4〜5'],['トマト','小さじ1'],['バナナ','小さじ2'],['豆腐','6g']],
 [['10倍がゆ','小さじ4〜5'],['トマト','小さじ2'],['バナナ','小さじ2'],['豆腐','6g']],
 [['10倍がゆ','小さじ4〜5'],['かぼちゃ','小さじ2〜3'],['バナナ','小さじ1'],['豆腐','6g']],
 [['10倍がゆ',null],['じゃがいも','小さじ1'],['りんご',null],['豆腐','12g']],
 [['10倍がゆ',null],['じゃがいも','小さじ2'],['かぶ','小さじ1'],['バナナ',null],['豆腐','12g']],
 [['10倍がゆ',null],['バナナ',null],['かぶ','小さじ2'],['りんご',null]],
 [['10倍がゆ',null],['玉ねぎ','小さじ1'],['豆腐','12g'],['りんご',null]],
 [['10倍がゆ',null],['ひらめ','小さじ1'],['かぶ',null],['玉ねぎ','小さじ2']],
 [['10倍がゆ',null],['ひらめ','小さじ2'],['玉ねぎ',null],['りんご',null]],
 [['10倍がゆ',null],['バナナ',null],['じゃがいも',null],['玉ねぎ',null],['りんご',null]],
 [['10倍がゆ',null],['にんじん',null],['白菜','小さじ1'],['りんご',null],['豆腐','12g']],
 [['10倍がゆ',null],['白菜','小さじ2'],['豆腐','12g'],['りんご',null]],
 [['10倍がゆ',null],['豆腐','12g'],['にんじん',null],['さつまいも','小さじ1'],['りんご',null]],
 [['10倍がゆ',null],['さつまいも','小さじ2'],['白菜',null],['鯛','小さじ1']],
 [['10倍がゆ',null],['にんじん',null],['りんご',null],['さつまいも',null],['鯛','小さじ2']],
 [['10倍がゆ',null],['にんじん',null],['白菜',null],['豆腐','12g']],
 [['10倍がゆ',null],['鯛',null],['にんじん',null],['さつまいも',null],['りんご',null]],
 [['10倍がゆ',null],['鯛',null],['にんじん',null],['バナナ',null],['きな粉',null]],
 [['10倍がゆ',null],['かぼちゃ',null],['バナナ',null],['きな粉',null],['豆腐','12g']],
 [['10倍がゆ',null],['小松菜','小さじ1'],['鯛',null],['にんじん',null]],
 [['10倍がゆ',null],['小松菜','小さじ2'],['バナナ',null],['豆腐','12g']],
 [['10倍がゆ',null],['鯛',null],['きゅうり','小さじ1'],['にんじん',null],['かぼちゃ',null],['きな粉',null]],
 [['10倍がゆ',null],['かぼちゃ',null],['きゅうり','小さじ2'],['にんじん',null],['豆腐','12g']],
 [['10倍がゆ',null],['鯛',null],['小松菜',null],['かぼちゃ',null],['きな粉',null]],
 [['10倍がゆ',null],['パンがゆ','小さじ1'],['トマト',null],['バナナ',null],['豆腐','12g']],
 [['10倍がゆ',null],['パンがゆ','小さじ2'],['かぶ',null],['にんじん',null],['バナナ',null],['きな粉',null]],
 [['10倍がゆ',null],['かぶ',null],['にんじん',null],['ひらめ',null]],
 [['10倍がゆ',null],['トマト',null],['ひらめ',null],['バナナ',null],['きな粉',null]],
 [['パンがゆ',null],['にんじん',null],['キャベツ','小さじ1'],['豆腐','12g']],
 [['10倍がゆ',null],['キャベツ','小さじ2'],['にんじん',null],['バナナ',null],['きな粉',null],['ひらめ',null]],
 [['10倍がゆ',null],['かぶ',null],['にんじん',null],['ひらめ',null]]
];
// 分類を持たない計画の食材だけの補助（qFoodGroups は買い足し候補・提案にも使われるので変えない）。
const spineGroupExtra={'10倍がゆ':'grains','パンがゆ':'grains','白菜':'vegfruit'};
function spineNorm(n){return String(n??'').normalize('NFKC').replace(/ペースト/g,'').replace(/\s+/g,'').trim()}
function spineGroup(n){const k=spineNorm(n);return spineGroupExtra[k]||qFoodGroup(k)}
// 初登場日＝その食材が計画に最初に出る日（別途フラグを持たず、SPINE から機械的に導く）。
let spineFirstMap=null;
function spineFirstDay(name){if(!spineFirstMap){spineFirstMap=new Map();SPINE.forEach((day,i)=>{for(const [n] of day)if(!spineFirstMap.has(n))spineFirstMap.set(n,i+1)})}return spineFirstMap.get(name)??null}
// ===== 1.7.0: 本の進め方（中期）=====
// 中期の背骨。1日＝[1回目の料理名の配列, 2回目の料理名の配列]。「A＋B」は別要素、★・参照ページは外してある。
// 7日×4パターンを 7カ月目[1・3週, 2・4週, 1・3週, 2・4週] → 8カ月目[同順] の順に並べて56日。量ラベルは持たない（表示は現行のストック分量＞時期の目安に任せる）。
const CHUKI_7A=[
 [['7倍がゆ','鯛と野菜のだし煮','最初の野菜スープ'],['ミルクパンがゆ','きな粉','にんじんと玉ねぎのだし煮']],
 [['にんじんとささみのおかゆ','最初の野菜スープ','バナナペースト'],['にんじんとほうれん草のおかゆ','鯛と野菜のだし煮']],
 [['にんじんとささみのおかゆ','ほうれん草のポタージュ','バナナペースト','ヨーグルト','きな粉'],['バナナミルクパンがゆ','最初の野菜スープ']],
 [['7倍がゆ','鯛と野菜のだし煮','バナナペースト','ヨーグルト','きな粉'],['にんじんとささみのおかゆ','ほうれん草のポタージュ']],
 [['にんじんとささみのおかゆ','基本のポテトサラダ'],['ミルクパンがゆ','きな粉','にんじんと玉ねぎのだし煮']],
 [['バナナミルクパンがゆ','鯛と野菜のだし煮','基本のポテトサラダ'],['にんじんとほうれん草のおかゆ','バナナペースト']],
 [['7倍がゆ','鯛と野菜のだし煮','バナナペースト','ヨーグルト','きな粉'],['にんじんとささみのおかゆ','基本のポテトサラダ']]
];
const CHUKI_7B=[
 [['7倍がゆ','ひきわり納豆','りんごきんとん','ブロッコリーのおかか和え','野菜豆乳スープ'],['ミルクパンがゆ','きな粉','りんごきんとん']],
 [['納豆オクラがゆ','野菜豆乳スープ','りんごきんとん'],['さつまいもペーストがゆ','ブロッコリーポタージュ']],
 [['りんごミルクパンがゆ','ツナポテサラダ','ブロッコリーのおかか和え'],['さつまいもペーストがゆ','野菜豆乳スープ']],
 [['ツナオクラがゆ','野菜豆乳スープ','りんごペースト','ヨーグルト'],['ミルクパンがゆ','ツナポテサラダ','ブロッコリーのおかか和え']],
 [['ツナオクラがゆ','野菜豆乳スープ','りんごペースト','ヨーグルト'],['7倍がゆ','ひきわり納豆','りんごきんとん','ブロッコリーポタージュ']],
 [['ミルクパンがゆ','きな粉','ブロッコリーのおかか和え','野菜豆乳スープ'],['納豆オクラがゆ','ツナポテサラダ']],
 [['7倍がゆ','ひきわり納豆','ブロッコリーポタージュ','りんごペースト','ヨーグルト'],['りんごミルクパンがゆ','ツナポテサラダ','ブロッコリーのおかか和え']]
];
const CHUKI_8C=[
 // 月の2回目の [7倍がゆ, クリームシチュー, かぼちゃペースト, 野菜みそ汁] は唯一の推定セル。クリームシチューとかぼちゃペーストは転記時の推定（本では文字が読み取れず要確認だった）。
 [['7倍がゆ','クリームシチュー','お野菜たっぷりポテトサラダ','お好みの果物'],['7倍がゆ','クリームシチュー','かぼちゃペースト','野菜みそ汁']],
 [['しらすとにんじんの炊き込みがゆ','かぼちゃサラダ','赤ちゃんミネストローネ'],['7倍がゆ','クリームシチュー','お野菜たっぷりポテトサラダ','お好みの果物']],
 [['しらすとにんじんの炊き込みがゆ','赤ちゃんミネストローネ','お野菜たっぷりポテトサラダ'],['7倍がゆ','はじめてのミートソース','かぼちゃサラダ','お好みの果物']],
 [['7倍がゆ','クリームシチュー','かぼちゃサラダ','お好みの果物'],['しらすとにんじんの炊き込みがゆ','野菜みそ汁','お好みの果物','きな粉']],
 [['しらすとにんじんの炊き込みがゆ','野菜みそ汁','お野菜たっぷりポテトサラダ'],['7倍がゆ','はじめてのミートソース','かぼちゃサラダ','お好みの果物']],
 [['7倍がゆ','はじめてのミートソース','野菜みそ汁','お好みの果物','きな粉'],['7倍がゆ','クリームシチュー','お野菜たっぷりポテトサラダ','お好みの果物']],
 [['しらすとにんじんの炊き込みがゆ','赤ちゃんミネストローネ','お野菜たっぷりポテトサラダ'],['7倍がゆ','はじめてのミートソース','野菜みそ汁','お好みの果物']]
];
const CHUKI_8D=[
 [['和風野菜うどん','小松菜となすのだし煮','お好みの果物','きな粉'],['ミルクパンがゆ','バナナペースト','スイートポテト','あっさり野菜スープ']],
 [['ツナとひじきの炊き込みがゆ','あっさり野菜スープ','スイートポテト'],['ミルクパンがゆ','バナナペースト','小松菜となすのだし煮','さつまいもポタージュ']],
 [['7倍がゆ','ツナ入りラタトゥイユ','さつまいもポタージュ','お好みの果物','きな粉'],['ツナとひじきの炊き込みがゆ','あっさり野菜スープ','スイートポテト']],
 [['7倍がゆ','ツナ入りラタトゥイユ','あっさり野菜スープ','スイートポテト'],['和風野菜うどん','小松菜となすのだし煮','お好みの果物','きな粉']],
 [['7倍がゆ','ツナ入りラタトゥイユ','バナナペースト','ヨーグルト'],['ミルクパンがゆ','バナナペースト','小松菜となすのだし煮','さつまいもポタージュ']],
 [['ツナとひじきの炊き込みがゆ','あっさり野菜スープ','スイートポテト'],['和風野菜うどん','ツナ入りラタトゥイユ','お好みの果物','きな粉']],
 [['ミルクパンがゆ','バナナペースト','小松菜となすのだし煮','ツナ入りラタトゥイユ'],['ツナとひじきの炊き込みがゆ','あっさり野菜スープ','スイートポテト']]
];
const SPINE_CHUKI=[...CHUKI_7A,...CHUKI_7B,...CHUKI_7A,...CHUKI_7B,...CHUKI_8C,...CHUKI_8D,...CHUKI_8C,...CHUKI_8D];
// 差し替え用の料理の分類（37品）。たんぱく質を含む煮物・サラダは主材料で寄せ、定まらない料理は書かない（＝差し替えなし＝ストックなし表示）。
// 料理に当たらない要素（ヨーグルト＝dairy は既存の分類、きな粉は分類なし）は spineGroup に任せる。
const CHUKI_GROUP={'7倍がゆ':'grains','鯛と野菜のだし煮':'fish','最初の野菜スープ':'vegfruit','ミルクパンがゆ':'grains','にんじんと玉ねぎのだし煮':'vegfruit','にんじんとささみのおかゆ':'grains','バナナペースト':'vegfruit','にんじんとほうれん草のおかゆ':'grains','ほうれん草のポタージュ':'vegfruit','バナナミルクパンがゆ':'grains','基本のポテトサラダ':'vegfruit','ひきわり納豆':'tofu','りんごきんとん':'vegfruit','ブロッコリーのおかか和え':'vegfruit','野菜豆乳スープ':'vegfruit','納豆オクラがゆ':'grains','さつまいもペーストがゆ':'grains','ブロッコリーポタージュ':'vegfruit','りんごミルクパンがゆ':'grains','ツナポテサラダ':'fish','ツナオクラがゆ':'grains','りんごペースト':'vegfruit','クリームシチュー':'meat','お野菜たっぷりポテトサラダ':'vegfruit','かぼちゃペースト':'vegfruit','野菜みそ汁':'vegfruit','しらすとにんじんの炊き込みがゆ':'grains','かぼちゃサラダ':'vegfruit','赤ちゃんミネストローネ':'vegfruit','はじめてのミートソース':'meat','和風野菜うどん':'grains','小松菜となすのだし煮':'vegfruit','スイートポテト':'vegfruit','あっさり野菜スープ':'vegfruit','ツナとひじきの炊き込みがゆ':'grains','さつまいもポタージュ':'vegfruit','ツナ入りラタトゥイユ':'fish'};
const CHUKI_FRUIT='お好みの果物',CHUKI_FRUITS=new Set(['バナナ','りんご','みかん','いちご','キウイ','梨','桃','アボカド','ぶどう','メロン','柿','すいか','ブルーベリー','さくらんぼ','マンゴー']);
// 中期は末尾の「ペースト」だけを外す（バナナペースト→バナナ で初期と同じ食材名にそろえ、さつまいもペーストがゆ は壊さない）。
function spineNormC(n){return String(n??'').normalize('NFKC').replace(/\s+/g,'').replace(/ペースト$/,'').trim()}
const chukiGroupMap=new Map(Object.entries(CHUKI_GROUP).map(([k,v])=>[spineNormC(k),v]));
function chukiGroup(n){return chukiGroupMap.has(n)?chukiGroupMap.get(n):spineGroup(n)}
// 初登場日（日の位置）。初期の spineFirstDay と同じく SPINE_CHUKI から機械的に導く。
let chukiFirstMap=null;
function chukiFirstDay(name){if(!chukiFirstMap){chukiFirstMap=new Map();SPINE_CHUKI.forEach((day,i)=>{for(const meal of day)for(const n of meal)if(!chukiFirstMap.has(n))chukiFirstMap.set(n,i+1)})}return chukiFirstMap.get(name)??null}
const SPINE_OPT={norm:spineNorm,group:spineGroup,first:spineFirstDay};
const CHUKI_OPT={norm:spineNormC,group:chukiGroup,first:chukiFirstDay,fruit:true};
// ===== 1.8.0: 本の進め方（後期）=====
// 後期＝9〜11カ月目の6パターン（週ローテーション）。各日は [1回目,2回目,3回目]。転記（hidden_files/utamaru-kouki-calendars.md）の規則：
// 「・」と「＋」は別要素、★と →P◯◯ は落とす、「（豆腐入り）」「（または軟飯）」は外す。
const KOUKI_9A=[
 [['鮭とひじきの炊き込みがゆ','かぼちゃペースト','インゲン','りんご'],['食パンスティック','野菜たっぷりみそ汁'],['5倍がゆ','鶏肉じゃが','にんじんのポタージュ','りんごとさつまいものおやき','ブロッコリー']],
 [['鮭とひじきの炊き込みがゆ','りんごとさつまいものおやき','野菜たっぷりみそ汁'],['豆腐でふわふわパンケーキ','にんじんのポタージュ','ブロッコリー'],['5倍がゆ','鶏肉じゃが','かぼちゃペースト','きな粉']],
 [['5倍がゆ','たらのだし煮','にんじんのポタージュ','りんごとさつまいものおやき','インゲン'],['5倍がゆ','鶏肉じゃが','野菜たっぷりみそ汁'],['鮭とひじきの炊き込みがゆ','かぼちゃペースト','インゲン','りんご']],
 [['5倍がゆ','たらのだし煮','野菜たっぷりみそ汁','りんご'],['豆腐でふわふわパンケーキ','にんじんのポタージュ','ブロッコリー'],['鮭とひじきの炊き込みがゆ','野菜たっぷりみそ汁','りんごとさつまいものおやき']],
 [['食パンスティック','鶏肉じゃが','かぼちゃペースト','きな粉'],['鮭とひじきの炊き込みがゆ','りんごとさつまいものおやき'],['5倍がゆ','鶏肉じゃが','野菜たっぷりみそ汁','りんご']],
 [['鮭とひじきの炊き込みがゆ','野菜たっぷりみそ汁','りんご'],['豆腐でふわふわパンケーキ','にんじんのポタージュ','ブロッコリー'],['5倍がゆ','たらのだし煮','りんごとさつまいものおやき','インゲン']],
 [['食パンスティック','たらのだし煮','りんごとさつまいものおやき','ブロッコリー'],['5倍がゆ','鶏肉じゃが','かぼちゃペースト','きな粉'],['5倍がゆ','たらのだし煮','野菜たっぷりみそ汁','りんご']]
];
const KOUKI_9B=[
 [['5倍がゆ','豆腐ハンバーグ','じゃがいもとほうれん草のおやき'],['5倍がゆ','ミートソース','ツナじゃがチーズおやき','ブロッコリー'],['ツナとにんじんの炊き込みがゆ','じゃがいもとほうれん草のおやき','野菜たっぷりみそ汁']],
 [['マカロニきな粉','じゃがいもとほうれん草のおやき','にんじんスティック'],['ツナとにんじんの炊き込みがゆ','野菜たっぷりみそ汁'],['5倍がゆ','豆腐ハンバーグ','にんじんのポタージュ','ブロッコリー']],
 [['ツナとにんじんの炊き込みがゆ','じゃがいもとほうれん草のおやき','お好みの果物'],['マカロニきな粉','ツナじゃがチーズおやき','野菜たっぷりみそ汁'],['5倍がゆ','ミートソース','じゃがいもとほうれん草のおやき','野菜たっぷりみそ汁']],
 [['ツナとにんじんの炊き込みがゆ','じゃがいもとほうれん草のおやき','お好みの果物'],['5倍がゆ','ミートソース','にんじんのポタージュ','ブロッコリー'],['5倍がゆ','豆腐ハンバーグ','野菜たっぷりみそ汁','にんじんスティック','ブロッコリー']],
 [['マカロニきな粉','ツナじゃがチーズおやき','にんじんスティック','ブロッコリー','お好みの果物'],['ツナとにんじんの炊き込みがゆ','野菜たっぷりみそ汁'],['5倍がゆ','ミートソース','ツナじゃがチーズおやき','にんじんのポタージュ']],
 [['ツナとにんじんの炊き込みがゆ','じゃがいもとほうれん草のおやき','お好みの果物'],['5倍がゆ','ミートソース','にんじんのポタージュ','ブロッコリー'],['5倍がゆ','豆腐ハンバーグ','野菜たっぷりみそ汁','にんじんスティック','ブロッコリー']],
 [['マカロニきな粉','豆腐ハンバーグ','野菜たっぷりみそ汁'],['ツナとにんじんの炊き込みがゆ','じゃがいもとほうれん草のおやき'],['5倍がゆ','ミートソース','にんじんのポタージュ','ブロッコリー']]
];
const KOUKI_10C=[
 [['ふわふわ蒸しパン','さつまいもきな粉おやき','にんじんスティック'],['5倍がゆ','赤ちゃんミートボール','野菜スープ'],['さつまいもがゆ','じゃがいもチーズおやき','ブロッコリー','お好みの果物']],
 [['5倍がゆ','赤ちゃんハヤシソース','じゃがいもチーズおやき','にんじんスティック','ブロッコリー'],['さつまいもがゆ','赤ちゃんミートボール','にんじんスティック','ブロッコリー'],['ふわふわ蒸しパン','さつまいもきな粉おやき','野菜スープ']],
 [['5倍がゆ','赤ちゃんハヤシソース','さつまいもきな粉おやき','にんじんスティック'],['さつまいもがゆ','あじと小松菜のうま煮','野菜スープ'],['5倍がゆ','赤ちゃんミートボール','じゃがいもチーズおやき','お好みの果物']],
 [['5倍がゆ','あじと小松菜のうま煮','さつまいもきな粉おやき','野菜スープ'],['ふわふわ蒸しパン','さつまいもきな粉おやき','野菜スープ'],['5倍がゆ','赤ちゃんミートボール','じゃがいもチーズおやき','ブロッコリー']],
 [['5倍がゆ','赤ちゃんミートボール','野菜スープ','お好みの果物'],['さつまいもがゆ','あじと小松菜のうま煮','お好みの果物'],['5倍がゆ','赤ちゃんハヤシソース','じゃがいもチーズおやき','ブロッコリー']],
 [['5倍がゆ','あじと小松菜のうま煮','野菜スープ','お好みの果物'],['ふわふわ蒸しパン','さつまいもきな粉おやき','にんじんスティック'],['さつまいもがゆ','赤ちゃんミートボール','ブロッコリー','お好みの果物']],
 [['5倍がゆ','赤ちゃんハヤシソース','さつまいもきな粉おやき','お好みの果物'],['5倍がゆ','赤ちゃんミートボール','野菜スープ','お好みの果物'],['5倍がゆ','あじと小松菜のうま煮','じゃがいもチーズおやき','お好みの果物']]
];
const KOUKI_10D=[
 [['5倍がゆ','具だくさん豚汁','ヨーグルト','お好みの果物'],['ほうれん草パンケーキ','たらとじゃがいものトマト煮','コロコロ大根にんじん煮'],['白菜とツナのクリームうどん','かぼちゃおやき','お好みの果物','きな粉']],
 [['ほうれん草パンケーキ','かぼちゃポタージュ','お好みの果物','きな粉'],['ひじきたっぷり炊き込みがゆ','具だくさん豚汁','ヨーグルト','きな粉'],['白菜とツナのクリームうどん','かぼちゃおやき','にんじんスティック','ブロッコリー']],
 [['ひじきたっぷり炊き込みがゆ','コロコロ大根にんじん煮','ヨーグルト','お好みの果物'],['5倍がゆ','具だくさん豚汁','かぼちゃおやき'],['白菜とツナのクリームうどん','たらとじゃがいものトマト煮','お好みの果物','きな粉']],
 [['ひじきたっぷり炊き込みがゆ','コロコロ大根にんじん煮','かぼちゃポタージュ'],['ほうれん草パンケーキ','たらとじゃがいものトマト煮','お好みの果物','きな粉'],['5倍がゆ','かぼちゃおやき','具だくさん豚汁']],
 [['ほうれん草パンケーキ','具だくさん豚汁','お好みの果物','きな粉'],['白菜とツナのクリームうどん','かぼちゃおやき','コロコロ大根にんじん煮'],['ひじきたっぷり炊き込みがゆ','かぼちゃポタージュ','にんじんスティック','ブロッコリー']],
 [['ほうれん草パンケーキ','具だくさん豚汁','お好みの果物','きな粉'],['ひじきたっぷり炊き込みがゆ','かぼちゃポタージュ','にんじんスティック','ブロッコリー'],['白菜とツナのクリームうどん','コロコロ大根にんじん煮','お好みの果物']],
 [['5倍がゆ','たらとじゃがいものトマト煮','コロコロ大根にんじん煮'],['ほうれん草パンケーキ','かぼちゃポタージュ','お好みの果物','きな粉'],['ひじきたっぷり炊き込みがゆ','かぼちゃおやき','具だくさん豚汁']]
];
const KOUKI_11E=[
 [['軟飯','なすの肉みそ','のり塩里いも','お好みの果物'],['鮭とほうれん草のクリームマカロニパスタ','コーンポタージュ'],['ひじき煮の軟飯','野菜豆乳みそスープ','お好みの果物']],
 [['ひじき煮の軟飯','のり塩里いも','野菜豆乳みそスープ'],['ツナ入りお好み焼き','にんじんしりしり','お好みの果物'],['鮭とほうれん草のクリームマカロニパスタ','コーンポタージュ','お好みの果物']],
 [['軟飯','なすの肉みそ','野菜豆乳みそスープ','お好みの果物'],['ツナ入りお好み焼き','にんじんしりしり','お好みの果物'],['ひじき煮の軟飯','のり塩里いも','コーンポタージュ']],
 [['ひじき煮の軟飯','にんじんしりしり','お好みの果物'],['軟飯','なすの肉みそ','のり塩里いも','野菜豆乳みそスープ'],['鮭とほうれん草のクリームマカロニパスタ','コーンポタージュ','お好みの果物']],
 [['軟飯','なすの肉みそ','野菜豆乳みそスープ','お好みの果物'],['ツナ入りお好み焼き','コーンポタージュ'],['ひじき煮の軟飯','野菜豆乳みそスープ','のり塩里いも']],
 [['鮭とほうれん草のクリームマカロニパスタ','コーンポタージュ'],['ひじき煮の軟飯','野菜豆乳みそスープ'],['軟飯','なすの肉みそ','のり塩里いも','にんじんしりしり']],
 [['ひじき煮の軟飯','コーンポタージュ','にんじんしりしり'],['軟飯','なすの肉みそ','野菜豆乳みそスープ','お好みの果物'],['ツナ入りお好み焼き','コーンポタージュ','お好みの果物']]
];
const KOUKI_11F=[
 [['鮭としめじの炊き込み軟飯','さつまいもポタージュ','ヨーグルト','お好みの果物'],['野菜つくねうどん','いももち','さつまいもの甘煮'],['しらすおかか軟飯','野菜たっぷりみそ汁','さつまいもの甘煮']],
 [['しらすおかか軟飯','いももち','お好みの果物'],['鮭としめじの炊き込み軟飯','野菜たっぷりみそ汁'],['野菜つくねうどん','さつまいもの甘煮','ヨーグルト','お好みの果物']],
 [['のり塩軟飯','鶏みそつくね','野菜たっぷりみそ汁'],['しらすおかか軟飯','さつまいもの甘煮','ヨーグルト','お好みの果物'],['鮭としめじの炊き込み軟飯','いももち','さつまいもポタージュ']],
 [['しらすおかか軟飯','いももち','野菜たっぷりみそ汁'],['野菜つくねうどん','さつまいもの甘煮','ヨーグルト','お好みの果物'],['のり塩軟飯','鶏みそつくね','さつまいもポタージュ']],
 [['鮭としめじの炊き込み軟飯','野菜たっぷりみそ汁','お好みの果物'],['のり塩軟飯','鶏みそつくね','さつまいもポタージュ'],['野菜つくねうどん','いももち','さつまいもの甘煮']],
 [['のり塩軟飯','鶏みそつくね','野菜たっぷりみそ汁'],['しらすおかか軟飯','いももち','さつまいもポタージュ'],['鮭としめじの炊き込み軟飯','野菜たっぷりみそ汁','ヨーグルト','お好みの果物']],
 [['鮭としめじの炊き込み軟飯','いももち','野菜たっぷりみそ汁'],['野菜つくねうどん','さつまいもの甘煮'],['しらすおかか軟飯','さつまいもポタージュ','お好みの果物']]
];
const SPINE_KOUKI=[...KOUKI_9A,...KOUKI_9B,...KOUKI_9A,...KOUKI_9B,...KOUKI_10C,...KOUKI_10D,...KOUKI_10C,...KOUKI_10D,...KOUKI_11E,...KOUKI_11F,...KOUKI_11E,...KOUKI_11F];
// 差し替え用の料理の分類（47品＋かぼちゃペースト・さつまいもポタージュ＋素材品4つ）。ヨーグルト＝dairy は既存の分類、きな粉は分類なし（書かない）。
const KOUKI_GROUP={'5倍がゆ':'grains','軟飯':'grains','鮭とひじきの炊き込みがゆ':'grains','食パンスティック':'grains','野菜たっぷりみそ汁':'vegfruit','鶏肉じゃが':'meat','にんじんのポタージュ':'vegfruit','りんごとさつまいものおやき':'grains','たらのだし煮':'fish','豆腐でふわふわパンケーキ':'grains','豆腐ハンバーグ':'tofu','じゃがいもとほうれん草のおやき':'grains','ミートソース':'meat','ツナじゃがチーズおやき':'grains','ツナとにんじんの炊き込みがゆ':'grains','マカロニきな粉':'grains','ふわふわ蒸しパン':'grains','さつまいもきな粉おやき':'grains','赤ちゃんミートボール':'meat','野菜スープ':'vegfruit','さつまいもがゆ':'grains','じゃがいもチーズおやき':'grains','赤ちゃんハヤシソース':'meat','あじと小松菜のうま煮':'fish','具だくさん豚汁':'vegfruit','ほうれん草パンケーキ':'grains','たらとじゃがいものトマト煮':'fish','コロコロ大根にんじん煮':'vegfruit','白菜とツナのクリームうどん':'grains','かぼちゃおやき':'grains','かぼちゃポタージュ':'vegfruit','ひじきたっぷり炊き込みがゆ':'grains','なすの肉みそ':'meat','のり塩里いも':'vegfruit','鮭とほうれん草のクリームマカロニパスタ':'grains','コーンポタージュ':'vegfruit','ひじき煮の軟飯':'grains','野菜豆乳みそスープ':'vegfruit','ツナ入りお好み焼き':'grains','にんじんしりしり':'vegfruit','鮭としめじの炊き込み軟飯':'grains','野菜つくねうどん':'grains','いももち':'grains','さつまいもの甘煮':'vegfruit','しらすおかか軟飯':'grains','のり塩軟飯':'grains','鶏みそつくね':'meat','かぼちゃペースト':'vegfruit','さつまいもポタージュ':'vegfruit','りんご':'vegfruit','ブロッコリー':'vegfruit','インゲン':'vegfruit','にんじんスティック':'vegfruit'};
// 表に無い名前は中期の分類→既存の分類の順で引く（中期の料理名のストックも後期で分類される）。
const koukiGroupMap=new Map(Object.entries(KOUKI_GROUP).map(([k,v])=>[spineNormC(k),v]));
function koukiGroup(n){return koukiGroupMap.has(n)?koukiGroupMap.get(n):chukiGroup(n)}
// 初登場日（日の位置）。SPINE_KOUKI から機械的に導く（初期・中期の初登場日とは別。後期の中での最初）。
let koukiFirstMap=null;
function koukiFirstDay(name){if(!koukiFirstMap){koukiFirstMap=new Map();SPINE_KOUKI.forEach((day,i)=>{for(const meal of day)for(const n of meal)if(!koukiFirstMap.has(n))koukiFirstMap.set(n,i+1)})}return koukiFirstMap.get(name)??null}
const KOUKI_OPT={norm:spineNormC,group:koukiGroup,first:koukiFirstDay,fruit:true};
let spineOffMem=false;
function spineOn(){try{const v=localStorage.getItem(SPINE_ON_KEY);if(v!==null)return v!=='off'}catch{}return !spineOffMem}
function spineSetOn(on){spineOffMem=!on;try{localStorage.setItem(SPINE_ON_KEY,on?'on':'off')}catch{}}
// 見送りの控え（保存データの外）。{name:表示名,plan:計画の食材名,date:見送った日,added?:今日の計画へ足した日}。14日より古いものは書くときに捨てる。
function spineSkips(){try{const v=JSON.parse(localStorage.getItem(SPINE_SKIP_KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.name==='string'&&typeof x.plan==='string'&&validDay(x.date)):[]}catch{return []}}
function spineSkipsSave(list){const from=plusDate(jstDate(),-14),keep=list.filter(x=>x.date>=from).slice(-60);try{localStorage.setItem(SPINE_SKIP_KEY,JSON.stringify(keep))}catch{}}
// 全期間通算の位置 E＝今日より前に「食べた」記録のある日の数＋1（1.6.0 の spineDay の数え方そのまま）。
// relax＝中期用。時期だけ選んで開始日が無い（source==='period'）ときも数える。初期（relax=false）は従来どおり null。
function spineElapsed(d,relax){
 const info=qStartInfo(d);if(info.source==='period'?!relax:(info.source&&info.day<1))return null;
 const plans=new Map(state().plans.map(p=>[p.id,p])),days=new Set();
 for(const r of state().records){const p=plans.get(r.planId);if(!p||!qEatenNames(r).length)continue;const x=qRecordDay(r,p);if(validDay(x)&&x<d&&(!info.start||x>=info.start))days.add(x)}
 return days.size+1}
// 初期の位置＝E（1〜56）。範囲外は null。
function spineDay(d=jstDate()){const e=spineElapsed(d,false);return e===null||e>SPINE.length?null:e}
// 中期の位置＝E−56（1〜56）。範囲外は null。
function spineChukiDay(d=jstDate()){const e=spineElapsed(d,true);if(e===null)return null;const n=e-SPINE.length;return n>=1&&n<=SPINE_CHUKI.length?n:null}
// 後期の位置＝E−112（1〜84）。範囲外は null。relax（時期のみ選択・開始日なしでも記録があれば進む）は中期と同じ。
function spineKoukiDay(d=jstDate()){const e=spineElapsed(d,true);if(e===null)return null;const n=e-SPINE.length-SPINE_CHUKI.length;return n>=1&&n<=SPINE_KOUKI.length?n:null}
function spineActiveDay(d){if(d!==jstDate()||!spineOn())return null;const st=qStageKey();return st==='初期'?spineDay(d):st==='中期'?spineChukiDay(d):st==='後期'?spineKoukiDay(d):null}
// 背骨が受け持つ枠の番号。初期は使用枠の1番目だけ、中期は1番目（1回目）と2番目（2回目）。受け持たない枠は -1。
function spineSlotIdx(d,slot){const i=tSlots(d).indexOf(slot),st=qStageKey();return i>=0&&i<(st==='後期'?3:st==='中期'?2:1)?i:-1}
// 背骨が受け持つ枠か。献立が無い・空の枠・記録から作られた枠・自動のおすすめは対象。手で作った／直した献立は手動なので対象外。
// 背骨が受け持つ枠か。献立が無い・空の枠・記録から作られた枠・自動のおすすめは対象。手で作った／直した献立は手動なので対象外。
function spineOwned(p){return !p||tIsHusk(p)||Boolean(p.quickCreated)||p.note===qSuggestNote}
function spineHolds(d,slot,p){return Boolean(spineActiveDay(d))&&spineSlotIdx(d,slot)>=0&&spineOwned(p)}// 計画日の食材を順に解決する。a=ストック一致 b=同じ分類で差し替え（食べたことがある＞賞味目安が近い順） c=ストックなし。
// plan＝[名前,量ラベル|null] の配列。o＝時期ごとの正規化・分類・初登場日（既定は初期）。中期の 'お好みの果物' は kind:'fruit' で解決する。
// shared（中期だけ渡る）＝その日の食事をまたいだストックの使用数（batchId→個数）。残り1個が2食に重なるのを防ぐ。
function spineRows(d,day,plan=SPINE[day-1],o=SPINE_OPT,shared=null){
 const {norm,group}=o,skips=spineSkips(),eaten=qEatenFoods(),stock=stockSorted(state().batches.filter(b=>b.quantity>0)),planNorms=new Set(plan.map(([n])=>norm(n))),used=new Set(),rows=[];
 const namesOf=b=>o.fruit&&b.name?[b.name,...qStockNames(b).filter(x=>x!==b.name)]:qStockNames(b);
 const eatenN=o.fruit?new Set([...eaten].map(x=>norm(x))):null,wasEaten=x=>eaten.has(x)||(eatenN!==null&&eatenN.has(norm(x)));
 const hasFruit=o.fruit&&plan.some(([n])=>n===CHUKI_FRUIT);
 const left=b=>!shared||(shared.get(b.id)||0)<b.quantity,use1=b=>{if(shared)shared.set(b.id,(shared.get(b.id)||0)+1)};
 const amt=b=>{const sp=b&&stockPortion(b);return sp&&sp.unit!=='whole'?portionAmountLabel(sp.unit,sp.amount,100):''};
 const hit=n=>{for(const b of stock)for(const x of namesOf(b))if(norm(x)===n&&left(b))return {b,x};return null};
 for(const [name,label] of plan){
  if(skips.some(s=>s.date===d&&!s.added&&s.plan===name))continue;
  if(o.fruit&&name===CHUKI_FRUIT){
   const cands=[];for(const b of stock)for(const x of namesOf(b)){const k=norm(x);if(CHUKI_FRUITS.has(k)&&!planNorms.has(k)&&!used.has(k)&&left(b)&&!cands.some(c=>c.k===k))cands.push({b,x,k})}
   const pick=cands.find(c=>wasEaten(c.x))||cands[0]||null;
   if(pick){used.add(pick.k);use1(pick.b);rows.push({kind:'fruit',name:pick.x,plan:name,label,stockAmt:amt(pick.b),skippable:false})}
   else rows.push({kind:'none',name,plan:name,label,stockAmt:'',skippable:false,fruit:true});
   continue}
  const n=norm(name),first=o.first(name)===day,m=hit(n);
  if(m){if(used.has(n))continue;used.add(n);use1(m.b);rows.push({kind:'match',name:n,plan:name,label,stockAmt:amt(m.b),skippable:first&&!wasEaten(n)});continue}
  const g=group(n);let pick=null;
  if(g){const cands=[];for(const b of stock)for(const x of namesOf(b)){const k=norm(x);if(group(k)===g&&!planNorms.has(k)&&!used.has(k)&&left(b)&&!cands.some(c=>c.k===k)&&!(hasFruit&&CHUKI_FRUITS.has(k)&&!CHUKI_FRUITS.has(n)))cands.push({b,x,k})}pick=cands.find(c=>wasEaten(c.x))||cands[0]||null}
  if(pick){used.add(pick.k);use1(pick.b);rows.push({kind:'swap',name:pick.x,plan:name,label,stockAmt:amt(pick.b),skippable:first&&!wasEaten(pick.x)});continue}
  rows.push({kind:'none',name:n,plan:name,label,stockAmt:'',skippable:false})
 }
 // 前日に見送り、「今日の計画に足す」を押した食材（中期は1回目の枠にだけ足す）。
 if(o.carry!==false)for(const s of skips)if(s.added===d){const k=norm(s.name);if(used.has(k))continue;used.add(k);const m=hit(k);if(m)use1(m.b);rows.push({kind:'carry',name:s.name,plan:s.plan,label:null,stockAmt:m?amt(m.b):'',skippable:false})}
 return rows}
// 前日に見送った食材の1行メモ（今日の行に出ているもの・もう食べたものは出さない）。
function spineMemo(d,rows){const y=plusDate(d,-1),eaten=qEatenFoods(),shown=new Set(rows.map(r=>r.name));return spineSkips().filter(s=>s.date===y&&!s.added&&!eaten.has(s.name)&&!shown.has(s.name)&&!shown.has(spineNorm(s.name))).map(s=>`<p class="tSpineMemo">見送った食材：<b>${esc(s.name)}</b><button class="linkButton" data-t="spine-carry" data-name="${esc(s.name)}" data-plan="${esc(s.plan)}" data-from="${s.date}" data-edit>今日の計画に足す</button></p>`).join('')}
function spineMeal(d,slot,p){
 if(!spineHolds(d,slot,p))return null;
 const day=spineActiveDay(d),i=spineSlotIdx(d,slot);
 const st=qStageKey(),bk=st==='中期'?[SPINE_CHUKI,CHUKI_OPT]:st==='後期'?[SPINE_KOUKI,KOUKI_OPT]:null;
 if(bk){const shared=new Map();let rows=null,memo='';for(let k=0;k<=i;k++){const r=spineRows(d,day,bk[0][day-1][k].map(n=>[n,null]),{...bk[1],carry:k===0},shared);if(k===i){rows=r;if(k===0)memo=spineMemo(d,r)}}return {day,rows,memo}}
 const rows=spineRows(d,day);return {day,rows,memo:spineMemo(d,rows)}}
function spineRowNotes(sp){return (sp.kind==='swap'?`<span class="tSpineSwap">差し替え</span><small class="tSpineFrom">（計画は${esc(sp.plan)}）</small>`:'')+(sp.kind==='fruit'?'<small class="tSpineFrom">（お好みの果物）</small>':'')+(sp.label?`<small class="tSpineLabel">計画：${esc(sp.label)}</small>`:'')}
function spineSkipButton(sp){return `<button class="linkButton tSpineSkip" data-t="spine-skip" data-plan="${esc(sp.plan)}" data-name="${esc(sp.name)}" aria-label="${esc(sp.name)}を今日は見送る" data-edit>今日は見送る</button>`}
function spineNoneRow(x){return `<div class="tRow tSpineNone"><span class="tRowMain"><b>${esc(x.name)}</b>${!x.fruit&&qIsFirstFood(x.name)?'<span class="qFirstBadge">はじめて</span>':''}<small>${x.fruit?'（ストックなし）':'ストックなし'+(x.label?'・計画：'+esc(x.label):'')}</small></span>${spineRecipeButton(x)}${x.fruit?'':`<button class="linkButton tSpineShop" data-action="suggestShop" data-name="${esc(x.name)}" aria-label="${esc(x.name)}を買い物リストに追加" data-edit>買い物へ</button>`}</div>`}
// ===== 1.7.0: 作り方ビュー =====
// RECIPES は recipes.js（データだけ）。無い・その料理が無いときは何も出さない。
function spineRecipe(k){return typeof RECIPES==='object'&&RECIPES&&Object.prototype.hasOwnProperty.call(RECIPES,k)&&RECIPES[k]&&typeof RECIPES[k]==='object'?RECIPES[k]:null}
function spineRecipeButton(sp){const k=sp.kind==='match'||sp.kind==='none'?sp.plan:sp.kind==='swap'?sp.name:'';return k&&spineRecipe(k)?`<button class="linkButton tSpineRecipe" data-t="spine-recipe" data-dish="${esc(k)}" aria-label="${esc(k)}の作り方を見る">作り方</button>`:''}
function spineRecipeOpen(k){
 const r=spineRecipe(k);if(!r)return;
 const list=a=>Array.isArray(a)?a:[],img=/^img\/recipes\/[\w-]+\.(webp|png|jpg)$/.test(r.img||'')?r.img:'';
 const ing=list(r.ingredients).filter(Array.isArray).map(([n,q])=>`<li><span>${esc(n)}</span>${q?`<b>${esc(q)}</b>`:''}</li>`).join(''),steps=list(r.steps).map(s=>`<li>${esc(s)}</li>`).join('');
 openDialog(`<section class="recipeView" aria-label="${esc(k)}の作り方"><h2>${esc(k)}</h2>${img?`<img class="recipeImg" src="${esc(img)}" alt="${esc(k)}">`:''}${r.makes?`<p class="small muted">${esc(r.makes)}</p>`:''}${ing?`<h3>材料</h3><ul class="recipeIng">${ing}</ul>`:''}${steps?`<h3>手順</h3><ol class="recipeSteps">${steps}</ol>`:''}${r.keep?`<h3>保存の目安</h3><p>${esc(r.keep)}</p>`:''}<p class="small muted">量は目安です。1食の量は、ほかの料理と合わせて、食べる様子を見ながら調整してください</p></section>`);
 // 写真が読めない（オフラインなど）ときは写真だけ外す。CSP でインライン onerror は使えないのでここで付ける。
 try{const im=$('#dialogBody').querySelector('.recipeImg');if(im)im.addEventListener('error',()=>im.remove(),{once:true})}catch{}}
function spineBody(d,slot,r,sp){
 const rows=sp.rows.map(x=>x.kind==='none'&&!(r&&tRecordedItem(r,x.name))?spineNoneRow(x):tRowMarkup(d,slot,x.name,r,false,false,x)),shown=new Set(sp.rows.map(x=>x.name)),extra=r?tMealNames(null,r).filter(n=>!shown.has(n)):[];
 const html=rows.join('')+extra.map(n=>tRowMarkup(d,slot,n,r)).join('');
 return sp.memo+(html||'<p class="small muted tDraftEmpty">今日の計画はすべて見送りました。</p>')}
function spineSkip(plan,name){const d=jstDate();if(view.date!==d||!plan||!name)return;const list=spineSkips().filter(s=>!(s.date===d&&s.plan===plan));list.push({name,plan,date:d});spineSkipsSave(list);showStatus(name+'は今日は見送りました。');render()}
function spineCarry(plan,name,from){const d=jstDate(),list=spineSkips(),s=list.find(x=>x.plan===plan&&x.name===name&&x.date===from&&!x.added);if(!s)return;s.added=d;spineSkipsSave(list);render()}
function spineSettingMarkup(){const on=spineOn();return `<p>本の進め方（初期・中期・後期）：${on?'使う':'使わない'}<small>（初期・中期・後期の時期だけ、今日のメニューを決まった順番で出します。食べた記録がついた日だけ進みます）</small> <button data-t="spine-toggle" aria-pressed="${on}">${on?'使わない':'使う'}</button></p>`}
function tRowMarkup(d,slot,name,r,removable=false,editing=false,sp=null){const done=tRecordedItem(r,name),t=done?null:qOneTap(name);let sub=done?(done.intake==='not_eaten'?'食べなかった':'食べた・'+qAmount(done)):t.amount==null?'':(t.source==='previous'?'前回 ':'目安 ')+qAmount(t);if(!done&&t.amount==null){const sa=tStockUseAmount(meals(d).find(x=>x.slot===slot),name)||(sp?sp.stockAmt:'');if(sa)sub='ストック '+sa}return `<div class="tRow ${done?'done':''}"><button class="tRowMain" data-t="adjust" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="${esc(name)}の量・様子を変える" data-edit><b>${esc(name)}</b>${qIsFirstFood(name)&&!done?'<span class="qFirstBadge">はじめて</span>':''}${sp&&!done?spineRowNotes(sp):''}<small>${esc(sub)}</small></button>${done?'<span class="tDone">記録済み</span>'+tRowBtnsMarkup(d,slot,name):editing?'':`<button class="tAte" data-t="ate" data-date="${d}" data-slot="${slot}" data-name="${esc(name)}" aria-label="${esc(name)}を食べたで記録" data-edit>食べた</button>`}${removable&&!done?tRemoveButton(d,slot,name):''}${sp&&sp.skippable&&!done?spineSkipButton(sp):''}${sp&&!done?spineRecipeButton(sp):''}</div>`}
function tMealMarkup(d,slot,day){
 const p=meals(d).find(x=>x.slot===slot),r=p&&record(p),names=tMealNames(p,r),husk=tIsHusk(p),inline=tInlineEditable(p),dr=tPlanDraft(d,slot),sp=dr?null:spineMeal(d,slot,p);
 // 題名が食材名の列挙そのもの（提案から入れた献立など）なら、カード内の食材名と重複するので見出しには出さない。食材未登録のときは本文側で題名を出す。
 const headTitle=!sp&&p&&!p.quickCreated&&names.length&&p.title&&p.title!==qPlanNames(p).join('・')?`<span class="tMealTitle">${esc(p.title)}</span>`:'',pill=r?`<span class="pill ${planRecordChanged(p,r)?'':'green'}">${esc(status(p))}</span>`:'';
 let body;
 // 1.4.7: 下書きがある間は、下書きの食材で描く（保存済みは変えない）。編集中の行に「食べた」は出さない（記録は決定してから）。
 if(dr)body=dr.names.length?dr.names.map(n=>tRowMarkup(d,slot,n,null,true,true)).join(''):'<p class="small muted tDraftEmpty">食材が入っていません。</p>';
 // 1.6.0: 背骨が受け持つ枠は、計画の解決結果を仮想の行として描く（データは書き換えない）。
 else if(sp)body=spineBody(d,slot,r,sp);
 // 1.3.0: 食材ごとの「×」（外す）。足す・外すができるのは未記録・未準備の献立だけ。
 else if(p&&names.length)body=names.map(n=>tRowMarkup(d,slot,n,r,inline)).join('');
 else if(p&&!husk)body=`<div class="tRow ${r?'done':''}"><span class="tRowMain"><b>${esc(p.title)}</b><small>${r?esc(r.result):'食材は未登録'}</small></span>${r?'<span class="tDone">記録済み</span>':`<button class="tAte" data-action="quickRecord" data-id="${p.id}" data-result="食べた" aria-label="${esc(p.title)}を食べたで記録" data-edit>食べた</button>`}</div>`;
 // 1.4.6: 空の枠（献立なし・全部外した跡）におすすめがあれば、プレビュー自体をタップして入れる。「入れる」ボタンは置かない。
 else{const m=husk?tReplaceMeal(d,slot,p.id):(day?day.meals.find(x=>x.slot===slot):null);body=m&&!m.taken&&m.add.length?`<div class="tEmpty">${tPreviewButton(m,d,slot)}</div>`:''}
 // 1.4.6: 操作の整理。献立がある枠は「＋ 食材を足す」＋（ストック使用があれば）「冷凍庫から出す」＋編集フォームの入口だけ。
 // 「おすすめに変える」は廃止（全部外すとプレビューが戻る）。空の枠は「自分で食材を選ぶ」だけ（「献立を追加」は廃止し、これに一本化）。
 // 記録済みの操作（様子・メモ／食材・量を訂正／行の − ＋）は従来どおり。
 const prepare=p&&p.uses.length&&!p.prepared&&!planStockConflict(p).length?`<button class="linkButton" data-action="prepare" data-id="${p.id}" data-edit>冷凍庫から出す</button>`:'';
 // 1.4.7: 下書きがある間は足元の操作を「＋ 食材を足す」と「決定／戻る」だけにする（出す・編集フォームは決定か戻るのあと）。
 const foot=dr?`${tAddButton(d,slot)}${tDraftButtons(d,slot)}`:sp?[inline?tAddButton(d,slot,'自分で食材を選ぶ'):'',r?`<button class="linkButton" data-action="detail" data-id="${p.id}" data-edit>様子・メモ</button>`:'',r?tEditMealButton(d,slot):''].filter(Boolean).join(''):(husk||!p)?tAddButton(d,slot,'自分で食材を選ぶ'):[inline?tAddButton(d,slot):'',prepare,r?`<button class="linkButton" data-action="detail" data-id="${p.id}" data-edit>様子・メモ</button>`:'',tEditMealButton(d,slot)].filter(Boolean).join('');
 return `<article class="tMeal" data-meal-slot="${slot}"><div class="tMealHead"><h3>${slots[slot]}</h3>${sp?'<span class="tSuggestMark">本の進め方</span>':tFromSuggest(p)?tSuggestMark:''}${headTitle}${pill}</div>${body}<div class="tMealFoot">${foot}</div>${inline?tAddPicker(d,slot):''}${r?tRecAddPicker(d,slot):''}</article>`;
}
// 編集フォーム（tEditMeal）への入口。1.3.0 から足す・外すはカードの上でできるので、副操作の小さなリンクにした（記録済み→食材・量を訂正、献立あり→献立を編集）。
// 1.4.6: 空き枠の「献立を追加」は廃止した（「自分で食材を選ぶ」に一本化）ので、献立が無い枠ではこの入口自体を出さない。
function tEditMealButton(d,slot){const p=meals(d).find(x=>x.slot===slot);if(!p)return '';const label=record(p)?'食材・量を訂正':'献立を編集';return `<button class="linkButton tEditMeal" data-t="edit-meal" data-date="${d}" data-slot="${slot}" aria-label="${esc(slots[slot])}の${label}" data-edit>${label}</button>`}
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
// 1食の品数（自動／1品〜5品）の切り替え（1.3.2、1.4.4 で 4・5品を追加）。「使う食事」と同じ流儀で、押すとプロフィールの itemsPerMeal として保存され（data-action="itemsPerMeal"）、
// 今日のメニュー・使い切り提案・「＋食材を足す」の上限・説明行に反映される。押された状態は qItemsPerMeal の実効状態（0＝自動）を表示する。
function tItemsBar(){const cur=qItemsPerMeal();const btns=[[0,'自動'],[1,'1品'],[2,'2品'],[3,'3品'],[4,'4品'],[5,'5品']].map(([n,v])=>`<button data-action="itemsPerMeal" data-value="${n||''}" aria-pressed="${cur===n}" data-edit>${v}</button>`).join('');return `<div class="tMealCount"><span class="tMealCountLabel">1食の品数</span><span class="tMealCountBtns">${btns}</span></div>`}
// 1.2.1: 使う食事の外の枠にある献立・記録。消さずに、畳んだ1行（開くと従来のカード）で出す。
// 1.4.2（要望3）: 今日画面からは出さなくなった（ユーザーが不要と判断）。データは消えず、使う食事に枠を戻せば通常のカードで出る。この関数はもう今日画面からは呼ばれない。
function tOutsideMarkup(d){return tOutsideSlots(d).map(slot=>`<details class="tOutside" data-outside-slot="${slot}"><summary>${slots[slot]}：${esc(tOutsideName(d,slot))}<small>${tOutsideLabel}</small></summary>${tMealMarkup(d,slot,null)}</details>`).join('')}
// 1.2.1: 日数の説明行。始めてからの日数の区分（qMealSteps と同じ 6・20・30日目）ごとに、品数と食事の回数の目安を短く伝える。日数が分からなければ汎用の1行。
// 1.4.0: 置き場所は統合「メニュー」全体の下（quickTodayPage の並び）。
function tStepLine(d){
 const info=qStartInfo(d),day=info.day,setItems=qItemsPerMeal();let t;
 if(setItems)t=`1食${setItems}品に設定中です。`;
 else if(info.source==='period'||day===null||day<1)t='進み具合に合わせて、品数と回数が少しずつ増えます。';
 else if(day<=6)t=`いまは始めて${day}日目です。最初のうちは1食1品（主食だけ）が目安なので、メニューはおかゆ中心になります。`;
 else if(day<=20)t=`いまは始めて${day}日目です。1日1回、1食2品（主食と野菜・果物）までが目安です。`;
 else if(day<=30)t=`いまは始めて${day}日目です。1日1回、1食3品（主食・主菜・副菜）までが目安です。主菜は豆腐・白身魚などから。`;
 else t=`いまは始めて${day}日目です。1食3品（主食・主菜・副菜）までが目安で、食事は1日${qSuggestMeals[info.stage]||(day<=120?2:3)}回が目安です。`;
 return `<p class="small muted tStepLine">${t}</p>`;
}
// 1.4.3: 設定画面のプロフィール付近に出す「いまの計算に効いている始めた日」の1行。数え方は今日画面の tStepLine と同じ qStartInfo（今日の日付）で、日数も同じ値になる。
// 始めた日が未設定で一番古い食事の記録から数えているとき・時期から決めているとき・どちらも無いときは、その旨が分かる文言にする。保存はしない。
function qStartNowLine(d=jstDate()){
 const i=qStartInfo(d),md=v=>{const [,m,dd]=v.split('-');return Number(m)+'月'+Number(dd)+'日'},nth=i.day>0?i.day+'日目':'まだ始める前の日付です';let t;
 if(i.source==='profile')t=`いまの計算：始めた日 ${md(i.start)}（${nth}）`;
 else if(i.source==='record')t=`いまの計算：始めた日が未設定のため、最初の記録（${md(i.start)}）から数えています（${nth}）`;
 else if(i.source==='period')t=`いまの計算：始めた日が未設定のため、今の時期（${i.stage}）から品数を決めています`;
 else t='いまの計算：始めた日も食事の記録もまだ無いため、日数では数えていません';
 return `<p class="small muted qStartNow">${esc(t)}</p>`;
}
// 対象の献立が無いものとして計算した、その日のその食事の提案。エンジン（qSuggest）の組み立ては変えず、同期計算の間だけ献立を外して戻す（画面には出ない）。
// 1.4.6 からは、食材を全部外した跡（tIsHusk）の枠にプレビューを戻すために使う（旧「おすすめに変える」用）。記録済み・準備済みの食事には使わない。
function tReplaceMeal(d,slot,planId){const plans=state().plans,i=plans.findIndex(p=>p.id===planId);if(i<0)return null;const removed=plans[i];plans.splice(i,1);try{return tSuggestFor(d)?.meals.find(m=>m.slot===slot&&!m.taken&&m.add.length)||null}finally{plans.splice(i,0,removed)}}
// 1.4.0: 旧 todayMealsBlock（今日のメニュー）と旧 todayUpcomingBlock（これからのメニュー）は todayMenuBlock（下）に統合した。
// メニューの明日〜6日後（1.2.0 の「これからのメニュー」を 1.4.0 で「メニュー」に統合）。日ごとに、日付と各食事の食材名だけ。献立があればその食材、無ければ使い切り提案（qSuggest、明日から）のプレビュー。
// 提案が作れない食事がある日は「ストックが足りません」の1行だけ（理由の長文は出さない）。提案の決め方は折りたたみの中に残す。
// 1.2.1: 日付を押すとその日がその場で開き（view.upOpen）、食事ごとに「おすすめに変える／おすすめを入れる」「食材を足す／変える」が押せる（開く→押すだけ）。
// 使う食事の外の枠の献立は、1.4.2（要望3）から今日画面には出さない（データは残し、使う食事に戻せば通常どおり出る）。
// 1.3.0: 開いた日の各食事にも、カードと同じ「×」（外す）・「＋ 食材を足す」・「おすすめに変える」（空きはプレビュー＋「入れる」）を出す。
// 1.4.6: 操作を整理（「おすすめに変える」「入れる」「献立を追加」を廃止）。空き枠のおすすめはプレビュー自体のタップで入れ（閉じた行からでも1タップ）、
// 自分の食材は「自分で食材を選ぶ」から。献立がある枠は「×」・「＋ 食材を足す」・編集フォームの入口だけ。
// 1.4.0: 日の欄全体がタップ対象（見出しに「直す」は付けない）。「この日のおすすめを入れる」（suggestPlan）も開いた中に出し、欄の外には「直す」系のボタンを置かない。
function tUpActions(d,slot,p,m){
 // 1.4.6: 「おすすめに変える」と空き枠の「献立を追加」は廃止。空き枠（献立なし・全部外した跡）は「自分で食材を選ぶ」だけ
 // （おすすめの採用はプレビュー自体のタップに一本化）。献立がある枠は「＋ 食材を足す」＋編集フォームの入口だけ。
 if(!p||tIsHusk(p))return `<span class="tUpActions">${tAddButton(d,slot,'自分で食材を選ぶ')}</span>`;
 return `<span class="tUpActions">${tInlineEditable(p)?tAddButton(d,slot):''}${tEditMealButton(d,slot)}</span>`;
}
// 1.3.0: on=一週間のおすすめを出す（weekSuggest）。出さないときは提案（s）を使わず、実際の献立だけを出す（空の日は「献立なし」だけ）。
function tUpcomingDay(d,s,on=true){
 const day=on?s?.days.find(x=>x.date===d):null,ps=meals(d),open=view.upOpen===d;let short=false;
 const rows=tSlots(d).map(slot=>{
  const p=ps.find(x=>x.slot===slot),dr=tPlanDraft(d,slot),m=p?null:day?.meals.find(x=>x.slot===slot),act=()=>!open?'':dr?`<span class="tUpActions">${tAddButton(d,slot)}${tDraftButtons(d,slot)}</span>${tAddPicker(d,slot)}`:tUpActions(d,slot,p,m)+(tInlineEditable(p)?tAddPicker(d,slot):'');
  // 1.4.5（要望A）: 閉じた状態では、食材名の並び自体をボタンにして、行をタップしてもその日が開くようにする（従来は日付の見出しだけがタップ対象で、行を押しても何も起きなかった）。
  const namesBox=inner=>open?`<span class="tUpNames">${inner}</span>`:`<button class="tUpNames tUpOpenBtn" data-t="up-open" data-date="${d}" aria-label="${esc(dateLabel(d))}の${slots[slot]}を開く">${inner}</button>`;
  // 1.4.7: 下書きがある間は、下書きの食材（チップ）で描き、「決定／戻る」を出す。保存済みの献立は変えない。
  if(dr){const shown=open&&dr.names.length?dr.names.map(x=>`<span class="tChip">${esc(x)}${tRemoveButton(d,slot,x)}</span>`).join(''):esc(dr.names.length?dr.names.join('・'):'食材なし');return `<li class="tUpSlot"><span class="tUpLabel">${slots[slot]}</span>${namesBox(shown)}${act()}</li>`}
  if(p&&!tIsHusk(p)){const n=tMealNames(p,record(p)),plain=n.length?n.map(x=>{const a=tPlanAmount(p,x);return esc(x)+(a?`<small class="tAmt">（${esc(a)}）</small>`:'')}).join('・'):esc(p.title),shown=open&&tInlineEditable(p)&&n.length?n.map(x=>`<span class="tChip">${esc(x)}${tRemoveButton(d,slot,x)}</span>`).join(''):plain;return `<li class="tUpSlot"><span class="tUpLabel">${slots[slot]}</span>${namesBox((tFromSuggest(p)?tSuggestMark:'')+shown)}${act()}</li>`}
  // 1.4.6: 空き枠のおすすめは、閉じた行でも開いた行でもプレビュー自体がボタン（タップ＝入れる）。日を開かずに1タップで入る。
  // 1.5.0（追補）: 「出さない」の間は殻の枠にもプレビューを出さない（取り除いた食事が空に見えるように。出すときだけ tReplaceMeal で戻す）。
  const m2=on?(p?tReplaceMeal(d,slot,p.id):m):null;
  if(m2&&!m2.taken&&m2.add.length)return `<li class="tUpSlot tUpSuggest"><span class="tUpLabel">${slots[slot]}</span>${tPreviewButton(m2,d,slot,'up','tUpNames tUpSuggestBtn')}${act()}</li>`;
  if(on&&(!m||!m.items.length))short=true;return open?`<li class="tUpSlot"><span class="tUpLabel">${slots[slot]}</span><span class="tUpNames"><small>${on?'まだありません':'献立なし'}</small></span>${act()}</li>`:'';
 }).join(''); // 1.4.2（要望3）: 使う食事の外の献立の1行（「（使う食事に入っていません）」）は今日画面に出さない（データは消さない）
 // 1.4.1（全体監査）: 「献立なし」は、その日に献立が1つも無いときだけ。使う食事の外の献立だけがある日は、外の1行が出るので同時に出さない。
 const can=Boolean(day?.meals.some(m=>!m.taken&&m.add.length)),none=!on&&!open&&!ps.some(p=>!tIsHusk(p));
 return `<li class="tUpDay${open?' open':''}" data-up-date="${d}"><div class="tUpHead"><button class="tUpDate" data-t="up-open" data-date="${d}" aria-expanded="${open}" aria-label="${esc(dateLabel(d))}のメニューを${open?'閉じる':'開く'}"><b>${esc(dateLabel(d))}</b></button></div>${rows?`<ul class="tUpSlots">${rows}</ul>`:''}${open&&can?`<div class="tUpDayActions"><button class="tUpAddIn" data-action="suggestPlan" data-date="${d}" aria-label="${esc(dateLabel(d))}のおすすめを献立に入れる" data-edit>この日のおすすめを入れる</button></div>`:''}${short?'<p class="small muted tUpShort">ストックが足りません</p>':''}${none?'<p class="tUpShort"><button class="tUpOpenBtn tUpSelfAdd" data-t="up-open" data-date="${d}" aria-label="${esc(dateLabel(d))}を開いて自分で食材を入れる">＋ 自分で入れる</button></p>':''}</li>`;
}
// ===== 1.4.0: 今日とこれからを1つの「メニュー」に統合 =====
// 見出しは「メニュー」1つ。冒頭に使う食事・1食の品数・一週間のおすすめの切り替えを置き、今日（開いた状態・カード＋「食べた」）→明日〜6日後（日タップで開く）の順に並べる。
// 内側の id（todayMeals / todayUpcoming）は、今日の分・これからの分の範囲の目印として div に残す。
// 「自分で選んで記録」の入口「メニューにないものを記録」は、1.4.2（要望3）で記録タブの先頭へ移した（開く先は従来の自由記録）。
// 使う食事の外の枠の献立（tOutsideMarkup）も 1.4.2 から今日画面には出さない（データは消さない）。
// on=一週間のおすすめを出す（weekSuggest）。出さないときは提案（s）を使わず、実際の献立だけを出す。
function todayMenuBlock(day=tSuggestFor(view.date)){
 const d=view.date,on=qWeekSuggestOn(),s=on?qSuggest():null,days=Array.from({length:6},(_,i)=>plusDate(jstDate(),i+1));
 return `<section class="tBlock tMenu" id="todayMenu" aria-labelledby="menuTitle"><h2 id="menuTitle">メニュー</h2>${tMealSlotsBar(d)}${tItemsBar()}${tWeekToggle()}${tSameFoodNote(d)}${quickStaleNote?`<p class="qNewFoodNote qStaleNote" role="status">${esc(quickStaleNote)}</p>`:''}<div id="todayMeals" class="tMenuToday"><div class="tMenuDayHead"><b>${esc(dateLabel(d))}</b>${d===jstDate()?'<span class="tMenuTodayMark">今日</span>':''}</div>${tSlots(d).map(slot=>tMealMarkup(d,slot,day)).join('')}</div><div id="todayUpcoming" class="tMenuWeek"><ul class="tUpDays">${days.map(x=>tUpcomingDay(x,s,on)).join('')}</ul>${s&&s.unknown.length?`<p class="small muted tUpUnknown">主食・主菜・副菜が分からず、メニューに使っていないストック：${esc(s.unknown.join('・'))}（冷凍庫のカードの「含まれる食材を直す」で使えます）</p>`:''}${s?`<details class="tUpWhy"><summary>おすすめの決め方</summary>${qSuggestFactsMarkup(s,true)}</details>`:''}</div></section>`;
}
// 期限が近いストック。冷凍庫から期限が近い順に最大3件、名前と「あと○日」だけ。押すとカードの詳細が開く。
function todayStockBlock(){const list=stockSorted(state().batches.filter(b=>b.quantity>0&&stockExpiry(b))).slice(0,3);return `<section class="tBlock tStock" id="todayStock" aria-labelledby="todayStockTitle"><h2 id="todayStockTitle">目安が近いストック</h2>${list.length?list.map(b=>`<button class="tStockRow" data-action="stockDetail" data-id="${b.id}"><span>${esc(b.name)}</span>${stockBadge(b)}</button>`).join('')+'<p class="small muted">「あと○日」は作った日から7日の目安です。</p>':'<p class="small muted">目安が近いストックはありません。</p>'}</section>`}
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
function qBumpFor(i){if(!i)return null;const prev=qPrevAmount(i.name);if(!prev||!quickUnits.includes(prev.unit)||i.unit!==prev.unit)return null;const next=Math.round((Number(prev.amount)+(prev.unit==='小さじ'?1:5))*100)/100;return Number.isFinite(next)&&next<=9999?{prev,amount:String(next),unit:prev.unit}:null}
function qBumpAmount(row){return qBumpFor(qDraft().items[row])}
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
function qWeekSection(jump=true){const end=view.date>jstDate()?jstDate():view.date;const days=Array.from({length:7},(_,i)=>plusDate(end,-i));const entries=qWeekEntries();const weekday=d=>new Intl.DateTimeFormat('ja-JP',{weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(d+'T12:00:00+09:00'));return `<section class="qWeek" id="weekHistory" aria-labelledby="weekTitle"><div class="qWeekHeader"><div><h2 id="weekTitle">一週間の食事</h2><p>${Number(days[6].slice(5,7))}/${Number(days[6].slice(8))}〜${Number(end.slice(5,7))}/${Number(end.slice(8))}・食べたものと量</p></div>${jump?'<button class="linkButton" data-q="input-jump">入力へ戻る</button>':''}</div>${qWeekSummaryMarkup(days[6],end)}<table class="qWeekTable"><caption class="srOnly">${esc(end)}を含む過去七日間の食事記録</caption><colgroup><col class="qWeekDateCol"><col><col><col></colgroup><thead><tr><th scope="col">日付</th><th scope="col">朝</th><th scope="col">昼</th><th scope="col">${slots.dinner}</th></tr></thead><tbody>${days.map(d=>`<tr class="${d===jstDate()?'today':''}"><th scope="row"><time datetime="${d}">${Number(d.slice(5,7))}/${Number(d.slice(8))}<small>${weekday(d)}</small>${d===jstDate()?'<em>今日</em>':''}</time></th>${Object.keys(slots).map(slot=>{const list=entries.filter(x=>x.date===d&&x.plan.slot===slot).sort((a,b)=>(a.record.eatenAt||a.record.recordedAt||'').localeCompare(b.record.eatenAt||b.record.recordedAt||''));return `<td data-week-date="${d}" data-week-slot="${slot}" data-meal-label="${slots[slot]}" class="${view.date===d&&qSlot()===slot?'currentMeal':''}">${list.length?list.map(x=>qWeekRecordMarkup(x.record)).join(''):'<span class="qWeekEmpty">未記録</span>'}</td>`}).join('')}</tr>`).join('')}</tbody></table></section>`}
function qWeekDetail(r){const p=state().plans.find(p=>p.id===r.planId);openDialog(`<h2>${dateLabel(qRecordDay(r,p))}・${slots[p.slot]}ごはん</h2><div class="qWeekDetail">${qWeekLines(r).map(i=>`<div><b>${esc(i.name)}</b><strong>${esc(i.amount)}${i.notEaten?'（食べず）':''}</strong></div>`).join('')}</div>${r.memo?`<p class="hint">${esc(r.memo)}</p>`:''}${r.symptom?`<p class="hint">観察メモ：${esc(r.symptom)}</p>`:''}<p class="formHint">${esc(r.actor)}が記録。${r.eatenAt?'食事時刻 '+dateTimeLabel(r.eatenAt):'食事時刻は未入力'}</p>${editable()?`<div class="buttonrow"><button data-q="edit-record" data-id="${r.id}">食材・量を訂正</button><button data-action="detail" data-id="${p.id}">様子を補足</button><button data-q="record-remove" data-id="${r.id}">この食事の記録を消す</button></div>`:''}`)}
// 記録を消して「未記録」に戻す確認。削除そのものは local-store の removeRecord（取り出し済みなら在庫も戻す）。直後は通知の「取り消す」で復元できる。
function qRemoveRecordConfirm(r){const p=state().plans.find(p=>p.id===r.planId);if(!p)return;openDialog(`<h2>記録を消しますか</h2><p>${esc(dateLabel(qRecordDay(r,p)))}・${slots[p.slot]}ごはん（${esc(r.actualTitle||p.title)}）の記録を消して、未記録に戻します。</p>${p.prepared?'<p>冷凍庫から取り出した分は、在庫に戻します。</p>':''}<p class="formHint">消した直後は、画面下の「取り消す」でもとに戻せます。</p><div class="buttonrow"><button data-action="close">やめる</button><button class="primary" data-q="record-remove-do" data-id="${r.id}">記録を消す</button></div>`)}
// 量の選択が直す対象。下書きの行（通常）か、記録済みの行の直接編集（quickDirect・1.4.1 症状B）か、記録への食材の追加（quickRecAdd・1.4.4 要望1）か。
function qAmountItem(row){return quickDirect?quickDirect.item:quickRecAdd?quickRecAdd.item:qDraft().items[row]}
function qAmountMarkup(row){const i=qAmountItem(row),unit=i.unit||qDefaultUnit(),first=qFirstEatenOn(i.name),guide=qGuideText(i.name),bump=qBumpFor(i);return `<h2>${esc(i.name)}の量</h2><p class="formHint">実際に食べた量を選びます。</p><p class="qFoodNote">${first?'はじめて食べた日：'+esc(dateLabel(first)):'はじめての食材です。様子を見ながら少しずつ。'}</p>${guide?`<p class="qGuide">${esc(guide)}</p>`:''}${bump?`<div class="qBumpRow"><span>前回 ${esc(qAmount(bump.prev))} を食べました。</span><button class="qBump" data-q="bump" data-row="${row}" data-amount="${esc(bump.amount)}">少し増やす：${esc(qAmount(bump))}</button></div>`:''}<div class="qAmountPicker"><div class="qUnitRow" role="group" aria-label="単位">${quickUnits.map(u=>`<button data-q="unit" data-unit="${u}" data-row="${row}" aria-pressed="${i.unit===u}">${u}</button>`).join('')}</div><div class="qQuantities">${(unit==='小さじ'?['0','0.5','1','2','3','4','5']:['0','5','10','15','20','30','40','50','60','80','100']).map(v=>`<button data-q="quantity" data-row="${row}" data-amount="${v}" aria-pressed="${String(i.amount)===v}">${esc(qAmount({amount:v,unit}))}</button>`).join('')}</div><div class="qExact"><label for="qExact${row}">ほかの量</label><input id="qExact${row}" data-q-exact="${row}" type="number" min="0" max="9999" step="0.01" inputmode="decimal" value="${i.amount??''}" aria-label="${esc(i.name)}の量"><button data-q="exact-done">この量にする</button></div><button class="linkButton full" data-q="unknown" data-row="${row}">量を入力せず続ける</button></div>`}
function qOpenAmount(row){quickAmountRow=quickDirect?null:row;const html=qAmountMarkup(row);if($('#dialog').open&&$('#dialog').dataset.quickAmount){$('#dialogBody').innerHTML='<div id="dialogError" class="dialogError" role="alert"></div>'+html}else{openDialog(html);$('#dialog').dataset.quickAmount='yes'}}
function qCloseAmount(){if($('#dialog').dataset.quickAmount){delete $('#dialog').dataset.quickAmount;closeDialog()}quickAmountRow=null;quickDirect=null;quickRecAdd=null}
function quickRecovered(operation){if(operation.action==='quickLog'){quickAmountRow=null;render()}}
function quickDock(){const d=qDraftView();if(!d.items.length)return '';return `<section class="dock qDock"><div class="qDraftSummary"><b>${esc(qSummary(d.items))}</b><small>未保存・${dateLabel(view.date)}・${slots[qSlot()]}ごはん${d.items.some(i=>i.amount==null)?' ／ 量未入力あり':''}</small><button class="linkButton" data-q="clear" data-edit>やめる</button></div><button class="primary" data-q="save" data-edit ${busy||pendingMutation?'disabled':''}>${d.replace?'この内容に訂正':qApplied(d.items)?'おかわりとして追加':qRecord()?'この食材・量を追加':'この食材・量で記録'}</button></section>`}
function qSetItems(source,id){return source==='template'?state().templates.find(t=>t.id===id)?.items:state().records.find(r=>r.id===id)?.items}
function qFill(items){const d=qDraft();d.items=qEditableItems(items).map(i=>({...i,fromPrevious:true}));quickAmountRow=null;render();document.querySelector('.qBasket')?.scrollIntoView({block:'nearest',behavior:'instant'})}
async function qSave(items,options={}){const date=view.date,slot=qSlot(),key=qKey();if(options.fromDraft&&qDraftStale(key,quickDrafts.get(key))){qDropStaleDrafts();render();showError('献立の内容が変わったため、記録しませんでした。今の献立から選び直してください。');return false}const ok=await mutate('quickLog',{date,slot,items:qItems(items),replace:Boolean(options.replace),recordId:options.recordId||undefined,allowRepeat:Boolean(options.allowRepeat),expectedRecord:options.replace?options.baseRecord:undefined},options.replace?'食材と量を訂正しました。在庫は変えていません。':'食材と量をまとめて記録しました。',{draftKey:options.fromDraft?key:null,draftValue:options.fromDraft?JSON.stringify(qDraft()):null});
 // 1.4.1（症状A）: 訂正の保存が「下書きの控えが古い」ために失敗したときは、行き止まりにしない。最新の記録で訂正を開き直し（下書きを作り直し）、
 // その場でもう一度押せば続けられるようにする。mutate が競合時に読み直した最新の状態で判定するので、古さが原因でない失敗では何もしない。
 if(!ok&&options.replace){const d=quickDrafts.get(key);if(d&&d.replace){const r=state().records.find(x=>x.id===d.recordId);if(r&&JSON.stringify(r)!==JSON.stringify(d.baseRecord)){quickDrafts.set(key,qDraftFromRecord(r));quickAmountRow=null;render();showStatus('記録が新しくなっていたため、最新の記録で訂正を開き直しました。内容を確認して、もう一度「この内容に訂正」を押してください。');return false}if(!r){quickDrafts.delete(key);quickAmountRow=null;render();showStatus('訂正していた記録が無くなったため、訂正の入力を消しました。');return false}}}
 if(ok){if(options.fromDraft)quickDrafts.delete(key);quickAmountRow=null;render()}return ok}
// 量の選択で量を決めたとき（1.3.1）。訂正（replace）の下書きなら、下書き（食材・量の一式）ごとその場で保存し、量の画面も閉じる。
// 背後の「この内容に訂正」をもう一度押す二度手間を無くす。様子・メモは別の保存（recordForm）で即時保存される仕組みなので、
// ここで一緒に保存する未保存分はクイック下書きだけ。新規の記録の下書き（複数食材の組み立て途中）は従来どおり、量を入れて閉じるだけ。
// 保存まで終わったら true（保存に失敗したら量の画面は閉じず false）。
async function qAmountDecided(){const d=qDraft();if(!d.replace||!d.items.length)return false;const ok=await qSave(d.items,{...d,fromDraft:true,allowRepeat:false});if(ok)qCloseAmount();return ok}
// 量を決めたときの保存先。訂正の下書きなら従来どおり下書きごと保存し（qAmountDecided）、記録済みの行の直接編集ならその食材だけを即保存し（qDirectDecided）、
// 記録への食材の追加なら、その食材を記録に足して即保存する（qRecAddDecided・1.4.4 要望1）。
async function qAmountSettled(){if(quickDirect)return qDirectDecided();if(quickRecAdd)return qRecAddDecided();return qAmountDecided()}
// 1.4.4（要望1）: 記録済みの行の ＋ で選んだ食材を、決めた量で記録に足して即保存する。保存の直前に記録を読み直して控え（expectedRecord）にするため古さでは失敗しない。
// ほかの食材・様子・メモは変えず、在庫も変えない（訂正と同じ扱い）。通知の「取り消す」で戻せる。
async function qRecAddDecided(){const qa=quickRecAdd;if(!qa)return false;const r=state().records.find(x=>x.id===qa.recordId);
 if(!r){quickRecAdd=null;showError('記録が見つかりませんでした。表示を新しくしました。');render();return false}
 const items=qEditableItems(r.items&&r.items.length?r.items:r.foodIds.map(foodId=>({foodId,amount:null,unit:''})));
 if(items.some(i=>i.name===qa.name)){quickRecAdd=null;showError('その食材は記録に入っています。表示を新しくしました。');render();return false}
 items.push({name:qa.name,amount:qa.item.amount,unit:qa.item.amount==null?'':(qa.item.unit||qDefaultUnit())});
 const ok=await mutate('quickLog',{date:qa.date,slot:qa.slot,items:qItems(items),replace:true,recordId:r.id,expectedRecord:JSON.parse(JSON.stringify(r))},qa.name+'を記録に足しました。在庫は変えていません。');
 if(ok){quickRecAdd=null;qCloseAmount()}return ok}
// 1.4.1（症状B）: 記録済みの食材の量だけを、その場で保存する。もとの記録は保存の直前に読み直して控え（expectedRecord）にするため、
// 開いている間に記録が変わっていても古さで失敗しない。ほかの食材・様子・メモは変えず、在庫も変えない。
// 記録済みの1食材だけの量を、その場で保存する共通処理（1.4.1 の直接編集で使用）。
// もとの記録は保存の直前に読み直した控え（expectedRecord）で送るため、古さでは失敗しない。ほかの食材・様子・メモ・在庫は変えない。
async function qDirectSave(date,slot,r,name,amount,unit,message){const items=qEditableItems(r.items&&r.items.length?r.items:r.foodIds.map(foodId=>({foodId,amount:null,unit:''}))),it=items.find(i=>i.name===name);if(!it)return false;it.amount=amount;if(amount!=null)it.unit=unit||qDefaultUnit();return mutate('quickLog',{date,slot,items:qItems(items),replace:true,recordId:r.id,expectedRecord:JSON.parse(JSON.stringify(r))},message)}
async function qDirectDecided(){const qd=quickDirect;if(!qd)return false;const r=state().records.find(x=>x.id===qd.recordId);
 if(!r){quickDirect=null;showError('記録が見つかりませんでした。表示を新しくしました。');render();return false}
 const items=qEditableItems(r.items&&r.items.length?r.items:r.foodIds.map(foodId=>({foodId,amount:null,unit:''}))),it=items.find(i=>i.name===qd.name);
 if(!it){quickDirect=null;showError('その食材は記録にありませんでした。表示を新しくしました。');render();return false}
 const ok=await qDirectSave(qd.date,qd.slot,r,qd.name,qd.item.amount,qd.item.unit,qd.name+'の量を直しました。在庫は変えていません。');
 if(ok){quickDirect=null;qCloseAmount()}return ok}
// 1.4.4（要望1）: 記録済みの行の − ＋（欄＝食材そのものの増減）。1.4.2 の量ステッパー（tStepAmount）は廃止した。
// その食事の訂正が途中のときは、下書きと競合するので保存せず、訂正を終えるよう案内する（v1.4.1 の直接編集の保護と同じ）。
function qRecordDraftBusy(date,slot,r){const draft=quickDrafts.get(date+'|'+slot);return Boolean(draft?.replace&&draft.recordId===r.id)}
const qDraftBusyMessage='この食事は訂正の途中です。下の「この内容に訂正」で保存するか、「やめる」を押してから操作してください。';
// − : その食材をその食事の記録から取り除いて即保存する（quickLog の上書き1回。通知の「取り消す」で戻せる。在庫は変えない＝訂正と同じ扱い）。
// 最後の1食材のときは、その食事の記録自体を消す（removeRecord 1回・取り消し可）。ただし冷凍庫から取り出し済みの食事は、
// 記録を消すと取り出した分が在庫に戻ってしまい「在庫は変えない」に反するため、消さずに既存の確認画面（記録を消しますか）へ案内する。
async function tRowRemove(date,slot,name){
 const p=meals(date).find(x=>x.slot===slot),r=p&&record(p);if(!r||!tRecordedItem(r,name)){render();return false}
 if(qRecordDraftBusy(date,slot,r)){showError(qDraftBusyMessage);return false}
 const items=qEditableItems(r.items&&r.items.length?r.items:r.foodIds.map(foodId=>({foodId,amount:null,unit:''}))).filter(i=>i.name!==name);
 if(!items.length){
  if(p.prepared){qRemoveRecordConfirm(r);return false}
  view.recAddOpen=null;
  return mutate('removeRecord',{id:p.id},name+'はこの食事の最後の食材だったので、'+slots[slot]+'の記録を消しました（未記録に戻しました）。在庫は変えていません。');
 }
 return mutate('quickLog',{date,slot,items:qItems(items),replace:true,recordId:r.id,expectedRecord:JSON.parse(JSON.stringify(r))},name+'を記録から外しました。在庫は変えていません。');
}
// ＋ で開く食材の選択。献立カードの「＋ 食材を足す」（tAddPicker）と同じ並び：ストック（残り個数つき・期限が近い順）を先に、続いて食材の一覧。
// 記録にすでに入っている食材は出さない。在庫は見せるだけで、選んでも減らさない（訂正と同じ扱い）。
function tRecAddPicker(d,slot){
 if(view.recAddOpen!==d+'|'+slot)return '';
 const p=meals(d).find(x=>x.slot===slot),r=p&&record(p);if(!r)return '';
 const have=new Set((r.items?.length?r.items.map(qName):r.foodIds.map(id=>food(id)?.name)).filter(Boolean)),attrs=`data-date="${d}" data-slot="${slot}"`;
 const stock=stockSorted(state().batches.filter(b=>b.quantity>0)).filter(b=>!qStockNames(b).every(n=>have.has(n))),inStock=new Set(stock.flatMap(qStockNames));
 const hidden=new Set(state().foods.filter(f=>f.quickHidden).map(f=>f.name));
 const master=[...new Set([...state().foods.map(f=>f.name),...Object.values(qFoodGroups).flat(),...Object.keys(qSuggestExtraRoles)])].filter(n=>!have.has(n)&&!inStock.has(n)&&!hidden.has(n));
 return `<div class="tAddPick" data-rec-add-pick="${d}|${slot}"><div class="tAddPickHead"><b>${esc(slots[slot])}の記録に足す食材</b><button class="linkButton" data-t="row-add" ${attrs} aria-expanded="true">閉じる</button></div>${stock.length?`<p class="tAddHead">ストック</p><div class="tAddList">${stock.map(b=>`<button class="tAddItem tAddStock" data-t="rec-pick" ${attrs} data-batch="${b.id}" data-edit><span>${esc(b.name)}</span><small>残り${b.quantity}個</small></button>`).join('')}</div>`:''}<p class="tAddHead">食材</p><div class="tAddList">${master.map(n=>`<button class="tAddItem" data-t="rec-pick" ${attrs} data-name="${esc(n)}" data-edit>${esc(n)}</button>`).join('')}</div></div>`;
}
// ＋ の選択先。食材が1つなら量の選択（前回量／目安／量なし＝qOneTap の初期値）を開き、決めたら即保存する（qRecAddDecided）。
// ストックに食材が複数あるときは、1食材ずつ量の画面を出さず、前回量／目安（どちらも無ければ量なし）でまとめて足す。どちらも在庫は変えない。
async function tRecPick(date,slot,batchId,name){
 const p=meals(date).find(x=>x.slot===slot),r=p&&record(p);if(!r){view.recAddOpen=null;render();return false}
 if(qRecordDraftBusy(date,slot,r)){showError(qDraftBusyMessage);return false}
 const b=batchId?batch(batchId):null;if(batchId&&(!b||b.quantity<=0)){showError('このストックは残りがありません。表示を新しくしました。');view.recAddOpen=null;render();return false}
 const names=b?qStockNames(b):[String(name||'').trim()].filter(Boolean);
 const have=new Set((r.items?.length?r.items.map(qName):r.foodIds.map(id=>food(id)?.name)).filter(Boolean)),add=names.filter(n=>!have.has(n));
 if(!add.length){showStatus('その食材は記録に入っています。');return false}
 view.recAddOpen=null;
 if(add.length===1){const t=qOneTap(add[0]);quickRecAdd={recordId:r.id,date,slot,name:add[0],item:{name:add[0],amount:t.amount,unit:t.unit||qDefaultUnit()}};quickAmountRow=null;render();qOpenAmount(-1);return true}
 const items=qEditableItems(r.items&&r.items.length?r.items:r.foodIds.map(foodId=>({foodId,amount:null,unit:''})));
 for(const n of add){const t=qOneTap(n);items.push({name:n,amount:t.amount,unit:t.amount==null?'':t.unit})}
 return mutate('quickLog',{date,slot,items:qItems(items),replace:true,recordId:r.id,expectedRecord:JSON.parse(JSON.stringify(r))},add.join('・')+'を記録に足しました。在庫は変えていません。');
}
// 1.4.1（症状B）: 記録済みの食材の行から量の選択を開く（直接編集）。下書きは作らないので、訂正ドックは出ない。
function qDirectOpen(date,slot,r,name){const rec=tRecordedItem(r,name);if(!rec)return false;quickDirect={recordId:r.id,date,slot,name,item:{name,amount:rec.amount,unit:rec.unit||qDefaultUnit()}};quickAmountRow=null;render();qOpenAmount(-1);return true}
async function qPin(items){const data=qItems(items);if(state().templates.some(t=>qSignature(t.items)===qSignature(data))){showStatus('この組み合わせは固定済みです。');return}await mutate('template',{items:data},'いつもの一食に固定しました。次回はカード一回で記録できます。')}
// 記録から訂正用の下書きを作る。控え（baseRecord）は、保存時に「開いてから記録が変わっていないか」の検出に使う。
function qDraftFromRecord(r){return {items:qEditableItems(r.items||r.foodIds.map(foodId=>({foodId,amount:null,unit:''}))),replace:true,recordId:r.id,baseRecord:JSON.parse(JSON.stringify(r)),planSig:null}}
// 記録済みの一食を、訂正用の下書き（replace）にする。保存は従来どおり quickLog の replace（expectedRecord で別タブの変更を検出）。
function qEditDraft(r){const draft=qDraft();Object.assign(draft,qDraftFromRecord(r));return draft}
// 1.4.1（症状A）: アプリ自身の保存で記録が変わったら、開いている訂正の下書きを最新の記録に追随させる。
// 古い控えのままだと、保存のたびに「別のタブで変更されています」で失敗し続けて行き止まりになるため。記録が消えていたら下書きも消す。
// 変えたら true。量の選択を開いている枠の下書きは、その保存の流れ（qAmountDecided→qSave）に任せて触らない。
function qSyncReplaceDrafts(){let changed=false;for(const [key,d] of [...quickDrafts]){if(!d.replace||!d.recordId)continue;if(key===qKey()&&$('#dialog').dataset.quickAmount)continue;const r=state().records.find(x=>x.id===d.recordId);if(!r){quickDrafts.delete(key);quickStaleNote='訂正していた記録が無くなったため、訂正の入力を消しました。';changed=true;continue}if(JSON.stringify(r)!==JSON.stringify(d.baseRecord)){quickDrafts.set(key,qDraftFromRecord(r));quickStaleNote='記録が新しくなったため、訂正の内容を最新の記録に合わせました。';changed=true}}return changed}
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
// 行を押したときの調整。従来の量の選択（qOpenAmount）を開く。未記録は保存を下の「この食材・量で記録」で行い、
// 記録済み（訂正）の下書きは量を決めた時点で下書きごと保存する（1.3.1・qAmountDecided）。
function tAdjust(date,slot,name){
 view.quickSlot=slot;quickStaleNote='';const p=meals(date).find(x=>x.slot===slot),r=p&&record(p);let d=qDraft();
 // 1.4.1（症状B）: 記録済みの食材の行は、訂正ドックを経由せず、その食材の量だけを直接直して即保存する。その食事の訂正が途中のときは、従来どおり下書きの中で直す。
 if(r&&tRecordedItem(r,name)&&!(d.replace&&d.recordId===r.id)&&qDirectOpen(date,slot,r,name))return;
 if(r&&tRecordedItem(r,name)&&!(d.replace&&d.recordId===r.id)){const pending=d.replace?[]:d.items.slice();d=qEditDraft(r);for(const i of pending)if(!d.items.some(x=>x.name===i.name))d.items.push(i)}
 let n=d.items.findIndex(i=>i.name===name);
 if(n<0){const t=qOneTap(name);d.items.push({name,amount:t.amount,unit:t.unit||qDefaultUnit(),fromPrevious:t.source==='previous'});n=d.items.length-1}
 if(!d.replace&&p&&!p.quickCreated&&!d.planSig)d.planSig=qPlanSig(p);
 quickAmountRow=null;render();qOpenAmount(n);
}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-t]');if(!b||b.disabled||!current)return;const a=b.dataset.t;
 if(a==='spine-toggle'){spineSetOn(!spineOn());render();return}
 if(a==='spine-skip'){spineSkip(b.dataset.plan,b.dataset.name);return}
 if(a==='spine-carry'){spineCarry(b.dataset.plan,b.dataset.name,b.dataset.from);return}
 if(a==='spine-recipe'){spineRecipeOpen(b.dataset.dish);return}
 if(a==='free'){view.todayFree=!view.todayFree;render();if(view.todayFree)qJump($('#freeComposer'));return}
 if(a==='free-slot'){view.quickSlot=b.dataset.slot;view.todayFree=true;quickAmountRow=null;render();qJump($('#freeComposer'));return}
 // 1.4.0: メニュー内の小さなリンク「メニューにないものを記録」。1.4.2（要望3）で入口は記録タブの先頭へ移した。
 // 開く先は従来の自由記録（食材を選んで記録）で、食事の枠は指定しない。記録は今日分として開く。
 if(a==='free-menu'){view.page='today';view.todayMode='quick';view.todayFree=true;view.date=jstDate();quickAmountRow=null;render();qJump($('#freeComposer'));return}
 // 1.4.7: 日を閉じる／別の日を開くと、残っていた献立の下書きは捨てる（決定しない限り保存されない）。
 if(a==='up-open'){tClearPlanDrafts();view.upOpen=view.upOpen===b.dataset.date?null:b.dataset.date;render();return}
 if(a==='edit-meal'){if(slots[b.dataset.slot])tEditMeal(b.dataset.date,b.dataset.slot);return}
 // 1.3.0: カードの上の「＋ 食材を足す」（候補の開閉）・候補のタップ（足す）・食材の「×」（外す）。
 // 1.4.7: 足す・外すは下書きだけを変え、保存は「決定」（draft-ok）で1回だけ。「戻る」（draft-cancel）は下書きを捨てる。
 if(a==='add-open'){if(!slots[b.dataset.slot])return;const k=tAddOpenKey(b.dataset.date,b.dataset.slot);view.addOpen=view.addOpen===k?null:k;render();return}
 if(a==='add-food'){if(slots[b.dataset.slot])await tDraftAdd(b.dataset.date,b.dataset.slot,b.dataset.batch||'',b.dataset.name||'');return}
 if(a==='remove-food'){if(slots[b.dataset.slot])tDraftRemove(b.dataset.date,b.dataset.slot,b.dataset.name||'');return}
 if(a==='draft-ok'){if(slots[b.dataset.slot])await tDraftCommit(b.dataset.date,b.dataset.slot);return}
 if(a==='draft-cancel'){if(slots[b.dataset.slot])tDraftCancel(b.dataset.date,b.dataset.slot);return}
 // 古い表示（別の日付）のボタンでは記録しない。
 if((a==='ate'||a==='adjust'||a==='row-remove'||a==='row-add'||a==='rec-pick')&&b.dataset.date!==view.date){showError('表示している日と違うため記録しませんでした。表示を更新しました。');render();return}
 if(a==='ate')await tAte(b.dataset.date,b.dataset.slot,b.dataset.name);
 if(a==='adjust')tAdjust(b.dataset.date,b.dataset.slot,b.dataset.name);
 // 1.4.4（要望1）: 記録済みの行の − ＋（欄＝食材そのものの増減）。− は記録から外し、＋ は食材の選択を開く。
 if(a==='row-remove')await tRowRemove(b.dataset.date,b.dataset.slot,b.dataset.name);
 if(a==='row-add'){if(slots[b.dataset.slot]){const k=b.dataset.date+'|'+b.dataset.slot;if(view.recAddOpen===k){view.recAddOpen=null;render()}else{const p=meals(b.dataset.date).find(x=>x.slot===b.dataset.slot),r=p&&record(p);if(r&&qRecordDraftBusy(b.dataset.date,b.dataset.slot,r))showError(qDraftBusyMessage);else{view.recAddOpen=k;render()}}}}
 if(a==='rec-pick'){if(slots[b.dataset.slot])await tRecPick(b.dataset.date,b.dataset.slot,b.dataset.batch||'',b.dataset.name||'')}
});
// 1.4.8: 開いた未来の日の余白（チップ・ボタン・リンク・入力などの操作要素でない場所）をタップしたら、その日を閉じる。
// 閉じる動きは見出しの up-open と同じにする（下書きが残っていたら従来ルールどおり破棄。確認ダイアログは出さない）。
// 操作要素のタップは上の各リスナーが従来どおり処理するので、ここでは開閉しない。今日のカード（.tUpDay でない）には効かない。
// 1.5.6: 閉じた日も余白のタップで開く（「＋ 自分で入れる」のボタンだけでは範囲が狭く押しにくいという声。開く範囲を日の欄全体に広げる）。
document.addEventListener('click',e=>{
 if(!current)return;const t=e.target;if(!t||typeof t.closest!=='function')return;
 if(t.closest('button,a,input,select,textarea,summary,label,.tChip'))return;
 const day=t.closest('.tUpDay.open');if(day&&day.dataset&&day.dataset.upDate===view.upOpen){tClearPlanDrafts();view.upOpen=null;render();return}
 const closed=t.closest('.tUpDay');if(!closed||!closed.dataset||!closed.dataset.upDate||closed.dataset.upDate===view.upOpen)return;
 tClearPlanDrafts();view.upOpen=closed.dataset.upDate;render();
});
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-q]');if(!b||b.disabled)return;const a=b.dataset.q;if(!current)return;
 if(a==='input-jump'){$('#main').scrollTo(0,0);return}if(a==='week-record'){const r=state().records.find(r=>r.id===b.dataset.id);if(r)qWeekDetail(r);return}
 if(a==='record-remove'){const r=state().records.find(r=>r.id===b.dataset.id);if(r)qRemoveRecordConfirm(r);return}
 if(a==='record-remove-do'){const r=state().records.find(r=>r.id===b.dataset.id);if(r){const removed=await mutate('removeRecord',{id:r.planId},'記録を消しました。未記録に戻しました。');if(removed)closeDialog()}return}
 if(a==='legacy'){tClearPlanDrafts();view.todayMode='legacy';render();$('#main').scrollTo(0,0);return}if(a==='quick'){tClearPlanDrafts();view.todayMode='quick';render();$('#main').scrollTo(0,0);return}
 if(a==='catalog'){quickCatalogExpanded=!quickCatalogExpanded;render();return}
 if(a==='search'){quickSearchOpen=!quickSearchOpen;if(!quickSearchOpen)quickSearch='';render();if(quickSearchOpen)$('#quickSearch').focus();return}
 if(a==='slot'){view.quickSlot=b.dataset.slot;quickAmountRow=null;render();return}
 quickStaleNote='';
 const d=qDraft(),row=Number(b.dataset.row);
 // 1.5.2: はちみつを含む名前を足すときは注意のダイアログ（honeyAsk）を挟み、「分かった」（honey-add）で足す。外すときは出さない。
 if(a==='food'||a==='add-search'||a==='honey-add'){const name=a==='add-search'?quickSearch.trim():b.dataset.name;if(!name)return;if(name.length>60){showError('食材名は六十文字以内で入力してください。');return;}const found=d.items.findIndex(i=>i.name===name);if(a==='honey-add'){closeDialog();if(found>=0)return}else if(found<0&&honeyName(name)){honeyAsk(name);return}if(found>=0){d.items.splice(found,1);quickAmountRow=null}else{const item=qDefaults(name);d.items.push(item);quickAmountRow=item.amount==null?d.items.length-1:null}quickSearch='';quickSearchOpen=false;render();if(quickAmountRow!==null)qOpenAmount(quickAmountRow)}
 if(a==='food-amount'){let n=d.items.findIndex(i=>i.name===b.dataset.name);if(n<0&&honeyName(b.dataset.name)){honeyAsk(b.dataset.name);return}if(n<0){d.items.push(qDefaults(b.dataset.name));n=d.items.length-1}render();qOpenAmount(n)}
 if(a==='amount')qOpenAmount(row)
 if(a==='unit'){const it=qAmountItem(row);if(it&&it.unit!==b.dataset.unit){it.unit=b.dataset.unit;it.amount=null;it.fromPrevious=false}qOpenAmount(row)}
 if(a==='quantity'){const it=qAmountItem(row);it.amount=b.dataset.amount;if(!it.unit)it.unit=qDefaultUnit();it.fromPrevious=false;qRememberUnit(it.unit);if(!await qAmountSettled()){qCloseAmount();render()}}
 if(a==='bump'){const it=qAmountItem(row),n=qBumpFor(it);if(n){it.amount=n.amount;it.unit=n.unit;it.fromPrevious=false;qRememberUnit(n.unit);if(!await qAmountSettled()){qCloseAmount();render()}}}
 if(a==='unknown'){const it=qAmountItem(row);it.amount=null;it.fromPrevious=false;if(!await qAmountSettled()){qCloseAmount();render()}}
 if(a==='remove'){d.items.splice(row,1);quickAmountRow=null;render()}
 if(a==='clear'){quickDrafts.delete(qKey());quickAmountRow=null;render()}
 if(a==='save')await qSave(d.items,{...d,fromDraft:true,allowRepeat:!d.replace&&qApplied(d.items)});
 if(a==='exact-done'){const i=qAmountItem(quickAmountRow);if(i.amount!=null&&(!/^\d{1,4}(?:\.\d{1,2})?$/.test(String(i.amount))||Number(i.amount)>9999)){showError('量をゼロ以上、小数二桁までで入力してください。');return}if(i.amount!=null)qRememberUnit(i.unit);if(!await qAmountSettled()){qCloseAmount();render()}}
 if(a==='log-set'){const items=qSetItems(b.dataset.source,b.dataset.id);if(items)await qSave(items)}
 if(a==='adjust-set'){const items=qSetItems(b.dataset.source,b.dataset.id);if(items)qFill(items)}
 if(a==='pin-draft'&&d.items.length)await qPin(d.items);
 if(a==='pin-record'){const r=state().records.find(r=>r.id===b.dataset.id);if(r?.items)await qPin(r.items)}
 if(a==='unpin')await mutate('removeTemplate',{id:b.dataset.id},'固定を外しました。食事記録は残っています。');
 // 記録の訂正（食材の追加・外すも含む）は「食材を選んで記録」を開いて選択中の一覧で行う。
 if(a==='edit-record'){const r=state().records.find(r=>r.id===b.dataset.id);const p=r&&state().plans.find(p=>p.id===r.planId);if(r&&p){if($('#dialog').open)closeDialog();view.page='today';view.todayMode='quick';view.todayFree=true;view.date=p.date;view.quickSlot=p.slot;qEditDraft(r);quickAmountRow=null;render();document.querySelector('.qBasket')?.scrollIntoView({block:'nearest'})}}
 if(a==='custom'){openDialog(`<h2>食材を自由に追加</h2><form id="quickCustomForm"><label class="field">食材名<input name="name" required maxlength="60" value="${esc(quickSearch)}" placeholder="市販品や家庭の呼び名でも"></label><p class="formHint">追加後、量はボタンで選べます。</p>${formActions('食材に追加')}</form>`)}
});
document.addEventListener('input',e=>{if(e.target.id==='quickSearch'){quickSearch=e.target.value;if(!e.isComposing&&!composingInputs.has(e.target))qRefreshSearch()}if(e.target.dataset.qExact!==undefined){const it=qAmountItem(Number(e.target.dataset.qExact));if(it){it.amount=e.target.value===''?null:e.target.value;it.fromPrevious=false;if(!it.unit)it.unit=qDefaultUnit()}if(!quickDirect&&!quickRecAdd)$('#actionbar').innerHTML=quickDock()}});
document.addEventListener('submit',e=>{if(e.target.id==='quickCustomForm'){e.preventDefault();if([...composingInputs].some(input=>e.target.contains(input)))return;const name=new FormData(e.target).get('name').trim();if(!name)return;if(honeyHold(e.target,[name]))return;if(name&&!qDraft().items.some(i=>i.name===name)){qDraft().items.push(qDefaults(name));quickAmountRow=qDraft().items.length-1}const row=quickAmountRow;draftFormSaved();closeDialog();quickSearch='';render();if(row!==null)qOpenAmount(row)}});

function qRefreshSearch(){const results=$('#quickFoodResults');if(results){results.innerHTML=qFoodResultsMarkup();if(pendingMutation||!editable())results.querySelectorAll('[data-edit]').forEach(b=>b.disabled=true)}}

// 使い切り提案。決め打ちのルールで、表示のたびに今の在庫・献立・記録から作り直す（保存しない）。
// 区分は量の目安と同じ食材分類表（qFoodGroups）から：穀類＝主食、魚・肉・豆腐・乳製品＝主菜、野菜・果物＝副菜。分類表にない食材だけのロットは組み合わせに入れない。
// 1日の食数は時期（qStageKey）から。時期が分からなければ2回を目安にする。ただし開始日数が分かり30日目までの日は1回（qEarly）。初めての食材は記録からの導出（qEatenFoods）で判定し、「はじめて」と表示する（1.4.9：品数の制限には使わない。品数は全日そろえ、初めてが重なる日はバッジで分かるようにする）。
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
// 1.4.1（全体監査）: よくある食材名の区分漏れを追加した。ここは「区分のみ」の表で、量の目安（qFoodGroups／qGuideText）には影響しない。
// 卵・卵白・全卵（量の目安を出さない判断とは別判断）と海藻類（ひじき・わかめ・のり）、大豆、コーンフレーク、蒸しパンは、区分の判断が要るため今回は入れていない。
const qSuggestExtraRoles={'うどん':'主食','卵黄':'主菜','10倍がゆ':'主食','5倍がゆ':'主食','7倍がゆ':'主食','軟飯':'主食','食パン':'主食','パン':'主食','パンがゆ':'主食','そうめん':'主食','マカロニ':'主食','スパゲッティ':'主食','ごはん':'主食','白米':'主食','米':'主食','オートミール':'主食','ツナ':'主菜','鮭フレーク':'主菜','高野豆腐':'主菜','納豆':'主菜','チーズ':'主菜','豆乳':'主菜','きな粉':'主菜','豚レバー':'主菜','コーン':'副菜','とうもろこし':'副菜','枝豆':'副菜','レタス':'副菜','もやし':'副菜','しいたけ':'副菜','えのき':'副菜','ぶどう':'副菜','すいか':'副菜','メロン':'副菜','柿':'副菜','アスパラガス':'副菜','オクラ':'副菜','里芋':'副菜','長芋':'副菜','ごぼう':'副菜','れんこん':'副菜','カリフラワー':'副菜','セロリ':'副菜','いんげん':'副菜','さやえんどう':'副菜','グリーンピース':'副菜','ブルーベリー':'副菜','マンゴー':'副菜'};
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
// 1食の品数の手動設定（プロフィールの任意項目 itemsPerMeal、1.3.1）。設定があれば日数区分より優先する（区分の対応は qMealSteps と同じ）。
// 1.4.4（要望2）: 手動の選択肢を 4・5品まで広げた。4・5品の区分は3品と同じ（主食・主菜・副菜）で、品数の不足分は提案側が同じ区分の2つ目で補う（qSuggest）。
// 開始30日目までの主菜の食材制限（qEarly／qEarlyMainOk）は日数基準のままで、ここでは変えない。
function qItemsPerMeal(){const v=state().child?.itemsPerMeal;return [1,2,3,4,5].includes(v)?v:0}
function qMealLimit(info){const set=qItemsPerMeal();if(set)return {cap:set,roles:qMealSteps[Math.min(set,3)-1][2]};if(info.day===null)return {cap:3,roles:['主食','主菜','副菜']};const s=qMealSteps.find(s=>info.day<=s[0]);return {cap:s[1],roles:s[2]}}
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
 // sim は提案どおり前の日から順に食べた前提（「はじめて」バッジの判定に使う。1.4.9：品数の制限には使わない）。
 const real=qEatenFoods(),sim=new Map(real),seen=(m,n,d)=>m.has(n)&&m.get(n)<d,mark=(m,n,d)=>{if(!m.has(n)||d<m.get(n))m.set(n,d)};
 // 1.5.0: ローテーション用。食材ごとに「最後に出た日」と「出た回数」を数える。開始前の1週間（7日）の献立から数え始め、
 // 週の組み立ての中で（その日の献立・記録と、前日までの提案の積み重ねで）1日ずつ更新する。乱数は使わない（同じ状態では必ず同じ結果）。
 const lastUsed=new Map(),useCount=new Map(),useMark=(n,d)=>{if(d>(lastUsed.get(n)||''))lastUsed.set(n,d);useCount.set(n,(useCount.get(n)||0)+1)};
 for(let k=7;k>=1;k--){const d0=plusDate(start,-k);for(const n of new Set(meals(d0).flatMap(qPlanFoodNames)))useMark(n,d0)}
 for(let d=start;usable.length&&d<=end;d=plusDate(d,1)){
  const planned=meals(d),dayNames=[...new Set([...planned.flatMap(qPlanFoodNames),...[...real].filter(([,x])=>x===d).map(([n])=>n)])],isNew=n=>!seen(sim,n,d);
  const fresh=new Set(dayNames.filter(isNew)),list=[];
  // その日の提案ですでに選んだ食材。同じ区分にほかに使える候補があれば、まだ使っていない食材を先にする（無ければ従来どおり繰り返す）。
  // 品数の目安（qMealLimit）に入らない区分は選ばない。鉄とビタミンCの食材が両方使える日は、1日1回は同じ食事に組み合わせる（主菜で鉄→副菜でビタミンC）。
  const dayUsed=new Set(),info=qStartInfo(d),limit=qMealLimit(info),early=qEarly(info),dayCount=mealCount(info);let dayPaired=false;
  for(const slot of qMealSlots(info)){
   if(planned.some(p=>p.slot===slot)){list.push({slot,taken:true,items:[],add:[]});continue}
   const items=[];
   // 1.4.9（品数統一）: 初めての食材の条件で候補を弾かない。旧仕様は「その日の献立・記録にある分＋その日に許された1種類」の範囲でだけ
   // 新しい食材を含む候補を通す段取りで、初めての食材が多い間は日ごとに品数が増える段差になり見にくい、というユーザーの指示で外した。
   // v1.4.5 の教訓（条件で候補を全弾き→0品・「ストックが足りません」誤表示）も、弾く条件自体を無くすことで再発しない。
   // 初めてかどうかは品の「はじめて」バッジ（first）でのみ示し、食べさせるかどうかは親が見る。
   const canFor=r=>x=>x.role===r&&x.left>0&&x.e.due>=d&&!(r==='主菜'&&early&&!qEarlyMainOk(x));
   const unused=x=>!x.names.some(n=>dayUsed.has(n));
   // 1.4.9 の段（組み合わせ pref → その日まだ使っていない食材 unused → 食べたことのある食材だけのロット eatenOnly）は維持する。
   // ただし 1.5.0 で eatenOnly の判定を、シミュレーション（sim）ではなく実際の食べた記録（real）に変えた。
   // sim のままだと、週の組み立ての中で一度出した食材が「食べた」扱いになって段を占め続け、顔ぶれが固定されてしまうため。
   // 実際の記録ベースなら、食べ済みの食材同士・初めての食材同士のどちらの中でも、下のスコア（ローテーション）が効く。
   const eatenOnly=x=>x.names.every(n=>real.has(n)&&real.get(n)<d);
   // 1.5.0: 段の中で候補が複数あるときの選び方（ローテーション）。スコア＝「最後に出てからの日数」
   // （出たことがない食材は2日分として数える）＋期限の前倒し（期限が今日は5日分・明日は3日分・明後日は2日分。余らせないための寄せ）。
   // 同点なら「出た回数が少ない順→期限の近い順」。最後の決め手は usable の並び（期限順）のままで安定させる。
   const lotLast=x=>x.names.reduce((m,n)=>{const v=lastUsed.get(n)||'';return v>m?v:m},'');
   const lotCount=x=>x.names.reduce((m,n)=>Math.max(m,useCount.get(n)||0),0);
   const dayDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
   const lotScore=x=>{const last=lotLast(x),since=last?dayDiff(d,last):2,left=dayDiff(x.e.due,d);return since+(left<=0?5:left<=1?3:left<=2?2:0)};
   const cmpLot=(a,b)=>{
    const sa=lotScore(a),sb=lotScore(b);if(sa!==sb)return sb-sa;
    const ca=lotCount(a),cb=lotCount(b);if(ca!==cb)return ca-cb;
    if(a.e.due!==b.e.due)return a.e.due<b.e.due?-1:1;
    return 0;
   };
   const pickFrom=levels=>{for(const conds of levels){const cands=usable.filter(x=>conds.every(c=>c(x)));if(cands.length)return cands.sort(cmpLot)[0]}return null};
   const pick=x=>{x.left--;const first=x.names.filter(isNew);first.forEach(n=>fresh.add(n));x.names.forEach(n=>{dayUsed.add(n);useMark(n,d)});items.push({batchId:x.b.id,name:x.b.name,role:x.role,names:x.names,first:first.length>0,due:x.e.due,guide:qSuggestGuide(x.names,stage),portion:String(x.b.portion||''),size:stockPortion(x.b)?stockPortionText(x.b):'',iron:qTagged(x.names,'iron'),vitaminC:qTagged(x.names,'vitaminC')})};
   for(const [role] of qSuggestRoles){
    if(!limit.roles.includes(role))continue;
    const can=canFor(role);
    let pref=null;
    if(!dayPaired&&limit.roles.includes('主菜')&&limit.roles.includes('副菜')){
     if(role==='主菜'&&!items.some(i=>i.iron)&&usable.some(y=>canFor('副菜')(y)&&qTagged(y.names,'vitaminC')))pref=x=>qTagged(x.names,'iron');
     if(role==='副菜'&&items.some(i=>i.iron)&&!items.some(i=>i.vitaminC))pref=x=>qTagged(x.names,'vitaminC');
    }
    const x=pref?pickFrom([[can,pref,unused,eatenOnly],[can,pref,unused],[can,pref,eatenOnly],[can,pref],[can,unused,eatenOnly],[can,eatenOnly],[can,unused],[can]]):pickFrom([[can,unused,eatenOnly],[can,eatenOnly],[can,unused],[can]]);
    if(!x)continue;
    pick(x);
   }
   // 1.4.4（要望2）: 品数を手動で選んでいて、区分ごとに1つずつでは目標品数に届かないときは、副菜→主菜→主食の順に同じ区分の2つ目以降を足す（同じ順を繰り返し、最大で目標品数まで）。
   // 同じ食材は1食に重ねない。期限の近い順・在庫の押さえ（left）・開始30日目までの主菜制限・鉄＋ビタミンCの優先は、1つ目と同じ判定（canFor）で効かせる（1.4.9：初めての食材では弾かない）。
   // 「自動」のときは従来どおり区分ごとに1つずつ（日数の目安で最大3品）。ストックの種類が足りなければ、出せる分だけ出す。
   if(qItemsPerMeal()){
    let added=true;
    while(items.length<limit.cap&&added){
     added=false;
     for(const role of ['副菜','主菜','主食']){
      if(items.length>=limit.cap)break;
      if(!limit.roles.includes(role))continue;
      const can=canFor(role),inMeal=x=>x.names.some(n=>items.some(i=>i.names.includes(n)));
      let pref=null;
      if(!dayPaired&&limit.roles.includes('主菜')&&limit.roles.includes('副菜')){
       if(role==='主菜'&&!items.some(i=>i.iron)&&usable.some(y=>canFor('副菜')(y)&&qTagged(y.names,'vitaminC')))pref=x=>qTagged(x.names,'iron');
       if(role==='副菜'&&items.some(i=>i.iron)&&!items.some(i=>i.vitaminC))pref=x=>qTagged(x.names,'vitaminC');
      }
      const notInMeal=x=>!inMeal(x);
      const x=pref?pickFrom([[can,pref,notInMeal,unused,eatenOnly],[can,pref,notInMeal,unused],[can,pref,notInMeal,eatenOnly],[can,pref,notInMeal],[can,notInMeal,unused,eatenOnly],[can,notInMeal,eatenOnly],[can,notInMeal,unused],[can,notInMeal]]):pickFrom([[can,notInMeal,unused,eatenOnly],[can,notInMeal,eatenOnly],[can,notInMeal,unused],[can,notInMeal]]);
      if(x){pick(x);added=true}
     }
    }
   }
   // 鉄の品とビタミンCの品（別の品）がそろった食事には、理由を小さく添える。
   const ironItem=items.find(i=>i.iron),cItem=items.find(i=>i!==ironItem&&i.vitaminC),pair=ironItem&&cItem?{iron:ironItem.iron,vitaminC:cItem.vitaminC}:null;
   if(pair)dayPaired=true;
   list.push({slot,taken:false,items,add:[],pair});
  }
  // 1.4.9: 「この日だけ入れる場合の数え直し」はしない。入れる品（add）は組み立てた品（items）そのまま（初めての食材の段取りで品を除かない）。
  for(const m of list)if(!m.taken)m.add=[...m.items];
  for(const n of fresh)mark(sim,n,d);
  // 1.5.0: その日の献立・記録に出た食材も「出た」として数える（翌日以降のローテーションに効かせる）。
  for(const n of dayNames)useMark(n,d);
  days.push({date:d,meals:list,cap:limit.cap,count:dayCount,early,roles:limit.roles});
 }
 const kinds=new Set(usable.flatMap(x=>x.names));
 return {stage,count,guess:qMealCountSource(startInfo)==='default',countSource:qMealCountSource(startInfo),onlyName:kinds.size===1?[...kinds][0]:'',days,leftovers:usable.filter(x=>x.left>0).map(x=>({name:x.b.name,left:x.left,due:x.e.due})),unknown:lots.filter(x=>!x.role).map(x=>x.b.name),from:start,start:startInfo,limit:startLimit,short};
}
// 提案の1食を、通常の献立（local-store の plan と同じ形）にする。在庫は減らさない（取り出しは従来どおり「今日」から）。
// 入れるのは組み立てた品（m.add＝m.items。1.4.9 から数え直しはしない）。
// itemsOverride（1.4.0）: 窓全体を一度に入れる自動反映では、前の日の提案も含めて入れる前提の品（m.items）で作る。
// （1.4.9 以前は m.add が「その日だけ入れる」前提の数え直しで痩せていたため、この使い分けが必要だった。今は m.add＝m.items で同義。）
function qSuggestPlan(date,m,itemsOverride){const items=itemsOverride||m.add||m.items;return {date,slot:m.slot,title:items.map(i=>i.name).join('・').slice(0,100),note:'使い切り提案から入れた献立です。',foods:[...new Set(items.flatMap(i=>i.names))],uses:items.map(i=>({batchId:i.batchId,quantity:1}))}}
// ストックの新規登録が成功したあと、今日〜6日後の空いている食事枠へおすすめを自動で入れる（1.1.4）。提案の窓は今日からにするため、qSuggest には前日を渡す（tSuggestFor と同じやり方）。
// 記録・準備済み・手入力の献立がある枠は提案側で taken になるので触らない。在庫は減らない（献立に入れるだけ）。
// 取り消し（直前の操作の復元）で自動で入れた分だけが戻るよう、反映は planMany の1回にまとめる。入る枠が無ければ何もしない（通知も出さない）。
// 1.2.1: 前に自動で入れたおすすめ（qAutoPlan）も、新しいストックを含めて組み立て直す（症状4「ストックを足しても10倍がゆしか出ない」の修正）。
// 計算の間だけその献立を外して提案を作り（tReplaceMeal と同じやり方・画面には出ない）、中身が変わる枠だけ同じ id で入れ直す。入れ直しも同じ planMany の1回なので、取り消しで一緒に戻る。
// 1.4.0（作業1・作業3）: 組み直しの窓を「今日〜6日後」に広げた。従来は今日の献立が qAutoPlan の対象外で、しかも開始日・時期・品数・使う食事を変えても
// 組み直し自体が走らなかったため、品数の少ない頃に入った1品だけの献立が残り続けていた（「3週間目なのに1種類だけ」の原因）。
// あわせて、窓全体を一度に入れるときの品は m.items（前の日の提案も食べる前提で組み立てた組み合わせ）を土台にする。m.add のままだと2日目以降が痩せる。
// from は窓の初日（含む）。第2引数の意味が「今日（この日以前は対象外）」から「窓の初日」に変わった。
function qAutoPlan(p,from){if(p.date<from||p.prepared||record(p)||p.note!=='使い切り提案から入れた献立です。'||!p.uses.length||!p.uses.every(u=>u.quantity===1&&batch(u.batchId)))return false;return p.title===p.uses.map(u=>batch(u.batchId).name).join('・').slice(0,100)&&qMealSlots(qStartInfo(p.date)).includes(p.slot)}
// 1.4.2（症状1）: 印（note＝使い切り提案から入れた献立です。）の無い古い形式の献立。旧版の自動入力で作った献立には印があり
// qAutoPlan で組み直せることを旧版（v1.1.4／v1.3.2）の実物で確認したが、「食材を選んで記録」が裏で作った献立（記録を消した後に残る分）や
// 献立フォームでそのまま入れた献立は note が空で印が無く、組み直しの対象から漏れていた（11/3以降が1種類だけのまま残った主因）。
// 記録・取り出しが無く、メモ（note）も無く（＝カードで直した印・家族メモのどちらも無い）、題名が食材名の列挙そのままで、
// 使うストックがあっても各1個だけのものは、アプリが作ったまま手が入っていないとみなして組み直しの対象に含める。
// 実際の入れ直しは qAutoApplySuggest 側で「今の食材が新しい提案にすっぽり含まれ、品が増える」ときだけ行う（歯止め）。
function qLegacyPlan(p,from){if(p.date<from||p.prepared||record(p)||p.note)return false;if(!qMealSlots(qStartInfo(p.date)).includes(p.slot))return false;const names=qPlanFoodNames(p);if(!names.length)return false;const titles=new Set([qPlanNames(p).join('・'),names.join('・'),p.uses.map(u=>batch(u.batchId)?.name).join('・')]);if(!titles.has(p.title))return false;return !p.uses.length||p.uses.every(u=>u.quantity===1&&batch(u.batchId))}
// 1.3.0: 一週間のおすすめを「出さない」（weekSuggest=false）ときは今日の分だけ入れる（明日以降の献立は作らない・入れ直さない）。
// 「出す」に切り替えたとき（future）は明日〜6日後だけを、同じ planMany の1回で入れる。lead は先頭に付ける一言（通知は1つにまとめる）。
// 1.4.0: 設定変更（開始日・時期・1食の品数・使う食事）からも why='設定'・rebuildOnly=true で呼ぶ。設定変更では空き枠への新規入力はせず、
// 既存のおすすめ献立の組み直しだけを行う（対象の限定・1回化・取り消し可は同じ）。lead は設定側の通知で、組み直しがあったときだけ後ろに続く。
// 窓全体（future でない・出す状態）の品は m.items、「出す」への切替（future）と「出さない」時の今日だけは m.add（1.4.9 以降は m.items と同じ）。
async function qAutoApplySuggest({future=false,lead='',why='ストック',rebuildOnly=false,excludeId=null}={}){
 // 1.4.5（要望B）: excludeId は、直前に手で編集した献立（その食事）だけを組み直しの対象から外すための指定（編集の保存に続く連動組み直しで使う）。
 const today=jstDate(),from=future?plusDate(today,1):today,all=state().plans,auto=all.filter(p=>p.id!==excludeId&&qAutoPlan(p,from)),legacy=all.filter(p=>p.id!==excludeId&&!auto.includes(p)&&qLegacyPlan(p,from)),targets=[...auto,...legacy];
 // 1.5.0（追補）: 「出す」への切替（future）のときは、殻（中身を空にした献立）も計算の間だけ外して空き枠として扱い、同じ id で入れ直せるようにする。
 // 殻のままだと枠が taken 扱いになり、「出さない」で取り除いた分が「出す」に戻しても入らなくなるため。通常の組み直し（rebuildOnly 等）では殻に触らない。
 const husks=future?all.filter(p=>p.id!==excludeId&&!targets.includes(p)&&p.date>=from&&tIsHusk(p)):[],gone=[...targets,...husks],at=gone.map(p=>all.indexOf(p)),use=d=>future?d>today:(qWeekSuggestOn()||d===today);let s;
 for(let k=at.length-1;k>=0;k--)all.splice(at[k],1);
 try{s=qSuggest(plusDate(today,-1))}finally{for(let k=0;k<at.length;k++)all.splice(at[k],0,gone[k])}
 if(!s)return false;const plans=[],key=x=>JSON.stringify(x.uses.map(u=>u.batchId).sort());let redo=0;
 for(const day of s.days)for(const m of day.meals){if(m.taken||!use(day.date))continue;const basis=future||!qWeekSuggestOn()?m.add:m.items;if(!basis||!basis.length)continue;const x=qSuggestPlan(day.date,m,basis),old=auto.find(p=>p.date===day.date&&p.slot===m.slot),leg=old?null:legacy.find(p=>p.date===day.date&&p.slot===m.slot),hk=(old||leg)?null:husks.find(p=>p.date===day.date&&p.slot===m.slot);if(old){if(key(old)===key(x))continue;x.id=old.id;redo++}else if(leg){const cur=new Set(qPlanFoodNames(leg)),neu=new Set(basis.flatMap(i=>i.names));if(!cur.size||![...cur].every(n=>neu.has(n))||neu.size<=cur.size)continue;x.id=leg.id;redo++}else if(hk){x.id=hk.id}else if(rebuildOnly)continue;plans.push(x)}
 if(!plans.length)return false;const fromD=plans[0].date,toD=plans[plans.length-1].date,range=fromD===toD?dateLabel(fromD):`${dateLabel(fromD)}〜${dateLabel(toD)}`,redoOnly=plans.length===redo;
 const body=future
  ?(redoOnly?`ストックに合わせて、${range}の自動で入れたおすすめを入れ直しました。`:`ストックに合わせて、${range}の空いている食事におすすめを入れました。${redo?`前に自動で入れたおすすめ${redo}食も入れ直しました。`:''}`)
  :(redoOnly?(why==='設定'?`設定に合わせて、${range}の自動で入れたおすすめを組み直しました。`:why==='起動'?`開いたときに合わせて、${range}の自動で入れたおすすめを組み直しました。`:why==='編集'?`献立の変更に合わせて、${range}の自動で入れたおすすめを組み直しました。`:`ストックに合わせて、${range}の自動で入れたおすすめを入れ直しました。`)
   :`${why}に合わせて、${range}の空いている食事におすすめを入れました。${redo?`前に自動で入れたおすすめ${redo}食も組み直しました。`:''}`);
 return mutate('planMany',{plans},lead+body)}
// 1.5.0（追補）: 一週間のおすすめを「出さない」にしたとき、明日〜6日後の手つかずの自動おすすめ（qAutoPlan の線引き）を取り除く。
// 献立を消す操作は無いので、1.4.6 の殻（中身を空にした献立・題名と id はそのまま）にして枠を空ける。保存は planMany の1回（取り消し可）。
// 手で直した献立・記録済み・準備済み・今日の分は qAutoPlan の線引きで対象外。印の無い古い形式（qLegacyPlan）は「自動で入った」と
// 断定できないため、組み直しの対象には含めても取り除きの対象には含めない。「出す」に戻したときは qAutoApplySuggest（future）が殻を入れ直す。
async function qClearWeekAuto(lead){
 const today=jstDate(),from=plusDate(today,1),to=plusDate(today,6);
 const targets=state().plans.filter(p=>p.date>=from&&p.date<=to&&qAutoPlan(p,from)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
 if(!targets.length)return false;
 const plans=targets.map(p=>({id:p.id,date:p.date,slot:p.slot,title:p.title,note:p.note,foods:[],uses:[]}));
 const fromD=targets[0].date,toD=targets[targets.length-1].date,range=fromD===toD?dateLabel(fromD):`${dateLabel(fromD)}〜${dateLabel(toD)}`;
 return mutate('planMany',{plans},`${lead}${range}の自動で入れたおすすめ${targets.length}食を取り除きました。`);
}
// 1.4.1（症状C）: アプリを開いた時点で、手つかずのおすすめ献立を現在の設定で組み直す。品数の少ない頃に入った献立が、
// 設定変更やストック追加のきっかけが無いまま残り続けるのを防ぐ（「開始日を3週間前にしたのに11/3以降が1種類だけ」の主因）。
// 変わる場合だけ・開くごとに1回だけ走り、保存は planMany の1回にまとまる（通知1つ＋取り消し可）。あわせて、復元された古い訂正の下書きも最新の記録に追随させる。
let qOpenReplanDone=false;
async function qMaybeOpenReplan(){
 if(qOpenReplanDone||!current||!editable()||busy||pendingMutation)return;
 qOpenReplanDone=true;
 if(qSyncReplaceDrafts())render();
 await qAutoApplySuggest({why:'起動',rebuildOnly:true});
}
// 提案の根拠は、文章の塊にせず「見出し：短い本文」の行に分ける。補足（切り替わりの日・数え方）は本文の下に小さく残す。どれも「目安」と書く。
function qSuggestFact(label,body,notes=[]){const n=notes.filter(Boolean);return `<li class="qSuggestFact"><b class="qFactLabel">${label}</b><span class="qFactBody">${body}${n.length?`<small class="qFactNote">${n.join('／')}</small>`:''}</span></li>`}
// 品数（開始からの日数・時期）・回数・主菜の範囲・組み合わせの決まり。数え方の元が分からないときは、設定の場所を1行で案内する。
function qSuggestFactsMarkup(s,near=false){
 const i=s.start,c=s.limit.cap,what='1回'+c+'品'+(c===1?'（主食）':c===2?'（主食・副菜）':'')+'まで（目安）';
 const later=s.days.find(d=>d.cap!==s.limit.cap),change=near?'':(later?`${esc(dateLabel(later.date))}からは1回${later.cap}品まで`:'');
 const guide=!i.start&&!qOldestRecordDay()?`<p class="small muted qSuggestStart">設定で「離乳食を始めた日」を入れると、日数に合わせた品数・回数で組み立てます。<button class="linkButton" data-action="profile" data-edit>設定する</button></p>`:'';
 let step;
 // 1.4.4（要望2）: 品数を手動で選んでいるときは、その品数が根拠（日数・時期の行より先に出す）。ストックの種類が足りず目標に届かない日があるときは、その旨も添える。
 if(qItemsPerMeal())step=qSuggestFact('品数：',`1回${qItemsPerMeal()}品まで（設定した品数）`,[s.days.some(d=>d.meals.some(m=>!m.taken&&m.items.length<d.cap))?'ストックの種類が足りない日は、出せる分だけにしています':'']);
 else if(i.source==='period')step=qSuggestFact('品数：',`今の時期（${esc(i.stage)}）→ ${what}`);
 else if(i.source==='')step=qSuggestFact('品数：','始めた日が分からない → 1回3品まで（目安）');
 else if(i.day===0)step=qSuggestFact('品数：',`始める日（${esc(dateLabel(i.start))}）より前 → ${what}`,[change]);
 else step=qSuggestFact('品数：',`開始${i.day}日目（${esc(dateLabel(s.from))}）→ ${what}`,[change,i.source==='record'?'始めた日は、一番古い食事の記録の日から数えています':'']);
 const moreMeals=s.days.find(d=>d.count!==s.count);
 const meals=qSuggestFact('回数：',`1日${s.count}回`+(s.countSource==='set'?'（設定した回数）':s.countSource==='early'?'（開始30日目まで）':s.countSource==='stage'?'（'+esc(s.stage)+'の目安）':s.countSource==='days'?'（始めてからの日数から）':'（仮の目安）'),[near?'':(moreMeals?`${esc(dateLabel(moreMeals.date))}からは1日${moreMeals.count}回`:'')]);
 const mains=s.days.some(d=>d.early&&d.roles.includes('主菜'))?qSuggestFact('主菜：','開始30日目までは 豆腐・白身魚・卵黄・しらす',near?['白身魚は鯛・ひらめ・たら・かれい']:['白身魚は鯛・ひらめ・たら・かれい','31日目からはほかの主菜も使います']):'';
 const paired=s.days.some(d=>d.meals.some(m=>m.pair));
 const combo=qSuggestFact('組み合わせ：',`${s.limit.roles.join('・')}を在庫にある分だけ`,['はじめての食材には「はじめて」と出ます',paired?'「鉄＋ビタミンC」は、鉄の吸収を助ける組み合わせです':'']);
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
// 提案の1食の表示（冷凍庫のくわしい提案。「今日」の「メニュー」の明日以降は食材名だけの tUpcomingDay）。
function qSuggestMealMarkup(m){return `<li class="qSuggestMeal"><span class="qSuggestSlot">${slots[m.slot]}</span><span class="qSuggestItems">${m.taken?'<span class="muted">献立があるので、そのままにします</span>':m.items.length?m.items.map(i=>`<span class="qSuggestItem"><small>${i.role}</small>${esc(i.name)}${i.first?'<span class="qFirstBadge">はじめて</span>':''}${i.size?`<small class="qSuggestMeta">${esc(i.size)}${i.guide?`<span class="qSuggestSub">／目安：${esc(i.guide)}</span>`:''}</small>`:`${i.guide?`<small class="qSuggestMeta">目安：${esc(i.guide)}</small>`:''}${i.portion?`<small class="qSuggestMeta">1個＝${esc(i.portion)}</small>`:''}`}</span>`).join('')+(m.pair?`<small class="qSuggestWhy">鉄＋ビタミンC の組み合わせ：${esc(m.pair.iron)}＋${esc(m.pair.vitaminC)}</small>`:''):'<span class="muted">使えそうなストックはありません</span>'}</span></li>`}
// 冷凍庫の使い切り提案。日ごとの食材名は「今日」の「メニュー」に出すので、ここは明日の1行の要約だけにし、
// くわしい内容（日ごとの品の量・目安・組み合わせ・足りないもの・使い切れない見込み・1個の量の未設定・区分の分からないストック）は折りたたみの中に置く。判定（qSuggest）は変えない。
// 1.2.0: 今日画面の「明日のおすすめ」カードを廃止したので、明日の分のくわしい表示もこの折りたたみに含める（1.1.x はあさって以降だけ）。
function qSuggestBrief(s,unset){
 const [first]=s.days,rest=s.days,firstMeals=first?first.meals.filter(m=>!m.taken&&m.items.length):[],itemCount=firstMeals.reduce((n,m)=>n+m.items.length,0);
 const summary=first?(itemCount?`<b>明日：</b>${firstMeals.length}食・${itemCount}品のおすすめ`:first.meals.every(m=>m.taken)?'明日の食事には献立が入っています。':'明日に入れられるおすすめはありません。'):'主食・主菜・副菜の分かるストックがまだありません。';
 return `<section class="qSuggest qSuggestBrief" id="useupSection" aria-labelledby="useupTitle"><h2 id="useupTitle">使い切り提案</h2><p class="small muted qSuggestLead">作った日から7日の目安までに使い切る、組み合わせの一例です。</p><p class="qSuggestBriefLine">${summary}</p>${first?'<p class="small muted">日ごとの分は「今日」の「メニュー」から入れられます。</p>':''}<details class="qSuggestMore"><summary>日ごとのくわしい提案・足りないもの</summary>${qSuggestFactsMarkup(s)}${qSuggestShortMarkup(s)}${s.onlyName?`<p class="small muted qSuggestOnly"><b>ストック1種類：</b>いまのストックは「${esc(s.onlyName)}」だけなので、提案は${esc(s.onlyName)}中心です。他のストックを入れると組み合わせが広がります。</p>`:''}${rest.map(day=>{const can=day.meals.some(m=>!m.taken&&m.add.length);return `<div class="qSuggestDay"><div class="sectionhead"><h3>${dateLabel(day.date)}</h3>${can?`<button class="linkButton" data-action="suggestPlan" data-date="${day.date}" data-edit>この日の提案を献立に入れる</button>`:''}</div><ul>${day.meals.map(qSuggestMealMarkup).join('')}</ul></div>`}).join('')}${s.leftovers.length?`<p class="qSuggestNote">目安までに使い切れないかも：${esc(s.leftovers.map(x=>x.name+'（あと'+x.left+'個）').join('・'))}</p>`:''}${unset.length?`<p class="small muted qSuggestUnset">1個の量は未設定：${esc(unset.join('・'))}。冷凍庫のカードを押して「1個の量を設定」から入れられます。</p>`:''}${s.unknown.length?`<p class="small muted qSuggestUnknown">区分（主食・主菜・副菜）が分からず使っていないストック：${esc(s.unknown.join('・'))}</p>`:''}<p class="small muted">あくまで目安です。献立に入れても在庫は減りません。</p></details></section>`;
}
