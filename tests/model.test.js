const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../public/assets/simulator/model.js');
const fixtures=require('./java-fixtures.json');
const near=(a,b,rtol=1e-9)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=rtol*Math.max(1,Math.abs(b)),`${a} differs from ${b}`);
test('32 reference cases agree with equations extracted from Java v1.16',()=>{
  for(const f of fixtures){
    const s=M.defaults(f.phase);Object.assign(s,{autoTime:false,solvent:f.solvent,mode:f.gradient?'gradient':'isocratic',fraction:f.gradient?5:40,temperature:f.temperature,flow:f.flow,tubingLength:f.tubing,sample:[{id:f.id,concentration:25}]});
    const r=M.simulate(s),p=r.peaks[0];
    near(r.t0,f.t0);near(r.plates,f.plates);near(r.totalPressure,f.pressure);near(r.diffusion,f.diffusion);near(r.tubeDelay,f.delay);near(p.retention,f.retention);near(p.sigma,f.sigma);
  }
});
test('all 43 phase-specific compounds run under both solvents and modes',()=>{
  for(let phase=0;phase<2;phase++)for(let solvent=0;solvent<2;solvent++)for(const mode of ['isocratic','gradient']){
    const s=M.defaults(phase);Object.assign(s,{solvent,mode,sample:M.phases[phase].compounds.map(c=>({id:c.id,concentration:25}))});
    const r=M.simulate(s);assert.ok(Number.isFinite(r.end));for(const p of r.peaks){assert.ok(p.retention===null||Number.isFinite(p.retention));assert.ok(p.sigma>0&&Number.isFinite(p.sigma));}
  }
});
test('constant gradient has isocratic retention; zero mixing is finite',()=>{
  const s=M.defaults();s.sample=[{id:2,concentration:25}];const iso=M.simulate(s);
  s.mode='gradient';s.gradient=[[0,s.fraction],[5,s.fraction]];s.mixing=0;s.nonmixing=0;
  const r=M.simulate(s);near(r.peaks[0].retention,iso.peaks[0].retention);assert.ok(r.profile.every(p=>p[1]===s.fraction));
});
test('non-eluting gradients terminate and never create fictitious peaks',()=>{
  const s=M.defaults();s.mode='gradient';s.autoTime=false;s.duration=0.1;s.gradient=[[0,0],[5,0]];
  const start=performance.now(),r=M.simulate(s);assert.ok(performance.now()-start<500);
  assert.ok(r.peaks.every(p=>p.retention===null));assert.equal(r.minResolution,null);
  r.method.noise=0;r.method.offset=0;near(M.signal(r,3),0);
});
test('post-column tubing increases delay, broadening and pressure',()=>{
  const s=M.defaults();const a=M.simulate(s);s.tubingLength=100;const b=M.simulate(s);
  for(let i=0;i<a.peaks.length;i++){near(b.peaks[i].retention-a.peaks[i].retention,b.tubeDelay);assert.ok(b.peaks[i].sigma>a.peaks[i].sigma);}
  assert.ok(b.totalPressure>a.totalPressure);
});
test('peak area conserves injected amount and concentration scales height',()=>{
  const s=M.defaults();s.sample=[{id:2,concentration:25}];s.noise=0;const r=M.simulate(s),p=r.peaks[0];
  let area=0;const dt=p.sigma/1000;for(let t=p.retention-8*p.sigma;t<=p.retention+8*p.sigma;t+=dt)area+=M.peakSignal(p,t)*dt;
  near(area*s.flow/60/1000*1e6,p.amount,1e-6);
  s.sample[0].concentration*=2;near(M.simulate(s).peaks[0].height,2*p.height);
});
test('flow has inverse retention and proportional pressure at fixed composition',()=>{
  const s=M.defaults(),a=M.simulate(s);s.flow*=2;const b=M.simulate(s);near(a.t0,2*b.t0);near(b.totalPressure,2*a.totalPressure);near(a.peaks[0].retention,2*b.peaks[0].retention);
});
test('validation rejects malformed imports without mutation',()=>{
  for(const mutate of [s=>s.flow=0,s=>s.temperature=NaN,s=>s.sample=[],s=>s.sample.push(s.sample[0]),s=>s.gradient=[[0,5],[0,95]],s=>s.gradient=[[0,101],[2,95]],s=>s.phase=7,s=>s.samplingRate=0]){
    const s=M.defaults();mutate(s);assert.throws(()=>M.simulate(s));
  }
  const s=M.defaults(),copy=structuredClone(s);M.simulate(s);assert.deepEqual(s,copy);
  assert.deepEqual(M.decode(JSON.stringify({format:'hplc-simulator-web',version:1,method:s})),s);
  assert.throws(()=>M.decode('{}'));assert.throws(()=>M.decode('not json'));
});
test('custom compounds reproduce library peaks and reject nonfinite factors',()=>{
  const s=M.defaults();s.sample=[{id:2,concentration:25}];const a=M.simulate(s);
  s.sample=[{...M.phases[0].compounds[2],id:-1,concentration:25}];const b=M.simulate(s);near(a.peaks[0].retention,b.peaks[0].retention);near(a.peaks[0].sigma,b.peaks[0].sigma);
  s.sample[0]=structuredClone(s.sample[0]);s.sample[0].coefficients[0][0]=20;assert.throws(()=>M.simulate(s));
});
test('noise repeats; overlay endpoints use held composition and position',()=>{
  const s=M.defaults();s.mode='gradient';s.autoTime=false;s.duration=20;const r=M.simulate(s);
  assert.equal(M.signal(r,50,123),M.signal(r,50,123));near(M.auxiliary(r,r.end,'composition'),95,1e-7);
  near(M.auxiliary(r,r.end,'position'),s.length);assert.ok(M.auxiliary(r,100,'pressure')>0);
});
test('small concentrations preserve linear signal and survive save/load',()=>{
  const s=M.defaults();s.noise=0;s.offset=0;s.sample=[{id:2,concentration:1}];
  const base=M.simulate(s).peaks[0];
  for(const concentration of [0.0001,1e-8,0]){
    s.sample[0].concentration=concentration;
    const decoded=M.decode(JSON.stringify({format:'hplc-simulator-web',version:1,method:s}));
    assert.equal(decoded.sample[0].concentration,concentration);
    const r=M.simulate(decoded),p=r.peaks[0];
    if(concentration){assert.ok(Math.abs(p.height/(base.height*concentration)-1)<1e-12);assert.ok(M.signal(r,p.retention)>0);}
    else assert.equal(p.height,0);
    assert.equal(p.retention,base.retention);
  }
  for(const concentration of [-0.0001,NaN,Infinity]){s.sample[0].concentration=concentration;assert.throws(()=>M.simulate(s));}
});
test('random compound properties use three significant figures',()=>{
  let seed=12345;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<25;i++){
    const c=M.randomCompound(i+1,random);
    for(const value of [c.molarVolume,c.concentration,...c.coefficients.flat()]){
      assert.equal(value,Number(value.toPrecision(3)));
    }
    const s=M.defaults();s.sample=[c];assert.doesNotThrow(()=>M.simulate(s));
  }
});
test('per-compound resolution uses the worse adjacent neighbor; run minimum uses only visible pairs',()=>{
  const s=M.defaults(),r=M.simulate(s);
  const pair=(a,b)=>Math.abs(a.retention-b.retention)/(2*(a.sigma+b.sigma));
  r.sorted.forEach((p,i)=>{
    const neighbors=[r.sorted[i-1],r.sorted[i+1]].filter(Boolean);
    near(p.resolution,Math.min(...neighbors.map(q=>pair(p,q))));
    assert.ok(neighbors.some(q=>q.index===p.resolutionNeighbor));
    near(p.resolution,pair(p,r.peaks[p.resolutionNeighbor]));
  });
  assert.ok(r.sorted.some((p,i)=>i>0&&i<r.sorted.length-1&&pair(p,r.sorted[i+1])<pair(p,r.sorted[i-1])));
  s.autoTime=false;
  for(let count=1;count<r.sorted.length;count++){
    s.duration=(r.sorted[count-1].retention+r.sorted[count].retention)/120;
    const limited=M.simulate(s),visible=limited.sorted.filter(p=>p.retention<=limited.end);
    assert.equal(visible.length,count);
    if(count===1)assert.equal(limited.minResolution,null);
    else near(limited.minResolution,Math.min(...visible.slice(1).map((p,i)=>pair(p,visible[i]))));
  }
  s.sample=[s.sample[0]];const single=M.simulate(s);assert.equal(single.peaks[0].resolution,null);assert.equal(single.minResolution,null);
});
test('detector data is evenly spaced across the full run with fixed noise',()=>{
  const s=M.defaults();s.autoTime=false;s.duration=1;s.samplingRate=10;const r=M.simulate(s),snapshot=structuredClone(r.detector);
  assert.equal(r.detector.times.length,601);assert.equal(r.detector.values.length,601);
  assert.equal(r.detector.times[0],0);assert.equal(r.detector.times.at(-1),r.end);
  r.detector.times.forEach((t,i)=>{near(t,i/10);assert.equal(r.detector.values[i],M.signal(r,t,i));near(M.detectorAt(r,t),r.detector.values[i]);});
  const i=123,t=(r.detector.times[i]+r.detector.times[i+1])/2;
  near(M.detectorAt(r,t),(r.detector.values[i]+r.detector.values[i+1])/2);
  assert.deepEqual(r.detector,snapshot);
});
test('recalculation refreshes noise while existing traces remain fixed',()=>{
  const s=M.defaults();s.sample=[{id:2,concentration:0}];
  const first=M.simulate(s,()=>0.1),saved=structuredClone(first.detector);
  const second=M.simulate(s,()=>0.9);
  assert.notDeepEqual(first.detector.values,second.detector.values);
  assert.deepEqual(first.detector,saved);
  assert.deepEqual(first.detector,M.simulate(s,()=>0.1).detector);
  s.fraction=55;const changed=M.simulate(s,()=>0.3);
  assert.notDeepEqual(first.detector.values,changed.detector.values);
  assert.equal(M.detectorAt(first,first.end/3),M.detectorAt(first,first.end/3));
  s.noise=0;
  assert.deepEqual(M.simulate(s,()=>0.1).detector.values,M.simulate(s,()=>0.9).detector.values);
});
test('automatic duration follows the final peak tail in both modes',()=>{
  for(const mode of ['isocratic','gradient']){
    const s=M.defaults();s.mode=mode;s.duration=0.1;
    const r=M.simulate(s),last=r.sorted.at(-1);
    assert(r.peaks.every(p=>p.retention!==null));assert.equal(r.truncated,false);
    near(r.requestedEnd,1.05*(last.retention+3*last.sigma));
    assert(r.end>=r.requestedEnd&&r.end-r.requestedEnd<=1/s.samplingRate+1e-9);
    assert.equal(r.detector.times.length,Math.ceil(r.requestedEnd*s.samplingRate)+1);
  }
});
test('sample cap cuts off long manual and automatic runs',()=>{
  for(const mode of ['isocratic','gradient'])for(const autoTime of [true,false]){
    const s=M.defaults();Object.assign(s,{mode,autoTime,duration:240,samplingRate:1000});
    const r=M.simulate(s);assert(r.truncated);assert.equal(r.detector.times.length,M.MAX_DATA_POINTS);
    near(r.end,(M.MAX_DATA_POINTS-1)/s.samplingRate);near(r.detector.times[1],0.001);
  }
});
test('fractional sampling rates and legacy method migration',()=>{
  const s=M.defaults();Object.assign(s,{autoTime:false,duration:1,samplingRate:2.5});
  const r=M.simulate(s);assert.equal(r.detector.times.length,151);near(r.detector.times[1],0.4);
  const old={...s,points:3000};delete old.samplingRate;
  const migrated=M.decode(JSON.stringify({format:'hplc-simulator-web',version:1,method:old}));
  near(migrated.samplingRate,2999/60);assert(!('points' in migrated));
  assert.deepEqual(M.decode(JSON.stringify({format:'hplc-simulator-web',version:2,method:s})),s);
});
