(function(){
'use strict';
const topics=window.HPLCHelp,seen=new WeakSet();
document.getElementById('show-help').checked=true;
document.body.classList.remove('hide-control-help');
const panel=document.createElement('div');panel.id='control-help';panel.className='control-help';panel.setAttribute('popover','auto');panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','control-help-title');
panel.innerHTML='<div class="help-heading"><strong id="control-help-title"></strong><button type="button" class="help-close" aria-label="Close help">×</button></div><p id="control-help-text"></p>';
document.body.append(panel);let active=null;
function close(){if(panel.matches(':popover-open'))panel.hidePopover();}
function position(){
 if(!active||!panel.matches(':popover-open'))return;
 const r=active.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;
 panel.style.left=Math.max(12,Math.min(innerWidth-w-12,r.left))+'px';
 panel.style.top=Math.max(12,Math.min(innerHeight-h-12,r.bottom+h+8<innerHeight?r.bottom+8:r.top-h-8))+'px';
}
function add(target,key,placement='append'){
 if(!target||seen.has(target)||!topics[key])return;seen.add(target);
 const b=document.createElement('button');b.type='button';b.className='help-button';b.dataset.help=key;b.textContent='?';b.setAttribute('aria-label','Help: '+topics[key].title);b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');
 if(placement==='field'){
  const control=target.control||target.querySelector('input,select');
  if(control&&!control.hasAttribute('aria-label')){const label=target.cloneNode(true);label.querySelectorAll('input,select,button').forEach(el=>el.remove());control.setAttribute('aria-label',label.textContent.trim());}
  if(control&&target.contains(control)&&control.type!=='checkbox')control.before(b);else target.append(b);
 }else if(placement==='after'){
  const pair=document.createElement('span');pair.className='help-pair';target.before(pair);pair.append(target,b);
 }else target.append(b);
}
const fields={solvent:'solventb',fraction:'solventbfraction',temperature:'temperature',flow:'flowrate',injection:'injectionvolume',phase:'stationaryphase',length:'columnlength',diameter:'columndiameter',particle:'particlesize',inter:'interparticleporosity',intra:'intraparticleporosity',a:'vandeemter',b:'vandeemter',c:'vandeemter',detector:'timeconstant',noise:'noise',offset:'signaloffset',tubingLength:'tubingLength',tubingDiameter:'tubingDiameter',autoTime:'automatictimespan',duration:'finaltime',samplingRate:'numdatapoints',mixing:'mixingvolume',nonmixing:'nonmixingvolume',overlay:'overlay'};
const actions={'save-method':'save','load-method':'load','reset-method':'reset',reference:'reference','export-csv':'csv','export-png':'image','custom-compound':'custom','add-compound':'library','random-compound':'unknown'};
function refresh(){
 for(const [id,key] of Object.entries(fields)){
  const control=document.getElementById(id),label=control?.closest('label')||document.querySelector('label[for="'+id+'"]');add(label,key,'field');
 }
 for(const [id,key] of Object.entries(actions))add(document.getElementById(id),key,'after');
 document.querySelectorAll('[data-mode]').forEach(b=>add(b,b.dataset.mode+'elutionmode','after'));
 add(document.querySelector('.gradient-labels'),'gradientprogramtable');
 add(document.querySelector('.zoom-controls'),'zoom');
 add(document.querySelector('.plot-legend'),'plot');
 const metricKeys=['voidtime','backpressure','theoreticalplates','resolution'];
 document.querySelectorAll('.metrics>div').forEach((el,i)=>{if(!seen.has(el)){add(el,metricKeys[i]);el.querySelector('span').after(el.lastElementChild);}});
 ['compound','concentration','retention','retentiontime','sigma','resolution','actions'].forEach((key,i)=>add(document.querySelectorAll('.sample-table th')[i],key));
 const derived=['voidvolume','porosity','hetp','flowvelocity','reducedplateheight','diffusioncoefficient','eluentviscosity','tubevolume','delay','pressureparts'];
 document.querySelectorAll('#derived-values dt').forEach((el,i)=>add(el,derived[i]));
 const dwell=document.getElementById('dwell-result');if(dwell&&!dwell.nextElementSibling?.classList.contains('help-pair')){add(dwell,'dwelltime','after');}
 document.querySelectorAll('#custom-form label').forEach(label=>{
  const name=label.querySelector('input')?.name;
  add(label,name?.startsWith('coefficient-')?'coefficients':name==='concentration'?'concentration':name,'field');
 });
}
document.addEventListener('click',event=>{
 const button=event.target.closest('.help-button');if(!button)return;
 event.preventDefault();event.stopPropagation();
 if(active===button&&panel.matches(':popover-open')){close();return;}
 close();active=button;const topic=topics[button.dataset.help];
 document.getElementById('control-help-title').innerHTML=topic.titleHtml;document.getElementById('control-help-text').innerHTML=topic.html;
 // Keep help inside the active modal's focus scope when editing a custom compound.
 (button.closest('dialog')||document.body).append(panel);
 panel.showPopover();button.setAttribute('aria-expanded','true');position();panel.querySelector('button').focus({preventScroll:true});
},true);
panel.querySelector('.help-close').addEventListener('click',()=>{close();active?.focus({preventScroll:true});});
panel.addEventListener('toggle',()=>{if(!panel.matches(':popover-open'))active?.setAttribute('aria-expanded','false');});
panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();active?.focus({preventScroll:true});}});
window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
let pending=false;new MutationObserver(records=>{
 if(!records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&!n.matches('.help-button,.help-pair,.control-help'))))return;
 if(!pending){pending=true;queueMicrotask(()=>{pending=false;refresh();});}
}).observe(document.getElementById('sim-app'),{childList:true,subtree:true});
new MutationObserver(()=>refresh()).observe(document.getElementById('coefficient-fields'),{childList:true});
refresh();
})();
