(function() {
'use strict';
const M=window.HPLC,$=id=>document.getElementById(id),app=$('sim-app');
let state=M.defaults(),result,reference=null,selected=0,view=null,frame=0,customIndex=null,plotGeometry=null,lockedY=null,compareResolution=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=3)=>v===null||!Number.isFinite(v)?'—':Math.abs(v)>=1e6||Math.abs(v)>0&&Math.abs(v)<10**(-d)?v.toExponential(2):v.toLocaleString('en-US',{maximumFractionDigits:d});
function error(message='') {$('sim-error').textContent=message;$('sim-error').hidden=!message;}
function status(message) {$('sim-status').textContent=message;}
function syncControls() {
  app.querySelectorAll('[data-key]').forEach(input=>{const key=input.dataset.key;if(input.type==='checkbox')input.checked=state[key];else input.value=state[key];input.removeAttribute('aria-invalid');});
  app.querySelectorAll('[data-range]').forEach(input=>input.value=state[input.dataset.range]);
  app.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  $('isocratic-controls').hidden=state.mode!=='isocratic';$('gradient-controls').hidden=state.mode!=='gradient';
  $('duration').disabled=state.autoTime;
  $('k-heading').textContent=state.mode==='gradient'?' (exit)':'';
  renderGradient();renderSample();
}
function renderGradient() {
  $('gradient-rows').innerHTML=state.gradient.map((p,i)=>`<div class="gradient-row"><input type="number" aria-label="Gradient point ${i+1} time in minutes" data-gradient="${i}" data-column="0" value="${p[0]}" min="0" max="240" step="any" ${i===0?'readonly':''}><input type="number" aria-label="Gradient point ${i+1} solvent B percent" data-gradient="${i}" data-column="1" value="${p[1]}" min="0" max="100" step="any"><button type="button" data-remove-gradient="${i}" aria-label="Remove gradient point ${i+1}" ${i===0||state.gradient.length<=2?'disabled':''}>×</button></div>`).join('');
  $('add-gradient').disabled=state.gradient.length>=30 || state.gradient.at(-1)[0]>=240;
}
function renderSample() {
  selected=Math.min(selected,state.sample.length-1);
  const available=M.phases[state.phase].compounds.filter(c=>!state.sample.some(p=>p.id===c.id));
  $('compound-library').innerHTML=available.length?available.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''):'<option>All library compounds added</option>';
  $('add-compound').disabled=!available.length||state.sample.length>=100;
  $('compound-library').disabled=!available.length;
  $('custom-compound').disabled=state.sample.length>=100;$('random-compound').disabled=state.sample.length>=100;
  $('compound-count').textContent=state.sample.length;
  $('sample-rows').innerHTML=state.sample.map((c,i)=>`<tr data-row="${i}"><td><button class="compound-select" data-select="${i}" aria-pressed="${i===selected}" title="${esc(M.compound(state,c).name)}"><span class="compound-number">${i+1}.</span> ${esc(M.compound(state,c).name)}</button></td><td><input type="number" aria-label="${esc(M.compound(state,c).name)} concentration in micromolar" data-concentration="${i}" min="0" max="10000" step="any" value="${c.concentration}"></td><td data-cell="k">—</td><td data-cell="retention">—</td><td data-cell="sigma">—</td><td data-cell="resolution">—</td><td>${c.id===-1?`<button class="edit-compound" data-edit="${i}" aria-label="Edit ${esc(c.name)}">Edit</button>`:''}<button class="remove-compound" data-remove="${i}" aria-label="Remove ${esc(M.compound(state,c).name)}" ${state.sample.length===1?'disabled':''}>×</button></td></tr>`).join('');
}
function calculate(message) {
  try {
    result=M.simulate(state);compareResolution=false;error();
    const late=result.peaks.filter(p=>p.retention===null||p.retention>result.end).length;
    status(message||`${M.phases[state.phase].name} · ${state.mode==='gradient'?'Gradient':'Isocratic'} · ${state.sample.length} compounds${late?' · '+late+' not eluted within the displayed run':''}`);
    updateResults();draw();
  } catch(e) {error(e.message+' The graph retains the last valid calculation.');}
}
function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>calculate());}
function updateResults() {
  if(state.autoTime)$('duration').value=Number((result.end/60).toPrecision(6));
  $('run-summary').textContent=`Displayed run: ${num(result.end/60)} min · ${result.detector.times.length.toLocaleString()} samples`;
  $('sampling-warning').hidden=!result.truncated;
  $('sampling-warning').textContent=result.truncated?`The ${M.MAX_DATA_POINTS.toLocaleString()}-point limit was reached. The chromatogram stops early at ${num(result.end/60)} min. Reduce the sampling rate to record a longer run.`:'';
  $('metric-t0').textContent=num(result.t0/60);
  $('metric-pressure').textContent=num(result.totalPressure,1);
  $('pressure-label').textContent=state.mode==='gradient'?'Initial backpressure':'Backpressure';
  $('metric-plates').textContent=num(result.plates,0);
  $('metric-resolution').textContent=num(result.minResolution,2);
  $('resolution-caption').textContent=result.minResolution===null?'fewer than two visible peaks':'adjacent visible peaks';
  $('dwell-result').textContent=`Dwell volume ${num(state.mixing+state.nonmixing,0)} µL · dwell time ${num((state.mixing+state.nonmixing)/1000/state.flow)} min`;
  for(const p of result.peaks) {
    const row=$('sample-rows').querySelector(`[data-row="${p.index}"]`);if(!row)continue;
    row.querySelector('[data-cell="k"]').textContent=p.retention===null?'—':num(p.k,2);
    row.querySelector('[data-cell="retention"]').textContent=p.retention===null?'Not eluted':num(p.retention/60);
    row.querySelector('[data-cell="sigma"]').textContent=p.retention===null?'—':num(p.sigma);
    const neighbor=result.peaks[p.resolutionNeighbor];
    row.querySelector('[data-cell="resolution"]').innerHTML=neighbor?`<button type="button" class="resolution-select" data-resolution="${p.index}" title="Compared with #${neighbor.index+1} ${esc(neighbor.name)}. Click to highlight both peaks." aria-label="Resolution ${num(p.resolution,2)}: compare #${p.index+1} ${esc(p.name)} with #${neighbor.index+1} ${esc(neighbor.name)}" aria-pressed="false">${num(p.resolution,2)}</button>`:'—';
  }
  const values=[['Column hold-up volume',`${num(result.voidVolume)} mL`],['Total porosity',num(result.porosity)],['Plate height (HETP)',`${num(result.hetp*10000,2)} µm`],['Reduced velocity',num(result.reducedVelocity)],['Reduced plate height',num(result.reducedHeight)],['Diffusion coefficient',`${result.diffusion.toExponential(3)} cm²/s`],[(state.mode==='gradient'?'Initial eluent viscosity':'Eluent viscosity'),`${num(result.viscosity)} cP`],['Post-column tubing volume',`${num(result.tubeVolume)} µL`],['Post-column delay',`${num(result.tubeDelay)} s`],['Post-column pressure drop',`${num(result.tubePressure)} bar`]];
  $('derived-values').innerHTML=values.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('');
  updateSelection();
}
function updateSelection() {
  $('sample-rows').querySelectorAll('[data-select]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.select)===selected)));
  const p=result?.peaks[selected],neighbor=compareResolution?result?.peaks[p?.resolutionNeighbor]:null;
  $('comparison-label').hidden=!neighbor;
  $('sample-rows').querySelectorAll('tr').forEach(row=>{row.classList.toggle('resolution-pair',!!neighbor&&[selected,neighbor.index].includes(Number(row.dataset.row)));});
  $('sample-rows').querySelectorAll('[data-resolution]').forEach(b=>b.setAttribute('aria-pressed',String(!!neighbor&&Number(b.dataset.resolution)===selected)));
  if(p)$('chart-note').textContent=p.retention===null?`${p.name}: not eluted. Increase the run duration to follow this compound longer.`:`${p.name} · retention ${num(p.retention/60)} min · σ ${num(p.sigma)} s · injected amount ${num(p.amount)} pmol`;
  if(neighbor)$('chart-note').textContent=`Resolution comparison: #${p.index+1} ${p.name} (red) and #${neighbor.index+1} ${neighbor.name} (purple) · Rs ${num(p.resolution,2)}`;
}
app.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.key) {
    const key=el.dataset.key;if(['phase','solvent'].includes(key))return;
    const value=el.type==='checkbox'?el.checked:el.value===''?NaN:Number(el.value);
    if(key==='autoTime'&&!value){state.duration=Math.max(M.limits.duration[0],Math.min(M.limits.duration[1],Number($('duration').value)));$('duration').value=state.duration;}
    state[key]=value;
    const range=app.querySelector(`[data-range="${key}"]`);if(range&&Number.isFinite(value))range.value=value;
    el.setAttribute('aria-invalid',String(el.type!=='checkbox'&&(!Number.isFinite(value)||value<M.limits[key][0]||value>M.limits[key][1])));
    $('duration').disabled=state.autoTime;
    view=null;schedule();
  } else if(el.dataset.range) {
    state[el.dataset.range]=Number(el.value);$(el.dataset.range).value=el.value;$(el.dataset.range).removeAttribute('aria-invalid');view=null;schedule();
  } else if(el.dataset.gradient!==undefined) {
    state.gradient[Number(el.dataset.gradient)][Number(el.dataset.column)]=el.value===''?NaN:Number(el.value);view=null;schedule();
  } else if(el.dataset.concentration!==undefined) {
    state.sample[Number(el.dataset.concentration)].concentration=el.value===''?NaN:Number(el.value);schedule();
  }
});
app.addEventListener('change',event=>{
  if(event.target.id==='solvent'){state.solvent=Number(event.target.value);view=null;calculate();}
  if(event.target.id==='phase'){
    state.phase=Number(event.target.value);state.sample=M.defaults(state.phase).sample;selected=0;view=null;renderSample();calculate('Stationary phase changed. Loaded its default sample; method conditions were retained.');
  }
});
app.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.mode){state.mode=b.dataset.mode;view=null;syncControls();calculate();}
  if(b.dataset.removeGradient!==undefined){state.gradient.splice(Number(b.dataset.removeGradient),1);renderGradient();view=null;calculate();}
  if(b.dataset.resolution!==undefined){selected=Number(b.dataset.resolution);compareResolution=true;updateSelection();draw();}
  if(b.dataset.select!==undefined){compareResolution=false;selected=Number(b.dataset.select);updateSelection();draw();}
  if(b.dataset.remove!==undefined){state.sample.splice(Number(b.dataset.remove),1);selected=0;renderSample();view=null;calculate();}
  if(b.dataset.edit!==undefined)openCustom(Number(b.dataset.edit));
});
$('add-gradient').addEventListener('click',()=>{const last=state.gradient.at(-1);if(!last.every(Number.isFinite)){error('Fix the existing gradient point first.');return;}state.gradient.push([Math.min(240,last[0]+1),last[1]]);renderGradient();calculate();});
$('add-compound').addEventListener('click',()=>{state.sample.push({id:Number($('compound-library').value),concentration:25});selected=state.sample.length-1;view=null;renderSample();calculate();});
$('random-compound').addEventListener('click',()=>{state.sample.push(M.randomCompound(state.sample.filter(c=>c.id===-1).length+1));selected=state.sample.length-1;view=null;renderSample();calculate();});
$('reset-method').addEventListener('click',()=>{state=M.defaults(state.phase);selected=0;view=null;syncControls();calculate('Default method and sample restored.');});
$('reference').addEventListener('click',()=>{
  if(!result)return;
  reference=reference?null:result;
  $('reference').textContent=reference?'Clear reference':'Keep reference';$('reference-label').hidden=!reference;draw();
});
$('overlay').addEventListener('change',()=>draw());
$('auto-y').addEventListener('change',()=>{lockedY=$('auto-y').checked?null:plotGeometry?[plotGeometry.min,plotGeometry.max]:null;draw();});
$('show-peak-labels').addEventListener('change',()=>draw());
$('show-help').addEventListener('change',()=>{
  document.body.classList.toggle('hide-control-help',!$('show-help').checked);
  const help=document.getElementById('control-help');if(help?.matches(':popover-open'))help.hidePopover();
});
function detectorWindow(r,start,end){
  const {times,values}=r.detector,n=times.length;
  if(end<0||start>r.end)return {times:[],values:[]};
  // Include one sample beyond each edge so the clipped polyline stays continuous.
  const first=Math.max(0,Math.floor(start/r.end*(n-1)));
  const last=Math.min(n-1,Math.ceil(end/r.end*(n-1)));
  return {times:times.slice(first,last+1),values:values.slice(first,last+1)};
}
// Spread labels in retention order while keeping isolated labels near their peaks.
function peakCallouts(peaks,left,right){
  const gap=24,capacity=Math.max(1,Math.floor((right-left)/gap)+1);
  const rows=Math.ceil(peaks.length/capacity),labels=[];
  for(let row=0;row<rows;row++){
    const group=peaks.filter((_,i)=>i%rows===row),blocks=[];
    group.forEach((peak,i)=>{
      blocks.push({sum:peak.x-i*gap,count:1});
      while(blocks.length>1){
        const b=blocks.at(-1),a=blocks.at(-2);
        if(a.sum/a.count<=b.sum/b.count)break;
        blocks.splice(-2,2,{sum:a.sum+b.sum,count:a.count+b.count});
      }
    });
    let i=0;
    for(const block of blocks){
      const base=Math.max(left,Math.min(right-(group.length-1)*gap,block.sum/block.count));
      for(let j=0;j<block.count;j++,i++)labels.push({...group[i],labelX:base+i*gap,row,rows});
    }
  }
  return labels;
}
function draw() {
  if(!result)return;
  const canvas=$('chromatogram'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,3);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
  const overlay=$('overlay').value,hasOverlay=overlay!=='none';$('overlay-label').hidden=!hasOverlay;
  const bounds=view||[0,result.end],start=bounds[0],end=bounds[1];
  const {times,values}=detectorWindow(result,start,end);
  const {times:refTimes,values:refValues}=reference?detectorWindow(reference,start,end):{times:[],values:[]};
  let max=values.reduce((a,b)=>Math.max(a,b),0),min=values.reduce((a,b)=>Math.min(a,b),0);
  max=refValues.reduce((a,b)=>Math.max(a,b),max)*1.14;min=refValues.reduce((a,b)=>Math.min(a,b),min);
  if(max===min)max=min+0.05;
  min-=(max-min)*0.025;
  if(lockedY)[min,max]=lockedY;
  ctx.font='14px Segoe UI, sans-serif';
  const tickWidth=Math.max(...Array.from({length:5},(_,i)=>ctx.measureText(num(max-(max-min)*i/4,2)).width));
  const auxTimes=hasOverlay?Array.from({length:301},(_,i)=>start+(end-start)*i/300):[];
  const auxValues=auxTimes.map(t=>M.auxiliary(result,t,overlay,selected));
  const auxMax=Math.max(overlay==='composition'?100:0.01,...auxValues)*(overlay==='composition'?1:1.05);
  const auxLabels=Array.from({length:5},(_,i)=>num(auxMax*(1-i/4),2));
  const rightMargin=hasOverlay?Math.max(72,Math.ceil(Math.max(...auxLabels.map(label=>ctx.measureText(label).width)))+36):20;
  const x0=Math.max(72,Math.ceil(tickWidth)+36),y0=26,pw=Math.max(50,w-x0-rightMargin),ph=h-65;
  const visiblePeaks=result.peaks.filter(p=>p.retention!==null&&p.retention>=start&&p.retention<=end&&p.height>0)
    .map(p=>({index:p.index,x:x0+(p.retention-start)/(end-start)*pw,
      value:M.detectorAt(result,p.retention)})).sort((a,b)=>a.x-b.x);
  const callouts=$('show-peak-labels').checked?peakCallouts(visiblePeaks,x0+12,x0+pw-12):[];
  // Leave enough headroom for all three leader segments and their numbers.
  for(let pass=0;!lockedY&&pass<12;pass++){
    let overflow=0;
    for(const c of callouts){
      const peakY=y0+ph-(c.value-min)/(max-min)*ph;
      const needed=26+Math.abs(c.labelX-c.x)+(c.rows-1)*20;
      overflow=Math.max(overflow,y0+10+needed-peakY);
    }
    if(overflow<0.1)break;
    max=min+(max-min)*Math.min(2,ph/Math.max(ph/2,ph-overflow-1));
  }
  if(lockedY)[min,max]=lockedY;
  const x=t=>x0+(t-start)/(end-start)*pw,y=v=>y0+ph-(v-min)/(max-min)*ph;
  plotGeometry={x0,y0,pw,ph,start,end,w,min,max};
  ctx.font='14px Segoe UI, sans-serif';ctx.textBaseline='middle';
  for(let i=0;i<=4;i++){
    const py=y0+ph*i/4,v=max-(max-min)*i/4;
    ctx.strokeStyle='#e6eaf4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,py);ctx.lineTo(x0+pw,py);ctx.stroke();
    ctx.fillStyle='#62718d';ctx.textAlign='right';ctx.fillText(num(v,2),x0-8,py);
  }
  const ticks=w<420?4:6;
  for(let i=0;i<=ticks;i++){
    const px=x0+pw*i/ticks;ctx.strokeStyle='#eef1f8';ctx.beginPath();ctx.moveTo(px,y0);ctx.lineTo(px,y0+ph);ctx.stroke();
    ctx.fillStyle='#62718d';ctx.textAlign='center';ctx.fillText(num((start+(end-start)*i/ticks)/60,2),px,y0+ph+17);
  }
  ctx.fillStyle='#4e5b7d';ctx.textAlign='center';
  ctx.save();ctx.translate(12,y0+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText('Concentration (µM)',0,0);ctx.restore();
  ctx.fillText('Time (min)',x0+pw/2,h-5);
  ctx.save();ctx.beginPath();ctx.rect(x0,y0,pw,ph);ctx.clip();
  function line(ts,vs,color,width=1.5,dash=[]) {ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ts.forEach((t,i)=>i?ctx.lineTo(x(t),y(vs[i])):ctx.moveTo(x(t),y(vs[i])));ctx.stroke();ctx.setLineDash([]);}
  if(reference)line(refTimes,refValues,'#9aa3b8',1.3,[5,4]);
  const p=result.peaks[selected];
  let selectedValues=null;
  if(p&&p.retention!==null) {
    const pv=selectedValues=times.map(t=>M.peakSignal(p,t)+result.method.offset);
    ctx.beginPath();ctx.moveTo(x(times[0]),y(result.method.offset));times.forEach((t,i)=>ctx.lineTo(x(t),y(pv[i])));ctx.lineTo(x(times.at(-1)),y(result.method.offset));ctx.closePath();ctx.fillStyle='#d32f2f14';ctx.fill();
  }
  line(times,values,'#202396',1.6);
  if(selectedValues)line(times,selectedValues,'#d32f2f',2);
  const neighbor=compareResolution?result.peaks[p?.resolutionNeighbor]:null;
  if(neighbor)line(times,times.map(t=>M.peakSignal(neighbor,t)+result.method.offset),'#8550b4',2);
  ctx.restore();
  if(hasOverlay) {
    const ts=auxTimes,vs=auxValues;
    ctx.save();ctx.beginPath();ctx.rect(x0,y0,pw,ph);ctx.clip();ctx.strokeStyle='#6c84ae';ctx.lineWidth=1.2;ctx.setLineDash([4,3]);ctx.beginPath();ts.forEach((t,i)=>{const yy=y0+ph-vs[i]/auxMax*ph;i?ctx.lineTo(x(t),yy):ctx.moveTo(x(t),yy);});ctx.stroke();ctx.restore();
    ctx.fillStyle='#627ba4';ctx.textAlign='left';for(let i=0;i<=4;i++)ctx.fillText(auxLabels[i],x0+pw+7,y0+ph*i/4);
    ctx.save();ctx.translate(w-12,y0+ph/2);ctx.rotate(Math.PI/2);ctx.textAlign='center';
    ctx.fillText($('overlay').selectedOptions[0].textContent,0,0);ctx.restore();
  }
  ctx.save();ctx.font='600 14px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const c of callouts){
    if(c.value<min||c.value>max)continue;
    const peakY=y(c.value),diagonal=Math.abs(c.labelX-c.x);
    const labelY=c.rows>1?y0+10+c.row*20:peakY-26-diagonal;
    const elbowY=peakY-7;
    ctx.strokeStyle=c.index===selected?'#d32f2f':'#778098';ctx.lineWidth=1;ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(c.x,peakY-2);ctx.lineTo(c.x,elbowY);
    ctx.lineTo(c.labelX,elbowY-diagonal);ctx.lineTo(c.labelX,labelY+9);ctx.stroke();
    ctx.fillStyle=c.index===selected?'#d32f2f':'#3c4665';ctx.fillText(String(c.index+1),c.labelX,labelY);
  }
  ctx.restore();
  canvas.setAttribute('aria-label',`Chromatogram from ${num(start/60)} to ${num(end/60)} minutes, ${result.peaks.length} compounds. Selected: ${p?.name||'none'}. Detailed values are in the sample table.`);
}
const plot=$('chromatogram'),cursorLine=document.createElement('div');
cursorLine.className='plot-cursor';cursorLine.hidden=true;cursorLine.setAttribute('aria-hidden','true');plot.parentElement.append(cursorLine);
let drag=null,suppressClick=false,interactionFrame=0;
function redrawPlot(){if(!interactionFrame)interactionFrame=requestAnimationFrame(()=>{interactionFrame=0;draw();});}
function setView(left,span){
  span=Math.max(Math.min(0.01,result.end),Math.min(result.end,span));
  left=Math.max(0,Math.min(result.end-span,left));view=[left,left+span];
}
function zoom(factor,anchor=null) {
  if(!result)return;
  const current=view||[0,result.end],p=result.peaks[selected];
  const center=anchor??(p&&p.retention!==null&&p.retention<=result.end?p.retention:(current[0]+current[1])/2);
  const ratio=anchor===null?0.5:(center-current[0])/(current[1]-current[0]);
  const span=Math.max(Math.min(0.01,result.end),Math.min(result.end,(current[1]-current[0])*factor));
  setView(center-span*ratio,span);redrawPlot();
}
function plotPoint(event){
  const rect=plot.getBoundingClientRect(),g=plotGeometry;
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  return {x,y,inside:!!g&&x>=g.x0&&x<=g.x0+g.pw&&y>=g.y0&&y<=g.y0+g.ph};
}
function hideCursor(){cursorLine.hidden=true;$('plot-tooltip').hidden=true;}
function nearbyPeak(point,g){
  const time=g.start+(point.x-g.x0)/g.pw*(g.end-g.start);
  const nearest=result.sorted.reduce((best,p)=>!best||Math.abs(p.retention-time)<Math.abs(best.retention-time)?p:best,null);
  if(!nearest)return null;
  // Respond across the full plot height, but only near the peak in time.
  // A small pixel allowance keeps very narrow peaks easy to target when zoomed out.
  const radius=Math.max(3*nearest.sigma,8/g.pw*(g.end-g.start));
  return Math.abs(time-nearest.retention)<=radius?nearest:null;
}
function showCursor(point){
  if(!point.inside){hideCursor();return;}
  const g=plotGeometry;
  Object.assign(cursorLine.style,{left:(plot.offsetLeft+point.x)+'px',top:(plot.offsetTop+g.y0)+'px',height:g.ph+'px'});cursorLine.hidden=false;
}
$('zoom-in').addEventListener('click',()=>zoom(0.5));$('zoom-out').addEventListener('click',()=>zoom(2));$('zoom-fit').addEventListener('click',()=>{view=null;draw();});
plot.addEventListener('wheel',event=>{
  if(!result||!plotGeometry)return;const point=plotPoint(event);if(!point.inside)return;
  event.preventDefault();if(drag)return;
  const current=view||[0,result.end],g=plotGeometry,anchor=current[0]+(point.x-g.x0)/g.pw*(current[1]-current[0]);
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?plot.clientHeight:1);
  zoom(Math.exp(Math.max(-1,Math.min(1,delta*0.002))),anchor);showCursor(point);$('plot-tooltip').hidden=true;
},{passive:false});
plot.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||!result||!plotGeometry||!plotPoint(event).inside)return;
  suppressClick=false;const current=view||[0,result.end];
  drag={id:event.pointerId,x:event.clientX,left:current[0],span:current[1]-current[0],width:plotGeometry.pw,moved:false};
  plot.setPointerCapture(event.pointerId);plot.classList.add('is-panning');event.preventDefault();
});
plot.addEventListener('pointermove',event=>{
  if(!result||!plotGeometry)return;const point=plotPoint(event);showCursor(point);
  if(drag&&drag.id===event.pointerId){
    const dx=event.clientX-drag.x;if(Math.abs(dx)>3)drag.moved=true;
    if(drag.moved){setView(drag.left-dx/drag.width*drag.span,drag.span);redrawPlot();}
    $('plot-tooltip').hidden=true;return;
  }
  if(!point.inside)return;
  const g=plotGeometry,t=g.start+(point.x-g.x0)/g.pw*(g.end-g.start),peak=nearbyPeak(point,g);
  if(!peak){$('plot-tooltip').hidden=true;return;}
  $('plot-tooltip').textContent=`${num(t/60)} min · ${num(M.detectorAt(result,t),3)} µM${peak?'\nNearest peak: '+peak.name+' ('+num(peak.retention/60)+' min)':''}`;$('plot-tooltip').hidden=false;
});
function endPan(event){
  if(!drag||drag.id!==event.pointerId)return;suppressClick=drag.moved;drag=null;plot.classList.remove('is-panning');
  if(plot.hasPointerCapture(event.pointerId))plot.releasePointerCapture(event.pointerId);
  if(event.type==='pointerup')showCursor(plotPoint(event));else hideCursor();
}
plot.addEventListener('pointerup',endPan);plot.addEventListener('pointercancel',endPan);plot.addEventListener('lostpointercapture',endPan);
plot.addEventListener('pointerleave',hideCursor);
plot.addEventListener('click',event=>{
  if(suppressClick){suppressClick=false;return;}
  if(!result||!plotGeometry||!result.sorted.length)return;const point=plotPoint(event),g=plotGeometry;
  if(!point.inside)return;const t=g.start+(point.x-g.x0)/g.pw*(g.end-g.start);
  const peak=result.sorted.reduce((a,p)=>Math.abs(p.retention-t)<Math.abs(a.retention-t)?p:a);selected=peak.index;compareResolution=false;updateSelection();draw();
});
new ResizeObserver(()=>draw()).observe($('chromatogram'));
function download(data,name,type) {
  const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('save-method').addEventListener('click',()=>{try{M.validate(state);download(JSON.stringify({format:'hplc-simulator-web',version:2,method:state},null,2),'hplc-method.json','application/json');status('Method download requested. Use Open method to restore this JSON file.');}catch(e){error(e.message);}});
$('load-method').addEventListener('click',()=>$('method-file').click());
$('method-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>1e6)throw Error('Method files must be smaller than 1 MB.');const candidate=M.decode(await file.text());M.simulate(candidate);state=candidate;view=null;selected=0;syncControls();calculate(`Opened ${file.name}.`);}catch(e){error('Could not open method: '+e.message);}finally{event.target.value='';}
});
const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function safeCsvText(s){return /^[=+\-@\t\r]/.test(s)?"'"+s:s;}
$('export-csv').addEventListener('click',()=>{
  if(!result)return;const rows=[['HPLC Simulator browser edition','Java model v1.16'],['Method JSON',JSON.stringify(result.method)],[],['Compound','Concentration (µM)','k (exit for gradient)','Retention (min)','Sigma (s)','Minimum resolution to adjacent neighbors','Injected amount (pmol)']];
  result.peaks.forEach(p=>rows.push([safeCsvText(p.name),p.concentration,p.retention===null?'':p.k,p.retention===null?'Not eluted':p.retention/60,p.retention===null?'':p.sigma,p.resolution,p.amount]));
  rows.push([],['Time (min)','Total concentration (µM)',...result.peaks.map(p=>safeCsvText(p.name)+' (µM)')]);
  for(let i=0;i<result.detector.times.length;i++){const t=result.detector.times[i];rows.push([t/60,result.detector.values[i],...result.peaks.map(p=>M.peakSignal(p,t))]);}
  download('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'hplc-results.csv','text/csv;charset=utf-8');status('CSV download requested: method, peak results, and full-run chromatogram.');
});
$('export-png').addEventListener('click',()=>$('chromatogram').toBlob(blob=>{if(blob){download(blob,'hplc-chromatogram.png','image/png');status('Chromatogram image download requested.');}},'image/png'));
function openCustom(index=null) {
  customIndex=index;const c=index===null?{name:'Custom compound',concentration:25,molarVolume:150,coefficients:[[-0.008,2,0.006,-3],[-0.01,2.5,0.008,-3.2]]}:state.sample[index];
  for(const key of ['name','concentration','molarVolume'])$('custom-form').elements[key].value=c[key];
  const labels=['log k_w temperature slope','log k_w intercept','−S temperature slope','−S intercept'];
  $('coefficient-fields').innerHTML=c.coefficients.map((row,i)=>`<fieldset class="coefficient-set"><legend>${i===0?'Acetonitrile':'Methanol'}</legend><div class="field-grid">${row.map((value,j)=>`<label class="field">${labels[j]}<input name="coefficient-${i}-${j}" type="number" required step="any" min="-20" max="20" value="${value}"></label>`).join('')}</div></fieldset>`).join('');
  $('custom-form').querySelector('button[type=submit]').textContent=index===null?'Add to sample':'Save compound';$('custom-error').hidden=true;$('custom-dialog').showModal();
}
$('custom-compound').addEventListener('click',()=>openCustom());$('close-custom').addEventListener('click',()=>$('custom-dialog').close());
$('custom-form').addEventListener('submit',event=>{
  event.preventDefault();const fields=event.currentTarget.elements;
  const c={id:-1,name:fields.name.value.trim(),concentration:Number(fields.concentration.value),molarVolume:Number(fields.molarVolume.value),coefficients:[0,1].map(i=>[0,1,2,3].map(j=>Number(fields[`coefficient-${i}-${j}`].value)))};
  try{const candidate=structuredClone(state);if(customIndex===null)candidate.sample.push(c);else candidate.sample[customIndex]=c;M.simulate(candidate);state=candidate;selected=customIndex??state.sample.length-1;view=null;renderSample();calculate();$('custom-dialog').close();}catch(e){$('custom-error').textContent=e.message;$('custom-error').hidden=false;}
});
syncControls();calculate();
})();
