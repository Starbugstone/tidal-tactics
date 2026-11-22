import { bossSheets, drawThreat, drawFallen, threatHeight } from './animation.js';
import { Road } from './road.js';
import { gearKeys } from './assets.js';
import { Simulation, autopilot, LANE_HALF } from './simulation.js';

const worlds=[['bay-road',[.333,.672]],['kiln-road',[.325,.674]],['frost-road',[.346,.654]]];
const weapons=['#ffd988','#6ef3ff','#ffa735','#ff7665'];
const TAU=Math.PI*2;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function pill(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,Math.min(r,h/2));}
function polygon(c,points,fill){
  c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.closePath();c.fillStyle=fill;c.fill();
}
function shadeSprite(image){
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const c=canvas.getContext('2d');c.drawImage(image,0,0);c.globalCompositeOperation='source-atop';c.fillStyle='rgba(255,226,165,.40)';c.fillRect(0,0,canvas.width,canvas.height);return canvas;
}
function glowSprite(core,mid){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');
  const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,core);g.addColorStop(.18,mid);g.addColorStop(1,'rgba(255,126,33,0)');c.fillStyle=g;c.fillRect(0,0,64,64);return canvas;
}

export class Battlefield {
  constructor(canvas,art){
    this.canvas=canvas;this.art=art;this.c=canvas.getContext('2d',{alpha:true});this.road=new Road(document.querySelector('#terrain'));
    this.flashArt=Object.fromEntries(['anim-infected',...bossSheets].map(k=>[k,shadeSprite(art[k])]));
    this.glow=glowSprite('#fffef2','rgba(255,191,65,.95)');this.blueGlow=glowSprite('#f0ffff','rgba(83,228,255,.9)');
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.time=0;this.camera=0;this.resize();this.clearEffects();
  }
  resize(){
    const r=this.canvas.getBoundingClientRect();this.w=Math.max(1,r.width);this.h=Math.max(1,r.height);
    this.dpr=Math.min(window.devicePixelRatio||1,1.6);
    for(const el of [this.canvas,this.road.canvas]){el.width=Math.round(this.w*this.dpr);el.height=Math.round(this.h*this.dpr);}
    this.near=Math.min(this.w*.94,this.h*1.22);this.unit=this.near/(LANE_HALF*2);this.c.imageSmoothingEnabled=true;
  }
  preview(index){
    const s=new Simulation(index);s.start();
    // The briefing opens in a real encounter. Deployment starts a fresh run.
    for(let t=0;t<205&&s.state==='playing';t++){autopilot(s);s.update(.1);s.events.length=0;}
    this.demo=s;this.demoStart=s.elapsed;
  }
  load(sim){
    this.index=sim.index;
    const [key,range]=worlds[sim.index];this.road.set(this.art[key],range);this.preview(sim.index);this.clearEffects();
  }
  clearEffects(){this.fx=[];this.rings=[];this.labels=[];this.fallen=[];this.impacts=[];this.shake=0;this.gainPulse=0;this.bossWarning=0;}
  aimAt(clientX){return clamp((clientX-this.canvas.getBoundingClientRect().left-this.w/2)/this.unit,-3.6,3.6);}
  project(x,d,z=0){
    const k=17.5/Math.max(5,17.5+d-this.camera),s=this.unit*k;
    return {x:this.w/2+x*s,y:this.h*(1.14*k-.38)-z*s,s,k};
  }
  ring(e,color,r,ttl){this.rings.push({x:e.x,d:e.d,color,r,ttl,life:ttl});}
  event(e){
    if(e.type==='fall'){
      this.fallen.push({...e, age:0, side:e.id%2?1:-1});
      if(this.fallen.length>160)this.fallen.shift();
      return;
    }
    if(e.type==='hit'||e.type==='casualty'||e.type==='bossStomp'||e.type==='blast'){
      const group=e.type==='bossStomp'?'stomp':e.type==='blast'?'blast':e.type==='casualty'?'claw':'spark';
      const height=e.target==='boss'?2.1:e.target==='brute'?1.1:e.target==='crate'?.5:.75;
      // One volley can hit one target several times during the same display frame.
      const previous=this.impacts.at(-1);
      if(!previous || previous.age>0 || previous.group!==group || Math.abs(previous.x-e.x)+Math.abs(previous.d-e.d)>.32){
        this.impacts.push({x:e.x,d:e.d,z:group==='stomp'?.08:group==='blast'?.25:height,group,age:0,angle:Math.random()*TAU});
        if(this.impacts.length>80)this.impacts.shift();
      }
    }
    if(e.type==='recruit'){
      if(e.gain>0){this.gainPulse=1;this.labels.push({text:'+'+e.gain,x:e.x,d:e.d,life:.78});this.ring(e,'#c0ff76',2.2,.40);}
    }
    if(e.type==='recruit'&&e.gain===0){this.gainPulse=.65;this.labels.push({text:'MAX',x:e.x,d:e.d,life:.78});}
    if(e.type==='upgrade'){this.ring(e,'#ffe486',3.7,.65);this.gainPulse=1;}
    if(e.type==='bossWarn')this.bossWarning=e.time||1.15;
    if(e.type==='bossStomp'){this.shake=.75;this.ring(e,'#ff7759',e.radius,.48);}
    if(e.type==='crateOpen')this.ring(e,'#ffd377',1.65,.46);
    if(e.type==='blast'||e.type==='bossDown'){this.shake=e.type==='bossDown'?1:.28;this.ring(e,'#ffbe6e',e.radius||3.6,.36);}
    if(!['hit','blast','crateOpen','bossDown','upgrade'].includes(e.type))return;
    const big=['blast','bossDown'].includes(e.type),loot=['crateOpen','upgrade'].includes(e.type);
    const count=big?15:loot?11:e.killed?5:2;
    for(let i=0;i<count&&this.fx.length<260;i++){
      const life=(big?.56:loot?.42:.20)*(Math.random()*.55+.7);
      this.fx.push({x:e.x,d:e.d,z:big?.30:.55,vx:(Math.random()-.5)*(big?6:2.8),vd:(Math.random()-.5)*3,vz:1+Math.random()*(big?5:3),life,ttl:life,big:big&&i%3===0,color:loot?'#ffda75':big?'#ffab54':e.killed?'#bbdd78':'#fff2ad'});
    }
  }
  print(text,x,y,size,color='#fff8e6',align='center'){
    const c=this.c;c.textAlign=align;c.textBaseline='middle';c.font='italic 900 '+size+'px "Barlow Condensed",sans-serif';c.lineJoin='round';c.strokeStyle='rgba(21,33,34,.68)';c.lineWidth=Math.max(1.6,size*.087);c.strokeText(text,x,y);c.fillStyle=color;c.fillText(text,x,y);
  }
  shadow(x,y,rx,ry,alpha=.22){
    const c=this.c;c.fillStyle='rgba(15,24,27,'+alpha+')';c.beginPath();c.ellipse(x+rx*.17,y+ry*.14,Math.max(.25,rx),Math.max(.25,ry),-.11,0,TAU);c.fill();
  }
  character(u,allied,tier){
    const c=this.c,p=this.project(u.x,u.d);if(p.y< -20||p.y>this.h*1.22)return;
    if(!allied){
      const height=threatHeight(u.kind,p.s,this.h);
      drawThreat(this,u,p,height);
      if(u.kind==='boss'){
        const top=p.y-height*1.10-5, w=height*.8;
        c.fillStyle='#261622';c.fillRect(p.x-w/2,top,w,5);
        c.fillStyle='#fa6b55';c.fillRect(p.x-w/2+1,top+1,(w-2)*Math.max(0,u.hp/u.maxHp),3);
      }
      return;
    }
    const img=this.art['marine'+tier],ht=1.22*p.s,wd=ht*img.width/img.height;
    const beat=Math.sin(this.time*12+u.phase),recoil=Math.max(0,Math.sin(this.time*(tier>=2?39:19)+u.id*7)-.65);
    this.shadow(p.x,p.y,wd*.40,Math.max(1,ht*.083),.27);
    c.save();c.translate(p.x,p.y-Math.abs(beat)*ht*.022+ht*recoil*.036);c.rotate(beat*.024);
    const split=Math.floor(img.height*.72),legH=img.height-split,hip=-ht+ht*split/img.height;
    for(let side=0;side<2;side++){
      const swing=(side?1:-1)*beat*ht*.036;
      c.drawImage(img,side*img.width/2,split,img.width/2,legH,-wd/2+side*wd/2,hip-.5,wd/2,ht*legH/img.height+swing+.5);
    }
    c.drawImage(img,0,0,img.width,split+1,-wd/2,-ht,wd,ht*(split+1)/img.height);
    c.restore();
  }
  impact(mark){
    const c=this.c,p=this.project(mark.x,mark.d,mark.z);
    const heavy=mark.group==='blast'||mark.group==='stomp',claw=mark.group==='claw';
    const t=mark.age/(heavy?.38:.17),r=p.s*(heavy?1.8:claw?.68:.46);
    if(t>=1)return;
    c.save();c.translate(p.x,p.y);c.globalAlpha=(1-t)*.92;
    if(claw){
      c.strokeStyle='#ff8566';c.lineWidth=Math.max(2,r*.12);c.lineCap='round';
      for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(i*r*.32-r*.33,-r*.6);c.quadraticCurveTo(i*r*.32,-r*.22,i*r*.32+r*.5,r*(.2+t*.7));c.stroke();}
    }else{
      if(mark.group==='stomp')c.scale(1,.56);
      c.rotate(mark.angle);c.strokeStyle=mark.group==='stomp'?'#dcbb87':heavy?'#ff9d3b':'#ffdb74';
      c.lineWidth=Math.max(1.5,p.s*(heavy?.105:.062));
      const rays=heavy?9:5;
      for(let i=0;i<rays;i++){c.rotate(TAU/rays);const reach=r*(.7+.28*Math.sin(i*19+mark.angle));c.beginPath();c.moveTo(reach*t*.77,0);c.lineTo(reach*(.35+t),0);c.stroke();}
      const size=r*(1-t)*(heavy?1.7:.78);c.drawImage(this.glow,-size,-size,size*2,size*2);
    }
    c.restore();
  }
  gate(o){
    const c=this.c,p=this.project(o.x,o.d);const w=o.width*p.s,h=p.s*1.24;
    const minus=o.risk,mult=o.op==='mul',base=minus?'#b7403e':mult?'#2e9f50':'#1888b3',edge=minus?'#ffad8e':mult?'#b7ff84':'#8ffaff';
    this.shadow(p.x,p.y,w*.52,h*.12,.20);
    const x=p.x-w/2,y=p.y-h;
    const grad=c.createLinearGradient(0,y,0,p.y);grad.addColorStop(0,base);grad.addColorStop(1,minus?'rgba(111,28,38,.51)':mult?'rgba(46,147,75,.49)':'rgba(20,132,167,.52)');
    c.fillStyle=grad;c.fillRect(x,y,w,h);c.fillStyle=edge;c.fillRect(x,y,w,Math.max(2,h*.065));c.fillRect(x,p.y-2,w,2);
    for(const px of [x,x+w]){
      c.fillStyle='#2c4142';c.fillRect(px-.075*p.s,y-.05*p.s,.15*p.s,h+.12*p.s);
      c.fillStyle=edge;c.fillRect(px-.04*p.s,y,.08*p.s,h*.90);
      c.fillStyle='#c5c4ae';c.fillRect(px-.115*p.s,p.y-.06*p.s,.23*p.s,.12*p.s);
    }
    this.print(o.label,p.x,y+h*.52,clamp(h*.82,15,54));
  }
  loot(o){
    const c=this.c,p=this.project(o.x,o.d),s=p.s,gear=this.art[gearKeys[o.tier]],isPickup=o.kind==='pickup';
    const tone=weapons[o.tier],w=s*1.55,h=s*.72,x=p.x-w/2,y=p.y-h;
    this.shadow(p.x,p.y,w*.57,s*.20);
    if(!isPickup){
      polygon(c,[x,y,x+w*.13,y-s*.23,x+w*1.10,y-s*.23,x+w,y],o.flash>.081?'#fff6ca':'#efb751');
      polygon(c,[x+w,y,x+w*1.10,y-s*.23,x+w*1.10,p.y-s*.20,x+w,p.y],'#6d552e');
      c.fillStyle=o.flash>.081?'#ffe4a0':'#876331';c.fillRect(x,y,w,h);
      c.fillStyle='#364246';for(const z of [.07,.78])c.fillRect(x+z*w,y,w*.14,h);
      c.fillStyle=tone;c.fillRect(x,y+h*.06,w,h*.10);
      this.print(String(Math.ceil(o.hp)),p.x,y+h*.56,clamp(h*.88,12,39));
    }else{
      const r=w*(.62+.06*Math.sin(this.time*7));
      c.fillStyle='#ffdb6333';c.beginPath();c.ellipse(p.x,p.y,r,r*.34,0,0,TAU);c.fill();c.strokeStyle=tone;c.lineWidth=2;c.stroke();
    }
    const gy=isPickup?p.y-s*.8+Math.sin(this.time*5)*s*.12:y-s*.56;
    const iw=clamp(s*(isPickup?1.8:1.37),16,115),ih=iw*gear.height/gear.width;
    c.save();c.translate(p.x,gy);c.rotate(-.07+Math.sin(this.time*3)*.055);c.drawImage(gear,-iw/2,-ih/2,iw,ih);c.restore();
    if(isPickup)this.print('EQUIP',p.x,p.y+.17*s,clamp(s*.33,10,19),'#ffedaa');
  }
  bullet(b){
    const c=this.c,p=this.project(b.x,b.d,.66),s=p.s,rocket=b.kind==='rocket';
    const shell=b.kind==='shell',twin=b.kind==='tracer';const length=rocket?.48:shell?.38:twin?.32:.25;
    const tail=this.project(b.x-length*b.vx/(b.vd||30),b.d-length,.66),dx=p.x-tail.x,dy=p.y-tail.y;
    c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(dy,dx));const size=Math.max(3,Math.hypot(dx,dy));
    if(rocket){
      c.fillStyle='rgba(242,218,174,.45)';for(let i=1;i<4;i++){c.beginPath();c.arc(-size*(1+i*.37),0,s*(.04+i*.022),0,TAU);c.fill();}
      polygon(c,[-size*.63,0,-size*1.8,-s*.09,-size*1.54,0,-size*1.93,s*.08],'#ffb039');
      polygon(c,[size*.46,0,0,-s*.105,-size*.65,-s*.08,-size*.65,s*.08,0,s*.105],'#fd735e');
      c.fillStyle='#e9f0dd';c.fillRect(-size*.53,-s*.07,size*.4,s*.14);
    }else{
      c.lineCap='round';c.strokeStyle=shell?'#ff9c24':twin?'#38e4f3':'#febe54';c.lineWidth=Math.max(2,s*(shell?.117:.084));c.beginPath();c.moveTo(-size,0);c.lineTo(0,0);c.stroke();
      c.strokeStyle=shell?'#fff4b8':twin?'#e0ffff':'#fffae2';c.lineWidth=Math.max(.9,s*.044);c.beginPath();c.moveTo(-size*.67,0);c.lineTo(0,0);c.stroke();
    }
    c.restore();
  }
  squadBadge(s){
    if(!s.count)return;const p=this.project(s.x,s.progress-s.formationRadius-.25);
    const c=this.c,num=String(s.count),sz=clamp(this.unit*.50,17,30)*(1+this.gainPulse*.22),w=sz*(1.65+num.length*.48),h=sz*1.05;
    const x=clamp(p.x,w/2+5,this.w-w/2-5),y=clamp(p.y+6,h,this.h-h-7);
    c.fillStyle='#132c39ed';c.strokeStyle=this.gainPulse>.3?'#c7ff84':'#6ad9ff';c.lineWidth=1.6;pill(c,x-w/2,y,w,h,4);c.fill();c.stroke();
    c.fillStyle='#9ce3ff';for(const shift of [-.14,.07]){c.beginPath();c.arc(x-w*.26+shift*sz,y+h*.34,sz*.11,0,TAU);c.fill();pill(c,x-w*.26+shift*sz-sz*.14,y+h*.48,sz*.28,h*.26,2);c.fill();}
    this.print(num,x+w*.12,y+h*.5,sz,'#fff5dc');
  }
  draw(sim,dt){
    const ready=sim.state==='ready';let s=sim;
    if(ready){
      s=this.demo;if(s.state!=='playing'||s.bossDefeated||s.elapsed-this.demoStart>22){this.preview(sim.index);s=this.demo;this.clearEffects();}
      autopilot(s);s.update(dt);for(const e of s.events)this.event(e);s.events.length=0;
    }
    const delta=sim.state==='paused'?0:dt;this.time+=delta;this.battleTime=s.elapsed;this.camera=s.progress;this.shake=Math.max(0,this.shake-delta*3.8);this.gainPulse=Math.max(0,this.gainPulse-delta*1.8);
    const c=this.c;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.w,this.h);this.road.draw(this.w,this.h,this.near,this.camera,this.dpr);
    c.save();if(!this.reduced&&this.shake)c.translate(Math.sin(this.time*84)*this.shake*4,Math.cos(this.time*72)*this.shake*3);
    if(s.boss?.windup){
      const p=this.project(s.boss.strikeX,s.progress),r=p.s*s.boss.strikeR;
      c.fillStyle='rgba(255,59,41,'+(.15+.14*Math.abs(Math.sin(this.time*14)))+')';c.strokeStyle='#ff775c';c.lineWidth=2.5;c.beginPath();c.ellipse(p.x,p.y,r,r*.55,0,0,TAU);c.fill();c.stroke();
    }
    for(const f of this.rings){f.life-=delta;if(f.life<=0)continue;const p=this.project(f.x,f.d),r=p.s*f.r*(.22+.78*(1-f.life/f.ttl));c.globalAlpha=f.life/f.ttl;c.lineWidth=clamp(p.s*.085,1.5,5);c.strokeStyle=f.color;c.beginPath();c.ellipse(p.x,p.y,r,r*.53,0,0,TAU);c.stroke();}c.globalAlpha=1;this.rings=this.rings.filter(f=>f.life>0);
    const finish=this.project(0,s.level.length);
    if(s.level.length-s.progress<30){
      const w=finish.s*LANE_HALF*2,cell=w/20;
      for(let i=0;i<20;i++)for(let j=0;j<2;j++){
        c.fillStyle=(i+j)%2?'#22383ad9':'#efebc9ea';
        c.fillRect(finish.x-w/2+i*cell,finish.y+j*cell*.35,cell+.5,cell*.36);
      }
      this.print('EXTRACTION',finish.x,finish.y-12,clamp(finish.s*.55,13,35),'#dfedcb');
    }
    const objects=[];
    this.fallen=this.fallen.filter(f=>(f.age+=delta)<(f.kind==='boss'?1.35:.68));
    for(const f of this.fallen)objects.push({d:f.d+.1,t:5,o:f});
    for(const u of s.threats)if(u.d-this.camera<40)objects.push({d:u.d,t:0,o:u});
    for(const u of s.members)objects.push({d:u.d,t:1,o:u});
    for(const o of s.objects)if(o.d-this.camera<37&&o.d-this.camera> -4)objects.push({d:o.d,t:o.kind==='gate'?2:3,o});
    for(const b of s.projectiles)if(b.d-this.camera<40)objects.push({d:b.d-.06,t:4,o:b});
    objects.sort((a,b)=>b.d-a.d);
    for(const {t,o} of objects){
      if(t===5)drawFallen(this,o);else if(t===4)this.bullet(o);else if(t===2)this.gate(o);else if(t===3)this.loot(o);else this.character(o,t===1,s.upgrade);
    }
    // Flashes live at each active gunner's muzzle, using the same cooldown as their shot.
    for(const m of s.members){if(!(m.muzzle>0))continue;
      const p=this.project(m.x,m.d+.22,.91),size=p.s*(s.upgrade>1?.52:.33);
      c.globalAlpha=.82;c.drawImage(s.upgrade===1?this.blueGlow:this.glow,p.x+size*.10,p.y-size*.61,size,size);
    }
    c.globalAlpha=1;
    this.impacts=this.impacts.filter(mark=>{
      this.impact(mark);mark.age+=delta;
      return mark.age<(mark.group==='blast'||mark.group==='stomp'?.38:.17);
    });
    for(const f of this.fx){
      f.life-=delta;if(f.life<=0)continue;f.x+=f.vx*delta;f.d+=f.vd*delta;f.z+=f.vz*delta;f.vz-=8*delta;
      const p=this.project(f.x,f.d,Math.max(0,f.z));c.globalAlpha=Math.min(1,f.life/f.ttl*2);const r=Math.max(1,p.s*(f.big?.42:.065));
      if(f.big)c.drawImage(this.glow,p.x-r,p.y-r,2*r,2*r);else{c.fillStyle=f.color;c.fillRect(p.x,p.y,r*1.6,r);}
    }
    this.fx=this.fx.filter(f=>f.life>0);c.globalAlpha=1;
    for(const l of this.labels){l.life-=delta;if(l.life<=0)continue;const p=this.project(l.x,l.d,1.9+(.78-l.life));c.globalAlpha=Math.min(1,l.life*5);this.print(l.text,p.x,p.y,clamp(p.s*.96,24,54),'#d4ff81');}
    this.labels=this.labels.filter(l=>l.life>0);c.globalAlpha=1;this.squadBadge(s);
    if(s.boss?.windup){
      const b=s.boss,p=this.project(b.strikeX,s.progress),r=p.s*b.strikeR;
      c.strokeStyle='#ff624c';c.lineWidth=3+2*b.windup;c.setLineDash([9,5]);c.beginPath();c.ellipse(p.x,p.y,r,r*.55,0,0,TAU);c.stroke();c.setLineDash([]);
      this.print(b.strikeX>0?'‹ DODGE':'DODGE ›',clamp(p.x,60,this.w-60),p.y-r*.60-8,clamp(this.unit*.48,17,28),'#ffb998');
    }
    c.restore();
    return s;
  }
}
