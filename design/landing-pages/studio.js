const templates=[
 {id:'blank',name:'Blank canvas',desc:'Your ideas. No header. No footer.',file:'blank.html',tag:'START FRESH'},
 {id:'shikor',name:'01 / Shikor',desc:'Food story · Warm, editorial, rooted',file:'01-shikor.html',tag:'FOOD & HERITAGE'},
 {id:'pantry',name:'02 / Pantry',desc:'Bundle offer · Bold, clear, organized',file:'02-pantry.html',tag:'COMBOS & OFFERS'},
 {id:'nira',name:'03 / Nira',desc:'Everyday care · Calm, minimal, natural',file:'03-nira.html',tag:'OILS & PERSONAL CARE'},
 {id:'mithai',name:'04 / Mithai',desc:'Compact funnel · Playful, focused, warm',file:'04-mithai.html',tag:'SINGLE PRODUCT'},
 {id:'nirvor',name:'05 / Nirvor',desc:'Product showcase · Practical, considered',file:'05-nirvor.html',tag:'PRACTICAL PRODUCTS'}
];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let selected=templates[0], active=null, pendingSection=null;
const frame=$('#page-frame');
function thumb(t){return t.id==='blank'?'<div class="template-thumb blank-thumb"><div class="blank-icon">+</div><p>A clean slate, entirely yours.</p></div>':`<div class="template-thumb"><iframe title="${t.name} miniature" src="${t.file}" tabindex="-1" loading="lazy" inert></iframe></div>`}
function renderCard(t,picker=false){return `<article class="template-card" ${picker?'data-selected="'+String(t===selected)+'"':''} data-template="${t.id}"><span class="template-no">${t.tag}</span>${thumb(t)}<div class="template-info"><div><h3><a href="${t.file}" target="_blank" rel="noopener">${t.name}</a></h3><p>${t.desc}</p></div>${picker?'':`<div class="card-actions"><a href="${t.file}" target="_blank" rel="noopener">Open page</a><button data-preview="${t.id}">Style preview</button></div>`}</div>${picker?`<button class="pick-template" type="button" aria-label="Select ${t.name}" aria-pressed="${String(t===selected)}" data-pick="${t.id}"></button>`:''}</article>`}
$('#gallery').innerHTML=templates.map(t=>renderCard(t)).join('');
function fitThumbs(){ $$('.template-thumb').forEach(el=>el.style.setProperty('--scale',el.clientWidth/1120));}
new ResizeObserver(fitThumbs).observe($('#gallery'));
function renderPicker(){ $('#picker').innerHTML=templates.map(t=>renderCard(t,true)).join('');fitThumbs();}
function showNew(){renderPicker();$('#new-dialog').showModal();fitThumbs();$('#page-name').focus();}
$('#new-page').onclick=showNew;
$$('.close-new').forEach(b=>b.onclick=()=>$('#new-dialog').close());
$('#picker').setAttribute('role','group');$('#picker').setAttribute('aria-label','Starting template');
$('#picker').onclick=e=>{let b=e.target.closest('[data-pick]');if(!b)return;selected=templates.find(t=>t.id===b.dataset.pick);$('#selected-label').textContent=selected.name+' selected';$$('#picker .template-card').forEach(c=>{c.setAttribute('data-selected',String(c.dataset.template===selected.id));c.querySelector('[data-pick]').setAttribute('aria-pressed',String(c.dataset.template===selected.id));});};
$('#new-form').onsubmit=e=>{e.preventDefault();$('#new-dialog').close();openPreview(selected,$('#page-name').value.trim());};
$('#gallery').onclick=e=>{const b=e.target.closest('[data-preview]');if(b)openPreview(templates.find(t=>t.id===b.dataset.preview));};
function openPreview(t,name){active=t;$('#preview').hidden=false;$('#preview-name').textContent=name?`${name} · ${t.name}`:t.name;$('#open-page').href=t.file;frame.src=t.file;$('#blank-hint').hidden=t.id!=='blank';document.body.style.overflow='hidden';$('.catalog').inert=true;$('.studio-header').inert=true;$('#back').focus();}
$('#back').onclick=()=>{$('#preview').hidden=true;document.body.style.overflow='';$('.catalog').inert=false;$('.studio-header').inert=false;active=null;$('#new-page').focus();};
$$('[data-device]').forEach(b=>b.onclick=()=>{ $('#frame-stage').classList.toggle('mobile',b.dataset.device==='mobile');$$('[data-device]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); });
$('#toggle-style').onclick=()=>{$('#style-panel').hidden=!$('#style-panel').hidden;$('#toggle-style').setAttribute('aria-expanded',String(!$('#style-panel').hidden));};
function populateTargets(){const select=$('#style-target');select.innerHTML='<option value="page">Whole page</option>';[...frame.contentDocument.querySelectorAll('[data-section]')].forEach((el,i)=>{el.dataset.previewIndex=i;const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+el.dataset.section;select.append(o);});syncControls();}
function target(){return $('#style-target').value==='page'?frame.contentDocument.body:frame.contentDocument.querySelector(`[data-preview-index="${$('#style-target').value}"]`);}
function color(v,fallback){return /^#[0-9a-f]{6}$/i.test(v.trim())?v.trim():fallback;}
function syncControls(){const el=target();if(!el)return;const s=getComputedStyle(el);$('#accent').value=color(s.getPropertyValue('--accent'),'#883e2d');$('#background').value=color(s.getPropertyValue('--paper'),'#fbf6ec');$('#text-color').value=color(s.getPropertyValue('--ink'),'#2e2a22');$('#font-size').value=parseInt(s.getPropertyValue('--heading-size'))||52;$('#space').value=parseInt(s.getPropertyValue('--section-space'))||88;$('#radius').value=parseInt(s.getPropertyValue('--radius'))||12;$('#border-width').value=parseInt(el.style.borderWidth)||0;['font','space','radius'].forEach((v,i)=>$('#'+(i===0?'font':v)+'-value').textContent=$('#'+['font-size','space','radius'][i]).value+'px');}
$('#style-target').onchange=syncControls;
frame.onload=()=>{populateTargets();if(pendingSection){const add=pendingSection;pendingSection=null;appendSection(add);}};
function styleChange(id,fn){$('#'+id).addEventListener('input',e=>{const el=target();if(!el)return;fn(el,e.target.value);$('#style-status').textContent='Preview updated';});}
styleChange('accent',(e,v)=>e.style.setProperty('--accent',v));
styleChange('background',(e,v)=>{e.style.setProperty('--paper',v);e.style.backgroundColor=v;});
styleChange('text-color',(e,v)=>{e.style.setProperty('--ink',v);e.style.color=v;});
styleChange('font-size',(e,v)=>{e.style.setProperty('--heading-size',v+'px');e.querySelectorAll('h1,h2').forEach(h=>h.style.fontSize=v+'px');$('#font-value').textContent=v+'px';});
styleChange('space',(e,v)=>{e.style.setProperty('--section-space',v+'px');if(e.tagName!=='BODY'){e.style.paddingTop=v+'px';e.style.paddingBottom=v+'px';}$('#space-value').textContent=v+'px';});
styleChange('radius',(e,v)=>{e.style.setProperty('--radius',v+'px');e.querySelectorAll('.card,.btn,.art-stage,.photo,.package,.checkout-form').forEach(x=>x.style.borderRadius=v+'px');if(e.tagName!=='BODY')e.style.borderRadius=v+'px';$('#radius-value').textContent=v+'px';});
styleChange('border-width',(e,v)=>{e.style.border=v+'px solid '+$('#border-color').value;});
styleChange('border-color',(e,v)=>e.style.borderColor=v);
$('#reset-style').onclick=()=>{if(active){frame.src=active.file;$('#blank-hint').hidden=active.id!=='blank';$('#style-status').textContent='Template restored';}};
const labels={hero:'Hero banner',trust:'Trust strip',features:'Benefits grid',story:'Image + story',packages:'Package selector',reviews:'Customer stories',faq:'FAQ accordion',order:'Order form',bundle:'Bundle contents',offer:'Offer summary',steps:'Steps / process',comparison:'Comparison table',specs:'Product specifications'};
let sections=[];
async function loadSections(){if(sections.length)return;const res=await fetch('sections.json');sections=await res.json();$('#section-grid').innerHTML=sections.map(s=>`<button class="section-card" data-section-file="${s.file}" data-theme="${s.theme}" data-type="${s.type}"><div class="template-thumb"><iframe src="${s.file}" title="${labels[s.type]} preview" tabindex="-1" loading="lazy" inert></iframe></div><span>${labels[s.type]}<small>＋ Add</small></span></button>`).join('');}
async function showSections(){try{await loadSections();$('#section-dialog').showModal();fitThumbs();$('#section-search').focus();}catch{$('#section-help').textContent='Section library could not load. Please reload the page.';$('#section-dialog').showModal();}}
$('#browse-sections').onclick=showSections;$('#add-section').onclick=showSections;$('#close-sections').onclick=()=>$('#section-dialog').close();
$('#section-search').oninput=e=>{let count=0;$$('.section-card').forEach(c=>{c.hidden=!(labels[c.dataset.type]+' '+c.dataset.type).toLowerCase().includes(e.target.value.toLowerCase());if(!c.hidden)count++;});$('#no-sections').hidden=count>0;};
async function appendSection(s){const res=await fetch(s.file);const parsed=new DOMParser().parseFromString(await res.text(),'text/html');const section=parsed.querySelector('section');const doc=frame.contentDocument;const node=doc.importNode(section,true);node.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));node.removeAttribute('id');node.querySelectorAll('form').forEach(f=>{f.onsubmit=e=>e.preventDefault();});const wrapper=doc.createElement('div');wrapper.className=s.theme;wrapper.append(node);doc.body.append(wrapper);$('#blank-hint').hidden=true;populateTargets();$('#style-target').value=node.dataset.previewIndex;syncControls();frame.contentWindow.scrollTo({top:wrapper.offsetTop,behavior:'smooth'});$('#style-status').textContent=labels[s.type]+' added to this preview';}
$('#section-grid').onclick=async e=>{const b=e.target.closest('[data-section-file]');if(!b)return;const s={file:b.dataset.sectionFile,theme:b.dataset.theme,type:b.dataset.type};$('#section-dialog').close();try{if(!active){pendingSection=s;openPreview(templates[0]);}else await appendSection(s);}catch{$('#style-status').textContent='Could not add the section. Please try again.';}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#preview').hidden&&!document.querySelector('dialog[open]'))$('#back').click();});
fitThumbs();
