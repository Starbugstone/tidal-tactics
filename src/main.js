import './styles.css';
import bayArt from './art/bay.webp';
import straitArt from './art/kiln.webp';
import keepArt from './art/frost.webp';
import { assetUrls, gearKeys, loadArt } from './assets.js';
import { Simulation, LEVELS, UPGRADE_NAMES } from './simulation.js';
import { Battlefield } from './renderer.js';
import { decorate,icon } from './icons.js';
import { unlock,sound,quiet,setMuted } from './audio.js';

const $=id=>document.getElementById(id);
const canvas=$('battlefield'), arena=$('arena'), dialog=$('dialog');
const descriptions=['Reach the coastal extraction zone','Fight through the burning refinery','Break through the frozen quarantine'];
const biomes=['Coastal islands','Volcanic strait','Arctic archipelago'];
const gearDetails=['Automatic rifle fire','Two streams of fire from each gunner','Rotary cannons sweep the road','Explosive salvos join the miniguns'];
const get=(key,def)=>{try{return JSON.parse(localStorage.getItem('tidal.'+key))??def;}catch{return def;}};
const save=(key,v)=>{try{localStorage.setItem('tidal.'+key,JSON.stringify(v));}catch{}};
let records=get('squadRecords',{});if(!records||typeof records!=='object')records={};
let muted=get('muted',false),sim=new Simulation(0),field,inputId=null,resumeAfter=false;
let last=0,toastTimer,alertTimer,hudStamp=0,dragX=0,dragAim=0,slowUntil=0,finishTimer;
const keys=new Set();
const art=[bayArt,straitArt,keepArt];
function levels(){
  $('levels').innerHTML=LEVELS.map((l,i)=>'<button class="level" data-level="'+i+'" aria-pressed="'+(sim.index===i)+'" style="--art:url('+art[i]+')"><small>Operation 0'+(i+1)+'</small><strong>'+l.name+'</strong>'+(records[i]?'<span class="tick" aria-label="Cleared">✓</span>':'')+'</button>').join('');
  $('cleared').textContent=LEVELS.filter((_,i)=>records[i]).length+' / 3 cleared';
}
function setSound(){
  setMuted(muted);const b=$('sound');b.innerHTML=icon(muted?'mute':'volume');b.title=b.ariaLabel=muted?'Enable sound':'Mute sound';b.setAttribute('aria-pressed',String(!muted));
}
function stopInput(){keys.clear();if(inputId!==null&&canvas.hasPointerCapture(inputId))canvas.releasePointerCapture(inputId);inputId=null;}
function toast(msg){clearTimeout(toastTimer);$('toast').textContent=msg;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1350);}
const alerts=[];
function alertCard(tag,title,detail,artKey,boss=false){
  alerts.push({tag,title,detail,artKey,boss});if($('alertCard').hidden)showNextAlert();
}
function showNextAlert(){
  if(!alerts.length){$('alertCard').hidden=true;return;}
  const {tag,title,detail,artKey,boss}=alerts.shift(),el=$('alertCard');
  el.hidden=false;el.classList.toggle('boss',boss);el.style.removeProperty('--alert-art');
  $('alertArt').src=assetUrls[artKey];$('alertTag').textContent=tag;$('alertTitle').textContent=title;$('alertDetail').textContent=detail;
  el.animate([{opacity:0,scale:'.89'},{opacity:1,scale:'1'}],{duration:180});
  alertTimer=setTimeout(showNextAlert,1750);
}
function sync(){
  arena.dataset.state=sim.state;
  const ready=sim.state==='ready',active=sim.state==='playing'||sim.state==='paused';
  document.body.classList.toggle('in-battle',active);$('loadout').hidden=!active;
  $('missionNo').textContent='0'+(sim.index+1);$('missionName').textContent=LEVELS[sim.index].name;$('objective').textContent=descriptions[sim.index];
  $('location').textContent='Drag to steer';$('biome').textContent=biomes[sim.index];
  $('statusText').textContent=({ready:'Battle preview',playing:'Battle in progress',paused:'Battle paused',won:'Extracted',lost:'Horde breakthrough'})[sim.state];
  $('combatHud').hidden=ready;
  $('deploy').innerHTML=icon(active?'pause':'play')+'<span>'+(active?'Pause battle':ready?'Deploy squad':'Play again')+'</span>';
  $('deploy').ariaLabel=active?'Pause battle':ready?'Deploy squad':'Play again';
  hud();levels();
}
function hud(){
  const boss=sim.boss,meter=$('bossMeter');
  meter.hidden=!boss||sim.state==='ready';
  if(!meter.hidden){
    $('bossName').textContent=sim.bossName;$('bossHealth').textContent=Math.ceil(100*boss.hp/boss.maxHp)+'%';
    meter.querySelector('em').style.width=boss.hp/boss.maxHp*100+'%';
  }
  if(sim.state==='ready')return;
  $('location').textContent=sim.count+' survivors';
  $('biome').textContent=sim.kills+' infected down';
  $('distance').textContent=Math.max(0,Math.ceil(sim.level.length-sim.progress))+' m';
  $('routeBar').style.width=(100*sim.progress/sim.level.length)+'%';
  if($('loadout').dataset.tier===String(sim.upgrade))return;
  $('loadout').dataset.tier=String(sim.upgrade);
  $('weaponName').textContent=sim.weaponName;$('gunArt').src=assetUrls[gearKeys[sim.upgrade]];
  $('upgradeSteps').innerHTML=gearKeys.slice(1).map((k,i)=>'<span class="'+(i<sim.upgrade?'unlocked':'')+'" title="'+UPGRADE_NAMES[i+1]+'" aria-label="'+UPGRADE_NAMES[i+1]+(i<sim.upgrade?' equipped':' locked')+'"><img src="'+assetUrls[k]+'" alt=""></span>').join('');
}
function choose(index){
  quiet();slowUntil=0;clearTimeout(finishTimer);clearTimeout(alertTimer);alerts.length=0;$('alertCard').hidden=true;stopInput();if(dialog.open)dialog.close();resumeAfter=false;sim=new Simulation(index);field.load(sim);clearTimeout(toastTimer);$('toast').classList.remove('show');
  sync();
}
function begin(){if(!field)return;unlock();if(sim.state==='won'||sim.state==='lost')choose(sim.index);quiet();field.clearEffects();sim.start();sound('start',!muted);sync();canvas.focus({preventScroll:true});}
function closeDialog(){
  if(dialog.open)dialog.close();if(resumeAfter&&sim.state==='paused')sim.resume();resumeAfter=false;sync();if(sim.state==='playing')canvas.focus({preventScroll:true});
}
function panel(mode,tag,title,body,actions){
  if(dialog.open)dialog.close();
  dialog.dataset.mode=mode;$('dialogTag').textContent=tag;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;
  $('dialogActions').replaceChildren();
  for(const [name,fn] of actions){
    const b=document.createElement('button');b.textContent=name;b.className=$('dialogActions').children.length?'dialog-secondary':'dialog-primary';b.onclick=fn;$('dialogActions').append(b);
  }
  dialog.showModal();
}
function suspend(){quiet();resumeAfter=sim.state==='playing';sim.pause();stopInput();sync();}
function pause(){
  suspend();panel('pause','Mission control','Battle paused','Your squad is holding position.',[
    ['Resume battle',closeDialog],['Restart operation',()=>{choose(sim.index);begin();}],['Mission briefing',()=>choose(sim.index)]]);
}
function manual(){
  suspend();
  const rows=[['pointer','Steer the formation','Slide one finger sideways or use A / D and the arrow keys. Every gunner fires automatically.'],
   ['layers','Recruit at the gates','The middle of your squad chooses a gate. Blue gates add survivors, green gates multiply your count and red gates cost troops.'],
   ['bolt','Break and collect weapon crates','Your soldiers shoot crates open. Run through the floating weapon to equip your whole squad. Rockets stack with the miniguns.'],
   ['flag','Survive the boss','Keep the squad moving when the red stomp marker appears. Take down the boss and reach extraction.']];
  panel('manual','Field manual','How to play',rows.map(([i,h,p])=>'<div class="guide-row"><i>'+icon(i)+'</i><div><b>'+h+'</b><p>'+p+'</p></div></div>').join(''),[['Got it',closeDialog]]);
}
function result(){
  stopInput();resumeAfter=false;
  const won=sim.state==='won',elapsed=Math.round(sim.elapsed);
  sync();
  const stats=[['Time',elapsed+'s'],['Peak squad',sim.peakSquad],['Infected down',sim.kills],...(records[sim.index]?[['Best',records[sim.index]+'s']]:[])];
  const copy=won?(sim.index===2?'Your survivors reached the northern extraction zone.':'Your squad reclaimed '+LEVELS[sim.index].name+'.'):'The infected broke through. Steer the centre of your squad through a blue or green gate for reinforcements.';
  const buttons=won&&sim.index<2?[['Next operation',()=>choose(sim.index+1)],['Replay operation',()=>{choose(sim.index);begin();}]]:[['Replay operation',()=>{choose(sim.index);begin();}],['Mission briefing',()=>choose(sim.index)]];
  panel('result','Operation 0'+(sim.index+1),won?'Squad extracted':'Horde breakthrough',copy+'<div class="dialog-stats">'+stats.map(([k,v])=>'<div class="dialog-stat"><small>'+k+'</small><b>'+v+'</b></div>').join('')+'</div>',buttons);
}
$('levels').onclick=e=>{
  const b=e.target.closest('[data-level]');if(!b||!field)return;const index=+b.dataset.level;if(index===sim.index)return;
  if(sim.state==='playing'){
    suspend();panel('switch','Mission control','Leave this battle?','Leave this battle to deploy at '+LEVELS[index].name+'?',[['Switch operation',()=>choose(index)],['Keep playing',closeDialog]]);
  }else choose(index);
};
$('deploy').onclick=()=>{clearTimeout(finishTimer);sim.state==='playing'?pause():begin();};
$('manualBtn').onclick=manual;$('dialogClose').onclick=closeDialog;
dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeDialog();});
$('sound').onclick=()=>{unlock();muted=!muted;save('muted',muted);setSound();if(!muted)sound('start',true);};
const full=$('expand');
if(!document.fullscreenEnabled)full.hidden=true;
full.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen unavailable');}};
document.addEventListener('fullscreenchange',()=>{full.innerHTML=icon(document.fullscreenElement?'exit':'expand');full.title=full.ariaLabel=document.fullscreenElement?'Exit full screen':'Enter full screen';});
canvas.addEventListener('pointerdown',e=>{
  if(!field||inputId!==null||e.button!==0||dialog.open)return;
  if(sim.state==='ready')begin();if(sim.state!=='playing')return;
  unlock();inputId=e.pointerId;canvas.setPointerCapture(inputId);dragX=e.clientX;dragAim=e.pointerType==='touch'?sim.x:field.aimAt(e.clientX,e.clientY);sim.targetX=dragAim;
});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===inputId){
  sim.targetX=e.pointerType==='touch'?Math.max(-3.6,Math.min(3.6,dragAim+(e.clientX-dragX)*9.6/canvas.clientWidth)):field.aimAt(e.clientX,e.clientY);
}});
function release(e){if(e.pointerId===inputId){inputId=null;}}
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
window.addEventListener('keydown',e=>{
  if(dialog.open||e.metaKey||e.ctrlKey||e.altKey||!field)return;
  if((e.code==='Escape'||e.code==='KeyP')&&sim.state==='playing'){e.preventDefault();pause();return;}
  if(!['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code))return;
  if(e.code==='Space'&&document.activeElement?.tagName==='BUTTON')return;
  e.preventDefault();if(e.code==='Space'&&sim.state==='ready')begin();
  if(sim.state!=='playing')return;keys.add(e.code);

});
window.addEventListener('keyup',e=>keys.delete(e.code));
function background(){if(sim.state==='playing'&&!dialog.open)pause();else stopInput();}
window.addEventListener('blur',background);document.addEventListener('visibilitychange',()=>{if(document.hidden)background();});
function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.12):0;last=now;
  if(sim.state==='playing'){
    const dir=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
    if(dir)sim.targetX=Math.max(-3.6,Math.min(3.6,sim.targetX+dir*dt*14));
    sim.update(dt*(now<slowUntil?.53:1));
    for(const e of sim.events){
      field.event(e);
      if(e.type==='won'||e.type==='lost')quiet();
      sound(e.type,!muted,sim.upgrade,e.x,e.kind);
      if(e.type==='upgrade'){slowUntil=now+450;alertCard('Squad weapon equipped',e.name,gearDetails[e.tier],gearKeys[e.tier]);}
      if(e.type==='bossSpawn')alertCard('Boss incoming',e.name,'Move out of the marked stomp zone','boss',true);
      if(e.type==='bossDown')toast('Boss defeated');
    }
    sim.events.length=0;
    if(now-hudStamp>100){hud();hudStamp=now;}
    if(sim.state==='won'||sim.state==='lost'){
      if(sim.state==='won'){
        records[sim.index]=Math.min(records[sim.index]||Infinity,Math.round(sim.elapsed));save('squadRecords',records);
      }
      stopInput();sync();finishTimer=setTimeout(result,sim.state==='won'?650:700);
    }
  }
  field.draw(sim,dt);
}
arena.addEventListener('animationend',()=>arena.classList.remove('breached'));
decorate();setSound();sync();
async function init(){
  $('deploy').disabled=true;
  try{
    const [artwork]=await Promise.all([loadArt(),document.fonts.load('italic 900 60px "Barlow Condensed"'),document.fonts.ready]);
    field=new Battlefield(canvas,artwork);field.load(sim);
    new ResizeObserver(()=>field.resize()).observe(arena);
    $('loading').hidden=true;$('deploy').disabled=false;requestAnimationFrame(frame);
  }catch(error){console.error(error);$('loading').textContent='Battlefield artwork could not load. Reload to try again.';}
}
init();
