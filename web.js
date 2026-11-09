'use strict';
let webRegistration=null,webReloading=false,webReloaded=false,webReloadHeld=false;
const INTRO_KEY='mogubi-web-intro:'+new URL('./',document.currentScript.src).pathname;
function webIntro(){let seen=false;try{seen=localStorage.getItem(INTRO_KEY)==='yes'}catch{}return seen?'':'<aside class="webIntro"><p>登録なしで使えます。記録はこの端末だけに保存され、家族との自動同期はありません。</p><p>SNSアプリ内では、Safari・Chromeで開き直してからお使いください。</p><a href="./guide.html">使い方と保存の注意点</a> <button data-web="intro">確認して使う</button></aside>'}
// 更新のお知らせ（1.5.1）。版ごとの文面を新しい順に持つ（先頭＝今の版）。「前回見た版」の控えは localStorage の単独キーだけに置き、保存データ本体（local-store）には混ぜない。
const SEEN_VERSION_KEY='mogubi-web-seen-version:'+new URL('./',document.currentScript.src).pathname;
const WEB_NEWS=[{version:'1.9.1',date:'2026-11-09',lines:['食材を「食べたことがある」と種類ごとに分けて、探しやすくしました']},{version:'1.9.0',date:'2026-11-09',lines:['食材を選ぶ画面を、縦スクロールのシートに作り替えました']},{version:'1.8.9',date:'2026-11-08',lines:['食材を選ぶ画面が、ふわっと浮かび上がるカードになりました']},{version:'1.8.8',date:'2026-11-08',lines:['食材を選ぶ画面をすっきりさせました。ストックと食材は1行の横スクロールになり、外側を押すと閉じます']},{version:'1.8.7',date:'2026-11-08',lines:['食材を選ぶ画面で、一覧をスクロールできるようにし、書いて追加する欄を右側に移しました']},{version:'1.8.6',date:'2026-11-08',lines:['目安を過ぎたストックを、冷凍庫から削除できるようにしました。カードを開いて「このストックを削除」から消せます','食材を選ぶ画面で、リストにない食材を書いて追加できるようにしました']},{version:'1.8.5',date:'2026-11-08',lines:['「作り方の一覧を見る」を、今日のメニューのすぐ下に移しました']},{version:'1.8.4',date:'2026-11-08',lines:['作り方の一覧を追加しました。今日の画面から、写真つきで全ての料理の作り方が見られます']},{version:'1.8.3',date:'2026-11-08',lines:['「食べた」と記録した日は、食材を選んでいない記録でも、本の計画がその分進むようになりました']},{version:'1.8.2',date:'2026-11-08',lines:['「本の進め方」が、設定で時期を選んでいないときも出るようになりました','時期は、食べた記録のある日数から推定します（時期を選んでいる場合はそちらが優先です）']},{version:'1.8.1',date:'2026-11-08',lines:['後期の「作り方」に、素材の下ごしらえと安全の案内を足しました','手で作った献立がある日も、ストックの配分がずれないように直しました']},{version:'1.8.0',date:'2026-11-08',lines:['中期に続いて、後期の進め方に対応しました。今日のメニューを、決まった順番で1回目・2回目・3回目の3食ぶん出します','完了期の目安（1日3食と補食のリズムなど）を、設定の「使い方と注意」に加えました']},{version:'1.7.0',date:'2026-11-08',lines:['中期の進め方に対応しました。今日のメニューを、決まった順番で1回目・2回目の2食ぶん出します','料理ごとに「作り方」を見られるようにしました（写真・材料・手順つき）']},{version:'1.6.0',date:'2026-11-07',lines:['初期の進め方に沿った計画を、食べた分だけ進む形で出すようにしました','設定の「本の進め方（初期）」で、使う・使わないを切り替えられます']},{version:'1.5.3',date:'2026-11-04',lines:['「一週間のおすすめ」を出さないときも、日をタップすれば自分の献立を入れられるようにしました']},{version:'1.5.2',date:'2026-11-04',lines:['はちみつ・窒息など、安全についての案内を加えました。はちみつを含む名前を入れると注意が出ます','ストックの日数の表示を、作った日からの目安だと分かる言い方にそろえました','「データの取り扱い」のページを公開用に新しくしました']},{version:'1.5.1',date:'2026-11-03',lines:['おすすめの組み合わせが日ごとに変わるようになりました','『一週間のおすすめ』を出さないにすると、自動で入った献立が取り除かれるようになりました']}];
function webSeenVersion(){try{return localStorage.getItem(SEEN_VERSION_KEY)}catch{return null}}
function webRememberVersion(v){try{localStorage.setItem(SEEN_VERSION_KEY,v)}catch{}}
// 1.5.2: 控えが無くても、既存の利用者（最初の案内を確認済み、または保存データがある）は「前回見た版＝1.5.0」として扱う（1.5.1 では控えの無い既存の利用者に一度も出なかった）。
// 保存データの有無は、描画の時点で読み込み済みの current（IndexedDB の中身）で見るので、今日画面の描画は待たせない。
function webExistingUser(){try{if(localStorage.getItem(INTRO_KEY)==='yes')return true}catch{}const c=typeof current!=='undefined'?current:null,s=c?.state;if(!s)return false;return c.revision>0||Boolean(s.child?.name||s.note)||['foods','plans','batches','records','shopping','templates'].some(k=>Array.isArray(s[k])&&s[k].length>0)}
// 今日画面の上に出すお知らせカード。本当の初回（控えなし・既存の利用者でない）は出さず、今の版を控えるだけ。控えが今の版と違えば1回出し、閉じたら控えを今の版にして二度と出さない。
function webWhatsNew(){const latest=WEB_NEWS[0];if(!latest)return '';let seen=webSeenVersion();if(seen===null){if(!webExistingUser()){webRememberVersion(latest.version);return ''}seen='1.5.0'}if(seen===latest.version)return '';return `<aside class="webNews" aria-label="更新のお知らせ"><p><b>新しくなりました</b>（${latest.date}）</p><ul>${latest.lines.map(l=>`<li>${l}</li>`).join('')}</ul><button data-web="news">閉じる</button></aside>`}
function webNewsHistory(){return WEB_NEWS.map(n=>`<div class="newsEntry"><p><b>版 ${n.version}</b>（${n.date}）</p><ul>${n.lines.map(l=>`<li>${l}</li>`).join('')}</ul></div>`).join('')}
function webUpdateButton(){const b=document.querySelector('[data-web=update]');if(b)b.hidden=!webRegistration?.waiting}
new MutationObserver(webUpdateButton).observe(document.querySelector('#screen'),{childList:true,subtree:true});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-web]');if(!b)return;
 try{
  if(b.dataset.web==='intro'){try{localStorage.setItem(INTRO_KEY,'yes')}catch{}b.closest('.webIntro').remove()}
  if(b.dataset.web==='news'){webRememberVersion(WEB_NEWS[0].version);b.closest('.webNews')?.remove()}
  if(b.dataset.web==='persist'){const ok=await navigator.storage?.persist?.();document.querySelector('#persistResult').textContent=ok?'記録の保持が許可されました。定期的なバックアップも続けてください。':'保持の許可は得られませんでした。通常の記録は使えます。バックアップを保存してください。'}
  if(b.dataset.web==='recovery'){const data=await MoguLocal.request('/api/recovery');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='もぐ日和_復元前コピー.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  if(b.dataset.web==='update'&&webRegistration?.waiting){if(busy||pendingMutation){showError('保存結果を確認してから更新してください。');return}draftPersist();if(!draftStorageOK){showError('入力を保存してから更新してください。');return}webReloading=true;webRegistration.waiting.postMessage({type:'ACTIVATE'})}
 }catch(err){showError(err.message||'この操作は利用できません。')}
});
// 1.5.2: 新しい版への自動の切り替え（controllerchange）でも入力を失わないよう、ダイアログが開いている間・保存の途中（pendingMutation）は再読み込みを保留し、
// ダイアログが閉じたとき（close）・保存が終わったとき（app.js の mutate の最後）に1回だけ反映する。新しい版はもう有効なので、保留のまま閉じても次回起動時は新版になる。
function webReloadBlocked(){try{return Boolean(document.querySelector('#dialog')?.open)||(typeof pendingMutation!=='undefined'&&Boolean(pendingMutation))||(typeof busy!=='undefined'&&busy===true)}catch{return false}}
function webReloadNow(){if(webReloaded)return;if(webReloadBlocked()){webReloadHeld=true;return}webReloadHeld=false;webReloaded=true;try{if(typeof draftPersist==='function')draftPersist()}catch{}location.reload()}
function webReloadRetry(){if(webReloadHeld)webReloadNow()}
if('serviceWorker'in navigator&&window.isSecureContext){
 // Reload once when a new version takes over. Skip the first install (no previous controller) so a fresh page never reloads.
 let webController=navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{const prev=webController;webController=navigator.serviceWorker.controller;if(webReloaded||(!prev&&!webReloading))return;webReloadNow()});
 document.querySelector('#dialog')?.addEventListener('close',webReloadRetry);
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(r=>{webRegistration=r;webUpdateButton();r.addEventListener('updatefound',()=>r.installing?.addEventListener('statechange',webUpdateButton))}).catch(()=>{/* Online recording remains available. Settings explain offline prerequisites. */});
}
