/* HPLC Simulator browser port — supplied Java version 1.16.
 * Pure numerical model shared by the UI and Node tests. See public/SIMULATOR.md.
 * Units: seconds internally; cm for velocity; mL/min flow; µM concentration.
 */
(function(root) {
'use strict';
const phases = typeof module !== 'undefined' ? require('./compounds.js') : root.HPLCPhases;
const MAX_DATA_POINTS=100000;
const limits = {fraction:[0,100],temperature:[10,100],flow:[0.01,20],length:[1,1000],diameter:[0.1,100],particle:[0.001,1000],inter:[0.1,0.9],intra:[0.01,0.9],a:[0.01,20],b:[0.01,50],c:[0.001,5],injection:[0.01,1000],detector:[0.001,30],noise:[0,1000],offset:[0,1000],tubingLength:[0,1000],tubingDiameter:[0.5,100],mixing:[0,10000],nonmixing:[0,10000],duration:[0.1,240],samplingRate:[0.1,1000]};
function defaults(phase=0) {
  return {phase,mode:'isocratic',solvent:0,fraction:phase===0?40:50,temperature:phase===0?40:25,
    flow:2,length:100,diameter:4.6,particle:3,inter:0.4,intra:0.4,a:1,b:5,c:0.05,
    injection:5,detector:0.1,noise:2,offset:0,tubingLength:0,tubingDiameter:5,mixing:200,nonmixing:200,
    duration:10,autoTime:true,samplingRate:10,gradient:[[0,5],[5,95]],
    sample:(phase===0?[[2,30],[3,40],[4,50],[5,60],[12,30],[14,50],[17,100],[18,20],[19,50]]:[[2,5],[3,25],[4,40],[6,15],[11,10]]).map(([id,concentration])=>({id,concentration}))};
}
function compound(s,c) {return c.id===-1?c:phases[s.phase].compounds[c.id];}
function validate(s) {
  if(!s || ![0,1].includes(s.phase) || !['isocratic','gradient'].includes(s.mode) || ![0,1].includes(s.solvent)) throw Error('Choose a supported column phase, method, and solvent.');
  for(const [key,[min,max]] of Object.entries(limits)) if(!Number.isFinite(s[key]) || s[key]<min || s[key]>max) throw Error(`${key} must be between ${min} and ${max}.`);
  if(typeof s.autoTime!=='boolean') throw Error('Invalid automatic run-duration setting.');
  if(!Array.isArray(s.sample) || s.sample.length<1 || s.sample.length>100) throw Error('Use between 1 and 100 sample compounds.');
  const ids=new Set();
  for(const c of s.sample) {
    if(!c || !Number.isInteger(c.id) || c.id< -1 || (c.id!==-1 && (!phases[s.phase].compounds[c.id] || ids.has(c.id))) || !Number.isFinite(c.concentration) || c.concentration<0 || c.concentration>10000) throw Error('Invalid sample: concentrations must be 0–10000 µM, with no duplicate library compounds.');
    if(c.id===-1 && (typeof c.name!=='string' || !c.name.trim() || c.name.length>80 || !Number.isFinite(c.molarVolume) || c.molarVolume<10 || c.molarVolume>2000 || !Array.isArray(c.coefficients) || c.coefficients.length!==2 || !c.coefficients.every(p=>Array.isArray(p)&&p.length===4&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=20)))) throw Error('Custom compounds need a name, molar volume (10–2000 cm³/mol), and four finite coefficients (−20 to 20) for each solvent.');
    if(c.id!==-1) ids.add(c.id);
  }
  if(!Array.isArray(s.gradient) || s.gradient.length<2 || s.gradient.length>30) throw Error('Use 2–30 gradient points.');
  s.gradient.forEach((p,i)=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>240||p[1]<0||p[1]>100||(i===0&&p[0]!==0)||(i>0&&p[0]<=s.gradient[i-1][0])) throw Error('Gradient times must start at zero and increase. Solvent B must stay between 0 and 100%.');});
  return s;
}
function interpolate(points,t) {
  if(t<=points[0][0]) return points[0][1];
  if(t>=points.at(-1)[0]) return points.at(-1)[1];
  let lo=0,hi=points.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<t)lo=mid;else hi=mid;}
  return points[lo][1]+(points[hi][1]-points[lo][1])*(t-points[lo][0])/(points[hi][0]-points[lo][0]);
}
function viscosity(phi,T,solvent) {
  return solvent===0?Math.exp(phi*(-3.476+726/T)+(1-phi)*(-5.414+1566/T)+phi*(1-phi)*(-1.762+929/T))
    :Math.exp(phi*(-4.597+1211/T)+(1-phi)*(-5.961+1736/T)+phi*(1-phi)*(-6.215+2809/T));
}
function retentionFactor(c,s,phi) {
  const [m,w,n,v]=compound(s,c).coefficients[s.solvent];
  const exponent=m*s.temperature+w+(n*s.temperature+v)*phi;
  if(!Number.isFinite(exponent)||Math.abs(exponent)>12) throw Error('These custom coefficients produce an extreme retention factor. Adjust the coefficients or conditions (log k must be between −12 and 12).');
  return 10**exponent;
}
function gradientProfile(s,end=s.duration*60) {
  // The original 1000-point, volume-balance mixer calculation.
  const dt=s.duration*60/999,delay=s.nonmixing/1000/s.flow*60,stepVolume=s.flow/60*1000*dt;
  let mixer=s.gradient[0][1];const points=[];
  for(let i=0;i<=Math.ceil(end/dt);i++) {
    const t=i*dt;points.push([t,mixer]);
    const incoming=interpolate(s.gradient,(t-delay)/60);
    mixer=stepVolume<s.mixing?mixer+(incoming-mixer)*stepVolume/s.mixing:incoming;
  }
  return points;
}
function gradientRetention(c,s,t0,profile) {
  // Literal Java migration loop, including its interpolation at the column exit.
  // Bound the calculation by run duration; late compounds are reported as not eluted.
  const dt=s.duration*60/1000,horizon=s.duration*60;
  let integral=0,total=0,dead=0,x=0,lastX=[0,0],lastK=[0,0],retention=null,k=0;
  const trajectory=[];
  for(let step=0;step<10010;step++) {
    k=retentionFactor(c,s,interpolate(profile,total-integral)/100);
    trajectory.push([total,k,Math.min(1,x)]);
    if(x<1 && total>horizon) break;
    const cur=dt/k,movement=cur/t0;
    let d=0;
    if(x>=1) d=(1-lastX[0])/(x-lastX[0])*(dead-lastX[1])+lastX[1];
    else lastX=[x,dead];
    dead+=movement*t0;
    if(x>=1) retention=(d-lastK[0])/(integral-lastK[0])*(total-lastK[1])+lastK[1];
    else lastK=[integral,total];
    total+=dt+cur;integral+=cur;
    if(x>1)break;
    x+=movement;
  }
  if(retention!==null && retention>horizon)retention=null;
  return {retention,k,trajectory};
}
function simulate(method,random=Math.random) {
  const s=structuredClone(validate(method));
  // Use initial gradient composition for viscosity and efficiency, avoiding a hidden isocratic control.
  const phi=s.mode==='gradient'?s.gradient[0][1]/100:s.fraction/100,T=s.temperature+273.15;
  const porosity=s.inter+s.intra*(1-s.inter),area=Math.PI*(s.diameter/20)**2;
  const voidVolume=area*s.length/10*porosity,t0=voidVolume/s.flow*60;
  const velocity=s.flow/60/area,eta=viscosity(phi,T,s.solvent);
  const pressure=velocity/100*s.length/1000*eta/1000*180*(1-s.inter)**2/(s.inter**3*(s.particle/1e6)**2)/1e5;
  const molar=s.sample.reduce((sum,c)=>sum+compound(s,c).molarVolume,0)/s.sample.length;
  const diffusion=7.4e-8*Math.sqrt(((1-phi)*0.7+1.9)*(phi*((s.solvent===0?41:32)-18)+18))*T/(eta*molar**0.6);
  const reducedVelocity=s.particle/10000*velocity/s.inter/diffusion;
  const reducedHeight=s.a+s.b/reducedVelocity+s.c*reducedVelocity,hetp=s.particle/10000*reducedHeight,plates=s.length/10/hetp;
  const radius=s.tubingDiameter*0.00254/2,tubeVelocity=s.flow/60/(Math.PI*radius**2);
  const tubeVolume=s.tubingLength*Math.PI*radius**2*1000,tubeDelay=tubeVolume/1000/s.flow*60;
  const tubeVariance=(2*diffusion*s.tubingLength/tubeVelocity+radius**2*s.tubingLength*tubeVelocity/(24*diffusion))*(Math.PI*radius**2)**2*(60/s.flow)**2;
  const tubePressure=8*(eta/1000)*(s.tubingLength/100)*(s.flow/1e6/60)/(Math.PI*(radius/100)**4)/1e5;
  const capTime=(MAX_DATA_POINTS-1)/s.samplingRate;
  let horizon=s.autoTime?Math.min(capTime,Math.max(60,s.gradient.at(-1)[0]*60+(s.mixing+s.nonmixing)/1000/s.flow*60+5*t0)):Math.min(capTime,s.duration*60);
  let profile,peaks;
  for(let attempt=0;attempt<32;attempt++){
  const calculation={...s,duration:horizon/60};
  profile=s.mode==='gradient'?gradientProfile(calculation):null;
  peaks=s.sample.map((c,index)=>{
    const kr=profile?gradientRetention(c,calculation,t0,profile):{k:retentionFactor(c,s,phi)};
    let retention=profile?(kr.retention===null?null:kr.retention+tubeDelay):t0*(1+kr.k)+tubeDelay;
    if(profile && retention>horizon)retention=null;
    const sigma=Math.sqrt((profile?t0*(1+kr.k):retention)**2/plates+s.detector**2+tubeVariance+(profile?0:((s.injection/1000)/(s.flow/60))**2/12));
    const height=(s.injection/1e6*c.concentration)/(Math.sqrt(2*Math.PI)*sigma*(s.flow/(60*1000)));
    return {...c,index,name:compound(s,c).name,k:kr.k,retention,sigma,height,amount:s.injection*c.concentration,trajectory:kr.trajectory,resolution:null};
  });
  if(!profile||!s.autoTime||peaks.every(p=>p.retention!==null)||horizon>=capTime)break;
  horizon=Math.min(capTime,horizon*2);
  }
  const sorted=peaks.filter(p=>p.retention!==null).sort((a,b)=>a.retention-b.retention);
  const pairResolution=(a,b)=>Math.abs(b.retention-a.retention)/(2*(a.sigma+b.sigma));
  sorted.forEach((p,i)=>{
    const neighbors=[sorted[i-1],sorted[i+1]].filter(Boolean);
    const neighbor=neighbors.reduce((best,q)=>!best||pairResolution(p,q)<pairResolution(p,best)?q:best,null);
    p.resolution=neighbor?pairResolution(p,neighbor):null;
    p.resolutionNeighbor=neighbor?neighbor.index:null;
  });
  const last=sorted.at(-1);
  const unresolved=s.autoTime&&peaks.some(p=>p.retention===null);
  const requestedEnd=s.autoTime?(unresolved?Infinity:1.05*(last.retention+3*last.sigma)):s.duration*60;
  const truncated=requestedEnd>capTime;
  const count=truncated?MAX_DATA_POINTS:Math.max(2,Math.min(MAX_DATA_POINTS,Math.ceil(requestedEnd*s.samplingRate)+1));
  const end=(count-1)/s.samplingRate;
  // Extend the overlay profile to include peak tails after the final elution.
  if(profile&&end>horizon)profile=gradientProfile({...s,duration:horizon/60},end);
  const visible=sorted.filter(p=>p.retention<=end);
  const minResolution=visible.length>1?Math.min(...visible.slice(1).map((p,i)=>pairResolution(visible[i],p))):null;
  const result={peaks,sorted,end,requestedEnd,truncated,profile,t0,voidVolume,porosity,pressure,tubePressure,totalPressure:pressure+tubePressure,tubeVolume,tubeDelay,tubeVariance,viscosity:eta,diffusion,plates,hetp,reducedVelocity,reducedHeight,minResolution,method:s};
  const times=Array.from({length:count},(_,i)=>i/s.samplingRate);
  result.noiseSeed=Math.floor(random()*4294967296);
  result.detector={times,values:times.map((t,i)=>signal(result,t,i))};
  return result;
}
function peakSignal(p,t) {return p.retention===null?0:p.height*Math.exp(-0.5*((t-p.retention)/p.sigma)**2);}
function signal(result,t,noiseIndex=0) {
  const s=result.method;
  const index=noiseIndex+1+(result.noiseSeed||0);
  const u=Math.max(1e-12,((Math.sin(index*127.1)*43758.5453)%1+1)%1);
  const v=((Math.sin(index*311.7)*22578.1459)%1+1)%1;
  const noise=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*s.noise/1000/Math.sqrt(s.detector);
  return s.offset+noise+result.peaks.reduce((y,p)=>y+peakSignal(p,t),0);
}
// Interpolate the stored detector trace; never generate new noise for a view or tooltip.
function detectorAt(result,t){
  const {times,values}=result.detector;
  const position=Math.max(0,Math.min(times.length-1,t/result.end*(times.length-1)));
  const i=Math.floor(position),j=Math.min(i+1,times.length-1);
  return values[i]+(values[j]-values[i])*(position-i);
}
function auxiliary(result,t,type,index=0) {
  const s=result.method,phi=result.profile?interpolate(result.profile,t)/100:s.fraction/100;
  if(type==='composition')return phi*100;
  const eta=viscosity(phi,s.temperature+273.15,s.solvent);
  if(type==='viscosity')return eta;
  if(type==='pressure')return result.totalPressure*eta/result.viscosity;
  const p=result.peaks[index];if(!p)return 0;
  if(p.trajectory) return interpolate(p.trajectory.map(v=>[v[0],v[type==='retention'?1:2]*(type==='position'?s.length:1)]),t);
  if(type==='retention')return p.k;
  return Math.min(1,t/(result.t0*(1+p.k)))*s.length;
}
function randomCompound(index=1,random=Math.random) {
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(random(),1e-12)))*Math.cos(2*Math.PI*random());
  const volume=random()*100+90,w0=random()*6.268938682-2,w1=1.036104824*w0+0.498925029+gaussian()*0.219210168;
  const compound={id:-1,name:`Unknown ${index}`,molarVolume:volume,concentration:10**(random()*2),coefficients:[
    [-0.002977165*w0-0.002210656+gaussian()*0.001038813,w0,0.003334429*w0+0.000190878+gaussian()*0.001400388,-0.896773193*w0-1.088853824+gaussian()*0.130567307],
    [-0.003077331*w1-0.004028345+gaussian()*0.000898516,w1,0.002509075*w1+0.004044421+gaussian()*0.001002375,-0.735675344*w1-1.407983911+gaussian()*0.147499601]]};
  const round=value=>Number(value.toPrecision(3));
  compound.molarVolume=round(compound.molarVolume);
  compound.concentration=round(compound.concentration);
  compound.coefficients=compound.coefficients.map(row=>row.map(round));
  return compound;
}
function decode(text) {
  const doc=JSON.parse(text);
  if(doc.format!=='hplc-simulator-web' || ![1,2].includes(doc.version))throw Error('Choose an HPLC Simulator web method (.json). Legacy Java files are not supported.');
  const method=structuredClone(doc.method);
  if(method&&method.samplingRate===undefined&&Number.isInteger(method.points)&&method.points>=500&&method.points<=20000&&Number.isFinite(method.duration)&&method.duration>0){
    method.samplingRate=Math.max(0.1,Math.min(1000,(method.points-1)/(method.duration*60)));
    delete method.points;
  }
  return validate(method);
}
const api={MAX_DATA_POINTS,phases,limits,defaults,compound,validate,simulate,signal,detectorAt,peakSignal,retentionFactor,interpolate,gradientProfile,auxiliary,randomCompound,decode};
if(typeof module!=='undefined')module.exports=api;else root.HPLC=api;
})(globalThis);
