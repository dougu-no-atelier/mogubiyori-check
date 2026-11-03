'use strict';
let webRegistration=null,webReloading=false,webReloaded=false;
const INTRO_KEY='mogubi-web-intro:'+new URL('./',document.currentScript.src).pathname;
function webIntro(){let seen=false;try{seen=localStorage.getItem(INTRO_KEY)==='yes'}catch{}return seen?'':'<aside class="webIntro"><p>登録なしで使えます。記録はこの端末だけに保存され、家族との自動同期はありません。</p><p>SNSアプリ内では、Safari・Chromeで開き直してからお使いください。</p><a href="./guide.html">使い方と保存の注意点</a> <button data-web="intro">確認して使う</button></aside>'}
// 更新のお知らせ（1.5.1）。版ごとの文面を新しい順に持つ（先頭＝今の版）。「前回見た版」の控えは localStorage の単独キーだけに置き、保存データ本体（local-store）には混ぜない。
const SEEN_VERSION_KEY='mogubi-web-seen-version:'+new URL('./',document.currentScript.src).pathname;
const WEB_NEWS=[{version:'1.5.1',date:'2026-11-03',lines:['おすすめの組み合わせが日ごとに変わるようになりました','『一週間のおすすめ』を出さないにすると、自動で入った献立が取り除かれるようになりました']}];
function webSeenVersion(){try{return localStorage.getItem(SEEN_VERSION_KEY)}catch{return null}}
function webRememberVersion(v){try{localStorage.setItem(SEEN_VERSION_KEY,v)}catch{}}
// 今日画面の上に出すお知らせカード。控えが無い初めての人には出さず、今の版を控えるだけ。控えが今の版と違えば1回出し、閉じたら控えを今の版にして二度と出さない。
function webWhatsNew(){const latest=WEB_NEWS[0];if(!latest)return '';const seen=webSeenVersion();if(seen===null){webRememberVersion(latest.version);return ''}if(seen===latest.version)return '';return `<aside class="webNews" aria-label="更新のお知らせ"><p><b>新しくなりました</b>（${latest.date}）</p><ul>${latest.lines.map(l=>`<li>${l}</li>`).join('')}</ul><button data-web="news">閉じる</button></aside>`}
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
if('serviceWorker'in navigator&&window.isSecureContext){
 // Reload once when a new version takes over. Skip the first install (no previous controller) so a fresh page never reloads.
 let webController=navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{const prev=webController;webController=navigator.serviceWorker.controller;if(webReloaded||(!prev&&!webReloading))return;webReloaded=true;location.reload()});
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(r=>{webRegistration=r;webUpdateButton();r.addEventListener('updatefound',()=>r.installing?.addEventListener('statechange',webUpdateButton))}).catch(()=>{/* Online recording remains available. Settings explain offline prerequisites. */});
}
