const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/assets/simulator/app.js','utf8');
const nodes=new Map();
function node(){return {style:{},hidden:true,handlers:{},classList:{add(){},remove(){}},parentElement:{append(){}},offsetLeft:0,offsetTop:0,clientHeight:355,setAttribute(){},addEventListener(k,f){this.handlers[k]=f},getBoundingClientRect(){return {left:0,top:0}},setPointerCapture(){},hasPointerCapture(){return false}}}
const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
const ctx=vm.createContext({$,document:{createElement:node},result:{end:100,peaks:[],sorted:[]},view:null,selected:0,plotGeometry:{x0:10,y0:10,pw:100,ph:100,start:0,end:100},requestAnimationFrame:()=>1,draw(){},updateSelection(){throw Error('drag selected a peak')},num:String,M:{signal:()=>0,detectorAt:()=>0}});
vm.runInContext(source.slice(source.indexOf("const plot=$('chromatogram')"),source.indexOf('new ResizeObserver')),ctx);
const h=$('chromatogram').handlers;
const event=(extra={})=>({clientX:60,clientY:60,pointerId:1,pointerType:'mouse',button:0,preventDefault(){this.prevented=true},...extra});
const e=event({deltaY:-200,deltaMode:0});h.wheel(e);assert(e.prevented);assert(ctx.view[1]-ctx.view[0]<100);assert(Math.abs((ctx.view[0]+ctx.view[1])/2-50)<1e-8);
const before=ctx.view[0];h.pointerdown(event());h.pointermove(event({clientX:70}));assert(ctx.view[0]<before);h.pointerup(event());h.click(event());
h.pointermove(event());assert.equal(vm.runInContext('cursorLine.hidden',ctx),false);h.pointerleave();assert.equal(vm.runInContext('cursorLine.hidden',ctx),true);
vm.runInContext('zoom(1e-100,50)',ctx);assert(ctx.view[1]>ctx.view[0]);vm.runInContext('zoom(1e100,50)',ctx);assert.equal(ctx.view[0],0);assert.equal(ctx.view[1],100);
const outside=event({clientY:0,deltaY:-200,deltaMode:0});h.wheel(outside);assert(!outside.prevented);
console.log('Passed: cursor visibility, anchored wheel zoom, drag panning, drag click suppression, zoom bounds, and outside-plot scrolling.');
// Tooltip hit testing spans the full plot height within the peak time region.
ctx.result={end:100,method:{offset:0},peaks:[{retention:50,sigma:2,height:1}],sorted:[{retention:50,sigma:2,height:1}]};
ctx.M.peakSignal=(p,t)=>p.height*Math.exp(-0.5*((t-p.retention)/p.sigma)**2);
ctx.plotGeometry={x0:0,y0:0,pw:1000,ph:200,start:0,end:100,min:0,max:2};
assert(vm.runInContext('nearbyPeak({x:500,y:100},plotGeometry)',ctx));
assert.equal(vm.runInContext('nearbyPeak({x:200,y:200},plotGeometry)',ctx),null);
for(const y of [0,10,100,200]){
  h.pointermove(event({clientX:500,clientY:y}));
  assert.equal($('plot-tooltip').hidden,false);
}
h.pointermove(event({clientX:200,clientY:10}));assert.equal($('plot-tooltip').hidden,true);
console.log('Passed: tooltip appears throughout the plot height over a peak and stays hidden between peaks.');
// Overlapping peaks should switch identity only at the retention-time midpoint.
const overlap=[{name:'ketoprofen',retention:49,sigma:2,height:1},{name:'propiophenone',retention:51,sigma:2,height:1.2}];
ctx.result={end:100,method:{offset:0},peaks:overlap,sorted:overlap};
const names=[];
for(let time=46;time<=54;time+=0.1){
  const value=overlap.reduce((sum,p)=>sum+ctx.M.peakSignal(p,time),0);
  ctx.hoverPoint={x:time*10,y:200-value/2*200};
  const peak=vm.runInContext('nearbyPeak(hoverPoint,plotGeometry)',ctx);
  assert(peak);names.push(peak.name);
}
assert.equal(names.filter((name,i)=>i&&name!==names[i-1]).length,1);
assert.equal(names[0],'ketoprofen');assert.equal(names.at(-1),'propiophenone');
console.log('Passed: overlapping peaks switch tooltip identity exactly once from left to right.');
vm.runInContext(source.slice(source.indexOf('function peakCallouts('),source.indexOf('function draw()')),ctx);
for(const count of [1,9,43,100]){
  ctx.labelPeaks=Array.from({length:count},(_,i)=>({index:i,x:100+i*0.01}));
  const labels=vm.runInContext('peakCallouts(labelPeaks,72,240)',ctx);
  assert.equal(labels.length,count);
  for(const label of labels)assert(label.labelX>=72&&label.labelX<=240);
  for(const row of new Set(labels.map(p=>p.row))){
    const xs=labels.filter(p=>p.row===row).map(p=>p.labelX);
    for(let i=1;i<xs.length;i++)assert(xs[i]-xs[i-1]>=24-1e-8);
  }
}
console.log('Passed: peak callouts stay within plot bounds and separate crowded numbers.');

ctx.labelPeaks=[{index:0,x:100},{index:1,x:160},{index:2,x:220}];
const isolated=vm.runInContext('peakCallouts(labelPeaks,72,240)',ctx);
for(const label of isolated)assert.equal(label.labelX,label.x);
console.log('Passed: isolated peak labels stay directly above their peaks.');

vm.runInContext(source.slice(source.indexOf('function detectorWindow('),source.indexOf('// Spread labels')),ctx);
ctx.sampled={end:100,detector:{times:Array.from({length:101},(_,i)=>i),values:Array.from({length:101},(_,i)=>Math.sin(i))}};
const windowData=vm.runInContext('detectorWindow(sampled,30.2,35.7)',ctx);
assert.deepEqual(Array.from(windowData.times),[30,31,32,33,34,35,36]);
assert.deepEqual(Array.from(windowData.values),ctx.sampled.detector.values.slice(30,37));
const narrow=vm.runInContext('detectorWindow(sampled,30.2,30.3)',ctx);
assert.deepEqual(Array.from(narrow.times),[30,31]);
console.log('Passed: zoom windows reuse stored samples, including bracketing points at high zoom.');
