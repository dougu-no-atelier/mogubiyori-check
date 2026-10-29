'use strict';
// Drafts are scoped to the server's data directory and this browser tab. No
// credentials, invitation codes, imported files, or rendered HTML are stored.
let draftStorageKey=null,draftStorageOK=true,savedForm=null,restoringForm=false;
const formDrafts=new Map();
const formKey=f=>f.id+'|'+(f.entity||'');
const draftLabels={quickCustomForm:'食材の追加',profileForm:'家庭の設定',batchForm:'冷凍ストック',planForm:'献立',recordForm:'食事の補足',moveForm:'献立の移動',noteForm:'家族メモ',foodNoteForm:'食材のメモ',shoppingForm:'買い物メモ'};
const draftForms=new Set(['quickCustomForm','profileForm','batchForm','planForm','recordForm','moveForm','noteForm','foodNoteForm','shoppingForm']);
function draftInit(next){
 if(draftStorageKey)return;
 try{
  let tab=sessionStorage.getItem('mogubi-tab');
  if(!tab){tab=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem('mogubi-tab',tab)}
  draftStorageKey='mogubi-draft-v1:'+next.storageId+':'+tab;
  const raw=localStorage.getItem(draftStorageKey);if(!raw)return;
  const saved=JSON.parse(raw);if(saved.version!==1||!Array.isArray(saved.quick))throw Error('draft format');
  for(const [key,draft] of saved.quick){if(/^\d{4}-\d{2}-\d{2}\|(breakfast|lunch|dinner)$/.test(key)&&Array.isArray(draft.items))quickDrafts.set(key,draft)}
  for(const form of saved.forms||[saved.form])if(form&&draftForms.has(form.id))formDrafts.set(formKey(form),form);
  savedForm=[...formDrafts.values()].at(-1)||null;
  pendingMutation=saved.pending||null;
  if(saved.quick.length||savedForm||pendingMutation||saved.search){Object.assign(view,saved.view);quickSearch=saved.search||'';quickSearchOpen=Boolean(quickSearch);}
 }catch{draftStorageOK=false;}
}
function draftCaptureForm(){
 const form=$('#dialog[open] form');if(restoringForm||!form||!draftForms.has(form.id)||!form.dataset.dirty)return;
 savedForm={id:form.id,entity:form.dataset.id||'',revision:Number(form.dataset.revision),fields:[...form.elements].filter(e=>e.name&&!['file','password','submit','button'].includes(e.type)).map(e=>({name:e.name,value:e.value,checked:e.checked,type:e.type}))};formDrafts.set(formKey(savedForm),savedForm);
}
function draftPersist(){
 if(!draftStorageKey)return false;
 draftCaptureForm();
 try{
  const quick=[...quickDrafts].filter(([,d])=>d.items.length);
  if(!quick.length&&!savedForm&&!pendingMutation&&!quickSearch){localStorage.removeItem(draftStorageKey)}
  else localStorage.setItem(draftStorageKey,JSON.stringify({version:1,quick,forms:[...formDrafts.values()],pending:pendingMutation,search:quickSearch,view:{page:view.page,todayMode:view.todayMode,date:view.date,quickSlot:view.quickSlot},at:new Date().toISOString()}));
  draftStorageOK=true;return true;
 }catch{draftStorageOK=false;return false;}
}
function draftBanner(){
 let host=$('#draftNotice');if(!host){host=document.createElement('div');host.id='draftNotice';$('#screen').prepend(host)}
 const hasDraft=[...quickDrafts.values()].some(d=>d.items.length)||savedForm||quickSearch;
 let markup=(hasDraft||pendingMutation)&&!draftStorageOK?'<p role="alert">このブラウザに下書きを保存できません。保存が済むまで再読み込み・終了をしないでください。</p>':'';
 if(!pendingMutation&&savedForm)markup+=`<span>入力途中：${esc(draftLabels[savedForm.id])}</span>${formDrafts.size>1?`<select id="formDraftChoice" aria-label="再開する下書き">${[...formDrafts].map(([key,f])=>`<option value="${esc(key)}" ${f===savedForm?'selected':''}>${esc(draftLabels[f.id])}</option>`).join('')}</select>`:''}<button data-draft="resume">入力を再開</button><button class="linkButton" data-draft="discard">下書きを破棄</button>`;
 if(host.innerHTML!==markup)host.innerHTML=markup;host.hidden=!markup;
}
function draftFormOpened(){const form=$('#dialogBody form');if(form&&draftForms.has(form.id))form.dataset.revision=current.revision;}
function draftFormSaved(id,entity){const form=$('#dialogBody form');const key=(id||form?.id)+'|'+(entity??form?.dataset.id??'');formDrafts.delete(key);savedForm=[...formDrafts.values()].at(-1)||null;if(form&&(!id||form.id===id))delete form.dataset.dirty;draftPersist();}
function draftResume(){
 if(!savedForm||!editable())return;
 const saved=savedForm,p=state().plans.find(p=>p.id===saved.entity),f=food(saved.entity);
 if(['recordForm','planForm','moveForm'].includes(saved.id)&&saved.entity&&!p||saved.id==='foodNoteForm'&&!f){showError('対象の記録がなくなっています。下書きは残しています。');return;}
 restoringForm=true;
 try{
  const openers={profileForm,batchForm,planForm:()=>planForm(p),recordForm:()=>detailForm(p),moveForm:()=>moveForm(p),foodNoteForm:()=>foodDialog(f),noteForm:()=>document.querySelector('[data-action=note]')?.click(),quickCustomForm:()=>{quickSearchOpen=true;render();document.querySelector('[data-q=custom]')?.click()},shoppingForm:()=>{view.page='stock';view.stockTab='shopping';render()}};
  if(saved.id==='noteForm')openDialog('<h2>家族に、ひとこと。</h2><form id="noteForm"><label class="field">家族の置き手紙<textarea name="note" maxlength="2000"></textarea></label>'+formActions('メモを残す')+'</form>');else openers[saved.id]();
  const form=document.getElementById(saved.id);if(!form)return;
  for(const field of saved.fields){const el=[...form.elements].find(e=>e.name===field.name&&(field.type!=='checkbox'||e.value===field.value));if(!el)continue;if(field.type==='checkbox')el.checked=field.checked;else el.value=field.value;}
  form.dataset.revision=saved.revision;form.dataset.dirty='yes';savedForm=saved;
 }finally{restoringForm=false;draftPersist();draftBanner();}
}
document.addEventListener('input',e=>{if(e.target.id==='formDraftChoice'){savedForm=formDrafts.get(e.target.value)||savedForm;return;}const form=e.target.closest('form');if(form&&draftForms.has(form.id)){form.dataset.dirty='yes';if(form.id==='shoppingForm'){savedForm={id:form.id,entity:'',revision:current.revision,fields:[{name:e.target.name,value:e.target.value,type:e.target.type}]};formDrafts.set(formKey(savedForm),savedForm);}}draftPersist();draftBanner();});
document.addEventListener('change',e=>{if(e.target.id==='formDraftChoice')savedForm=formDrafts.get(e.target.value)||savedForm;const form=e.target.closest('form');if(form&&draftForms.has(form.id))form.dataset.dirty='yes';draftPersist();draftBanner()});
document.addEventListener('click',e=>{if(e.target.closest('#formDraftChoice'))return;const action=e.target.closest('[data-draft]')?.dataset.draft;if(action==='resume')draftResume();if(action==='discard'){if(savedForm)formDrafts.delete(formKey(savedForm));savedForm=[...formDrafts.values()].at(-1)||null;draftPersist();draftBanner()}queueMicrotask(()=>{draftPersist();draftBanner()});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)draftPersist()});
window.addEventListener('pagehide',draftPersist);
window.addEventListener('beforeunload',e=>{draftPersist();if(!draftStorageOK&&([...quickDrafts.values()].some(d=>d.items.length)||savedForm||pendingMutation)){e.preventDefault();e.returnValue='';}});
