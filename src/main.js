import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import './style.css';
import { trackGameEvent } from './analytics.js';

const canvas = document.querySelector('#world');
const bgm=document.querySelector('#bgm'),musicToggle=document.querySelector('#musicToggle'),MUSIC_PREF_KEY='endless-forest-music';
let musicEnabled=true;try{musicEnabled=localStorage.getItem(MUSIC_PREF_KEY)!=='off';}catch{}
bgm.volume=.32;
function updateMusicButton(){musicToggle.setAttribute('aria-pressed',String(musicEnabled));musicToggle.querySelector('b').textContent=musicEnabled?'MUSIC ON':'MUSIC OFF';musicToggle.title=musicEnabled?'關閉背景音樂':'開啟背景音樂';}
function requestMusicPlayback(){if(!musicEnabled)return;const playback=bgm.play();if(playback?.catch)playback.catch(()=>{});}
function toggleMusic(){musicEnabled=!musicEnabled;try{localStorage.setItem(MUSIC_PREF_KEY,musicEnabled?'on':'off');}catch{}if(musicEnabled)requestMusicPlayback();else bgm.pause();updateMusicButton();}
musicToggle.addEventListener('click',toggleMusic);updateMusicButton();
const walkingSound=document.querySelector('#walkingSound'),hitSound=document.querySelector('#hitSound'),coinSound=document.querySelector('#coinSound'),hitSoundPool=[hitSound,...Array.from({length:3},()=>hitSound.cloneNode())],coinSoundPool=[coinSound,coinSound.cloneNode()];
walkingSound.volume=.34;hitSoundPool.forEach(sound=>sound.volume=.58);coinSoundPool.forEach(sound=>sound.volume=.55);
let hitSoundIndex=0,coinSoundIndex=0;
function startWalkingSound(){if(!walkingSound.paused)return;const playback=walkingSound.play();if(playback?.catch)playback.catch(()=>{});}
function updateWalkingSound(shouldPlay){if(shouldPlay){startWalkingSound();return;}if(!walkingSound.paused){walkingSound.pause();walkingSound.currentTime=0;}}
function playHitSound(){const sound=hitSoundPool[hitSoundIndex++%hitSoundPool.length];sound.pause();sound.currentTime=0;const playback=sound.play();if(playback?.catch)playback.catch(()=>{});}
function playCoinSound(){const sound=coinSoundPool[coinSoundIndex++%coinSoundPool.length];sound.pause();sound.currentTime=0;const playback=sound.play();if(playback?.catch)playback.catch(()=>{});}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10271b);
scene.fog = new THREE.FogExp2(0x10271b, 0.022);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 240);
camera.position.set(13, 13, 18);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const hemisphereLight=new THREE.HemisphereLight(0xb7d6aa,0x182015,1.65);scene.add(hemisphereLight);
const sun = new THREE.DirectionalLight(0xffedba, 2.2);
sun.position.set(-18, 28, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -28; sun.shadow.camera.right = sun.shadow.camera.top = 28;
scene.add(sun,sun.target);
const heroSpotlight=new THREE.SpotLight(0xd9ccff,8,30,.72,.78,1.45);heroSpotlight.position.set(4,10,5);heroSpotlight.castShadow=false;scene.add(heroSpotlight,heroSpotlight.target);

const world = new THREE.Group(); scene.add(world);
const combatParticleGroup=new THREE.Group(),combatParticles=[],combatParticleGeometry=new THREE.SphereGeometry(.085,6,5),combatParticleMaterials=new Map();scene.add(combatParticleGroup);
const combatParticleColors={run:[0xb78a5f,0x8f694b],takeoff:[0xd8efad,0xf3d998],land:[0xd9aa72,0xf0d09b],hit:[0xffdd62,0xff9f43],critical:[0xfff0a3,0xff63ad,0xffffff],heal:[0xff8fcf,0xf7c1df,0xffd9ef],levelup:[0xffdc45,0xfff5a0,0xffffff]};
const levelUpEffectGroup=new THREE.Group(),levelUpEffects=[],levelUpBeamGeometry=new THREE.CylinderGeometry(.48,.7,4.8,20,1,true),levelUpRingGeometry=new THREE.RingGeometry(.48,.68,28);scene.add(levelUpEffectGroup);

function particleMaterial(color){if(!combatParticleMaterials.has(color))combatParticleMaterials.set(color,new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));return combatParticleMaterials.get(color);}

function emitCombatParticles(position,type,direction=null){
  const settings={run:{count:3,life:.3,speed:1.15,size:.6},takeoff:{count:10,life:.5,speed:2.8,size:.85},land:{count:14,life:.55,speed:3.5,size:1},hit:{count:11,life:.48,speed:4.6,size:1},critical:{count:24,life:.72,speed:7,size:1.35},heal:{count:42,life:1.5,speed:1.35,size:1.9},levelup:{count:46,life:1.65,speed:1.9,size:1.45}}[type];if(!settings)return;
  const colors=combatParticleColors[type],baseY=(type==='hit'||type==='critical') ? .62 : type==='heal'||type==='levelup' ? .38 : .08;
  for(let i=0;i<settings.count;i++){
    const angle=Math.random()*Math.PI*2,mesh=new THREE.Mesh(combatParticleGeometry,particleMaterial(colors[i%colors.length]));mesh.position.set(position.x+(Math.random()-.5)*(type==='heal'?.75:.28),position.y+baseY+Math.random()*(type==='heal'?.9:.18),position.z+(Math.random()-.5)*(type==='heal'?.75:.28));mesh.renderOrder=8;
    let vx=Math.cos(angle)*settings.speed*(.35+Math.random()*.65),vz=Math.sin(angle)*settings.speed*(.35+Math.random()*.65),vy;
    if(type==='run'){vx*=.55;vz*=.55;vy=.25+Math.random()*.45;}
    else if(type==='heal'){vx*=.58;vz*=.58;vy=.65+Math.random()*1.25;}
    else if(type==='levelup'){vx*=.38;vz*=.38;vy=1.7+Math.random()*2.4;}
    else if(type==='land'){vy=.35+Math.random()*.7;}
    else if(type==='takeoff'){vy=1.4+Math.random()*2.4;}
    else{vx+=(direction?.x||0)*settings.speed*.65;vz+=(direction?.z||0)*settings.speed*.65;vy=1.4+Math.random()*settings.speed*.65;}
    const scale=settings.size*(.55+Math.random()*.75);mesh.scale.setScalar(scale);combatParticleGroup.add(mesh);combatParticles.push({mesh,vx,vy,vz,life:settings.life,startLife:settings.life,gravity:type==='heal'?-.12:type==='levelup'?-.25:type==='run'?2.5:type==='land'?4.5:7,spin:(Math.random()-.5)*8});
  }
}

function updateCombatParticles(dt){
  for(let i=combatParticles.length-1;i>=0;i--){const particle=combatParticles[i];particle.life-=dt;if(particle.life<=0){combatParticleGroup.remove(particle.mesh);combatParticles.splice(i,1);continue;}particle.vy-=particle.gravity*dt;particle.mesh.position.x+=particle.vx*dt;particle.mesh.position.y+=particle.vy*dt;particle.mesh.position.z+=particle.vz*dt;particle.mesh.rotation.y+=particle.spin*dt;particle.mesh.scale.multiplyScalar(Math.max(.82,1-dt*3.6));}
}

function emitLevelUpEffect(animal,levels=1){
  if(!animal||animal.userData.dead)return;
  const group=new THREE.Group(),beamMaterial=new THREE.MeshBasicMaterial({color:0xffd83d,transparent:true,opacity:0,depthWrite:false,depthTest:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),ringMaterial=new THREE.MeshBasicMaterial({color:0xffef75,transparent:true,opacity:0,depthWrite:false,depthTest:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),beam=new THREE.Mesh(levelUpBeamGeometry,beamMaterial),ring=new THREE.Mesh(levelUpRingGeometry,ringMaterial),light=new THREE.PointLight(0xffd94e,0,7,1.7);
  ring.rotation.x=-Math.PI/2;beam.renderOrder=9;ring.renderOrder=10;group.add(beam,ring,light);levelUpEffectGroup.add(group);levelUpEffects.push({animal,group,beam,ring,light,time:0,duration:2.25,power:Math.min(1.45,1+(levels-1)*.12),beamMaterial,ringMaterial});emitCombatParticles(animal.position,'levelup');
}

function updateLevelUpEffects(dt){
  for(let i=levelUpEffects.length-1;i>=0;i--){
    const effect=levelUpEffects[i];effect.time+=dt;const progress=Math.min(effect.time/effect.duration,1),rise=1-Math.pow(1-Math.min(progress/.28,1),3),fade=progress<.72?1:1-(progress-.72)/.28,pulse=.82+Math.sin(effect.time*12)*.18,radius=Math.max(.8,(effect.animal.userData.collisionRadius||.62)*1.35)*effect.power;
    effect.group.position.set(effect.animal.position.x,effect.animal.position.y+.03,effect.animal.position.z);effect.beam.position.y=2.4*rise;effect.beam.scale.set(radius*(.72+pulse*.18),Math.max(.02,rise),radius*(.72+pulse*.18));effect.beamMaterial.opacity=.38*fade*pulse;effect.ring.scale.setScalar(radius*(.35+progress*1.18));effect.ringMaterial.opacity=.8*fade*(1-progress*.45);effect.light.position.y=1.15;effect.light.intensity=5.5*fade*pulse;
    if(progress>=1){levelUpEffectGroup.remove(effect.group);effect.beamMaterial.dispose();effect.ringMaterial.dispose();levelUpEffects.splice(i,1);}
  }
}
const TILE = 32, GRID = 5;
const ORIGIN_LAYOUT={
  tent:{x:0,z:-7},
  merchant:{x:-5.5,z:0},
  doctor:{x:5.5,z:0}
};
const DAY_LENGTH=240,WEATHER_REGION_SIZE=TILE*3;
const weatherProfiles={
  clear:{label:'晴朗',sun:1,fog:.017,rain:0,cloud:.02,mist:0},
  cloudy:{label:'陰天',sun:.58,fog:.022,rain:0,cloud:.72,mist:0},
  mist:{label:'粉紅薄霧',sun:.52,fog:.024,rain:0,cloud:.42,mist:1},
  rain:{label:'雨天',sun:.36,fog:.028,rain:1,cloud:.9,mist:0}
};
const weatherState={key:'',name:'clear',sun:1,fog:.017,rain:0,cloud:.02,mist:0};
const worldCycleState={phase:.3,time:'morning'};
const leafMats = [0x244e2d,0x315e35,0x406b3a].map(c => new THREE.MeshStandardMaterial({color:c,roughness:1}));
const rockMat = new THREE.MeshStandardMaterial({color:0x667064,roughness:1});
const groundMat = new THREE.MeshStandardMaterial({color:0x29452c,roughness:1});
const rockGeo = new THREE.DodecahedronGeometry(1,0);
const shrubGeo = new THREE.IcosahedronGeometry(.65,1);
const platformTemplates=new Map(),decorTemplates=new Map(),coinTemplates=new Map(),platformColliders=[],obstacleColliders=[],fixedObstacleColliders=[],activeCoins=[];
const bossArenaGroup=new THREE.Group();scene.add(bossArenaGroup);
const BOSS_ARENA_CLEAR_RADIUS=14,BOSS_ARENA_RING_RADIUS=15.8,BOSS_ARENA_LOAD_RADIUS=98;
const collectedCoins=new Set();
const coinRespawns=new Map(),COIN_RESPAWN_MIN_MS=120000,COIN_RESPAWN_MAX_MS=300000;
const coinLayoutSeed=(Math.random()*0x7fffffff)|0;
const coinDefs=[['coin-bronze',1],['coin-bronze',1],['coin-silver',3],['coin-gold',5]];
const LOCAL_SAVE_KEY='endless-forest-personal-v1';
let pendingLocalSave=null;try{pendingLocalSave=JSON.parse(localStorage.getItem(LOCAL_SAVE_KEY)||'null');}catch{pendingLocalSave=null;}
let coinBalance=Math.max(0,Math.floor(Number(pendingLocalSave?.coins)||0));
const platformDefs=[
  {name:'block-grass-low-large',scale:1.7,halfX:1.77,halfZ:1.77,top:.85},
  {name:'block-grass-low-long',scale:1.7,halfX:1.77,halfZ:.92,top:.85},
  {name:'block-grass-large',scale:1.35,halfX:1.4,halfZ:1.4,top:1.35}
];
const treeDefs=[['tree',3.2],['tree-pine',3],['tree-pine-small',3.5]];
const decorDefs=[
  ['flowers',2],['flowers-tall',1.8],['mushrooms',1.8],['stones',2.2],
  ['rocks',1.8],['fence-straight',2.2],['fence-broken',2.2]
];

function rng(seed){ let s=seed|0; return ()=>{ s=Math.imul(s^s>>>15,1|s); s^=s+Math.imul(s^s>>>7,61|s); return ((s^s>>>14)>>>0)/4294967296; }; }
function hash(x,z){ return Math.imul(x,73856093)^Math.imul(z,19349663); }

const tiles=[];
for(let gz=-2;gz<=2;gz++) for(let gx=-2;gx<=2;gx++){
  const tile=new THREE.Group(); tile.userData.grid={x:gx,z:gz};
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(TILE,TILE),groundMat); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; ground.userData.ground=true; tile.add(ground);
  tile.userData.props=new THREE.Group(); tile.add(tile.userData.props); world.add(tile); tiles.push(tile);
}

function addGrassBlock(tile,props,def,x,z,y=0,rotation=0){
  const template=platformTemplates.get(def.name);if(!template)return;
  const block=template.clone(true);block.scale.setScalar(def.scale);block.position.set(x,y,z);block.rotation.y=rotation;block.userData.blocking=true;block.userData.arenaClearable=true;props.add(block);
  const swap=Math.abs(Math.sin(rotation))>.5;
  tile.userData.colliders.push({x,z,halfX:swap?def.halfZ:def.halfX,halfZ:swap?def.halfX:def.halfZ,bottom:y,top:y+def.top});
}

function populate(tile,tx,tz){
  const props=tile.userData.props;props.clear();tile.userData.colliders=[];tile.userData.obstacles=[];tile.userData.coins=[];
  const random=rng(hash(tx,tz)),coinRandom=rng(hash(tx,tz)^coinLayoutSeed),occupied=[];
  const isFree=(x,z,radius)=>occupied.every(o=>Math.hypot(x-o.x,z-o.z)>radius+o.radius+.25);
  const reserve=(x,z,radius)=>occupied.push({x,z,radius});
  const findSpot=(radius,range=TILE-3,clearCenter=true,randomSource=random)=>{
    for(let attempt=0;attempt<24;attempt++){
      const x=(randomSource()-.5)*range,z=(randomSource()-.5)*range;
      if(clearCenter&&Math.abs(x)<4&&Math.abs(z)<4)continue;
      if(isFree(x,z,radius))return [x,z];
    }
    return null;
  };
  if(tx===0&&tz===0){
    reserve(ORIGIN_LAYOUT.tent.x,ORIGIN_LAYOUT.tent.z,4.2);
    reserve(ORIGIN_LAYOUT.merchant.x,ORIGIN_LAYOUT.merchant.z,4.2);
    reserve(ORIGIN_LAYOUT.doctor.x,ORIGIN_LAYOUT.doctor.z,2.4);
    reserve(0,0,2.2);
  }

  platformDefs.forEach((def,i)=>{
    let spot;
    // Keep the tent, hero, merchant and doctor area clear. The origin blocks
    // remain available around the outer edge instead of blocking the camp.
    if(tx===0&&tz===0)spot=[[10,7],[-11,-10],[11,-11]][i];
    else spot=findSpot(Math.max(def.halfX,def.halfZ),TILE-8,false);
    if(!spot)return;const [x,z]=spot,rotation=i===1&&random()>.5?Math.PI/2:0;
    reserve(x,z,Math.max(def.halfX,def.halfZ));addGrassBlock(tile,props,def,x,z,0,rotation);
  });

  for(let i=0;i<15;i++){
    const [name,baseScale]=treeDefs[Math.floor(random()*treeDefs.length)],template=decorTemplates.get(name);if(!template)continue;
    const treeScale=baseScale*(.75+random()*.5),spot=findSpot(treeScale*.5,TILE-2);if(!spot)continue;
    const [x,z]=spot,tree=template.clone(true);tree.scale.setScalar(treeScale);tree.position.set(x,0,z);tree.rotation.y=random()*Math.PI*2;tree.userData.blocking=true;tree.userData.arenaClearable=true;tree.userData.cameraFadeTree=true;props.add(tree);
    reserve(x,z,treeScale*.5);tile.userData.obstacles.push({type:'circle',x,z,radius:treeScale*.25,top:99});
  }

  for(let i=0;i<10;i++){
    const isRock=random()>.55,s=isRock ? .25+random()*.55 : .25+random()*.45,spot=findSpot(s*.65,TILE-2,false);if(!spot)continue;
    const mesh=new THREE.Mesh(isRock?rockGeo:shrubGeo,isRock?rockMat:leafMats[2]);mesh.scale.set(s,s*(.55+random()*.35),s);mesh.position.set(spot[0],s*.55,spot[1]);mesh.rotation.set(random(),random()*3,random());mesh.castShadow=true;mesh.userData.arenaClearable=true;props.add(mesh);reserve(spot[0],spot[1],s*.65);
  }

  decorDefs.forEach(([name,scale],i)=>{
    const template=decorTemplates.get(name);if(!template)return;
    const count=i<2?1:2;
    for(let j=0;j<count;j++){
      const propScale=scale*(.8+random()*.4),radius=propScale*(name.startsWith('fence') ? .58 : .32),spot=findSpot(radius,TILE-3);if(!spot)continue;
      const [x,z]=spot,prop=template.clone(true);prop.scale.setScalar(propScale);prop.position.set(x,0,z);prop.rotation.y=random()*Math.PI*2;if(name.startsWith('fence'))prop.userData.blocking=true;if(name.startsWith('fence')||name==='stones'||name==='rocks')prop.userData.arenaClearable=true;props.add(prop);reserve(x,z,radius);
      if(name.startsWith('fence')){const offset=propScale*.42;tile.userData.obstacles.push({type:'box',x:x+Math.sin(prop.rotation.y)*offset,z:z+Math.cos(prop.rotation.y)*offset,halfX:propScale*.52,halfZ:propScale*.13,rotation:prop.rotation.y,top:propScale*.4});}
    }
  });

  coinDefs.forEach(([name,value],i)=>{
    const id=`${tx}:${tz}:${i}`,template=coinTemplates.get(name),respawn=coinRespawns.get(id);if(!template)return;
    if(collectedCoins.has(id)&&(!respawn||performance.now()<respawn.readyAt))return;
    const placementRandom=respawn?rng(hash(tx+i*101,tz-i*137)^coinLayoutSeed^Math.imul(respawn.cycle,83492791)):coinRandom,spot=findSpot(.35,TILE-3,false,placementRandom);if(!spot)return;
    if(respawn){collectedCoins.delete(id);coinRespawns.delete(id);}
    const coin=template.clone(true);coin.scale.setScalar(.02);coin.position.set(spot[0],.12,spot[1]);coin.userData={coinId:id,value,baseY:.12,baseScale:1.35,spawnTime:0,phase:placementRandom()*Math.PI*2,collecting:false,collectTime:0,collected:false,worldTX:tx,worldTZ:tz,respawnCycle:respawn?.cycle||0};props.add(coin);tile.userData.coins.push(coin);reserve(spot[0],spot[1],.35);
  });
}

let centerTX=0,centerTZ=0;
function assignTile(tile,tx,tz){
  tile.userData.worldTX=tx;tile.userData.worldTZ=tz;tile.position.set(tx*TILE,0,tz*TILE);populate(tile,tx,tz);
}

function nearbyBossArenas(){
  return bosses.filter(boss=>!boss.userData.dead).map(boss=>({boss,x:boss.userData.arenaX??boss.position.x,z:boss.userData.arenaZ??boss.position.z,entryAngle:boss.userData.arenaAngle||0})).filter(arena=>Math.hypot(arena.x-hero.position.x,arena.z-hero.position.z)<BOSS_ARENA_LOAD_RADIUS);
}

function blockerInsideBossArena(x,z,bound,arena){
  const dx=x-arena.x,dz=z-arena.z;if(Math.hypot(dx,dz)<BOSS_ARENA_CLEAR_RADIUS+bound)return true;
  const dirX=Math.sin(arena.entryAngle),dirZ=Math.cos(arena.entryAngle),along=Math.abs(dx*dirX+dz*dirZ),lateral=Math.abs(dx*dirZ-dz*dirX);
  return along<BOSS_ARENA_RING_RADIUS+5+bound&&lateral<2.5+bound;
}

function animalInActiveBattle(animal){return !!battle&&(battle.enemy===animal||battle.allies.includes(animal));}

function rebuildWorldColliders(arenas=[]){
  platformColliders.length=0;obstacleColliders.length=0;
  tiles.forEach(tile=>tile.userData.colliders.forEach(c=>{const collider={...c,x:c.x+tile.position.x,z:c.z+tile.position.z},bound=Math.hypot(c.halfX,c.halfZ);if(!arenas.some(arena=>blockerInsideBossArena(collider.x,collider.z,bound,arena)))platformColliders.push(collider);}));
  tiles.forEach(tile=>tile.userData.obstacles.forEach(c=>{const collider={...c,x:c.x+tile.position.x,z:c.z+tile.position.z},bound=c.type==='circle'?c.radius:Math.hypot(c.halfX,c.halfZ);if(!arenas.some(arena=>blockerInsideBossArena(collider.x,collider.z,bound,arena)))obstacleColliders.push(collider);}));
  fixedObstacleColliders.forEach(collider=>obstacleColliders.push(collider));
}

function refreshBossArenas(){
  const arenas=nearbyBossArenas();bossArenaGroup.clear();
  tiles.forEach(tile=>tile.userData.props.children.forEach(prop=>{prop.visible=true;if(!prop.userData.blocking&&!prop.userData.arenaClearable)return;const x=tile.position.x+prop.position.x,z=tile.position.z+prop.position.z;if(arenas.some(arena=>blockerInsideBossArena(x,z,1.8,arena)))prop.visible=false;}));
  rebuildWorldColliders(arenas);
  const availableTrees=treeDefs.filter(([name])=>decorTemplates.has(name));
  arenas.forEach(arena=>{
    const random=rng(hash(arena.boss.userData.spawnId,2719));
    for(let i=0;i<30;i++){
      const angle=i/30*Math.PI*2,entryDelta=Math.abs(Math.atan2(Math.sin(angle-arena.entryAngle),Math.cos(angle-arena.entryAngle))),oppositeDelta=Math.abs(Math.PI-entryDelta);
      if(entryDelta<.25||oppositeDelta<.25||!availableTrees.length)continue;
      const [name,baseScale]=availableTrees[Math.floor(random()*availableTrees.length)],scale=baseScale*(.82+random()*.3),x=arena.x+Math.sin(angle)*BOSS_ARENA_RING_RADIUS,z=arena.z+Math.cos(angle)*BOSS_ARENA_RING_RADIUS,tree=decorTemplates.get(name).clone(true);
      tree.scale.setScalar(scale);tree.position.set(x,0,z);tree.rotation.y=random()*Math.PI*2;tree.userData.cameraFadeTree=true;bossArenaGroup.add(tree);obstacleColliders.push({type:'circle',x,z,radius:scale*.25,top:99,bossArena:true});
    }
  });
  animals.filter(animal=>!animal.userData.boss&&!animal.userData.dead&&!animalInActiveBattle(animal)&&huntPrompt?.target!==animal&&arenas.some(arena=>Math.hypot(animal.position.x-arena.x,animal.position.z-arena.z)<BOSS_ARENA_CLEAR_RADIUS)).forEach(animal=>{animal.userData.spawnCycle++;placeAnimal(animal,true);});
  npcs.forEach((npc,index)=>{if(arenas.some(arena=>Math.hypot(npc.position.x-arena.x,npc.position.z-arena.z)<BOSS_ARENA_CLEAR_RADIUS))placeNpc(npc,index,true);});
}

const treeOcclusionRaycaster=new THREE.Raycaster(),treeOcclusionDirection=new THREE.Vector3(),treeOcclusionPoint=new THREE.Vector3();
let treeOcclusionElapsed=0,cameraOccludedTrees=new Set();

function visibleCameraFadeTrees(){
  const trees=[];tiles.forEach(tile=>tile.userData.props.children.forEach(prop=>{if(prop.visible&&prop.userData.cameraFadeTree)trees.push(prop);}));
  bossArenaGroup.children.forEach(tree=>{if(tree.visible&&tree.userData.cameraFadeTree)trees.push(tree);});return trees;
}

function cameraFadeTreeRoot(object){
  while(object&&!object.userData.cameraFadeTree)object=object.parent;return object?.userData.cameraFadeTree?object:null;
}

function prepareCameraFadeTree(tree){
  if(tree.userData.cameraFadeMaterials)return;
  const entries=[];tree.traverse(object=>{
    if(!object.isMesh||!object.material)return;
    const materials=(Array.isArray(object.material)?object.material:[object.material]).map(material=>material.clone());object.material=Array.isArray(object.material)?materials:materials[0];
    materials.forEach(material=>entries.push({material,baseOpacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite}));
  });
  tree.userData.cameraFadeMaterials=entries;tree.userData.cameraFadeOpacity=1;
}

function setCameraTreeFade(tree,targetOpacity,dt){
  const current=tree.userData.cameraFadeOpacity??1;if(targetOpacity>=.999&&current>=.999)return;
  prepareCameraFadeTree(tree);let opacity=THREE.MathUtils.damp(tree.userData.cameraFadeOpacity,targetOpacity,targetOpacity<1?11:7,dt);if(Math.abs(opacity-targetOpacity)<.004)opacity=targetOpacity;tree.userData.cameraFadeOpacity=opacity;
  tree.userData.cameraFadeMaterials.forEach(entry=>{const transparent=entry.transparent||opacity<.999,depthWrite=opacity>=.999?entry.depthWrite:false;entry.material.opacity=entry.baseOpacity*opacity;if(entry.material.transparent!==transparent||entry.material.depthWrite!==depthWrite){entry.material.transparent=transparent;entry.material.depthWrite=depthWrite;entry.material.needsUpdate=true;}});
}

function updateTreeCameraOcclusion(dt){
  const trees=visibleCameraFadeTrees();treeOcclusionElapsed+=dt;
  if(treeOcclusionElapsed>=.1){
    treeOcclusionElapsed=0;const occluded=new Set(),targets=[hero,...followers.filter(animal=>!animal.userData.dead)];
    targets.forEach(target=>{
      treeOcclusionPoint.set(target.position.x,target.position.y+(target===hero?1:.62),target.position.z);treeOcclusionDirection.subVectors(treeOcclusionPoint,camera.position);const distance=treeOcclusionDirection.length();if(distance<.5)return;
      treeOcclusionRaycaster.set(camera.position,treeOcclusionDirection.multiplyScalar(1/distance));treeOcclusionRaycaster.near=.2;treeOcclusionRaycaster.far=Math.max(.2,distance-.28);
      treeOcclusionRaycaster.intersectObjects(trees,true).forEach(hit=>{const root=cameraFadeTreeRoot(hit.object);if(root)occluded.add(root);});
    });
    cameraOccludedTrees=occluded;
  }
  trees.forEach(tree=>setCameraTreeFade(tree,cameraOccludedTrees.has(tree)?.25:1,dt));
}

function arrangeTiles(force=false){
  const tx=Math.floor(hero.position.x/TILE),tz=Math.floor(hero.position.z/TILE); if(!force&&tx===centerTX&&tz===centerTZ)return; centerTX=tx;centerTZ=tz;
  if(force||tiles.some(tile=>tile.userData.worldTX===undefined)){
    tiles.forEach((tile,i)=>assignTile(tile,tx+i%GRID-2,tz+Math.floor(i/GRID)-2));
  }else{
    const wanted=[];for(let gz=-2;gz<=2;gz++)for(let gx=-2;gx<=2;gx++)wanted.push({tx:tx+gx,tz:tz+gz,key:`${tx+gx}:${tz+gz}`});
    const wantedKeys=new Set(wanted.map(entry=>entry.key)),existing=new Map();
    tiles.forEach(tile=>existing.set(`${tile.userData.worldTX}:${tile.userData.worldTZ}`,tile));
    const reusable=tiles.filter(tile=>!wantedKeys.has(`${tile.userData.worldTX}:${tile.userData.worldTZ}`));
    wanted.forEach(entry=>{if(existing.has(entry.key))return;const tile=reusable.pop();if(tile)assignTile(tile,entry.tx,entry.tz);});
  }
  rebuildWorldColliders();
  activeCoins.length=0;tiles.forEach(tile=>tile.userData.coins.forEach(coin=>activeCoins.push(coin)));
  updateBossRegions();
  refreshBossArenas();
  relocateEmbeddedEntities();
}

const hero=new THREE.Group(); hero.position.set(0,0,0); scene.add(hero);
const shadow=new THREE.Mesh(new THREE.CircleGeometry(.7,24),new THREE.MeshBasicMaterial({color:0x071009,transparent:true,opacity:.35,depthWrite:false})); shadow.rotation.x=-Math.PI/2; shadow.position.y=.015; scene.add(shadow);
const heroRig=[];
let heroModel=null;
let remoteCharacterTemplate=null,multiplayerSocket=null,localPlayerId='',currentRoom='',lastNetworkSend=0,lastPlayerCardUpdate=0,localDisplayName='小森',worldTimeOffset=0;
let reconnectRoom='',reconnectName='',reconnectTimer=null,reconnectAttempts=0,intentionalDisconnect=false,networkAssetsReady=false,lastLatencyPing=0,networkLatencyMs=0;
let analyticsGameStarted=false,analyticsSessionStartedAt=0,analyticsHeartbeatTimer=null,analyticsSessionEnded=false;
const remotePlayers=new Map(),pendingRemotePlayers=new Map();
const sharedBossStates=new Map();
const sharedBossTransforms=new Map();
const pendingSharedEncounters=new Map();

function createCharacterWalkRig(model){
  const rig=[];
  model.traverse(mesh=>{
    if(!mesh.isMesh || /head/i.test(mesh.name)) return;
    const position=mesh.geometry.attributes.position;
    const base=new Float32Array(position.array);
    const limb=new Uint8Array(position.count);
    for(let i=0;i<position.count;i++){
      const x=base[i*3],y=base[i*3+1];
      if(y>.18&&y<.52&&x>.15) limb[i]=1;       // right arm and hand
      else if(y>.18&&y<.52&&x<-.15) limb[i]=2; // left arm and hand
      else if(y<.18&&x>.012) limb[i]=3;         // right leg and foot
      else if(y<.18&&x<-.012) limb[i]=4;        // left leg and foot
    }
    rig.push({mesh,position,base,limb});
  });
  return rig;
}

function buildWalkRig(model){heroRig.push(...createCharacterWalkRig(model));}

function animateCharacterWalkRig(rig,phase,weight){
  const swing=Math.sin(phase);
  rig.forEach(({mesh,position,base,limb})=>{
    for(let i=0;i<position.count;i++){
      const k=i*3,part=limb[i];
      let x=base[k],y=base[k+1],z=base[k+2];
      if(part){
        const arm=part<3;
        const pivotY=arm ? .405 : .18;
        const pivotZ=arm?-.015:0;
        const side=part===1||part===4?1:-1;
        const angle=swing*side*(arm ? .68 : .56)*weight;
        const c=Math.cos(angle),s=Math.sin(angle),dy=y-pivotY,dz=z-pivotZ;
        y=pivotY+dy*c-dz*s; z=pivotZ+dy*s+dz*c;
      }
      position.setXYZ(i,x,y,z);
    }
    position.needsUpdate=true;
    mesh.geometry.computeVertexNormals();
  });
}

function animateWalkRig(phase,weight){animateCharacterWalkRig(heroRig,phase,weight);}

function buildAnimalFootRig(animal){
  const rig=[],entries=[],bounds=new THREE.Box3(),point=new THREE.Vector3();
  animal.updateMatrixWorld(true);const inverseAnimal=animal.matrixWorld.clone().invert();
  animal.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const position=mesh.geometry.attributes.position,transform=new THREE.Matrix4().multiplyMatrices(inverseAnimal,mesh.matrixWorld);entries.push({mesh,position,transform});
    for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(transform);bounds.expandByPoint(point);}
  });
  const height=Math.max(.001,bounds.max.y-bounds.min.y),centerX=(bounds.min.x+bounds.max.x)/2,centerZ=(bounds.min.z+bounds.max.z)/2;
  entries.forEach(({mesh,position,transform})=>{
    const base=new Float32Array(position.array),foot=new Uint8Array(position.count),influence=new Float32Array(position.count);
    for(let i=0;i<position.count;i++){
      point.set(base[i*3],base[i*3+1],base[i*3+2]).applyMatrix4(transform);const ratio=(point.y-bounds.min.y)/height;
      if(ratio<=.26){foot[i]=1+(point.x>centerX?1:0)+(point.z>centerZ?2:0);influence[i]=Math.pow(Math.max(0,1-ratio/.27),.55);}
    }
    rig.push({mesh,position,base,foot,influence,height});
  });
  animal.userData.footRig=rig;
}

function animateAnimalFeet(animal,phase,weight){
  const offsets=[0,0,Math.PI,Math.PI,0];
  animal.userData.footRig?.forEach(({mesh,position,base,foot,influence,height})=>{
    for(let i=0;i<position.count;i++){
      const k=i*3,part=foot[i];let x=base[k],y=base[k+1],z=base[k+2];
      if(part){const strength=weight*influence[i],step=Math.sin(phase+offsets[part]);z+=step*height*.045*strength;y+=Math.max(0,step)*height*.025*strength;}
      position.setXYZ(i,x,y,z);
    }
    position.needsUpdate=true;mesh.geometry.computeVertexNormals();
  });
}

function loadObj(folder,name){ return new Promise((resolve,reject)=>{ new MTLLoader().setPath(`/${folder}/`).load(`${name}.mtl`,m=>{m.preload();new OBJLoader().setMaterials(m).setPath(`/${folder}/`).load(`${name}.obj`,resolve,undefined,reject);},undefined,reject); }); }
function prepModel(obj,scale){ obj.scale.setScalar(scale); obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}}); return obj; }
function cloneModelUnique(source){const clone=source.clone(true);clone.traverse(o=>{if(o.isMesh)o.geometry=o.geometry.clone();});return clone;}

function loadOriginTent(){
  return loadObj('tent','tent').then(obj=>{
    const {x,z}=ORIGIN_LAYOUT.tent,tent=prepModel(obj,7);tent.traverse(object=>{if(!object.isMesh)return;const materials=Array.isArray(object.material)?object.material:[object.material];materials.filter(Boolean).forEach(material=>{material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.depthTest=true;material.side=THREE.DoubleSide;material.needsUpdate=true;});});tent.position.set(x,0,z);tent.rotation.y=0;tent.userData.blocking=true;scene.add(tent);
    fixedObstacleColliders.push({type:'box',x,z,halfX:3.05,halfZ:2.35,rotation:0,top:4});
    rebuildWorldColliders(nearbyBossArenas());relocateEmbeddedEntities();
    return tent;
  }).catch(error=>console.error('Tent model loading error:',error));
}

function createPlayerNameLabel(name){
  const label=document.createElement('canvas');label.width=256;label.height=64;const context=label.getContext('2d');
  context.fillStyle='rgba(8,25,17,.82)';context.beginPath();context.roundRect(18,7,220,48,18);context.fill();
  context.strokeStyle='rgba(225,212,158,.7)';context.lineWidth=2;context.stroke();context.fillStyle='#f0e8c8';context.font='600 23px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(name,128,32);
  const texture=new THREE.CanvasTexture(label);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(3.2,.8,1);sprite.position.y=2.75;sprite.renderOrder=20;return sprite;
}

function addRemotePlayer(data){
  if(!data?.id||data.id===localPlayerId)return;
  if(!remoteCharacterTemplate){pendingRemotePlayers.set(data.id,data);return;}
  removeRemotePlayer(data.id);
  const player=new THREE.Group(),model=prepModel(cloneModelUnique(remoteCharacterTemplate),2.25);model.rotation.y=0;player.add(model,createPlayerNameLabel(data.name||'旅人'));
  const state=data.state||{};player.position.set(Number(state.x)||0,Number(state.y)||0,Number(state.z)||0);player.rotation.y=Number(state.rotation)||0;
  player.userData.targetPosition=player.position.clone();player.userData.targetRotation=player.rotation.y;player.userData.networkMoving=Boolean(state.moving);player.userData.rig=createCharacterWalkRig(model);player.userData.phase=0;player.userData.weight=0;player.userData.model=model;player.userData.companions=new Map();player.userData.displayName=data.name||'旅人';
  scene.add(player);remotePlayers.set(data.id,player);syncRemoteCompanions(player,state.companions||[]);pendingRemotePlayers.delete(data.id);updateRoomHud();
}

function syncRemoteCompanions(player,companions=[]){
  const wanted=new Set(companions.map(pet=>pet.id));
  player.userData.companions.forEach((pet,id)=>{if(!wanted.has(id)){scene.remove(pet);player.userData.companions.delete(id);}});
  companions.forEach(data=>{
    let pet=player.userData.companions.get(data.id);
    if(!pet){
      const template=animalTemplates.get(data.species),definition=animalData.find(([species])=>species===data.species);if(!template||!definition)return;
      pet=prepModel(cloneModelUnique(template),definition[1]);pet.userData.targetPosition=new THREE.Vector3(data.x,data.y,data.z);pet.userData.targetRotation=data.rotation||0;pet.userData.networkMoving=Boolean(data.moving);pet.userData.phase=0;pet.userData.weight=0;buildAnimalFootRig(pet);scene.add(pet);player.userData.companions.set(data.id,pet);
    }
    pet.userData.targetPosition.set(data.x,data.y,data.z);pet.userData.targetRotation=data.rotation;pet.userData.networkMoving=Boolean(data.moving);
  });
}

function removeRemotePlayer(id){const player=remotePlayers.get(id);if(player){player.userData.companions?.forEach(pet=>scene.remove(pet));scene.remove(player);player.traverse(object=>{if(object.material?.map&&object.isSprite)object.material.map.dispose();if(object.material&&object.isSprite)object.material.dispose();});remotePlayers.delete(id);}pendingRemotePlayers.delete(id);updateRoomHud();}

function updateRemotePlayers(dt){
  remotePlayers.forEach(player=>{
    const distance=player.position.distanceTo(player.userData.targetPosition);
    if(distance>14)player.position.copy(player.userData.targetPosition);else player.position.lerp(player.userData.targetPosition,1-Math.pow(.0005,dt));
    let turn=player.userData.targetRotation-player.rotation.y;turn=Math.atan2(Math.sin(turn),Math.cos(turn));player.rotation.y+=turn*(1-Math.pow(.001,dt));
    const walking=player.userData.networkMoving||distance>.08;player.userData.weight=THREE.MathUtils.damp(player.userData.weight,walking?1:0,10,dt);if(walking)player.userData.phase+=dt*9.5;
    player.userData.model.position.y=Math.abs(Math.sin(player.userData.phase))*player.userData.weight*.055;animateCharacterWalkRig(player.userData.rig,player.userData.phase,player.userData.weight);
    player.userData.companions?.forEach(pet=>{
      const petDistance=pet.position.distanceTo(pet.userData.targetPosition);if(petDistance>12)pet.position.copy(pet.userData.targetPosition);else pet.position.lerp(pet.userData.targetPosition,1-Math.pow(.0005,dt));
      let petTurn=pet.userData.targetRotation-pet.rotation.y;petTurn=Math.atan2(Math.sin(petTurn),Math.cos(petTurn));pet.rotation.y+=petTurn*(1-Math.pow(.001,dt));
      const petWalking=pet.userData.networkMoving||petDistance>.06;pet.userData.weight=THREE.MathUtils.damp(pet.userData.weight,petWalking?1:0,9,dt);if(petWalking)pet.userData.phase+=dt*10;animateAnimalFeet(pet,pet.userData.phase,pet.userData.weight);
    });
  });
}

function updateRoomHud(){
  const hud=document.querySelector('#roomHud');if(!hud)return;
  hud.classList.toggle('hidden',!currentRoom);document.querySelector('#roomLabel').textContent=`ROOM ${currentRoom||'------'}`;document.querySelector('#playerCount').textContent=`${Math.min(4,remotePlayers.size+1)} / 4 PLAYERS${networkLatencyMs?` · ${networkLatencyMs}ms`:''}`;updateOnlinePlayerCard(true);
}

function hideRoomRecovery(){document.querySelector('#roomRecovery')?.classList.add('hidden');}
function showRoomRecovery(){document.querySelector('#roomRecovery')?.classList.remove('hidden');}
function createFreshRoom(){requestMusicPlayback();const code=Math.random().toString(36).slice(2,8).toUpperCase(),typedName=document.querySelector('#playerName').value.trim(),name=reconnectName||typedName||localDisplayName||'旅人';document.querySelector('#roomCode').value=code;hideRoomRecovery();connectToRoom(code,name,true);}

function relativePlayerLocation(player){
  const dx=player.position.x-hero.position.x,dz=player.position.z-hero.position.z,distance=Math.round(Math.hypot(dx,dz));if(distance<3)return '就在你身旁';
  const directions=['北','東北','東','東南','南','西南','西','西北'],direction=directions[(Math.round(Math.atan2(dx,dz)/(Math.PI/4))+8)%8];return `${direction}方 ${distance}m`;
}

function updateOnlinePlayerCard(force=false,t=0){
  if(!force&&t-lastPlayerCardUpdate<.25)return;lastPlayerCardUpdate=t;const list=document.querySelector('#onlinePlayerList');if(!list)return;list.replaceChildren();
  const makeRow=(name,detail,local=false)=>{const row=document.createElement('div'),badge=document.createElement('span'),text=document.createElement('div'),title=document.createElement('b'),location=document.createElement('small');row.className=`online-player${local?' local':''}`;badge.textContent=local?'主':(name.trim()[0]||'旅');title.textContent=name;location.textContent=detail;text.append(title,location);row.append(badge,text);return row;};
  list.append(makeRow(localDisplayName,currentRoom?'你 · 同房在線':'你 · 本地漫遊',true));
  remotePlayers.forEach(player=>list.append(makeRow(player.userData.displayName||'旅人',relativePlayerLocation(player))));
}

function setCoopStatus(message,error=false){const status=document.querySelector('#coopStatus');status.textContent=message;status.classList.toggle('error',error);}

function sendPlayerState(t){
  if(!currentRoom||multiplayerSocket?.readyState!==WebSocket.OPEN||t-lastNetworkSend<.1)return;lastNetworkSend=t;
  const companions=followers.filter(animal=>!animal.userData.dead).map((animal,index)=>{ensureCompanionNetworkId(animal,index);return {id:animal.userData.networkId,species:animal.userData.species,x:animal.position.x,y:animal.position.y,z:animal.position.z,rotation:animal.rotation.y,moving:Boolean(animal.userData.isWalking||animal.userData.walkWeight>.15)};});
  multiplayerSocket.send(JSON.stringify({type:'state',state:{x:hero.position.x,y:hero.position.y,z:hero.position.z,rotation:hero.rotation.y,moving:moving||!grounded,companions}}));
  if(t-lastLatencyPing>5){lastLatencyPing=t;multiplayerSocket.send(JSON.stringify({type:'latency_ping',sentAt:performance.now()}));}
  const enemy=battle?.enemy;if(enemy?.userData.sharedEncounterId&&enemy.userData.sharedControllerId===localPlayerId)multiplayerSocket.send(JSON.stringify({type:'encounter_move',id:enemy.userData.sharedEncounterId,x:enemy.position.x,y:enemy.position.y,z:enemy.position.z,rotation:enemy.rotation.y}));
  if(enemy?.userData.boss&&enemy.userData.sharedControllerId===localPlayerId)multiplayerSocket.send(JSON.stringify({type:'boss_move',region:enemy.userData.bossRegion,x:enemy.position.x,y:enemy.position.y,z:enemy.position.z,rotation:enemy.rotation.y}));
}

function ensureCompanionNetworkId(animal,index=followers.indexOf(animal)){animal.userData.networkId||=`${localPlayerId||'local'}-${Date.now().toString(36)}-${Math.max(0,index)}`;return animal.userData.networkId;}

function applySharedBossState(region,ratio,transform=null){
  const previous=sharedBossStates.get(region)??1;ratio=Math.min(previous,Number.isFinite(Number(ratio))?Number(ratio):previous);sharedBossStates.set(region,ratio);
  if(transform){const normalized={x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0,rotation:Number(transform.rotation)||0,arenaX:Number.isFinite(Number(transform.arenaX))?Number(transform.arenaX):Number(transform.x)||0,arenaZ:Number.isFinite(Number(transform.arenaZ))?Number(transform.arenaZ):Number(transform.z)||0,controllerId:String(transform.controllerId||'')};sharedBossTransforms.set(region,normalized);const regionState=bossRegions.get(region);if(regionState){regionState.x=normalized.arenaX;regionState.z=normalized.arenaZ;}}
  const boss=bosses.find(animal=>animal.userData.bossRegion===region);if(!boss)return;boss.userData.hp=Math.min(boss.userData.hp,boss.userData.maxHp*ratio);
  const shared=sharedBossTransforms.get(region);if(shared){boss.userData.arenaX=shared.arenaX;boss.userData.arenaZ=shared.arenaZ;boss.userData.sharedControllerId=shared.controllerId;boss.userData.sharedTargetPosition??=boss.position.clone();boss.userData.sharedTargetPosition.set(shared.x,shared.y,shared.z);boss.userData.sharedTargetRotation=shared.rotation;}
  if(ratio<=0&&!boss.userData.dead)killAnimal(boss,false);
}

function updateSharedBosses(dt){
  if(!currentRoom)return;bosses.filter(boss=>!boss.userData.dead&&boss.userData.sharedTargetPosition&&boss.userData.sharedControllerId!==localPlayerId).forEach(boss=>{const target=boss.userData.sharedTargetPosition,distance=boss.position.distanceTo(target);if(distance>.001)boss.position.lerp(target,Math.min(1,(animalInActiveBattle(boss)?7:4)*dt/distance));let turn=boss.userData.sharedTargetRotation-boss.rotation.y;turn=Math.atan2(Math.sin(turn),Math.cos(turn));boss.rotation.y+=turn*(1-Math.pow(.001,dt));});
}

function ensureSharedEncounter(data){
  if(!data?.id||!data.species)return null;
  let animal=animals.find(candidate=>candidate.userData.sharedEncounterId===data.id);
  if(!animal){
    animal=animals.filter(candidate=>!candidate.userData.dead&&!candidate.userData.boss&&candidate.userData.wild&&!candidate.userData.sharedEncounterId&&candidate.userData.species===data.species).sort((a,b)=>Math.hypot(a.position.x-data.x,a.position.z-data.z)-Math.hypot(b.position.x-data.x,b.position.z-data.z))[0];
    if(animal&&Math.hypot(animal.position.x-data.x,animal.position.z-data.z)>7)animal=null;
    if(!animal){
      const template=animalTemplates.get(data.species),definition=animalData.find(([species])=>species===data.species);if(!template||!definition){pendingSharedEncounters.set(data.id,data);return null;}
      animal=prepModel(cloneModelUnique(template),definition[1]);animal.userData.species=data.species;animal.userData.displayName=animalNames[data.species];animal.userData.spawnId=`shared-${data.id}`;animal.userData.spawnCycle=0;animal.userData.collisionRadius=.62;initializeAnimalStats(animal,true);buildAnimalFootRig(animal);initAnimalMotion(animal);scene.add(animal);animals.push(animal);
    }
    animal.userData.sharedEncounterId=data.id;animal.position.set(data.x,data.y||0,data.z);resetAnimalMotion(animal);const label=createPlayerNameLabel('共同目標');label.position.y=1.55;label.scale.set(2.25,.56,1);animal.add(label);
  }
  const sharedLevel=THREE.MathUtils.clamp(Math.floor(Number(data.level)||1),1,100),base=animalBaseStats[animal.userData.species]||{hp:45,attack:10,defense:4,speed:6.5};animal.userData.level=sharedLevel;animal.userData.xp=0;animal.userData.maxHp=data.maxHp;animal.userData.hp=Math.min(animal.userData.hp,data.hp);animal.userData.attack=base.attack+(sharedLevel-1)*2;animal.userData.defense=base.defense+(sharedLevel-1);animal.userData.combatSpeed=base.speed+(sharedLevel-1)*.15;animal.userData.sharedControllerId=data.controllerId||animal.userData.sharedControllerId;animal.userData.sharedTargetPosition??=animal.position.clone();animal.userData.sharedTargetPosition.set(data.x,data.y||0,data.z);animal.userData.sharedTargetRotation=data.rotation||0;pendingSharedEncounters.delete(data.id);
  if(data.dead&&!animal.userData.dead)killAnimal(animal,false);return animal;
}

function updateSharedEncounters(dt){
  animals.filter(animal=>animal.userData.sharedEncounterId&&!animal.userData.dead&&animal.userData.sharedControllerId!==localPlayerId).forEach(animal=>{
    const target=animal.userData.sharedTargetPosition;if(!target)return;const distance=animal.position.distanceTo(target);
    if(animalInActiveBattle(animal)){if(distance>.001)animal.position.lerp(target,Math.min(1,7*dt/distance));}
    else if(distance>8)animal.position.copy(target);else animal.position.lerp(target,1-Math.pow(.0005,dt));
    let turn=animal.userData.sharedTargetRotation-animal.rotation.y;turn=Math.atan2(Math.sin(turn),Math.cos(turn));animal.rotation.y+=turn*(1-Math.pow(.001,dt));
  });
}

function applyWorldSnapshot(payload){
  const roomElapsed=Number(payload?.world?.timeElapsed);if(Number.isFinite(roomElapsed))worldTimeOffset=roomElapsed-clock.elapsedTime;
  const bossRatios=payload?.world?.bosses||{},bossPositions=payload?.world?.bossPositions||{},bossRegionsInSnapshot=new Set([...Object.keys(bossRatios),...Object.keys(bossPositions)]);bossRegionsInSnapshot.forEach(region=>applySharedBossState(region,bossRatios[region]??1,bossPositions[region]));(payload?.world?.encounters||[]).forEach(ensureSharedEncounter);(payload?.players||[]).forEach(addRemotePlayer);
}

function notifyMultiplayerReady(){if(networkAssetsReady&&currentRoom&&multiplayerSocket?.readyState===WebSocket.OPEN)multiplayerSocket.send(JSON.stringify({type:'client_ready'}));}

function clearRemoteRoomView(){remotePlayers.forEach((_,id)=>removeRemotePlayer(id));pendingRemotePlayers.clear();currentRoom='';localPlayerId='';networkLatencyMs=0;updateRoomHud();}

function scheduleReconnect(){
  if(!reconnectRoom||intentionalDisconnect||reconnectTimer)return;const delay=Math.min(15000,1000*Math.pow(1.7,reconnectAttempts++));
  setCoopStatus(`連線中斷，${Math.ceil(delay/1000)} 秒後重新連接…`);if(started)showBattleMessage('合作連線中斷，正在返回原房間…',2.4);
  reconnectTimer=setTimeout(()=>{reconnectTimer=null;connectToRoom(reconnectRoom,reconnectName,false,true);},delay);
}

function leaveRoom(showMessage=true){
  const wasConnected=Boolean(currentRoom),roomSize=Math.min(4,remotePlayers.size+1);
  intentionalDisconnect=true;clearTimeout(reconnectTimer);reconnectTimer=null;reconnectRoom='';reconnectName='';reconnectAttempts=0;
  if(multiplayerSocket){multiplayerSocket.onclose=null;multiplayerSocket.close();multiplayerSocket=null;}clearRemoteRoomView();hideRoomRecovery();
  if(wasConnected)trackGameEvent('room left',{room_size:roomSize});
  if(showMessage)setCoopStatus('已離開房間，現在是單人漫遊。');
}

function analyticsSessionProperties(){
  return {duration_seconds:analyticsSessionStartedAt?Math.max(0,Math.round((Date.now()-analyticsSessionStartedAt)/1000)):0,multiplayer:Boolean(currentRoom),room_size:currentRoom?Math.min(4,remotePlayers.size+1):1,companion_count:followers.filter(animal=>!animal.userData.dead).length};
}

function sendAnalyticsHeartbeat(){if(!analyticsSessionStartedAt||analyticsSessionEnded)return;trackGameEvent('session heartbeat',analyticsSessionProperties());}

function startAnalyticsSession(){
  if(analyticsSessionStartedAt)return;analyticsSessionStartedAt=Date.now();analyticsSessionEnded=false;sendAnalyticsHeartbeat();analyticsHeartbeatTimer=setInterval(sendAnalyticsHeartbeat,60000);
}

function endAnalyticsSession(){
  if(!analyticsSessionStartedAt||analyticsSessionEnded)return;analyticsSessionEnded=true;if(analyticsHeartbeatTimer){clearInterval(analyticsHeartbeatTimer);analyticsHeartbeatTimer=null;}trackGameEvent('game ended',analyticsSessionProperties(),{send_instantly:true,transport:'sendBeacon'});
}

function startGame(){requestMusicPlayback();localDisplayName=document.querySelector('#playerName').value.trim()||'小森';started=true;document.querySelector('#intro').classList.add('hidden');document.querySelector('#hint').classList.remove('faded');updateOnlinePlayerCard(true);if(!analyticsGameStarted){analyticsGameStarted=true;trackGameEvent('game started',{mode:currentRoom?'multiplayer':'single_player',companion_count:followers.filter(animal=>!animal.userData.dead).length});startAnalyticsSession();}}

function connectToRoom(room,name,create=false,reconnecting=false){
  if(multiplayerSocket){multiplayerSocket.onclose=null;multiplayerSocket.close();multiplayerSocket=null;}const code=room.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(code.length<4){setCoopStatus('請輸入 4–6 位房間代碼。',true);return;}
  if(!reconnecting){clearTimeout(reconnectTimer);reconnectTimer=null;reconnectRoom=code;reconnectName=name||'旅人';reconnectAttempts=0;hideRoomRecovery();}intentionalDisconnect=false;
  localDisplayName=name||'旅人';document.querySelectorAll('.coop-panel button').forEach(button=>button.disabled=true);setCoopStatus(reconnecting?'正在返回原房間…':'正在連接森林旅伴…');
  const protocol=location.protocol==='https:'?'wss':'ws',socket=new WebSocket(`${protocol}://${location.host}/multiplayer`);multiplayerSocket=socket;
  socket.onopen=()=>socket.send(JSON.stringify({type:'join',room:code,name:name||'旅人',create:create&&!reconnecting,worldTime:clock.elapsedTime+worldTimeOffset}));
  socket.onmessage=event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='welcome'){localPlayerId=message.id;currentRoom=message.room;reconnectAttempts=0;hideRoomRecovery();document.querySelectorAll('.coop-panel button').forEach(button=>button.disabled=false);applyWorldSnapshot(message);updateRoomHud();setCoopStatus(`已加入房間 ${currentRoom}`);startGame();trackGameEvent('room joined',{room_size:Math.min(4,(message.players?.length||0)+1),created:Boolean(create&&!reconnecting),reconnected:Boolean(reconnecting)});notifyMultiplayerReady();if(reconnecting)showBattleMessage(`已重新連接房間 ${currentRoom}`,2.2);}
    else if(message.type==='world_sync'){applyWorldSnapshot(message);updateRoomHud();}
    else if(message.type==='player_joined')addRemotePlayer(message.player);
    else if(message.type==='player_left')removeRemotePlayer(message.id);
    else if(message.type==='state'){const player=remotePlayers.get(message.id);if(player){player.userData.targetPosition.set(message.state.x,message.state.y,message.state.z);player.userData.targetRotation=message.state.rotation;player.userData.networkMoving=message.state.moving;syncRemoteCompanions(player,message.state.companions||[]);}else{const pending=pendingRemotePlayers.get(message.id);if(pending){pending.state=message.state;pendingRemotePlayers.set(message.id,pending);}}}
    else if(message.type==='boss_state'){applySharedBossState(message.region,message.hpRatio,message.boss);if(message.damage){if(message.attackerId!==localPlayerId)playHitSound();showBattleMessage(`${message.critical?'暴擊！':''}${message.attackerName||'旅伴'}造成 ${message.damage} 傷害`,1.4);}}
    else if(message.type==='encounter_state'){ensureSharedEncounter(message.encounter);if(message.damage){if(message.attackerId!==localPlayerId)playHitSound();showBattleMessage(`${message.critical?'暴擊！':''}${message.attackerName||'旅伴'}造成 ${message.damage} 傷害`,1.4);}}
    else if(message.type==='latency_pong'){networkLatencyMs=Math.max(1,Math.round(performance.now()-Number(message.sentAt)));updateRoomHud();}
    else if(message.type==='error'){
      const errorMessage=message.message||'無法加入房間。',roomReset=reconnecting&&/找不到這個房間/.test(errorMessage);setCoopStatus(errorMessage,true);
      if(roomReset){intentionalDisconnect=true;reconnectRoom='';reconnectAttempts=0;showRoomRecovery();if(started)showBattleMessage('免費伺服器已重置舊房間，請建立新房間。',4);}
      else if(!reconnecting){reconnectRoom='';reconnectName='';}
      socket.close();
    }
  };
  socket.onerror=()=>setCoopStatus(reconnecting?'重新連線暫時失敗。':'連線失敗，請確認合作伺服器已啟動。',true);
  socket.onclose=()=>{document.querySelectorAll('.coop-panel button').forEach(button=>button.disabled=false);if(multiplayerSocket===socket){multiplayerSocket=null;clearRemoteRoomView();scheduleReconnect();}};
}

async function loadPlatformerPack(){
  const platformLoads=platformDefs.map(def=>loadObj('platformer',def.name).then(obj=>platformTemplates.set(def.name,prepModel(obj,1))));
  const decorLoads=[...treeDefs,...decorDefs].map(([name])=>loadObj('platformer',name).then(obj=>decorTemplates.set(name,prepModel(obj,1))));
  const coinLoads=[...new Set(coinDefs.map(([name])=>name))].map(name=>loadObj('platformer',name).then(obj=>coinTemplates.set(name,prepModel(obj,1))));
  const results=await Promise.allSettled([...platformLoads,...decorLoads,...coinLoads]);
  results.filter(r=>r.status==='rejected').forEach(r=>console.error('Platformer asset loading error:',r.reason));
  arrangeTiles(true);
}

const animalData=[
  ['animal-deer',1.05],['animal-fox',.85],['animal-bunny',.9],['animal-panda',.85],['animal-hog',.75],['animal-monkey',.8],['animal-tiger',.8],['animal-parrot',.75]
];
const animalNames={
  'animal-deer':'小鹿','animal-fox':'狐狸','animal-bunny':'兔子','animal-panda':'熊貓','animal-hog':'野豬','animal-monkey':'猴子','animal-tiger':'老虎','animal-parrot':'鸚鵡'
};
const animalPrices={'animal-deer':12,'animal-fox':15,'animal-bunny':8,'animal-panda':20,'animal-hog':11,'animal-monkey':14,'animal-tiger':22,'animal-parrot':10};
const animalBaseStats={
  'animal-deer':{hp:52,attack:10,defense:4,speed:6.5},'animal-fox':{hp:44,attack:11,defense:3,speed:7.4},
  'animal-bunny':{hp:36,attack:8,defense:3,speed:7.8},'animal-panda':{hp:68,attack:12,defense:6,speed:5.4},
  'animal-hog':{hp:62,attack:13,defense:6,speed:6},'animal-monkey':{hp:46,attack:10,defense:4,speed:7.2},
  'animal-tiger':{hp:72,attack:15,defense:5,speed:7},'animal-parrot':{hp:38,attack:9,defense:3,speed:8}
};
const animalAffinities={
  'animal-deer':{time:'morning',weather:'mist'},
  'animal-fox':{time:'night',weather:'mist'},
  'animal-bunny':{time:'morning',weather:'clear'},
  'animal-panda':{time:'afternoon',weather:'cloudy'},
  'animal-hog':{time:'evening',weather:'rain'},
  'animal-monkey':{time:'afternoon',weather:'clear'},
  'animal-tiger':{time:'night',weather:'rain'},
  'animal-parrot':{time:'morning',weather:'cloudy'}
};
const affinityTimeLabels={morning:'清晨與上午',afternoon:'午後',evening:'黃昏與入夜',night:'深夜'};

function timeAffinityAt(phase){
  if(phase>=.2&&phase<.45)return 'morning';
  if(phase>=.45&&phase<.67)return 'afternoon';
  if(phase>=.67&&phase<.82)return 'evening';
  return 'night';
}

function animalAffinityEffect(animal){
  const affinity=animalAffinities[animal.userData.species],timeMatch=affinity?.time===worldCycleState.time,weatherMatch=affinity?.weather===weatherState.name;
  const power=1+(timeMatch ? .1 : 0)+(weatherMatch ? .1 : 0)+(timeMatch&&weatherMatch ? .05 : 0);
  return {timeMatch,weatherMatch,power,speed:1+(power-1)*.65};
}
const animalPersonalityDefs={
  fierce:{label:'勇猛好戰',willingness:1,attackChance:.76,evadeChance:.08,dodgeChance:.1,roamTime:.55,chainLimit:3},
  wary:{label:'謹慎避戰',willingness:.28,attackChance:.25,evadeChance:.52,dodgeChance:.64,roamTime:1.25,chainLimit:2},
  playful:{label:'靈活好動',willingness:.62,attackChance:.43,evadeChance:.3,dodgeChance:.54,roamTime:1.05,chainLimit:2},
  steady:{label:'沉著穩健',willingness:.7,attackChance:.5,evadeChance:.2,dodgeChance:.3,roamTime:.8,chainLimit:2}
};
const animals=[],animalTemplates=new Map(),followers=[],fallenFollowers=[],bosses=[],shopSlots=[0,1,2].map(index=>({index,animal:null,restockTimer:0}));
const animalRespawns=[];
const bossRegions=new Map(),BOSS_REGION_SIZE=TILE*4;
let merchant=null,doctor=null,doctorState=null,purchaseState=null,huntPrompt=null,battle=null,battleActionState=null,potionCount=Math.max(0,Math.floor(Number(pendingLocalSave?.potions)||0)),doctorPotionStock=4,doctorPotionRestockTimer=0;
let localSaveRestored=false,localSaveElapsed=0,lastLocalSaveJson='';
const DOCTOR_POTION_MAX_STOCK=4,DOCTOR_POTION_PRICE=15,DOCTOR_HEAL_ALL_PRICE=10,DOCTOR_REVIVE_PRICE=200,DOCTOR_UPGRADE_PRICE=100,DOCTOR_POTION_RESTOCK_TIME=38;
const SEVERE_INJURY_RATIO=.25,SEVERE_INJURY_SPEED=.48,SEVERE_INJURY_COLOR=new THREE.Color(0xff182c);

function initializeAnimalStats(animal,wild=false){
  const base=animalBaseStats[animal.userData.species]||{hp:45,attack:10,defense:4,speed:6.5};
  animal.userData.level=animal.userData.level||1;animal.userData.xp=animal.userData.xp||0;
  animal.userData.maxHp=animal.userData.maxHp||base.hp;animal.userData.hp=animal.userData.hp??animal.userData.maxHp;
  animal.userData.attack=animal.userData.attack||base.attack;animal.userData.defense=animal.userData.defense||base.defense;animal.userData.combatSpeed=animal.userData.combatSpeed||base.speed;
  const personalityKeys=Object.keys(animalPersonalityDefs);animal.userData.personality=animal.userData.personality||personalityKeys[Math.floor(Math.random()*personalityKeys.length)];
  animal.userData.baseScale=animal.userData.baseScale||animal.scale.x;animal.userData.fatigue=0;animal.userData.exhausted=false;animal.userData.verticalVelocity=animal.userData.verticalVelocity||0;animal.userData.grounded=animal.userData.grounded??true;animal.userData.jumpCooldown=animal.userData.jumpCooldown||0;animal.userData.wild=wild;animal.userData.dead=false;animal.userData.restingForRecovery=false;animal.userData.cryCooldown=2+Math.random()*3;
}

function severeInjurySpeed(animal){
  return !animal.userData.dead&&animal.userData.hp/Math.max(1,animal.userData.maxHp)<=SEVERE_INJURY_RATIO?SEVERE_INJURY_SPEED:1;
}

function prepareAnimalInjuryVisual(animal){
  if(animal.userData.injuryVisual)return animal.userData.injuryVisual;
  const materials=[];
  animal.traverse(object=>{
    if(!object.isMesh||!object.material)return;
    const source=Array.isArray(object.material)?object.material:[object.material],clones=source.map(material=>material.clone());
    object.material=Array.isArray(object.material)?clones:clones[0];
    clones.forEach(material=>materials.push({material,color:material.color?.clone(),emissive:material.emissive?.clone(),emissiveIntensity:material.emissiveIntensity??1}));
  });
  const light=new THREE.PointLight(0xff2438,0,5,2);light.position.set(0,1.15/Math.max(.01,animal.userData.baseScale||animal.scale.x),0);animal.add(light);
  animal.userData.injuryVisual={materials,light};return animal.userData.injuryVisual;
}

function updateAnimalInjuryEffects(time){
  const visibleAnimals=new Set([...animals,...followers,...shopSlots.map(slot=>slot.animal).filter(Boolean)]);
  visibleAnimals.forEach(animal=>{
    const ratio=animal.userData.hp/Math.max(1,animal.userData.maxHp),severe=!animal.userData.dead&&ratio<=SEVERE_INJURY_RATIO;
    if(!severe&&!animal.userData.injuryVisual)return;
    const visual=prepareAnimalInjuryVisual(animal),pulse=.5+.5*Math.sin(time*9+(animal.userData.phase||0));
    visual.materials.forEach(entry=>{
      if(entry.color&&entry.material.color)entry.material.color.copy(entry.color).lerp(SEVERE_INJURY_COLOR,severe?.34+pulse*.2:0);
      if(entry.emissive&&entry.material.emissive){entry.material.emissive.copy(entry.emissive);if(severe)entry.material.emissive.lerp(SEVERE_INJURY_COLOR,.72);}
      if('emissiveIntensity' in entry.material)entry.material.emissiveIntensity=severe?Math.max(entry.emissiveIntensity,.5+pulse*.85):entry.emissiveIntensity;
    });
    visual.light.intensity=severe?.8+pulse*2.1:0;
  });
}

function highestCompanionLevel(){return Math.max(1,...followers.map(animal=>animal.userData.level||1),...fallenFollowers.map(animal=>animal.userData.level||1));}

function targetWildLevel(animal){
  const cap=highestCompanionLevel(),minimum=Math.max(1,cap-3),spawnNumber=Number(animal.userData.spawnId)||0,random=rng(hash(spawnNumber+cap*97,(animal.userData.spawnCycle||0)*131+cap*7919));return minimum+Math.floor(random()*(cap-minimum+1));
}

function setWildAnimalLevel(animal,level=targetWildLevel(animal)){
  if(!animal?.userData.wild||animal.userData.boss)return;const base=animalBaseStats[animal.userData.species]||{hp:45,attack:10,defense:4,speed:6.5},target=THREE.MathUtils.clamp(Math.floor(level)||1,1,highestCompanionLevel()),previousMax=Math.max(1,animal.userData.maxHp||base.hp),healthRatio=THREE.MathUtils.clamp((animal.userData.hp??previousMax)/previousMax,0,1);animal.userData.level=target;animal.userData.xp=0;animal.userData.maxHp=base.hp+(target-1)*8;animal.userData.hp=animal.userData.maxHp*healthRatio;animal.userData.attack=base.attack+(target-1)*2;animal.userData.defense=base.defense+(target-1);animal.userData.combatSpeed=base.speed+(target-1)*.15;
}

function refreshWildAnimalLevels(){animals.forEach(animal=>{if(!animal.userData.dead&&!animal.userData.boss&&!animal.userData.sharedEncounterId&&!animalInActiveBattle(animal)&&huntPrompt?.target!==animal)setWildAnimalLevel(animal);});}

function xpNeeded(animal){return 20+animal.userData.level*15;}
function entitySpotIsFree(x,z,radius,ignore=null){
  if(blockedByWorld(x,z,radius,0,1.65,ignore))return false;
  if(!ignore?.userData.boss&&nearbyBossArenas().some(arena=>Math.hypot(x-arena.x,z-arena.z)<BOSS_ARENA_CLEAR_RADIUS+radius))return false;
  if(ignore!==hero&&Math.hypot(x-hero.position.x,z-hero.position.z)<radius+.5)return false;
  const shopAnimals=shopSlots.map(slot=>slot.animal).filter(Boolean);
  for(const entity of [...animals,...npcs,...followers,...shopAnimals,merchant,doctor].filter(Boolean)){
    if(entity===ignore)continue;const otherRadius=entity.userData.collisionRadius||.4;
    if(Math.hypot(x-entity.position.x,z-entity.position.z)<radius+otherRadius+.15)return false;
  }
  return true;
}

function resetAnimalMotion(a){
  const motion=a.userData.motion;if(!motion)return;
  motion.home.set(a.position.x,a.position.z);motion.target.set(a.position.x,a.position.z);
  motion.wait=.8+Math.random()*3;motion.walking=false;motion.weight=0;
}

function initAnimalMotion(a){
  a.userData.motion={home:new THREE.Vector2(a.position.x,a.position.z),target:new THREE.Vector2(a.position.x,a.position.z),wait:Math.random()*2,speed:.45+Math.random()*.45,phase:Math.random()*Math.PI*2,weight:0,walking:false};
}

function companionSaveData(animal,dead=false){
  animal.userData.saveId||=`pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  return {id:animal.userData.saveId,species:animal.userData.species,dead:Boolean(dead||animal.userData.dead),level:animal.userData.level,xp:animal.userData.xp,hp:animal.userData.hp,maxHp:animal.userData.maxHp,attack:animal.userData.attack,defense:animal.userData.defense,combatSpeed:animal.userData.combatSpeed,personality:animal.userData.personality};
}

function saveLocalGame(force=false){
  if(!localSaveRestored)return;const livingAndDying=[...followers],all=[...livingAndDying,...fallenFollowers.filter(animal=>!livingAndDying.includes(animal))];
  const data={version:1,coins:Math.max(0,Math.floor(coinBalance)),potions:Math.max(0,Math.floor(potionCount)),companions:all.slice(0,12).map(animal=>companionSaveData(animal,fallenFollowers.includes(animal)))};
  const json=JSON.stringify(data);if(!force&&json===lastLocalSaveJson)return;try{localStorage.setItem(LOCAL_SAVE_KEY,json);lastLocalSaveJson=json;}catch{}
}

function restoreLocalCompanions(){
  if(localSaveRestored)return;const saved=Array.isArray(pendingLocalSave?.companions)?pendingLocalSave.companions.slice(0,12):[];
  saved.forEach((entry,index)=>{
    const template=animalTemplates.get(entry.species),definition=animalData.find(([species])=>species===entry.species);if(!template||!definition)return;
    const animal=prepModel(cloneModelUnique(template),definition[1]);animal.userData.species=entry.species;animal.userData.displayName=animalNames[entry.species];animal.userData.saveId=String(entry.id||`saved-${index}`).slice(0,40);animal.userData.spawnId=`saved-${index}`;animal.userData.spawnCycle=0;animal.userData.collisionRadius=.62;
    initializeAnimalStats(animal,false);animal.userData.level=THREE.MathUtils.clamp(Math.floor(Number(entry.level)||1),1,100);animal.userData.xp=THREE.MathUtils.clamp(Math.floor(Number(entry.xp)||0),0,100000);animal.userData.maxHp=THREE.MathUtils.clamp(Number(entry.maxHp)||animal.userData.maxHp,1,5000);animal.userData.hp=THREE.MathUtils.clamp(Number(entry.hp)||0,0,animal.userData.maxHp);animal.userData.attack=THREE.MathUtils.clamp(Number(entry.attack)||animal.userData.attack,1,500);animal.userData.defense=THREE.MathUtils.clamp(Number(entry.defense)||animal.userData.defense,0,500);animal.userData.combatSpeed=THREE.MathUtils.clamp(Number(entry.combatSpeed)||animal.userData.combatSpeed,1,30);if(animalPersonalityDefs[entry.personality])animal.userData.personality=entry.personality;
    animal.userData.following=true;animal.userData.shopAnimal=false;animal.userData.phase=Math.random()*Math.PI*2;animal.userData.walkWeight=0;animal.userData.verticalVelocity=0;animal.userData.grounded=true;buildAnimalFootRig(animal);initAnimalMotion(animal);
    if(entry.dead){animal.userData.dead=true;animal.userData.hp=0;fallenFollowers.push(animal);return;}
    const row=Math.floor(index/2),side=index%2===0?-1:1;let x=hero.position.x+side*(1.4+row*.3),z=hero.position.z+2.2+row*1.1;for(let attempt=0;attempt<12&&!entitySpotIsFree(x,z,.62,animal);attempt++){const angle=attempt*.75,radius=2.2+attempt*.3;x=hero.position.x+Math.cos(angle)*radius;z=hero.position.z+Math.sin(angle)*radius;}
    animal.position.set(x,surfaceHeightAt(x,z,Infinity),z);scene.add(animal);followers.push(animal);
  });
  localSaveRestored=true;pendingLocalSave=null;refreshWildAnimalLevels();saveLocalGame(true);
}

function placeAnimal(a,initial=false){
  if(animalInActiveBattle(a))return;
  const id=a.userData.spawnId;
  const cycle=a.userData.spawnCycle||0;
  const random=rng(hash(centerTX+id*17+cycle*31,centerTZ-id*23-cycle*13));
  let x,z;
  for(let attempt=0;attempt<28;attempt++){
    const angle=random()*Math.PI*2,radius=initial?10+random()*42:54+random()*12;
    x=hero.position.x+Math.cos(angle)*radius;z=hero.position.z+Math.sin(angle)*radius;
    if(entitySpotIsFree(x,z,a.userData.collisionRadius||.4,a))break;
  }
  a.position.set(x,0,z);
  a.rotation.y=random()*Math.PI*2;
  setWildAnimalLevel(a);
  resetAnimalMotion(a);
}

function chooseAnimalTarget(a){
  const motion=a.userData.motion;
  for(let attempt=0;attempt<8;attempt++){
    const angle=Math.random()*Math.PI*2,distance=2+Math.random()*6;
    const x=motion.home.x+Math.cos(angle)*distance,z=motion.home.y+Math.sin(angle)*distance;
    if(entitySpotIsFree(x,z,a.userData.collisionRadius||.62,a)){motion.target.set(x,z);motion.walking=true;return;}
  }
  motion.wait=1+Math.random()*2;
}

function updateAnimals(dt){
  animals.forEach(a=>{
    if(a.userData.dead||conversation?.npc===a||huntPrompt?.target===a||battle?.enemy===a)return;
    if(a.userData.boss&&currentRoom){if(a.userData.motion){a.userData.motion.walking=false;a.userData.motion.weight=THREE.MathUtils.damp(a.userData.motion.weight,0,7,dt);animateAnimalFeet(a,a.userData.motion.phase,a.userData.motion.weight);}return;}
    if(a.userData.sharedEncounterId){if(a.userData.motion){a.userData.motion.walking=false;a.userData.motion.weight=THREE.MathUtils.damp(a.userData.motion.weight,0,7,dt);animateAnimalFeet(a,a.userData.motion.phase,a.userData.motion.weight);}return;}
    a.userData.fatigue=Math.max(0,(a.userData.fatigue||0)-dt*.06);a.userData.exhausted=false;
    const motion=a.userData.motion;
    if(!motion)return;
    const healthRatio=a.userData.hp/a.userData.maxHp;
    if(healthRatio<=SEVERE_INJURY_RATIO)a.userData.restingForRecovery=true;
    else if(a.userData.restingForRecovery&&healthRatio>=.48)a.userData.restingForRecovery=false;
    if(a.userData.restingForRecovery){motion.walking=false;recoverAnimal(a,dt,true);motion.weight=THREE.MathUtils.damp(motion.weight,0,7,dt);animateAnimalFeet(a,motion.phase,motion.weight);return;}
    if(!motion.walking){motion.wait-=dt;if(motion.wait<=0)chooseAnimalTarget(a);}
    if(motion.walking){
      const dx=motion.target.x-a.position.x,dz=motion.target.y-a.position.z,dist=Math.hypot(dx,dz);
      if(dist<.12){motion.walking=false;motion.wait=1+Math.random()*3;}
      else{
        const dirX=dx/dist,dirZ=dz/dist,step=Math.min(motion.speed*dt,dist);
        const nx=a.position.x+dirX*step,nz=a.position.z+dirZ*step;
        if(!entitySpotIsFree(nx,nz,a.userData.collisionRadius||.62,a)){motion.walking=false;motion.wait=.4+Math.random();}
        else{a.position.x=nx;a.position.z=nz;a.rotation.y=Math.atan2(dirX,dirZ);motion.phase+=dt*7;}
      }
    }
    motion.weight=THREE.MathUtils.damp(motion.weight,motion.walking?1:0,7,dt);
    if(!motion.walking)recoverAnimal(a,dt);
    a.position.y=Math.abs(Math.sin(motion.phase))*motion.weight*.025;
    animateAnimalFeet(a,motion.phase,motion.weight);
  });
}

function recycleDistantAnimals(){
  animals.forEach(a=>{
    if(a.userData.dead||a.userData.boss||a.userData.sharedEncounterId||huntPrompt?.target===a||battle?.enemy===a)return;
    const dx=a.position.x-hero.position.x,dz=a.position.z-hero.position.z;
    if(dx*dx+dz*dz>76*76){
      a.userData.spawnCycle++;
      placeAnimal(a);
    }
  });
}

const npcData=[['character-male-a','阿洛'],['character-female-c','米亞'],['character-male-d','路恩'],['character-female-e','小葵']];
const npcs=[];
const conversations=[
  [{speaker:'npc',text:'你有沒有發現，這裡的風總是從同一個方向吹？'},{speaker:'hero',text:'也許風知道森林的出口。'},{speaker:'npc',text:'那我們就聽著樹葉，慢慢走吧。'}],
  [{speaker:'npc',text:'剛才有一隻狐狸偷偷跟著我。'},{speaker:'hero',text:'牠可能只是想交朋友。'},{speaker:'npc',text:'下次見到牠，我會記得打招呼。'}],
  [{speaker:'npc',text:'你也是在這座森林裡旅行嗎？'},{speaker:'hero',text:'嗯，我想看看沒有盡頭的地方會通往哪裡。'},{speaker:'npc',text:'真巧，我也是。希望我們還會再遇見。'}],
  [{speaker:'npc',text:'草地平台上看見的星星，似乎比地面更多。'},{speaker:'hero',text:'那我今晚也跳上去看看。'},{speaker:'npc',text:'小心別驚醒旁邊睡覺的兔子。'}],
  [{speaker:'npc',text:'老人們說，霧林不是沒有盡頭，而是會悄悄把走過的路搬到身後。'},{speaker:'hero',text:'所以地圖才總像在改變嗎？'},{speaker:'npc',text:'也許。只有記得同行者名字的人，才不會被森林繞回原地。'}],
  [{speaker:'npc',text:'深夜的螢火蟲不全是蟲，有些是迷路旅人的夢。'},{speaker:'hero',text:'要怎樣分辨牠們？'},{speaker:'npc',text:'真正的螢火蟲怕雨，夢的光卻會在雨裡變得更亮。'}],
  [{speaker:'npc',text:'有人說，地區首領都記得一副不屬於現在的影子。森林把那些影子藏得很深，連牠們自己也不願回頭看。'},{speaker:'hero',text:'那牠們為甚麼會攻擊我們？'},{speaker:'npc',text:'也許牠們只是想知道，世上是否真的有一些傷口，可以不靠遺忘便慢慢癒合。'}],
  [{speaker:'npc',text:'下雨後如果看見石頭上出現發光的腳印，千萬不要急著追。'},{speaker:'hero',text:'腳印會通往哪裡？'},{speaker:'npc',text:'有人說是古老獸王的巢，也有人追著走，第二天卻從森林另一端醒來。'}],
  [{speaker:'npc',text:'這裡的樹根會記住聲音。把秘密告訴老樹，很多年後葉子仍會低聲重複。'},{speaker:'hero',text:'那森林一定知道很多故事。'},{speaker:'npc',text:'也知道很多不該再被提起的名字。'}],
  [{speaker:'npc',text:'你撿到的金幣，也許不是普通錢幣。傳說它們是消失王國留下的承諾。'},{speaker:'hero',text:'承諾也能拿來買東西嗎？'},{speaker:'npc',text:'只要仍有人相信它有價值，承諾就還沒有完全消失。'}],
  [{speaker:'npc',text:'清晨最安靜的那一刻，我偶爾會聽到地底傳來鐘聲。'},{speaker:'hero',text:'森林下面有鐘樓？'},{speaker:'npc',text:'傳說整座森林長在一座沉睡城市之上，樹根就是它最後的街道。'}],
  [{speaker:'npc',text:'粉紅霧出現時，最好留意影子的方向。'},{speaker:'hero',text:'霧裡的影子有甚麼特別？'},{speaker:'npc',text:'如果影子沒有跟著你移動，那可能是森林裡另一個「你」正在看著這邊。'}],
  [{speaker:'npc',text:'那些看似隨意的木柵欄，其實全都朝向森林外面。'},{speaker:'hero',text:'不是用來阻止我們進去嗎？'},{speaker:'npc',text:'不。很久以前，人們建造它們，是怕外面的某樣東西走進森林。'}],
  [{speaker:'npc',text:'動物升級時的特殊叫聲，據說會被遠方的古老巨獸聽見。'},{speaker:'hero',text:'牠們會回應嗎？'},{speaker:'npc',text:'有時夜裡那聲很低的吼叫，就是牠們在向年輕的生命祝福。'}],
  [{speaker:'npc',text:'森林醫生很少談自己的過去，但有人看過他和地區首領和平地坐在一起。'},{speaker:'hero',text:'也許他以前就認識牠們。'},{speaker:'npc',text:'又或者，他比我們想像中更早來到這座森林。'}],
  [{speaker:'npc',text:'如果風突然完全停下來，就在附近找一塊沒有長草的石頭。'},{speaker:'hero',text:'石頭下面藏著東西嗎？'},{speaker:'npc',text:'我不知道。傳說有人把耳朵貼上去，聽見了森林明天才會發生的事。'}],
  [{speaker:'npc',text:'森林醫生會調配回血藥水。帶著動物遠行前，最好先買一兩瓶放在身上。'},{speaker:'hero',text:'受傷後就不用每次都趕回診所了。'},{speaker:'npc',text:'沒錯，戰鬥中也能使用，只是醫生的存貨需要時間補充。'}],
  [{speaker:'npc',text:'那些體型巨大的地區首領，不只是強大的野獸，也守護著這個世界被遺忘的真相。'},{speaker:'hero',text:'打敗牠們，牠們便會告訴我嗎？'},{speaker:'npc',text:'先證明你會保護同行的動物，首領才願意讓你接近答案。'}],
  [{speaker:'npc',text:'動物也有自己喜歡的時刻。有些在清晨精神最好，有些卻要等月亮升起才會展現力量。'},{speaker:'hero',text:'天氣也會影響牠們嗎？'},{speaker:'npc',text:'會。晴天、陰天、雨天與粉紅霧，都可能喚醒不同動物的本能。'}],
  [{speaker:'npc',text:'動物傷得太重時會不願出戰。讓牠停下休息，身體才會慢慢恢復。'},{speaker:'hero',text:'我也可以向醫生買藥水，對嗎？'},{speaker:'npc',text:'當然。懂得何時休息，也是旅行的一部分。'}]
];
const merchantConversations=[
  [{speaker:'npc',text:'今天的森林很安靜，適合慢慢散步。'},{speaker:'hero',text:'你每天都會在這裡嗎？'},{speaker:'npc',text:'只要動物需要一個家，我就會留在這裡。'}],
  [{speaker:'npc',text:'銀色金幣在月光下特別容易找到。'},{speaker:'hero',text:'謝謝你的提示。'},{speaker:'npc',text:'不用客氣，路上小心。'}],
  [{speaker:'npc',text:'每隻動物都有自己的個性，不一定要買東西，也可以先和牠們相處。'},{speaker:'hero',text:'我會好好認識牠們的。'}],
  [{speaker:'npc',text:'有人問我這些動物從哪裡來。其實很多時候，是牠們自己找到我的。'},{speaker:'hero',text:'牠們知道你會替牠們找同伴。'},{speaker:'npc',text:'也可能是森林在替旅人挑選彼此。'}],
  [{speaker:'npc',text:'金色金幣上的花紋，是一種已經沒有人會寫的文字。'},{speaker:'hero',text:'上面寫了甚麼？'},{speaker:'npc',text:'一位學者說那是「歸來」，但他走進霧裡後就再也沒回來。'}],
  [{speaker:'npc',text:'首領附近的森林看似封閉，其實樹木會為真正需要離開的人讓路。'},{speaker:'hero',text:'要怎樣請樹木讓開？'},{speaker:'npc',text:'不是用說的。森林會看你如何對待並肩作戰的動物。'}],
  [{speaker:'npc',text:'我從不把動物稱作商品。金幣只是旅人願意負起責任的證明。'},{speaker:'hero',text:'所以牠們最後仍是自己選擇跟誰走。'},{speaker:'npc',text:'沒錯。若牠不願意，再多金幣也留不住牠。'}]
];
const beginnerNpcConversations=[
  [{speaker:'npc',text:'你還沒有動物同行嗎？沿路收集金幣，就可以向森林商人請一隻動物加入旅程。'},{speaker:'hero',text:'森林商人在哪裡？'},{speaker:'npc',text:'你知道起始帳篷嗎？帳篷附近守著幾隻動物的那位，就是商人。'}],
  [{speaker:'npc',text:'獨自在霧林裡旅行會有點寂寞。先撿一些金幣，再到起始帳篷附近找森林商人吧。'},{speaker:'hero',text:'他會讓動物跟我同行嗎？'},{speaker:'npc',text:'只要準備足夠的金幣，並願意好好照顧牠們，商人會替你介紹。'}]
];
const merchantBeginnerConversations=[
  [{speaker:'npc',text:'你還沒有動物同行吧？我這裡的動物都在等待可靠的旅伴。'},{speaker:'hero',text:'但我現在應該怎樣準備？'},{speaker:'npc',text:'先在森林收集金幣，再點擊我前方喜歡的動物。我會告訴你牠需要多少金幣。'}],
  [{speaker:'npc',text:'歡迎回到起始帳篷附近。沒有動物陪伴的話，不妨看看我帶來的孩子們。'},{speaker:'hero',text:'我可以直接和牠們談談嗎？'},{speaker:'npc',text:'點擊想認識的動物吧。準備好金幣，我便會問你是否願意帶牠同行。'}]
];

function playerOwnsAnyAnimal(){return followers.length>0||fallenFollowers.length>0;}
function npcConversationScripts(npc){
  if(npc===merchant)return playerOwnsAnyAnimal()?merchantConversations:merchantBeginnerConversations;
  if(!playerOwnsAnyAnimal()&&Math.random()<.5)return beginnerNpcConversations;
  return conversations;
}
const animalVoices={
  'animal-deer':['呦——呦！','呦嗚～'],
  'animal-fox':['嗚嗚……嗷！','嗷嗚～'],
  'animal-bunny':['吱吱！','啾、啾～'],
  'animal-panda':['嗯嗯～','呼嚕……'],
  'animal-hog':['哼哼！','呼嚕呼嚕！'],
  'animal-monkey':['唧唧、吱呀！','吱吱吱～'],
  'animal-tiger':['嗷嗚！','呼嚕嚕……'],
  'animal-parrot':['嘎嘎！啾——','啾啾、嘎！']
};
function animalConversationsFor(animal){
  const [hello,reply]=animalVoices[animal.userData.species]||['嗚嗚～','啾啾！'];
  const ratio=animal.userData.hp/animal.userData.maxHp;
  const healthText=ratio>.82?'今天看起來很有精神呢。':ratio>.5?'你的毛色看起來不太健康，是不是有點累了？':ratio>.25?'你受傷了嗎？我們找個地方休息一下吧。':'你傷得很重，不要再勉強自己了。';
  const growthText=animal.userData.level<=1?(animal.userData.xp>xpNeeded(animal)*.45?'你最近好像漸漸習慣森林的生活了呢。':'我們一起旅行的日子還不算長，慢慢來就好。'):'你看起來比之前成長了不少了呢。';
  const personalityText={
    fierce:'不可以隨便咬人，知道嗎？',wary:'不用一直躲得那麼遠，這裡很安全。',
    playful:'你真是活潑好動呢，一刻也停不下來。',steady:'你總是不慌不忙，待在你身邊很安心。'
  }[animal.userData.personality]||'今天也要好好相處喔。';
  const affinity=animalAffinities[animal.userData.species],affinityText=affinity?`每到${affinityTimeLabels[affinity.time]}，尤其碰上${weatherProfiles[affinity.weather].label}，你總會顯得格外有精神呢。`:'你似乎很懂得從森林的天氣中取得力量。';
  const healthHint={speaker:'hero',text:healthText},growthHint={speaker:'hero',text:growthText},personalityHint={speaker:'hero',text:personalityText},affinityHint={speaker:'hero',text:affinityText};
  return [
    [{speaker:'npc',text:hello},{speaker:'hero',text:'我也很高興能和你一起旅行。'},{speaker:'npc',text:reply},healthHint],
    [{speaker:'npc',text:reply},{speaker:'hero',text:'前面的森林好像有新味道，對嗎？'},{speaker:'npc',text:hello},growthHint],
    [{speaker:'npc',text:`${hello} ${reply}`},{speaker:'hero',text:'放心，我會一直陪著你的。'},{speaker:'npc',text:reply},personalityHint],
    [{speaker:'npc',text:reply},affinityHint,{speaker:'npc',text:hello}]
  ];
}
const npcBubble=document.createElement('div'),heroBubble=document.createElement('div');
npcBubble.className='speech-bubble hidden';heroBubble.className='speech-bubble hero-speech hidden';
document.querySelector('#app').append(npcBubble,heroBubble);
let conversation=null;

function relocateEmbeddedEntities(){
  animals.forEach(a=>{if(animalInActiveBattle(a)||huntPrompt?.target===a)return;if(blockedByWorld(a.position.x,a.position.z,a.userData.collisionRadius||.4,0,a.userData.boss?Math.max(3,a.userData.bossFactor*1.1):1.1,a)){if(a.userData.boss)repositionBoss(a,bossRegions.get(a.userData.bossRegion));else placeAnimal(a,true);}});
  npcs.forEach((npc,i)=>{if(blockedByWorld(npc.position.x,npc.position.z,npc.userData.collisionRadius||.42,0))placeNpc(npc,i,true);});
  placeDoctorSafely();
}

function placeDoctorSafely(){
  if(!doctor||!blockedByWorld(doctor.position.x,doctor.position.z,.68,0,1.65,doctor))return;
  const origin=ORIGIN_LAYOUT.doctor;let x=origin.x,z=origin.z;for(let attempt=0;attempt<16;attempt++){const angle=attempt*.78,radius=attempt?2+attempt*.28:0,cx=origin.x+Math.cos(angle)*radius,cz=origin.z+Math.sin(angle)*radius;if(entitySpotIsFree(cx,cz,.68,doctor)){x=cx;z=cz;break;}}doctor.position.set(x,0,z);
}

function placeNpc(npc,index,initial=true){
  const random=rng(hash(centerTX+index*41+npc.userData.spawnCycle*17,centerTZ-index*29));
  let x,z;
  for(let attempt=0;attempt<28;attempt++){
    const angle=random()*Math.PI*2,radius=initial?9+random()*28:52+random()*12;
    x=hero.position.x+Math.cos(angle)*radius;z=hero.position.z+Math.sin(angle)*radius;
    if(entitySpotIsFree(x,z,npc.userData.collisionRadius||.42,npc))break;
  }
  npc.position.set(x,0,z);npc.rotation.y=random()*Math.PI*2;
  const motion=npc.userData.motion;
  if(motion){motion.home.set(npc.position.x,npc.position.z);motion.target.copy(motion.home);motion.wait=1+random()*3;motion.walking=false;}
}

function chooseNpcTarget(npc){
  const motion=npc.userData.motion;
  for(let attempt=0;attempt<8;attempt++){
    const angle=Math.random()*Math.PI*2,distance=2+Math.random()*7,x=motion.home.x+Math.cos(angle)*distance,z=motion.home.y+Math.sin(angle)*distance;
    if(entitySpotIsFree(x,z,npc.userData.collisionRadius||.68,npc)){motion.target.set(x,z);motion.walking=true;return;}
  }
  motion.wait=1+Math.random()*2;
}

function updateNpcs(dt){
  npcs.forEach((npc,index)=>{
    const motion=npc.userData.motion,chatting=conversation?.npc===npc;
    if(!chatting){
      if(!motion.walking){motion.wait-=dt;if(motion.wait<=0)chooseNpcTarget(npc);}
      if(motion.walking){
        const dx=motion.target.x-npc.position.x,dz=motion.target.y-npc.position.z,dist=Math.hypot(dx,dz);
        if(dist<.12){motion.walking=false;motion.wait=1+Math.random()*3;}
        else{
          const dirX=dx/dist,dirZ=dz/dist,step=Math.min(motion.speed*dt,dist),nx=npc.position.x+dirX*step,nz=npc.position.z+dirZ*step;
          if(!entitySpotIsFree(nx,nz,npc.userData.collisionRadius||.68,npc)){motion.walking=false;motion.wait=.5+Math.random();}
          else{npc.position.x=nx;npc.position.z=nz;npc.rotation.y=Math.atan2(dirX,dirZ);motion.phase+=dt*8;}
        }
      }
    }else motion.walking=false;
    motion.weight=THREE.MathUtils.damp(motion.weight,motion.walking?1:0,8,dt);
    npc.userData.model.position.y=Math.abs(Math.sin(motion.phase))*motion.weight*.045;
    animateCharacterWalkRig(npc.userData.rig,motion.phase,motion.weight);
    const dx=npc.position.x-hero.position.x,dz=npc.position.z-hero.position.z;
    if(!chatting&&dx*dx+dz*dz>76*76){npc.userData.spawnCycle++;placeNpc(npc,index,false);}
  });
}

function resolveRoamingEntitySeparation(){
  const roamers=[...npcs,...animals.filter(a=>!a.userData.dead&&conversation?.npc!==a&&battle?.enemy!==a&&huntPrompt?.target!==a)];
  for(let i=0;i<roamers.length;i++)for(let j=i+1;j<roamers.length;j++){
    const a=roamers[i],b=roamers[j];
    if(Math.abs(a.position.y-b.position.y)>1)continue;
    const radiusA=a.userData.collisionRadius||.62,radiusB=b.userData.collisionRadius||.62,minDistance=radiusA+radiusB+.15;
    let dx=a.position.x-b.position.x,dz=a.position.z-b.position.z,dist=Math.hypot(dx,dz);
    if(dist>=minDistance)continue;
    if(dist<.001){dx=Math.sin(i+j+1);dz=Math.cos(i+j+1);dist=1;}
    const nx=dx/dist,nz=dz/dist,push=(minDistance-dist)/2+.002;
    const ax=a.position.x+nx*push,az=a.position.z+nz*push,bx=b.position.x-nx*push,bz=b.position.z-nz*push;
    if(!blockedByWorld(ax,az,radiusA,a.position.y,a.userData.isNpc?1.65:a.userData.boss?Math.max(3,a.userData.bossFactor*1.1):1.1,a)){a.position.x=ax;a.position.z=az;}
    if(!blockedByWorld(bx,bz,radiusB,b.position.y,b.userData.isNpc?1.65:b.userData.boss?Math.max(3,b.userData.bossFactor*1.1):1.1,b)){b.position.x=bx;b.position.z=bz;}
  }
}

function startConversation(npc,scripts=conversations){
  if(purchaseState)closePurchase();if(doctorState)closeDoctor();if(huntPrompt)closeHuntPrompt();
  let scriptIndex=Math.floor(Math.random()*scripts.length);if(scripts.length>1&&scriptIndex===npc.userData.lastConversationIndex)scriptIndex=(scriptIndex+1+Math.floor(Math.random()*(scripts.length-1)))%scripts.length;npc.userData.lastConversationIndex=scriptIndex;
  conversation={npc,script:scripts[scriptIndex],index:0,elapsed:0};moving=false;marker.visible=false;
}

function startBossConversation(boss,onComplete){
  if(purchaseState)closePurchase();if(doctorState)closeDoctor();if(huntPrompt)closeHuntPrompt();
  if(boss.userData.motion){boss.userData.motion.walking=false;boss.userData.motion.weight=0;animateAnimalFeet(boss,boss.userData.motion.phase,0);}
  conversation={npc:boss,script:bossConversationFor(boss),index:0,elapsed:0,lineDuration:8.5,onComplete};moving=false;marker.visible=false;
}

function positionSpeechBubble(element,object,height){
  const point=new THREE.Vector3(object.position.x,object.position.y+height,object.position.z).project(camera);
  if(point.z<-1||point.z>1){element.classList.add('hidden');return;}
  element.style.left=`${(point.x*.5+.5)*innerWidth}px`;element.style.top=`${(-point.y*.5+.5)*innerHeight}px`;
}

function advanceConversation(){
  if(!conversation)return;
  conversation.elapsed=0;conversation.index++;
  if(conversation.index>=conversation.script.length){const completed=conversation;conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');completed.onComplete?.();}
}

function updateConversation(dt){
  if(!conversation){npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');return;}
  const {npc,script}=conversation,dx=npc.position.x-hero.position.x,dz=npc.position.z-hero.position.z;
  npc.rotation.y=Math.atan2(-dx,-dz);hero.rotation.y=Math.atan2(dx,dz);conversation.elapsed+=dt;
  if(conversation.elapsed>(conversation.lineDuration||2.7)){advanceConversation();if(!conversation)return;}
  const line=script[conversation.index],npcSpeaking=line.speaker==='npc',bubble=npcSpeaking?npcBubble:heroBubble;
  npcBubble.classList.toggle('hidden',!npcSpeaking);heroBubble.classList.toggle('hidden',npcSpeaking);
  bubble.textContent=line.text;bubble.dataset.speaker=npcSpeaking?npc.userData.displayName:'小森';
  const npcBubbleHeight=npc.userData.boss?Math.max(3.2,npc.userData.bossFactor*.82):npc.userData.following?1.55:2.25;
  positionSpeechBubble(npcBubble,npc,npcBubbleHeight);positionSpeechBubble(heroBubble,hero,2.25);
}

const shopBubble=document.createElement('div');shopBubble.className='speech-bubble shop-bubble hidden';shopBubble.dataset.speaker='森林商店';
const shopText=document.createElement('div'),shopActions=document.createElement('div'),buyButton=document.createElement('button'),cancelButton=document.createElement('button');
shopActions.className='shop-actions';buyButton.textContent='購買';cancelButton.textContent='不要';shopActions.append(buyButton,cancelButton);shopBubble.append(shopText,shopActions);document.querySelector('#app').append(shopBubble);

function spawnShopAnimal(slot){
  if(!merchant||slot.animal)return;
  const occupied=new Set(shopSlots.map(s=>s.animal?.userData.species).filter(Boolean));
  const choices=animalData.filter(([name])=>animalTemplates.has(name)&&!occupied.has(name));if(!choices.length)return;
  const [species,scale]=choices[Math.floor(Math.random()*choices.length)],animal=prepModel(cloneModelUnique(animalTemplates.get(species)),scale);
  const offsets=[-1.7,0,1.7];animal.position.set(merchant.position.x+offsets[slot.index],0,merchant.position.z+2.35);animal.rotation.y=Math.PI;
  animal.userData.species=species;animal.userData.displayName=animalNames[species];animal.userData.price=animalPrices[species];animal.userData.shopAnimal=true;animal.userData.collisionRadius=.62;animal.userData.phase=Math.random()*Math.PI*2;
  initializeAnimalStats(animal,false);
  buildAnimalFootRig(animal);scene.add(animal);slot.animal=animal;clearMerchantArea();
}

function clearMerchantArea(){
  if(!merchant)return;
  animals.forEach(a=>{if(Math.hypot(a.position.x-merchant.position.x,a.position.z-merchant.position.z)<4.4){if(a.userData.boss)repositionBoss(a,bossRegions.get(a.userData.bossRegion));else placeAnimal(a,true);}});
  npcs.forEach((npc,i)=>{if(Math.hypot(npc.position.x-merchant.position.x,npc.position.z-merchant.position.z)<4.4)placeNpc(npc,i,true);});
}

function clearDoctorArea(){
  if(!doctor)return;
  animals.forEach(animal=>{if(Math.hypot(animal.position.x-doctor.position.x,animal.position.z-doctor.position.z)<3.8){if(animal.userData.boss)repositionBoss(animal,bossRegions.get(animal.userData.bossRegion));else placeAnimal(animal,true);}});
  npcs.forEach((npc,index)=>{if(Math.hypot(npc.position.x-doctor.position.x,npc.position.z-doctor.position.z)<3.8)placeNpc(npc,index,true);});
}

function openPurchase(slot){
  if(!slot?.animal||!merchant)return;if(huntPrompt)closeHuntPrompt();if(doctorState)closeDoctor();conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');purchaseState={slot,anchor:merchant,thanksTimer:0};moving=false;marker.visible=false;
  const animal=slot.animal;shopBubble.dataset.speaker='森林商人';
  shopText.textContent=`這隻${animal.userData.displayName}的售價是 ${animal.userData.price} 枚金幣。你想買下牠嗎？`;
  buyButton.disabled=false;shopActions.style.display='flex';shopBubble.classList.remove('hidden');
}

function closePurchase(){purchaseState=null;shopBubble.classList.add('hidden');}
cancelButton.addEventListener('click',closePurchase);
buyButton.addEventListener('click',()=>{
  const slot=purchaseState?.slot,animal=slot?.animal;if(!animal)return;
  if(coinBalance<animal.userData.price){shopText.textContent='你的金幣還不夠，再去森林裡找找吧。等你準備好再來。';buyButton.disabled=false;return;}
  coinBalance-=animal.userData.price;document.querySelector('#coinCount').textContent=coinBalance;
  animal.userData.shopAnimal=false;animal.userData.following=true;animal.userData.phase=Math.random()*Math.PI*2;animal.userData.walkWeight=0;animal.userData.verticalVelocity=0;animal.userData.grounded=true;animal.userData.jumpCooldown=0;animal.position.y=0;followers.push(animal);
  slot.animal=null;slot.restockTimer=12+Math.random()*10;
  trackGameEvent('animal purchased',{species:animal.userData.species,price:animal.userData.price,coin_balance:coinBalance,companion_count:followers.filter(follower=>!follower.userData.dead).length});
  purchaseState={slot:null,anchor:merchant,thanksTimer:2.8};shopBubble.dataset.speaker='森林商人';shopText.textContent='謝謝你！請好好照顧牠。新的動物過一段時間才會來。';shopActions.style.display='none';
});

const doctorBubble=document.createElement('div'),doctorText=document.createElement('div'),doctorActions=document.createElement('div');
doctorBubble.className='speech-bubble shop-bubble doctor-bubble hidden';doctorBubble.dataset.speaker='森林醫生';doctorActions.className='shop-actions doctor-actions';doctorBubble.append(doctorText,doctorActions);document.querySelector('#app').append(doctorBubble);

function setCoinBalance(value,pulse=false){
  const previous=coinBalance;coinBalance=Math.max(0,value);document.querySelector('#coinCount').textContent=coinBalance;if(coinBalance>previous)playCoinSound();if(pulse)pulseWallet();
}

function setPotionCount(value,pulse=false){
  potionCount=Math.max(0,Math.floor(value));potionButton.textContent=`使用藥水(${potionCount})`;
}

function buyDoctorPotion(){
  if(doctorPotionStock<=0)return showDoctorResult(`藥水暫時售罄了。下一瓶大約 ${Math.max(1,Math.ceil(doctorPotionRestockTimer))} 秒後調配完成。`);
  if(coinBalance<DOCTOR_POTION_PRICE)return showDoctorResult(`一瓶藥水需要 ${DOCTOR_POTION_PRICE} 枚金幣，你現在還不夠。`);
  setCoinBalance(coinBalance-DOCTOR_POTION_PRICE);setPotionCount(potionCount+1,true);doctorPotionStock--;if(doctorPotionStock<DOCTOR_POTION_MAX_STOCK&&doctorPotionRestockTimer<=0)doctorPotionRestockTimer=DOCTOR_POTION_RESTOCK_TIME;trackGameEvent('doctor service used',{service:'potion',price:DOCTOR_POTION_PRICE,coin_balance:coinBalance});showDoctorResult(`這是你的回血藥水。現在還有 ${doctorPotionStock} 瓶存貨。`);
}

function doctorButton(label,handler,disabled=false){
  const button=document.createElement('button');button.textContent=label;button.disabled=disabled;button.addEventListener('click',handler);return button;
}

function closeDoctor(){doctorState=null;doctorBubble.classList.add('hidden');doctorActions.replaceChildren();}

function showDoctorResult(text){
  if(!doctor)return;doctorState={mode:'result'};doctorText.textContent=text;doctorActions.replaceChildren(doctorButton('返回',showDoctorMenu),doctorButton('離開',closeDoctor));
}

function showDoctorMenu(){
  if(!doctor)return;
  if(purchaseState)closePurchase();if(huntPrompt)closeHuntPrompt();conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');moving=false;marker.visible=false;doctorState={mode:'menu'};
  doctorText.textContent='旅途中受傷了嗎？我可以照顧你的動物。';
  doctorActions.replaceChildren(
    doctorButton(`回血藥水 $${DOCTOR_POTION_PRICE} · 存貨 ${doctorPotionStock}`,buyDoctorPotion),
    doctorButton(`全部治療 $${DOCTOR_HEAL_ALL_PRICE}`,()=>{
      const companions=followers.filter(animal=>!animal.userData.dead),patients=companions.filter(animal=>animal.userData.hp<animal.userData.maxHp-.01);if(!companions.length)return showDoctorResult('你現在沒有隨行動物。');if(!patients.length)return showDoctorResult('大家都很健康，現在不需要治療。');
      if(coinBalance<DOCTOR_HEAL_ALL_PRICE)return showDoctorResult(`你的金幣不足 ${DOCTOR_HEAL_ALL_PRICE} 枚。`);
      setCoinBalance(coinBalance-DOCTOR_HEAL_ALL_PRICE);companions.forEach(animal=>{animal.userData.hp=animal.userData.maxHp;animal.userData.restingForRecovery=false;});trackGameEvent('doctor service used',{service:'heal_all',price:DOCTOR_HEAL_ALL_PRICE,animal_count:companions.length,coin_balance:coinBalance});showDoctorResult('治療完成了。大家現在都恢復精神了。');
    }),
    doctorButton(`復活一隻 $${DOCTOR_REVIVE_PRICE}`,showReviveChoices,!fallenFollowers.length),
    doctorButton(`升級一隻 $${DOCTOR_UPGRADE_PRICE}`,showUpgradeChoices,!followers.some(animal=>!animal.userData.dead)),
    doctorButton('離開',closeDoctor)
  );
  doctorBubble.classList.remove('hidden');
}

function showReviveChoices(){
  if(!doctorState)return;if(!fallenFollowers.length)return showDoctorResult('目前沒有需要復活的動物。');
  doctorState={mode:'revive'};doctorText.textContent='你希望復活哪一隻動物？';
  const choices=fallenFollowers.map(animal=>doctorButton(`${animal.userData.displayName} · Lv.${animal.userData.level}`,()=>reviveFollower(animal)));
  doctorActions.replaceChildren(...choices,doctorButton('返回',showDoctorMenu));
}

function reviveFollower(animal){
  if(!fallenFollowers.includes(animal))return showDoctorResult('這隻動物已經不在復活名單中。');
  if(coinBalance<DOCTOR_REVIVE_PRICE)return showDoctorResult(`復活需要 ${DOCTOR_REVIVE_PRICE} 枚金幣，你現在還不夠。`);
  setCoinBalance(coinBalance-DOCTOR_REVIVE_PRICE);fallenFollowers.splice(fallenFollowers.indexOf(animal),1);animal.userData.dead=false;animal.userData.deathTime=0;animal.userData.hp=animal.userData.maxHp;animal.userData.following=true;animal.userData.restingForRecovery=false;animal.userData.exhausted=false;animal.userData.grounded=true;animal.userData.verticalVelocity=0;animal.userData.walkWeight=0;animal.quaternion.identity();animateAnimalFeet(animal,0,0);
  let x=doctor.position.x+1.5,z=doctor.position.z+1.4;for(let attempt=0;attempt<10&&!entitySpotIsFree(x,z,.62,animal);attempt++){const angle=attempt*.8;x=doctor.position.x+Math.cos(angle)*(1.8+attempt*.2);z=doctor.position.z+Math.sin(angle)*(1.8+attempt*.2);}
  animal.position.set(x,0,z);animal.scale.setScalar(animal.userData.baseScale*.015);animal.userData.teleport={phase:'in',time:0,x,z};scene.add(animal);followers.push(animal);trackGameEvent('doctor service used',{service:'revive',price:DOCTOR_REVIVE_PRICE,species:animal.userData.species,level:animal.userData.level,coin_balance:coinBalance});showDoctorResult(`${animal.userData.displayName}醒過來了。請繼續好好照顧牠。`);
}

function showUpgradeChoices(){
  if(!doctorState)return;const choices=followers.filter(animal=>!animal.userData.dead);if(!choices.length)return showDoctorResult('目前沒有可以升級的隨行動物。');
  doctorState={mode:'upgrade'};doctorText.textContent='你希望讓哪一隻動物成長？';
  doctorActions.replaceChildren(...choices.map(animal=>doctorButton(`${animal.userData.displayName} · Lv.${animal.userData.level}`,()=>doctorUpgrade(animal))),doctorButton('返回',showDoctorMenu));
}

function doctorUpgrade(animal){
  if(!followers.includes(animal)||animal.userData.dead)return showDoctorResult('這隻動物目前無法接受訓練。');
  if(coinBalance<DOCTOR_UPGRADE_PRICE)return showDoctorResult(`升級需要 ${DOCTOR_UPGRADE_PRICE} 枚金幣，你現在還不夠。`);
  setCoinBalance(coinBalance-DOCTOR_UPGRADE_PRICE);animal.userData.level++;animal.userData.maxHp+=8;animal.userData.hp=Math.min(animal.userData.maxHp,animal.userData.hp+8);animal.userData.attack+=2;animal.userData.defense+=1;animal.userData.combatSpeed+=.15;
  refreshWildAnimalLevels();trackGameEvent('doctor service used',{service:'upgrade',price:DOCTOR_UPGRADE_PRICE,species:animal.userData.species,new_level:animal.userData.level,coin_balance:coinBalance});const special=(animalVoices[animal.userData.species]||['嗷嗚——！','嗚——！'])[1];emitLevelUpEffect(animal);emitAnimalSound(animal,`✦ ${special}——！ ${special} ✦`,2.7);showDoctorResult(`${animal.userData.displayName}完成訓練了，看起來比之前更可靠。`);
}

const huntBubble=document.createElement('div'),huntText=document.createElement('div'),huntActions=document.createElement('div'),huntYes=document.createElement('button'),huntNo=document.createElement('button');
huntBubble.className='speech-bubble shop-bubble hunt-bubble hidden';huntBubble.dataset.speaker='狩獵';huntActions.className='shop-actions';huntYes.textContent='是，開始戰鬥';huntNo.textContent='不要';huntActions.append(huntYes,huntNo);huntBubble.append(huntText,huntActions);document.querySelector('#app').append(huntBubble);
const battleBanner=document.createElement('div');battleBanner.className='battle-banner hidden';document.querySelector('#app').append(battleBanner);
const bossHealth=document.createElement('div'),bossHealthName=document.createElement('span'),bossHealthFill=document.createElement('i');
bossHealth.className='boss-health hidden';bossHealthName.textContent='地區首領';bossHealth.append(bossHealthName,bossHealthFill);document.querySelector('#app').append(bossHealth);
const battleActionBubble=document.createElement('div'),battleActionText=document.createElement('div'),battleActionButtons=document.createElement('div'),cheerButton=document.createElement('button'),swapButton=document.createElement('button'),potionButton=document.createElement('button'),escapeButton=document.createElement('button'),closeActionButton=document.createElement('button');
battleActionBubble.className='speech-bubble shop-bubble battle-action-bubble hidden';battleActionBubble.dataset.speaker='小森';battleActionButtons.className='shop-actions';cheerButton.textContent='加油';swapButton.textContent='換手';potionButton.textContent=`使用藥水(${potionCount})`;escapeButton.textContent='逃走';closeActionButton.textContent='不用了';battleActionButtons.append(cheerButton,swapButton,potionButton,escapeButton,closeActionButton);battleActionBubble.append(battleActionText,battleActionButtons);document.querySelector('#app').append(battleActionBubble);
const cryBubbles=new Map(),dyingAnimals=[];

function closeHuntPrompt(){
  if(huntPrompt?.target?.userData.motion)huntPrompt.target.userData.motion.wait=1.2;
  huntPrompt=null;huntBubble.classList.add('hidden');
}

const bossLegendStories={
  'animal-deer':{past:'我曾把每一個清晨都抵押給一疊永遠做不完的事情，還以為窗邊那盞燈會一直等我。等我終於抬頭，燈芯已短得照不亮下一個冬天。',secret:'我在這裡追逐許多落葉，總以為找到其中一片，便能換回那個沒有回去的晚上。可風說，惦掛若只向昨日吹，便永遠到不了仍在等待的人身旁。'},
  'animal-fox':{past:'我曾替一隻雛鳥畫好所有飛行的方向。我折斷牠想去遠方的枝條，說籠子的形狀就是天空；後來門仍然開著，牠卻再也沒有飛回來。',secret:'我守著那隻空籠太久，連月光也生了鏽。森林偶爾問我：若愛真是一雙手，為甚麼握得愈緊，掌心留下的便只有羽毛？'},
  'animal-bunny':{past:'我把第一步擦掉又重畫，嫌它不夠端正；再抬頭時，道路已長滿比我更高的草。遠方沒有離開，是我一直要求雙腳先學會不跌倒。',secret:'霧裡有一條路，只在踩錯時才會出現。我不明白它通往哪裡，卻開始懷疑，所謂完美，也許只是恐懼替停步取的一個好聽名字。'},
  'animal-panda':{past:'我把每一個人的行囊都背到自己身上，卻在有人伸手時說不需要。後來肩上的東西變成山，我便怪責山下的人從未看見我。',secret:'這片竹林只在我承認疲倦時發出聲音。它說，總把空出的懷抱藏在背後，溫柔找不到入口，也會誤以為自己不被需要。'},
  'animal-hog':{past:'有一封信在盛怒裡被我撕碎。我等著另一封信先來，等到信箱長出青苔，才知道有些道路會在兩個人都不肯先走時慢慢消失。',secret:'我用獠牙翻遍泥土，仍找不回那些紙片。夜風卻說，道歉不一定能抵達舊日，但每一句不再傷人的話，都能替未來少埋下一根刺。'},
  'animal-monkey':{past:'我曾在每一面鏡子前模仿別人的姿勢，誰爬得高，我便爬得更高。到掌聲從四面響起時，我卻找不到哪一個倒影會跟著我回家。',secret:'樹頂的風沒有排名，也從不問葉子落得比誰更遠。也許只有停止追趕別人的背影，腳下那條安靜的路才肯說出自己的名字。'},
  'animal-tiger':{past:'我把想說的話鎖進牙齒後面，以為沉默的門愈厚，屋裡的人便愈安全。後來另一扇門也關上了，我們隔著很近的牆，聽彼此的腳步一年年走遠。',secret:'雷聲教會眾獸躲避，卻只有很輕的一句話能讓誰停下來。可惜那句話在我胸口徘徊太久，如今一出口，便散成不知道該飛向哪裡的灰。'},
  'animal-parrot':{past:'我曾為了換取一陣笑聲，把別人交給我的一顆種子剖開給眾人看。笑聲很快停了，那顆種子卻再也沒有發芽。',secret:'森林記得所有被風吹散的話。它們有些落地成花，有些落進看不見的地方長成荊棘；我仍在學習，下一句聲音究竟該成為刀，還是替誰留一點光。'}
};

function bossConversationFor(boss){
  const story=bossLegendStories[boss.userData.species]||{past:'我曾在一扇關上的門前等了太久，久得忘記門是誰關上的，也忘記自己原本要到哪裡去。',secret:'森林的風總想把甚麼帶走，我卻一直握緊掌心。也許有些東西並非不能消失，只是我們害怕放手以後，連自己也會變得不再完整。'};
  return [
    {speaker:'npc',text:story.past},
    {speaker:'hero',text:'那像是一段很久以前的記憶。森林為甚麼把它留在你身上？'},
    {speaker:'npc',text:story.secret},
    {speaker:'hero',text:'我不完全明白。你是在等風帶走甚麼，還是在等甚麼重新回來？'},
    {speaker:'npc',text:'也許兩者都不是。我只知道，若你想聽見樹根下面那句沒有意義的回答，就先在戰鬥中讓我忘記如何緊握。'},
    {speaker:'npc',text:'不要因幾句舊夢而輕敵。我遠比沿途的野獸強大——讓你的同伴替你作證，或在風記住你以前離開。'}
  ];
}

function beginBossEncounter(boss){
  startBossConversation(boss,()=>{
    if(!boss.userData.dead&&!battle)openHuntPrompt(boss);
  });
}

function openHuntPrompt(animal){
  if(!animal||animal.userData.dead||battle)return;
  if(purchaseState)closePurchase();if(doctorState)closeDoctor();conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');
  huntPrompt={target:animal};moving=false;marker.visible=false;animal.userData.motion.walking=false;
  huntBubble.dataset.speaker=animal.userData.boss?'地區首領':'狩獵';
  huntText.textContent=animal.userData.boss?`${animal.userData.displayName}散發著危險的氣息。要讓你的動物挑戰牠嗎？`: `要讓你的動物狩獵這隻 ${animal.userData.displayName} 嗎？戰鬥可能令動物受傷或死亡。`;
  huntYes.textContent='是，開始戰鬥';huntNo.textContent='不要';huntActions.replaceChildren(huntYes,huntNo);huntActions.style.display='flex';huntBubble.classList.remove('hidden');
}

function showBattleStarterChoices(){
  const enemy=huntPrompt?.target;if(!enemy||enemy.userData.dead)return closeHuntPrompt();
  const candidates=followers.filter(animal=>!animal.userData.dead&&animal.userData.hp/animal.userData.maxHp>=SEVERE_INJURY_RATIO);
  if(!candidates.length){huntText.textContent='你的動物目前太虛弱了。先讓牠停下來休息回血吧。';huntNo.textContent='離開';huntActions.replaceChildren(huntNo);return;}
  huntText.textContent=`要派哪一隻動物迎戰 ${enemy.userData.displayName}？`;
  huntNo.textContent='返回';huntActions.replaceChildren(...candidates.map(animal=>doctorButton(`${animal.userData.displayName} · Lv.${animal.userData.level}`,()=>startBattle(animal))),huntNo);
}

function gainExperience(animal,amount){
  if(animal.userData.dead)return 0;
  animal.userData.xp+=amount;let levels=0;
  while(animal.userData.xp>=xpNeeded(animal)){
    animal.userData.xp-=xpNeeded(animal);animal.userData.level++;levels++;
    animal.userData.maxHp+=8;animal.userData.hp=Math.min(animal.userData.maxHp,animal.userData.hp+8);
    animal.userData.attack+=2;animal.userData.defense+=1;animal.userData.combatSpeed+=.15;
  }
  if(levels){
    if(animal.userData.following)refreshWildAnimalLevels();const special=(animalVoices[animal.userData.species]||['嗷嗚——！','嗚——！'])[1];animal.userData.cryCooldown=4;
    emitLevelUpEffect(animal,levels);emitAnimalSound(animal,`✦ ${special}——！ ${special} ✦`,2.7);
  }
  return levels;
}

function showBattleMessage(message,duration=1.8){
  battleBanner.textContent=message;battleBanner.dataset.timer=duration;battleBanner.classList.remove('hidden');
}

function createCombatState(index=0){
  return {state:'standoff',cooldown:.8+Math.random()*1.6,time:0,duration:0,strafe:index%2?1:-1,wanderAngle:Math.random()*Math.PI*2,attackChain:0,target:null,targetLock:0,chargeX:0,chargeZ:1,rollX:0,rollZ:0,rollSide:1,rollFacingY:0,rollBaseY:0,rollLift:.65,hitX:0,hitZ:0,hitFacingY:0,hitBaseY:0,hitLift:.65,hitCritical:false,hasHit:false,particleCooldown:0,jumpTargetX:0,jumpTargetY:0,jumpTargetZ:0,jumpSpeed:0,jumpDuration:0};
}

function closeBattleAction(){
  battleActionState=null;battleActionBubble.classList.add('hidden');battleActionButtons.style.display='flex';
}

function showHeroActionButtons(...buttons){battleActionButtons.replaceChildren(...buttons);battleActionButtons.style.display='flex';}

function battleReserves(){
  if(!battle)return [];
  return followers.filter(animal=>!animal.userData.dead&&!battle.allies.includes(animal));
}

function safeFollowerRetreatSpot(index){
  const row=Math.floor(index/2),side=index%2===0?-1:1;let x=hero.position.x+side*(1.2+row*.25),z=hero.position.z+2.2+row*1.15;
  for(let attempt=0;attempt<12&&blockedByWorld(x,z,.62,0,1.1);attempt++){const angle=hero.rotation.y+Math.PI+attempt*.72,radius=2.1+attempt*.32;x=hero.position.x+Math.sin(angle)*radius;z=hero.position.z+Math.cos(angle)*radius;}
  return {x,z};
}

function openBattleAction(){
  if(!battle||battle.ending)return;
  battleActionState={mode:'menu',context:'battle'};moving=false;marker.visible=false;battleActionBubble.dataset.speaker=localDisplayName;battleActionText.textContent='現在想做甚麼？';showHeroActionButtons(cheerButton,...(battleReserves().length?[swapButton]:[]),potionButton,escapeButton,closeActionButton);battleActionBubble.classList.remove('hidden');
}

function openHeroAction(){
  if(battle)return openBattleAction();if(purchaseState)closePurchase();if(doctorState)closeDoctor();if(huntPrompt)closeHuntPrompt();conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');moving=false;marker.visible=false;battleActionState={mode:'menu',context:'field'};battleActionBubble.dataset.speaker=localDisplayName;battleActionText.textContent='想要做甚麼？';showHeroActionButtons(potionButton,doctorButton('返回起始帳篷',returnToOrigin),doctorButton('再見動物',showGoodbyeChoices),closeActionButton);battleActionBubble.classList.remove('hidden');
}

function showGoodbyeChoices(){
  if(battle)return openBattleAction();battleActionState={mode:'goodbye',context:'field'};const candidates=followers.filter(animal=>!animal.userData.dead);
  if(!candidates.length){battleActionText.textContent=fallenFollowers.length?'目前沒有能夠離隊的隨活動物。倒下的動物仍可請醫生復活。':'你目前還沒有隨行動物。';showHeroActionButtons(doctorButton('返回',openHeroAction),closeActionButton);return;}
  battleActionText.textContent='你想和哪一隻動物說再見？說再見後牠會離開隊伍。';showHeroActionButtons(...candidates.map(animal=>doctorButton(`${animal.userData.displayName} · Lv.${animal.userData.level}`,()=>confirmGoodbyeAnimal(animal))),doctorButton('返回',openHeroAction),closeActionButton);
}

function confirmGoodbyeAnimal(animal){
  if(!followers.includes(animal)||animal.userData.dead)return showGoodbyeChoices();battleActionState={mode:'goodbye-confirm',context:'field'};battleActionText.textContent=`真的要和 ${animal.userData.displayName} 說再見，讓牠離開隊伍嗎？`;showHeroActionButtons(doctorButton('確定說再見',()=>releaseCompanion(animal)),doctorButton('留下牠',showGoodbyeChoices),closeActionButton);
}

function releaseCompanion(animal){
  const index=followers.indexOf(animal);if(index<0||animal.userData.dead)return showGoodbyeChoices();cancelFollowerTeleport(animal);followers.splice(index,1);scene.remove(animal);const bubble=cryBubbles.get(animal);bubble?.remove();cryBubbles.delete(animal);refreshWildAnimalLevels();saveLocalGame(true);battleActionState={mode:'message',context:'field',timer:2.4};battleActionText.textContent=`你向 ${animal.userData.displayName} 道別。牠回頭看了你一眼，然後慢慢走進森林。`;battleActionButtons.style.display='none';
}

function showPotionChoices(){
  const context=battleActionState?.context||(battle?'battle':'field'),back=context==='battle'?openBattleAction:openHeroAction;battleActionState={mode:'potion',context};battleActionBubble.dataset.speaker=localDisplayName;
  if(potionCount<=0){battleActionText.textContent='你現在沒有回血藥水，可以向森林醫生購買。';showHeroActionButtons(doctorButton('返回',back),closeActionButton);return;}
  const availableAnimals=[...new Set([...followers,...(battle?.allies||[])])];
  const candidates=availableAnimals.filter(animal=>!animal.userData.dead&&animal.userData.hp<animal.userData.maxHp-.01);
  if(!candidates.length){battleActionText.textContent='隨行動物現在都沒有受傷。';showHeroActionButtons(doctorButton('返回',back),closeActionButton);return;}
  battleActionText.textContent=`要給哪一隻動物使用？目前持有 ${potionCount} 瓶。`;showHeroActionButtons(...candidates.map(animal=>doctorButton(animal.userData.displayName,()=>usePotionOnAnimal(animal,context))),doctorButton('返回',back),closeActionButton);
}

function usePotionOnAnimal(animal,context){
  const availableAnimals=new Set([...followers,...(battle?.allies||[])]);
  if(potionCount<=0||!availableAnimals.has(animal)||animal.userData.dead||animal.userData.hp>=animal.userData.maxHp-.01)return showPotionChoices();
  const recovered=Math.min(animal.userData.maxHp-animal.userData.hp,Math.max(1,Math.round(animal.userData.maxHp*.45)));
  animal.userData.hp+=recovered;animal.userData.restingForRecovery=false;setPotionCount(potionCount-1);emitCombatParticles(animal.position,'heal');
  const sounds=animalVoices[animal.userData.species]||['嗚嗚……'];emitAnimalSound(animal,`♡ ${sounds[1]||sounds[0]} ♡`,2.05);closeBattleAction();
}

function showBattleSwapChoices(){
  if(!battle)return closeBattleAction();const reserves=battleReserves();
  battleActionState={mode:'swap',context:'battle'};battleActionBubble.dataset.speaker=localDisplayName;
  if(!reserves.length){battleActionText.textContent='現在沒有其他動物可以換手。';showHeroActionButtons(doctorButton('返回',openBattleAction),closeActionButton);return;}
  battleActionText.textContent='要換哪一隻動物上場？';
  showHeroActionButtons(...reserves.map(animal=>doctorButton(`${animal.userData.displayName} · Lv.${animal.userData.level}`,()=>switchBattleAnimal(animal))),doctorButton('返回',openBattleAction),closeActionButton);
}

function switchBattleAnimal(incoming){
  if(!battle)return closeBattleAction();
  if(!incoming||!battleReserves().includes(incoming))return showBattleSwapChoices();
  const outgoing=battle.allies.find(animal=>!animal.userData.dead);
  if(!outgoing)return closeBattleAction();
  resetCombatRollPose(outgoing);const index=battle.allies.indexOf(outgoing),position=outgoing.position.clone(),retreat=safeFollowerRetreatSpot(Math.max(0,followers.indexOf(outgoing)));
  outgoing.userData.exhausted=false;outgoing.userData.returningFromBattle=true;startFollowerTeleport(outgoing,retreat.x,retreat.z);
  cancelFollowerTeleport(incoming);incoming.position.copy(position);incoming.position.y=surfaceHeightAt(position.x,position.z,position.y+.2);incoming.scale.setScalar(incoming.userData.baseScale);incoming.userData.grounded=true;incoming.userData.verticalVelocity=0;incoming.userData.restingForRecovery=false;incoming.userData.exhausted=false;incoming.userData.isWalking=false;
  battle.allies[index]=incoming;battle.states.delete(outgoing);battle.states.set(incoming,createCombatState(index));battle.startingHp.delete(outgoing);battle.startingHp.set(incoming,incoming.userData.hp);
  battle.states.forEach(state=>{state.target=null;state.targetLock=0;if(['aim','charge','jumpCrouch','jumpLeap','jumpLand'].includes(state.state))state.state='standoff';});
  closeBattleAction();showBattleMessage(`${outgoing.userData.displayName}退下，${incoming.userData.displayName}接手戰鬥！`,2.2);
}

function escapeBattle(teleportFollowers=true,announce=true){
  if(!battle)return;
  const escaping=battle.allies.filter(animal=>!animal.userData.dead),enemy=battle.enemy;
  trackGameEvent('battle finished',{result:'escaped',enemy_species:enemy.userData.species,enemy_level:enemy.userData.level||1,is_boss:Boolean(enemy.userData.boss),multiplayer:Boolean(currentRoom),ally_count:battle.allies.length,duration_seconds:Math.round(battle.elapsed*10)/10});
  [...escaping,enemy].filter(animal=>!animal.userData.dead).forEach(animal=>{resetCombatRollPose(animal);animal.userData.exhausted=false;});
  if(!enemy.userData.dead){resetAnimalMotion(enemy);if(enemy.userData.motion)enemy.userData.motion.wait=2.5;}
  battle=null;closeBattleAction();
  escaping.forEach((animal,index)=>{animal.userData.returningFromBattle=false;if(teleportFollowers){const retreat=safeFollowerRetreatSpot(index);startFollowerTeleport(animal,retreat.x,retreat.z);}});
  if(announce)showBattleMessage('小森帶著動物安全逃離了戰鬥。',2.6);
}

cheerButton.addEventListener('click',()=>{
  if(!battle)return closeBattleAction();
  const cheers=['大家加油！我一直都在這裡！','不要怕，照自己的步調來！','做得很好！再堅持一下！','相信自己，我們一起回去！'];
  battleActionText.textContent=cheers[Math.floor(Math.random()*cheers.length)];battleActionButtons.style.display='none';battleActionState={mode:'message',timer:2.2};
});
swapButton.addEventListener('click',showBattleSwapChoices);
potionButton.addEventListener('click',showPotionChoices);
escapeButton.addEventListener('click',()=>escapeBattle(true,true));
closeActionButton.addEventListener('click',closeBattleAction);

function startBattle(selectedAlly=null){
  const enemy=huntPrompt?.target;if(!enemy||enemy.userData.dead)return closeHuntPrompt();
  if(!enemy.userData.boss&&!enemy.userData.sharedEncounterId)setWildAnimalLevel(enemy);const livingFollowers=followers.filter(a=>!a.userData.dead),candidates=enemy.userData.boss?livingFollowers:livingFollowers.filter(a=>a.userData.hp/a.userData.maxHp>=SEVERE_INJURY_RATIO);
  if(!candidates.length){huntText.textContent='你的動物目前太虛弱了。先讓牠停下來休息回血吧。';huntActions.style.display='none';return;}
  if(!enemy.userData.boss&&!candidates.includes(selectedAlly))return showBattleStarterChoices();
  const allies=enemy.userData.boss?[...candidates]:[selectedAlly];
  if(currentRoom&&!enemy.userData.boss&&multiplayerSocket?.readyState===WebSocket.OPEN){
    enemy.userData.sharedEncounterId||=`${enemy.userData.species}:${Math.round(enemy.position.x*2)}:${Math.round(enemy.position.z*2)}`;
    enemy.userData.sharedControllerId||=localPlayerId;
    multiplayerSocket.send(JSON.stringify({type:'encounter_start',encounter:{id:enemy.userData.sharedEncounterId,species:enemy.userData.species,level:enemy.userData.level,x:enemy.position.x,y:enemy.position.y,z:enemy.position.z,maxHp:enemy.userData.maxHp}}));
  }
  if(currentRoom&&enemy.userData.boss&&multiplayerSocket?.readyState===WebSocket.OPEN){enemy.userData.sharedControllerId||=localPlayerId;multiplayerSocket.send(JSON.stringify({type:'boss_start',region:enemy.userData.bossRegion}));}
  closeHuntPrompt();moving=false;marker.visible=false;
  const combatants=[...allies,enemy],states=new Map();
  combatants.forEach((animal,index)=>states.set(animal,createCombatState(index)));
  enemy.userData.motion.walking=false;allies.forEach(a=>{cancelFollowerTeleport(a);a.userData.restingForRecovery=false;a.userData.isWalking=false;});
  battle={enemy,allies,states,startingHp:new Map(allies.map(animal=>[animal,animal.userData.hp])),elapsed:0,ending:0};
  trackGameEvent('battle started',{enemy_species:enemy.userData.species,enemy_level:enemy.userData.level||1,is_boss:Boolean(enemy.userData.boss),multiplayer:Boolean(currentRoom),ally_count:allies.length,ally_species:allies.map(animal=>animal.userData.species)});
  showBattleMessage(`${allies.map(a=>a.userData.displayName).join('、')} VS ${enemy.userData.displayName}`,2.2);
}

huntNo.addEventListener('click',closeHuntPrompt);
huntYes.addEventListener('click',()=>{if(huntPrompt?.target?.userData.boss)startBattle();else showBattleStarterChoices();});

function moveCombatAnimal(animal,dirX,dirZ,distance,footY=animal.position.y){
  if(!Number.isFinite(dirX)||!Number.isFinite(dirZ))return false;
  const radius=animal.userData.collisionRadius||.62,bodyHeight=animal.userData.boss?animal.userData.bossFactor*1.1:1.1;
  let moved=false,currentDepth=collisionPenetrationAt(animal.position.x,animal.position.z,radius,footY,bodyHeight,animal),nx=animal.position.x+dirX*distance,nz=animal.position.z+dirZ*distance;
  const xDepth=collisionPenetrationAt(nx,animal.position.z,radius,footY,bodyHeight,animal);
  if(xDepth<.0001||xDepth<currentDepth-.0001){animal.position.x=nx;currentDepth=xDepth;moved=true;}
  const zDepth=collisionPenetrationAt(animal.position.x,nz,radius,footY,bodyHeight,animal);
  if(zDepth<.0001||zDepth<currentDepth-.0001){animal.position.z=nz;moved=true;}
  return moved;
}

function maybeStartCombatJump(animal,dirX,dirZ){
  if(!animal.userData.grounded||animal.userData.jumpCooldown>0||Math.abs(dirX)+Math.abs(dirZ)<.001)return;
  const length=Math.hypot(dirX,dirZ),radius=animal.userData.collisionRadius||.62,bodyHeight=animal.userData.boss?animal.userData.bossFactor*1.1:1.1,probe=Math.max(.72,radius*.55),x=animal.position.x+dirX/length*probe,z=animal.position.z+dirZ/length*probe,currentDepth=collisionPenetrationAt(animal.position.x,animal.position.z,radius,animal.position.y,bodyHeight,animal),aheadDepth=collisionPenetrationAt(x,z,radius,animal.position.y,bodyHeight,animal),surface=surfaceHeightAt(x,z,animal.position.y+2.5);
  const blocked=aheadDepth>currentDepth+.001,higher=surface>animal.position.y+.08&&surface<=animal.position.y+2.35;
  if(blocked||higher){animal.userData.verticalVelocity=7.5;animal.userData.grounded=false;animal.userData.jumpCooldown=.9;}
}

function turnCombatAnimal(animal,dirX,dirZ,maxTurn=.12){
  if(Math.abs(dirX)+Math.abs(dirZ)<=.001)return;
  const desired=Math.atan2(dirX,dirZ),delta=Math.atan2(Math.sin(desired-animal.rotation.y),Math.cos(desired-animal.rotation.y));animal.rotation.y+=THREE.MathUtils.clamp(delta,-maxTurn,maxTurn);
}

function moveCombatAnimalFacing(animal,dirX,dirZ,distance){
  turnCombatAnimal(animal,dirX,dirZ);
  const moved=moveCombatAnimal(animal,dirX,dirZ,distance);maybeStartCombatJump(animal,dirX,dirZ);return moved;
}

function emitAnimalSound(animal,text=null,duration=1.7){
  const sounds=animalVoices[animal.userData.species]||['嗚嗚……'];const bubble=ensureCryBubble(animal);
  bubble.textContent=text||sounds[Math.floor(Math.random()*sounds.length)];bubble.dataset.timer=duration;bubble.classList.remove('hidden');
}

function chooseBattleAction(animal,state){
  const personality=animalPersonalityDefs[animal.userData.personality]||animalPersonalityDefs.steady;
  if(animal.userData.fatigue>=.84||(state.attackChain>=personality.chainLimit&&animal.userData.fatigue>.42)){
    state.state='exhausted';state.time=0;state.duration=1.55+Math.random()*1.15;animal.userData.exhausted=true;
    emitAnimalSound(animal,`${(animalVoices[animal.userData.species]||['嗚嗚……'])[0]}……`,2.1);return;
  }
  const affinity=animalAffinityEffect(animal),attackChance=Math.min(.92,personality.attackChance*(1-animal.userData.fatigue*.55)*(1+(affinity.power-1)*.35)),roll=Math.random();state.time=0;
  if(roll<attackChance){
    const jumpAttacker=animal.userData.species==='animal-bunny'||animal.userData.species==='animal-parrot';state.state=jumpAttacker?'jumpCrouch':'aim';state.duration=(jumpAttacker ? .34 : .24+Math.random()*.18)/affinity.speed;state.hasHit=false;state.attackChain++;animal.userData.fatigue=Math.min(1,animal.userData.fatigue+.2+state.attackChain*.035);
    tryTriggerCombatRoll(animal,state.target);return;
  }
  state.attackChain=0;
  if(roll<attackChance+personality.evadeChance){state.state='evade';state.duration=.65+Math.random()*.75;state.strafe=Math.random()<.5?-1:1;return;}
  state.state='wander';state.duration=personality.roamTime*(.75+Math.random()*.75);state.wanderAngle=Math.random()*Math.PI*2;
}

function tryTriggerCombatRoll(attacker,target){
  if(!battle||!target||target.userData.dead||target.userData.boss||target.userData.exhausted||!target.userData.grounded)return;
  const state=battle.states.get(target);if(!state||state.state==='roll'||state.state==='hit')return;
  const personality=animalPersonalityDefs[target.userData.personality]||animalPersonalityDefs.steady,health=target.userData.hp/target.userData.maxHp;
  const chance=personality.dodgeChance*(.45+health*.55)*(1-(target.userData.fatigue||0)*.65);if(Math.random()>=chance)return;
  const side=Math.random()<.5?-1:1,facing=target.rotation.y,size=new THREE.Vector3();new THREE.Box3().setFromObject(target).getSize(size);
  state.state='roll';state.time=0;state.duration=.46+Math.random()*.12;state.rollSide=side;state.rollFacingY=facing;state.rollX=Math.cos(facing)*side;state.rollZ=-Math.sin(facing)*side;state.rollBaseY=target.position.y;state.rollLift=THREE.MathUtils.clamp(size.y*1.02,.65,1.8);state.attackChain=0;target.rotation.set(0,facing,0);
}

const combatYawAxis=new THREE.Vector3(0,1,0),combatRollAxis=new THREE.Vector3(0,0,1),combatYawQuaternion=new THREE.Quaternion(),combatRollQuaternion=new THREE.Quaternion();
function setCombatRollPose(animal,state,progress){
  combatYawQuaternion.setFromAxisAngle(combatYawAxis,state.rollFacingY);combatRollQuaternion.setFromAxisAngle(combatRollAxis,-state.rollSide*progress*Math.PI*2);
  animal.quaternion.copy(combatYawQuaternion).multiply(combatRollQuaternion);animal.position.y=state.rollBaseY+Math.sin(progress*Math.PI)*state.rollLift;
}

function resetCombatRollPose(animal){
  const state=battle?.states.get(animal);
  if(state?.state==='roll'){animal.position.y=state.rollBaseY;animal.rotation.set(0,state.rollFacingY,0);}
  else if(state?.state==='hit'){animal.position.y=state.hitBaseY;animal.rotation.set(0,state.hitFacingY,0);}
  else if(state&&['jumpCrouch','jumpLeap','jumpLand'].includes(state.state)){animal.rotation.x=0;animal.rotation.z=0;animal.scale.setScalar(animal.userData.baseScale);}
  else animal.rotation.z=0;
}

function setCombatHitPose(animal,state,progress){
  let angle,lift;
  if(state.hitCritical){angle=progress<.2?progress/.2*Math.PI:progress<.68?Math.PI:Math.PI+(progress-.68)/.32*Math.PI;lift=Math.abs(Math.sin(angle*.5))*state.hitLift;}
  else{angle=Math.sin(progress*Math.PI)*.24;lift=Math.sin(progress*Math.PI)*.12;}
  combatYawQuaternion.setFromAxisAngle(combatYawAxis,state.hitFacingY);combatRollQuaternion.setFromAxisAngle(combatRollAxis,angle*state.rollSide);
  animal.quaternion.copy(combatYawQuaternion).multiply(combatRollQuaternion);animal.position.y=state.hitBaseY+lift;
}

function damageAnimal(attacker,victim){
  if(victim.userData.dead)return;
  playHitSound();
  const attackerAffinity=animalAffinityEffect(attacker),victimAffinity=animalAffinityEffect(victim),exposed=victim.userData.exhausted,criticalChance=(exposed ? .22 : .12)+(attackerAffinity.power-1)*.12,critical=Math.random()<criticalChance,multiplier=(exposed?1.65:1)*(critical?1.5:1),damage=Math.max(2,Math.round((attacker.userData.attack*attackerAffinity.power*(.85+Math.random()*.3)-victim.userData.defense*victimAffinity.power*.45)*multiplier));
  const impactDX=victim.position.x-attacker.position.x,impactDZ=victim.position.z-attacker.position.z,impactLength=Math.max(.001,Math.hypot(impactDX,impactDZ)),impactDirection={x:impactDX/impactLength,z:impactDZ/impactLength};emitCombatParticles(victim.position,'hit',impactDirection);if(critical)emitCombatParticles(victim.position,'critical',impactDirection);
  if(victim.userData.sharedEncounterId&&currentRoom&&multiplayerSocket?.readyState===WebSocket.OPEN){
    multiplayerSocket.send(JSON.stringify({type:'encounter_hit',id:victim.userData.sharedEncounterId,companionId:ensureCompanionNetworkId(attacker)}));
    showBattleMessage(`${attacker.userData.displayName}攻擊命中，正在確認傷害…`,1.05);startCombatHitReaction(attacker,victim,critical);return;
  }
  if(victim.userData.boss&&currentRoom&&multiplayerSocket?.readyState===WebSocket.OPEN){
    multiplayerSocket.send(JSON.stringify({type:'boss_hit',region:victim.userData.bossRegion,companionId:ensureCompanionNetworkId(attacker)}));
    showBattleMessage(`${attacker.userData.displayName}攻擊命中，正在確認傷害…`,1.05);startCombatHitReaction(attacker,victim,critical);return;
  }
  victim.userData.hp=Math.max(0,victim.userData.hp-damage);
  showBattleMessage(`${critical?'暴擊！':''}${attacker.userData.displayName} 衝撞命中${exposed?'疲勞破綻':''}，造成 ${damage} 傷害`,critical?1.7:1.15);
  if(victim.userData.hp<=0)killAnimal(victim);else startCombatHitReaction(attacker,victim,critical);
}

function startCombatHitReaction(attacker,victim,critical){
  const state=battle?.states.get(victim);if(!state)return;resetCombatRollPose(victim);
  const dx=victim.position.x-attacker.position.x,dz=victim.position.z-attacker.position.z,length=Math.max(.001,Math.hypot(dx,dz)),size=new THREE.Vector3();new THREE.Box3().setFromObject(victim).getSize(size);
  state.state='hit';state.time=0;state.duration=critical?1.15:.28;state.hitX=dx/length;state.hitZ=dz/length;state.hitFacingY=victim.rotation.y;state.hitBaseY=victim.position.y;state.hitLift=victim.userData.boss?Math.max(1.8,size.y*.82):THREE.MathUtils.clamp(size.y*1.02,.65,1.8);state.hitCritical=critical;state.rollSide=Math.random()<.5?-1:1;state.attackChain=0;state.targetLock=0;victim.userData.exhausted=false;
}

function killAnimal(animal,broadcastShared=true){
  if(animal.userData.dead)return;
  resetCombatRollPose(animal);
  animal.userData.dead=true;animal.userData.deathTime=0;animal.userData.deathScale=animal.scale.x;dyingAnimals.push(animal);
  if(animal.userData.boss){const state=bossRegions.get(animal.userData.bossRegion);if(state)state.defeated=true;}
  else if(animal.userData.wild&&!animal.userData.sharedEncounterId)animalRespawns.push({species:animal.userData.species,spawnId:animal.userData.spawnId,timer:24+Math.random()*14});
}

function finishBattle(playerWon){
  if(!battle||battle.ending)return;
  trackGameEvent('battle finished',{result:playerWon?'win':'loss',enemy_species:battle.enemy.userData.species,enemy_level:battle.enemy.userData.level||1,is_boss:Boolean(battle.enemy.userData.boss),multiplayer:Boolean(currentRoom),ally_count:battle.allies.length,duration_seconds:Math.round(battle.elapsed*10)/10});
  if(playerWon&&battle.enemy.userData.boss)trackGameEvent('boss defeated',{species:battle.enemy.userData.species,level:battle.enemy.userData.level||1,multiplayer:Boolean(currentRoom),ally_count:battle.allies.length});
  battle.ending=1.8;[...battle.allies,battle.enemy].filter(a=>!a.userData.dead).forEach(resetCombatRollPose);
  if(playerWon){
    const enemyLevel=Math.max(1,battle.enemy.userData.level||1),survivors=battle.allies.filter(a=>!a.userData.dead),reward=battle.enemy.userData.boss?80+enemyLevel*25:10+enemyLevel*10,coinReward=battle.enemy.userData.boss?120+enemyLevel*10:6+enemyLevel*4,startTotal=battle.allies.reduce((sum,a)=>sum+(battle.startingHp.get(a)||a.userData.maxHp),0),remainingTotal=survivors.reduce((sum,a)=>sum+a.userData.hp,0),averageHealth=survivors.reduce((sum,a)=>sum+a.userData.hp/a.userData.maxHp,0)/Math.max(1,survivors.length),retained=remainingTotal/Math.max(1,startTotal);
    const outcome=survivors.length<battle.allies.length||averageHealth<.3||retained<.42?'hard':averageHealth>=.72&&retained>=.76?'great':'close',outcomeLabel={great:'大勝',close:'小勝',hard:'苦勝'}[outcome];
    survivors.forEach((animal,index)=>{
      const leveled=gainExperience(animal,reward),[first,second]=animalVoices[animal.userData.species]||['嗚嗚','嗷嗚'];
      const text=outcome==='great'?`♪ ${second}！${second}！`:outcome==='close'?`${second}～！`:`${first}…… ${second}……`;
      animal.userData.returningFromBattle=true;animal.userData.victoryCry={delay:(leveled?3.05:2.05)+index*.35,text};
    });
    setCoinBalance(coinBalance+coinReward,true);showBattleMessage(`${outcomeLabel}！獲得 ${coinReward} 枚 coin，參戰動物正返回你的身邊。`,3.2);
  }else{
    gainExperience(battle.enemy,18);showBattleMessage(`${battle.enemy.userData.displayName} 勝利了，你的動物倒下了……`,3.2);
  }
}

function livingBattleTarget(animal){
  if(animal===battle.enemy)return battle.allies.filter(a=>!a.userData.dead).sort((a,b)=>a.position.distanceToSquared(animal.position)-b.position.distanceToSquared(animal.position))[0];
  return battle.enemy.userData.dead?null:battle.enemy;
}

function updateBattle(dt){
  if(!battle)return;
  battle.elapsed+=dt;
  const aliveAllies=battle.allies.filter(a=>!a.userData.dead),enemy=battle.enemy;
  if(!battle.ending&&(enemy.userData.dead||!aliveAllies.length))finishBattle(enemy.userData.dead&&aliveAllies.length>0);
  if(battle.ending){
    [...battle.allies,enemy].filter(a=>!a.userData.dead).forEach(a=>{a.userData.jumpCooldown=Math.max(0,(a.userData.jumpCooldown||0)-dt);updateFollowerVertical(a,dt);});
    battle.ending-=dt;if(battle.ending<=0){[...battle.allies,enemy].forEach(a=>a.userData.exhausted=false);if(!enemy.userData.dead)resetAnimalMotion(enemy);battle=null;}return;
  }
  const enemyLocallyControlled=enemy.userData.boss&&currentRoom?(!enemy.userData.sharedControllerId||enemy.userData.sharedControllerId===localPlayerId):(!enemy.userData.sharedEncounterId||enemy.userData.sharedControllerId===localPlayerId);
  const combatants=[...aliveAllies,...(enemyLocallyControlled?[enemy]:[])].filter(a=>!a.userData.dead);
  combatants.forEach((animal,index)=>{
    const state=battle.states.get(animal);if(!state)return;const affinityEffect=animalAffinityEffect(animal),injurySpeed=severeInjurySpeed(animal),combatSpeed=animal.userData.combatSpeed*affinityEffect.speed*injurySpeed;
    state.targetLock=Math.max(0,state.targetLock-dt);
    const attacking=['aim','charge','jumpCrouch','jumpLeap','jumpLand'].includes(state.state),lockedTarget=state.target&&!state.target.userData.dead&&(attacking||state.targetLock>0)?state.target:null,opponent=lockedTarget||livingBattleTarget(animal);if(!opponent)return;
    if(!lockedTarget){state.target=opponent;state.targetLock=.85+Math.random()*.7;}
    const dx=opponent.position.x-animal.position.x,dz=opponent.position.z-animal.position.z,dist=Math.max(.001,Math.hypot(dx,dz)),dirX=dx/dist,dirZ=dz/dist;
    let walking=false;state.time+=dt;
    if(state.state==='standoff'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.045);
      state.cooldown-=dt*affinityEffect.speed*injurySpeed;const desired=2.5+(animal===enemy ? .15 : index*.12);
      if(dist>desired+.35)walking=moveCombatAnimalFacing(animal,dirX,dirZ,Math.min(combatSpeed*.35*dt,dist-desired));
      else if(dist<desired-.35)walking=moveCombatAnimalFacing(animal,-dirX,-dirZ,combatSpeed*.25*dt);
      else walking=moveCombatAnimalFacing(animal,-dirZ*state.strafe,dirX*state.strafe,.34*dt);
      if(state.cooldown<=0){state.target=opponent;chooseBattleAction(animal,state);}
    }else if(state.state==='jumpCrouch'){
      turnCombatAnimal(animal,dirX,dirZ,.3);const progress=Math.min(state.time/state.duration,1),compression=Math.sin(progress*Math.PI*.5),base=animal.userData.baseScale;
      animal.scale.set(base*(1+compression*.08),base*(1-compression*.28),base*(1+compression*.08));
      if(state.time>=state.duration){
        state.jumpTargetX=opponent.position.x;state.jumpTargetY=opponent.position.y;state.jumpTargetZ=opponent.position.z;const jumpDX=state.jumpTargetX-animal.position.x,jumpDZ=state.jumpTargetZ-animal.position.z,jumpDistance=Math.max(.001,Math.hypot(jumpDX,jumpDZ)),apex=THREE.MathUtils.clamp(1.6+jumpDistance*.25,2.1,5.6)+(animal.userData.species==='animal-parrot' ? .65 : 0),launchVelocity=Math.sqrt(36*apex),heightDelta=state.jumpTargetY-animal.position.y,flightTime=(launchVelocity+Math.sqrt(Math.max(.01,launchVelocity*launchVelocity-36*heightDelta)))/18;
        state.chargeX=jumpDX/jumpDistance;state.chargeZ=jumpDZ/jumpDistance;state.jumpSpeed=jumpDistance/Math.max(.35,flightTime);state.jumpDuration=flightTime;state.state='jumpLeap';state.time=0;state.hasHit=false;animal.scale.setScalar(base);animal.rotation.y=Math.atan2(state.chargeX,state.chargeZ);animal.userData.verticalVelocity=launchVelocity;animal.userData.grounded=false;animal.userData.jumpCooldown=1;emitCombatParticles(animal.position,'takeoff');
      }
    }else if(state.state==='jumpLeap'){
      const descending=animal.userData.verticalVelocity<0,remaining=Math.hypot(state.jumpTargetX-animal.position.x,state.jumpTargetZ-animal.position.z),step=Math.min(remaining,state.jumpSpeed*dt);walking=remaining>.025&&moveCombatAnimal(animal,state.chargeX,state.chargeZ,step,animal.position.y);animal.rotation.x=descending ? .3 : -.16;
      const impactDistance=(animal.userData.collisionRadius||.62)+(opponent.userData.collisionRadius||.62)+.16,feetNearTarget=animal.position.y-opponent.position.y<=1.05,nearLockedLanding=remaining<=impactDistance+.35;
      if(!state.hasHit&&descending&&feetNearTarget&&nearLockedLanding&&dist<=impactDistance){state.hasHit=true;damageAnimal(animal,opponent);}
      if(animal.userData.grounded&&state.time>.12){state.state='jumpLand';state.time=0;animal.rotation.x=0;emitCombatParticles(animal.position,'land');}
      else if(state.time>state.jumpDuration+.55){state.state='jumpLand';state.time=0;animal.rotation.x=0;emitCombatParticles(animal.position,'land');}
    }else if(state.state==='jumpLand'){
      const progress=Math.min(state.time/.24,1),squash=Math.sin(progress*Math.PI),base=animal.userData.baseScale;animal.scale.set(base*(1+squash*.1),base*(1-squash*.2),base*(1+squash*.1));
      if(progress>=1){animal.scale.setScalar(base);state.state='retreat';state.time=0;}
    }else if(state.state==='aim'){
      turnCombatAnimal(animal,dirX,dirZ,.32);
      if(state.time>=state.duration){state.chargeX=dirX;state.chargeZ=dirZ;animal.rotation.y=Math.atan2(dirX,dirZ);state.state='charge';state.time=0;state.hasHit=false;}
    }else if(state.state==='charge'){
      walking=moveCombatAnimal(animal,state.chargeX,state.chargeZ,combatSpeed*dt);maybeStartCombatJump(animal,state.chargeX,state.chargeZ);
      const impactDistance=(animal.userData.collisionRadius||.62)+(opponent.userData.collisionRadius||.62)+.04;
      if(!state.hasHit&&dist<=impactDistance){state.hasHit=true;damageAnimal(animal,opponent);state.state='retreat';state.time=0;}
      else if(state.time>1.25){state.state='retreat';state.time=0;}
    }else if(state.state==='retreat'){
      walking=moveCombatAnimalFacing(animal,-dirX,-dirZ,combatSpeed*.55*dt);
      if(state.time>.48){state.state='standoff';state.cooldown=.35+Math.random()*.8;state.time=0;state.strafe*=-1;}
    }else if(state.state==='evade'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.09);
      const evadeX=-dirX*.72-dirZ*state.strafe*.7,evadeZ=-dirZ*.72+dirX*state.strafe*.7,length=Math.hypot(evadeX,evadeZ);
      walking=moveCombatAnimalFacing(animal,evadeX/length,evadeZ/length,combatSpeed*.7*dt);
      if(state.time>=state.duration){state.state='standoff';state.cooldown=.45+Math.random()*1.1;state.time=0;}
    }else if(state.state==='wander'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.075);
      const wanderX=Math.sin(state.wanderAngle),wanderZ=Math.cos(state.wanderAngle);walking=moveCombatAnimalFacing(animal,wanderX,wanderZ,combatSpeed*.38*dt);
      if(state.time>=state.duration){state.state='standoff';state.cooldown=.55+Math.random()*1.25;state.time=0;state.strafe*=-1;}
    }else if(state.state==='hit'){
      const progress=Math.min(state.time/state.duration,1),pushSpeed=(state.hitCritical?2.8:2.2)*(1-progress);
      moveCombatAnimal(animal,state.hitX,state.hitZ,pushSpeed*dt,state.hitBaseY);setCombatHitPose(animal,state,progress);
      if(progress>=1){animal.position.y=state.hitBaseY;animal.rotation.set(0,state.hitFacingY,0);state.state='standoff';state.cooldown=.55+Math.random()*.8;state.time=0;}
    }else if(state.state==='roll'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.035);const progress=Math.min(state.time/state.duration,1);
      walking=moveCombatAnimal(animal,state.rollX,state.rollZ,combatSpeed*1.15*dt,state.rollBaseY);
      if(walking)setCombatRollPose(animal,state,progress);
      if(!walking||progress>=1){animal.position.y=state.rollBaseY;animal.rotation.set(0,state.rollFacingY,0);state.state='standoff';state.cooldown=.35+Math.random()*.75;state.time=0;}
    }else{
      animal.userData.fatigue=Math.max(.12,animal.userData.fatigue-dt*.3);walking=moveCombatAnimalFacing(animal,-dirZ*state.strafe,dirX*state.strafe,.12*dt);
      if(state.time>=state.duration){animal.userData.exhausted=false;state.attackChain=0;state.state='standoff';state.cooldown=.8+Math.random()*1.2;state.time=0;}
    }
    if(state.state!=='roll'&&state.state!=='hit'){animal.userData.jumpCooldown=Math.max(0,(animal.userData.jumpCooldown||0)-dt);updateFollowerVertical(animal,dt);}
    if(walking&&animal.userData.grounded){state.particleCooldown-=dt;if(state.particleCooldown<=0){emitCombatParticles(animal.position,'run');state.particleCooldown=.1+Math.random()*.06;}}else state.particleCooldown=Math.min(state.particleCooldown,.04);
    animal.userData.phase=(animal.userData.phase||0)+dt*(walking?11:3)*injurySpeed;animal.userData.walkWeight=THREE.MathUtils.damp(animal.userData.walkWeight||0,walking?1:0,10,dt);animateAnimalFeet(animal,animal.userData.phase,animal.userData.walkWeight);
  });
}

function respawnWildAnimal(entry){
  const template=animalTemplates.get(entry.species),data=animalData.find(([species])=>species===entry.species);if(!template||!data)return;
  const animal=prepModel(cloneModelUnique(template),data[1]);animal.userData.species=entry.species;animal.userData.displayName=animalNames[entry.species];animal.userData.spawnId=entry.spawnId;animal.userData.spawnCycle=1;animal.userData.collisionRadius=.62;
  initializeAnimalStats(animal,true);buildAnimalFootRig(animal);initAnimalMotion(animal);placeAnimal(animal,false);scene.add(animal);animals.push(animal);
}

function getBossRegionState(rx,rz){
  const key=`${rx}:${rz}`;if(bossRegions.has(key))return bossRegions.get(key);
  const random=rng(hash(rx*37+811,rz*43-1297)),eligible=!(rx===0&&rz===0)&&random()<.68,species=animalData[Math.floor(random()*animalData.length)]?.[0];
  const state={key,rx,rz,eligible,species,factor:5+random()*5,x:(rx+.5)*BOSS_REGION_SIZE+(random()-.5)*(BOSS_REGION_SIZE-34),z:(rz+.5)*BOSS_REGION_SIZE+(random()-.5)*(BOSS_REGION_SIZE-34),defeated:false,object:null,stats:null};bossRegions.set(key,state);return state;
}

function repositionBoss(boss,state){
  if(animalInActiveBattle(boss))return;
  const shared=sharedBossTransforms.get(state.key),arenaX=shared?.arenaX??state.x,arenaZ=shared?.arenaZ??state.z,x=shared?.x??arenaX,y=shared?.y??0,z=shared?.z??arenaZ;state.x=arenaX;state.z=arenaZ;boss.position.set(x,y,z);boss.rotation.y=shared?.rotation||0;boss.userData.arenaX=arenaX;boss.userData.arenaZ=arenaZ;boss.userData.sharedControllerId=shared?.controllerId||'';boss.userData.sharedTargetPosition=shared?new THREE.Vector3(x,y,z):null;boss.userData.sharedTargetRotation=shared?.rotation||0;if(boss.userData.motion){boss.userData.motion.home.set(arenaX,arenaZ);boss.userData.motion.target.set(x,z);}
}

function spawnRegionBoss(state){
  const template=animalTemplates.get(state.species),data=animalData.find(([species])=>species===state.species);if(!state.eligible||state.defeated||state.object||!template||!data)return;
  const displayFactor=state.factor*.5,boss=prepModel(cloneModelUnique(template),data[1]*displayFactor);boss.userData.species=state.species;boss.userData.displayName=`巨型${animalNames[state.species]}`;boss.userData.spawnId=10000+Math.abs(hash(state.rx,state.rz)%10000);boss.userData.spawnCycle=0;boss.userData.boss=true;boss.userData.bossFactor=displayFactor;boss.userData.bossRegion=state.key;boss.userData.arenaAngle=((Math.abs(hash(state.rx+307,state.rz-911))%10000)/10000)*Math.PI*2;boss.userData.collisionRadius=THREE.MathUtils.clamp(.62*displayFactor*.68,1.1,2.3);
  initializeAnimalStats(boss,true);boss.userData.maxHp=Math.round(boss.userData.maxHp*(5+state.factor*.65));boss.userData.hp=boss.userData.maxHp;boss.userData.attack=Math.round(boss.userData.attack*2.25);boss.userData.defense=Math.round(boss.userData.defense*2);boss.userData.combatSpeed*=.72;boss.userData.level=5;
  if(state.stats)Object.assign(boss.userData,state.stats);const sharedRatio=sharedBossStates.get(state.key);if(sharedRatio!==undefined)boss.userData.hp=Math.min(boss.userData.hp,boss.userData.maxHp*sharedRatio);if(boss.userData.hp<=0){state.defeated=true;return;}buildAnimalFootRig(boss);initAnimalMotion(boss);boss.userData.motion.speed=.18+Math.random()*.18;repositionBoss(boss,state);scene.add(boss);animals.push(boss);bosses.push(boss);state.object=boss;
}

function updateBossRegions(){
  if(!animalTemplates.size)return;const rx=Math.floor(hero.position.x/BOSS_REGION_SIZE),rz=Math.floor(hero.position.z/BOSS_REGION_SIZE),wanted=new Set();
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const state=getBossRegionState(rx+dx,rz+dz);wanted.add(state.key);spawnRegionBoss(state);}
  [...bosses].forEach(boss=>{
    const state=bossRegions.get(boss.userData.bossRegion);if(!state||wanted.has(state.key)||battle?.enemy===boss||huntPrompt?.target===boss)return;
    state.stats={hp:boss.userData.hp,maxHp:boss.userData.maxHp,level:boss.userData.level,xp:boss.userData.xp,attack:boss.userData.attack,defense:boss.userData.defense,combatSpeed:boss.userData.combatSpeed,personality:boss.userData.personality};state.object=null;scene.remove(boss);
    const animalIndex=animals.indexOf(boss),bossIndex=bosses.indexOf(boss);if(animalIndex>=0)animals.splice(animalIndex,1);if(bossIndex>=0)bosses.splice(bossIndex,1);cryBubbles.get(boss)?.remove();cryBubbles.delete(boss);
  });
}

function updateDeathsAndRespawns(dt){
  for(let i=dyingAnimals.length-1;i>=0;i--){
    const animal=dyingAnimals[i];animal.userData.deathTime+=dt;const progress=Math.min(animal.userData.deathTime/1.05,1);
    animal.rotation.z=progress*Math.PI*.48;animal.position.y-=dt*.14;animal.scale.setScalar(animal.userData.deathScale*(1-progress*.82));
    if(progress>=1){
      scene.remove(animal);const wildIndex=animals.indexOf(animal),followerIndex=followers.indexOf(animal),bossIndex=bosses.indexOf(animal);
      if(wildIndex>=0)animals.splice(wildIndex,1);
      if(followerIndex>=0){followers.splice(followerIndex,1);if(!fallenFollowers.includes(animal))fallenFollowers.push(animal);}
      if(bossIndex>=0)bosses.splice(bossIndex,1);
      if(animal.userData.boss){const state=bossRegions.get(animal.userData.bossRegion);if(state)state.object=null;}
      cryBubbles.get(animal)?.remove();cryBubbles.delete(animal);dyingAnimals.splice(i,1);
    }
  }
  for(let i=animalRespawns.length-1;i>=0;i--){animalRespawns[i].timer-=dt;if(animalRespawns[i].timer<=0){respawnWildAnimal(animalRespawns[i]);animalRespawns.splice(i,1);}}
}

function followerSeparationPenalty(x,z,self){
  let penalty=0;
  followers.forEach(other=>{if(other===self||Math.abs(other.position.y-self.position.y)>1)return;const depth=1.4-Math.hypot(x-other.position.x,z-other.position.z);if(depth>0)penalty+=depth;});
  return penalty;
}

function updateFollowerVertical(animal,dt){
  if(animal.userData.grounded){
    const support=surfaceHeightAt(animal.position.x,animal.position.z,animal.position.y+.12);
    if(Math.abs(animal.position.y-support)<.15)animal.position.y=support;else{animal.userData.grounded=false;animal.userData.verticalVelocity=0;}
  }
  if(!animal.userData.grounded){
    const previous=animal.position.y;animal.userData.verticalVelocity-=18*dt;const next=previous+animal.userData.verticalVelocity*dt;
    if(animal.userData.verticalVelocity<=0){const landing=surfaceHeightAt(animal.position.x,animal.position.z,previous+.05);if(next<=landing){animal.position.y=landing;animal.userData.verticalVelocity=0;animal.userData.grounded=true;return;}}
    animal.position.y=Math.max(0,next);if(animal.position.y===0){animal.userData.verticalVelocity=0;animal.userData.grounded=true;}
  }
}

function resolveFollowerSeparation(){
  for(let i=0;i<followers.length;i++)for(let j=i+1;j<followers.length;j++){
    const a=followers[i],b=followers[j];if(a.userData.dead||b.userData.dead||a.userData.teleport||b.userData.teleport||battle?.allies.includes(a)||battle?.allies.includes(b)||Math.abs(a.position.y-b.position.y)>1)continue;
    let dx=a.position.x-b.position.x,dz=a.position.z-b.position.z,dist=Math.hypot(dx,dz);if(dist>=1.4)continue;
    if(dist<.001){dx=1;dz=0;dist=1;}const push=(1.4-dist)/2,nx=dx/dist,nz=dz/dist;
    const ax=a.position.x+nx*push,az=a.position.z+nz*push,bx=b.position.x-nx*push,bz=b.position.z-nz*push;
    if(!blockedByWorld(ax,az,.62,a.position.y,1.1)){a.position.x=ax;a.position.z=az;}
    if(!blockedByWorld(bx,bz,.62,b.position.y,1.1)){b.position.x=bx;b.position.z=bz;}
  }
}

function recoverAnimal(animal,dt,resting=false){
  if(animal.userData.hp>=animal.userData.maxHp)return;
  const rate=animal.userData.maxHp*(resting ? .035 : .018);
  animal.userData.hp=Math.min(animal.userData.maxHp,animal.userData.hp+rate*dt);
}

function startFollowerTeleport(animal,x,z){
  animal.userData.teleport={phase:'out',time:0,x,z};animal.userData.isWalking=false;animal.userData.walkWeight=0;
}

function cancelFollowerTeleport(animal){
  if(!animal.userData.teleport)return;animal.scale.setScalar(animal.userData.baseScale);delete animal.userData.teleport;
}

function updateFollowerTeleport(animal,dt){
  const teleport=animal.userData.teleport;if(!teleport)return false;
  teleport.time+=dt;
  if(teleport.phase==='out'){
    const progress=Math.min(teleport.time/.28,1),ease=progress*progress*(3-2*progress);animal.scale.setScalar(animal.userData.baseScale*Math.max(.015,1-ease));
    if(progress>=1){animal.position.set(teleport.x,0,teleport.z);animal.userData.grounded=true;animal.userData.verticalVelocity=0;teleport.phase='in';teleport.time=0;}
  }else{
    const progress=Math.min(teleport.time/.38,1),offset=progress-1,ease=1+2.70158*offset*offset*offset+1.70158*offset*offset;animal.scale.setScalar(animal.userData.baseScale*Math.max(.015,ease));
    if(progress>=1){animal.scale.setScalar(animal.userData.baseScale);delete animal.userData.teleport;}
  }
  animateAnimalFeet(animal,animal.userData.phase||0,0);return true;
}

function updateVictoryCelebration(animal,dt){
  const celebration=animal.userData.victoryCelebration;if(!celebration)return false;
  const wasAirborne=!animal.userData.grounded;celebration.delay-=dt;
  if(animal.userData.grounded&&celebration.delay<=0){
    if(celebration.jumpsLeft<=0){delete animal.userData.victoryCelebration;return false;}
    animal.userData.verticalVelocity=6.4;animal.userData.grounded=false;animal.userData.jumpCooldown=.35;celebration.jumpsLeft--;emitCombatParticles(animal.position,'takeoff');
  }
  updateFollowerVertical(animal,dt);
  if(wasAirborne&&animal.userData.grounded){celebration.delay=celebration.jumpsLeft>0?.16:.28;emitCombatParticles(animal.position,'land');}
  animal.userData.isWalking=false;animal.userData.phase=(animal.userData.phase||0)+dt*8;animal.userData.walkWeight=THREE.MathUtils.damp(animal.userData.walkWeight||0,animal.userData.grounded?0:.7,10,dt);animateAnimalFeet(animal,animal.userData.phase,animal.userData.walkWeight);return true;
}

function updateFollowers(dt){
  followers.forEach((animal,i)=>{
    if(animal.userData.dead)return;
    if(animal.userData.victoryCry){
      animal.userData.victoryCry.delay-=dt;if(animal.userData.victoryCry.delay<=0){emitAnimalSound(animal,animal.userData.victoryCry.text,2.2);delete animal.userData.victoryCry;}
    }
    if(battle?.allies.includes(animal))return;
    if(updateFollowerTeleport(animal,dt))return;
    if(updateVictoryCelebration(animal,dt))return;
    const returning=!!animal.userData.returningFromBattle;
    animal.userData.fatigue=Math.max(0,(animal.userData.fatigue||0)-dt*.075);animal.userData.exhausted=false;
    const healthRatio=animal.userData.hp/animal.userData.maxHp;
    if(healthRatio<=SEVERE_INJURY_RATIO&&!returning)animal.userData.restingForRecovery=true;
    else if(animal.userData.restingForRecovery&&healthRatio>=.48)animal.userData.restingForRecovery=false;
    if(animal.userData.restingForRecovery){
      animal.userData.isWalking=false;recoverAnimal(animal,dt,true);updateFollowerVertical(animal,dt);
      animal.userData.walkWeight=THREE.MathUtils.damp(animal.userData.walkWeight,0,8,dt);animateAnimalFeet(animal,animal.userData.phase,animal.userData.walkWeight);return;
    }
    if(conversation?.npc===animal){
      animal.userData.isWalking=false;recoverAnimal(animal,dt);
      updateFollowerVertical(animal,dt);
      animal.userData.walkWeight=THREE.MathUtils.damp(animal.userData.walkWeight,0,8,dt);
      animateAnimalFeet(animal,animal.userData.phase,animal.userData.walkWeight);
      return;
    }
    const row=Math.floor(i/2),side=i%2===0?-1:1,forwardX=Math.sin(hero.rotation.y),forwardZ=Math.cos(hero.rotation.y),perpX=forwardZ,perpZ=-forwardX;
    const distance=2.1+row*1.25,sideOffset=side*(.65+row*.18),tx=hero.position.x-forwardX*distance+perpX*sideOffset,tz=hero.position.z-forwardZ*distance+perpZ*sideOffset;
    const dx=tx-animal.position.x,dz=tz-animal.position.z,dist=Math.hypot(dx,dz);
    if(returning&&dist<.45){animal.userData.returningFromBattle=false;animal.userData.victoryCelebration={jumpsLeft:2,delay:.12};if(updateVictoryCelebration(animal,dt))return;}
    let walking=dist>.18,blocked=false;animal.userData.jumpCooldown=Math.max(0,animal.userData.jumpCooldown-dt);
    if(dist>11&&!returning&&!blockedByWorld(tx,tz,.62,0,1.1)&&followerSeparationPenalty(tx,tz,animal)===0){startFollowerTeleport(animal,tx,tz);walking=false;}
    else if(walking){
      const dirX=dx/dist,dirZ=dz/dist,injurySpeed=severeInjurySpeed(animal),step=Math.min((returning?3.4:4)*injurySpeed*dt,dist),nx=animal.position.x+dirX*step,nz=animal.position.z+dirZ*step;
      let currentPenalty=followerSeparationPenalty(animal.position.x,animal.position.z,animal),nextPenalty=followerSeparationPenalty(nx,animal.position.z,animal);
      if(!blockedByWorld(nx,animal.position.z,.62,animal.position.y,1.1)&&(nextPenalty<.001||nextPenalty<currentPenalty)){animal.position.x=nx;currentPenalty=nextPenalty;}else blocked=true;
      nextPenalty=followerSeparationPenalty(animal.position.x,nz,animal);
      if(!blockedByWorld(animal.position.x,nz,.62,animal.position.y,1.1)&&(nextPenalty<.001||nextPenalty<currentPenalty))animal.position.z=nz;else blocked=true;
      if(blocked&&animal.userData.grounded&&animal.userData.jumpCooldown<=0){animal.userData.verticalVelocity=7.5;animal.userData.grounded=false;animal.userData.jumpCooldown=.9;}
      animal.rotation.y=Math.atan2(dirX,dirZ);animal.userData.phase+=dt*8*injurySpeed;
    }
    updateFollowerVertical(animal,dt);
    animal.userData.isWalking=walking;
    if(!walking)recoverAnimal(animal,dt);
    animal.userData.walkWeight=THREE.MathUtils.damp(animal.userData.walkWeight,walking?1:0,8,dt);
    animateAnimalFeet(animal,animal.userData.phase,animal.userData.walkWeight);
  });
  resolveFollowerSeparation();
}

function updateShop(dt){
  shopSlots.forEach(slot=>{
    if(!slot.animal){slot.restockTimer-=dt;if(slot.restockTimer<=0)spawnShopAnimal(slot);}
    else{slot.animal.userData.phase+=dt*1.4;slot.animal.position.y=Math.sin(slot.animal.userData.phase)*.025;}
  });
  if(!purchaseState)return;
  if(merchant){const dx=hero.position.x-merchant.position.x,dz=hero.position.z-merchant.position.z;merchant.rotation.y=Math.atan2(dx,dz);}
  if(purchaseState.thanksTimer>0){purchaseState.thanksTimer-=dt;if(purchaseState.thanksTimer<=0){closePurchase();return;}}
  shopBubble.classList.remove('hidden');positionSpeechBubble(shopBubble,purchaseState.anchor,2.05);
}

function updateDoctor(dt){
  if(doctorPotionStock<DOCTOR_POTION_MAX_STOCK){doctorPotionRestockTimer-=dt;if(doctorPotionRestockTimer<=0){doctorPotionStock++;doctorPotionRestockTimer=doctorPotionStock<DOCTOR_POTION_MAX_STOCK?DOCTOR_POTION_RESTOCK_TIME:0;if(doctorState?.mode==='menu')showDoctorMenu();}}
  if(!doctorState||!doctor)return;
  const dx=hero.position.x-doctor.position.x,dz=hero.position.z-doctor.position.z;doctor.rotation.y=Math.atan2(dx,dz);
  if(Math.hypot(dx,dz)>5.4){closeDoctor();return;}
  doctorBubble.classList.remove('hidden');positionSpeechBubble(doctorBubble,doctor,2.1);
}

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),target=new THREE.Vector3(),marker=new THREE.Group();
const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.68,32),new THREE.MeshBasicMaterial({color:0xe6d795,transparent:true,opacity:.85,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; marker.add(ring); marker.visible=false; scene.add(marker);
let moving=false,started=false;

function setPointerRay(e){
  pointer.x=e.clientX/innerWidth*2-1;pointer.y=-(e.clientY/innerHeight)*2+1;raycaster.setFromCamera(pointer,camera);
}

function moveTargetFromPointer(e){
  setPointerRay(e);
  let bestHit=null,bestDistance=Infinity;
  const considerSurface=(height,collider=null)=>{
    const hit=new THREE.Vector3();
    if(!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),hit))return;
    if(collider&&(Math.abs(hit.x-collider.x)>collider.halfX||Math.abs(hit.z-collider.z)>collider.halfZ))return;
    const distance=hit.distanceToSquared(raycaster.ray.origin);
    if(distance<bestDistance){bestDistance=distance;bestHit=hit;}
  };
  considerSurface(0);
  platformColliders.forEach(c=>considerSurface(c.top,c));
  if(bestHit){
    target.copy(bestHit);moving=true;if(grounded)startWalkingSound();marker.position.copy(bestHit);marker.position.y+=.04;marker.visible=true;document.querySelector('#hint').classList.add('faded');
  }
}

function clickedNpc(){
  const characters=[...npcs,merchant,doctor].filter(Boolean),hit=raycaster.intersectObjects(characters,true)[0];if(!hit)return null;
  let object=hit.object;while(object&&!object.userData.isNpc)object=object.parent;
  return object?.userData.isNpc?object:null;
}

function clickedShopSlot(){
  const products=shopSlots.map(slot=>slot.animal).filter(Boolean),hit=raycaster.intersectObjects(products,true)[0];if(!hit)return null;
  let object=hit.object;while(object&&!object.userData.shopAnimal)object=object.parent;
  return object?.userData.shopAnimal?shopSlots.find(slot=>slot.animal===object):null;
}

function clickedFollower(){
  const hit=raycaster.intersectObjects(followers,true)[0];if(!hit)return null;
  let object=hit.object;while(object&&!object.userData.following)object=object.parent;
  return object?.userData.following?object:null;
}

function clickedWildAnimal(){
  const wild=animals.filter(animal=>!animal.userData.dead),hit=raycaster.intersectObjects(wild,true)[0];if(!hit)return null;
  let object=hit.object;while(object&&!object.userData.wild)object=object.parent;
  return object?.userData.wild?object:null;
}

function clickedHero(){return !!raycaster.intersectObject(hero,true)[0];}

function returnToOrigin(){
  if(battle)escapeBattle(false,false);if(huntPrompt)closeHuntPrompt();if(purchaseState)closePurchase();if(doctorState)closeDoctor();conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');closeBattleAction();moving=false;marker.visible=false;
  hero.position.set(0,0,0);verticalVelocity=0;grounded=true;arrangeTiles(true);hero.position.y=surfaceHeightAt(0,0,Infinity);camera.position.set(hero.position.x+12,hero.position.y+11,hero.position.z+16);camera.lookAt(hero.position.x,hero.position.y+1.8,hero.position.z);
  followers.filter(animal=>!animal.userData.dead).forEach((animal,index)=>{
    cancelFollowerTeleport(animal);const side=index%2===0?-1:1,row=Math.floor(index/2);let x=side*(1.3+row*.2),z=2.2+row*1.2;
    for(let attempt=0;attempt<10&&blockedByWorld(x,z,.62,0,1.1);attempt++){const angle=attempt*Math.PI*.7;x=Math.cos(angle)*(2.2+attempt*.35);z=Math.sin(angle)*(2.2+attempt*.35);}
    startFollowerTeleport(animal,x,z);
  });
  showBattleMessage('已返回起始帳篷旁邊。',2.2);
}

function setTarget(e){
  if(!started||e.button!==0)return;
  if(conversation){advanceConversation();return;}
  if(battle){setPointerRay(e);if(!battleActionState&&!battle.ending&&clickedHero()){openBattleAction();return;}if(battleActionState)return;moveTargetFromPointer(e);return;}
  if(battleActionState)return;
  setPointerRay(e);if(clickedHero()){openHeroAction();return;}const shopSlot=clickedShopSlot();
  if(shopSlot&&shopSlot.animal.position.distanceTo(hero.position)<=4){openPurchase(shopSlot);return;}
  const follower=clickedFollower();
  if(follower&&follower.position.distanceTo(hero.position)<=3.4){startConversation(follower,animalConversationsFor(follower));return;}
  const npc=clickedNpc();
  if(npc&&npc.position.distanceTo(hero.position)<=3.4){if(npc===doctor)showDoctorMenu();else startConversation(npc,npcConversationScripts(npc));return;}
  const wild=clickedWildAnimal();
  const wildInteractionDistance=wild?.userData.boss?(wild.userData.collisionRadius||3)+5:4.8;
  if(wild&&wild.position.distanceTo(hero.position)<=wildInteractionDistance){
    if(followers.some(animal=>!animal.userData.dead)){if(wild.userData.boss)beginBossEncounter(wild);else openHuntPrompt(wild);}
    return;
  }
  if(huntPrompt)closeHuntPrompt();
  if(purchaseState)closePurchase();if(doctorState)closeDoctor();
  moveTargetFromPointer(e);
}
canvas.addEventListener('pointerdown',setTarget);
canvas.addEventListener('contextmenu',e=>{
  e.preventDefault();if(!started)return;
  if(conversation){advanceConversation();return;}
  if(huntPrompt||battleActionState)return;
  if(grounded){verticalVelocity=7.8;grounded=false;}
});
document.querySelector('#beginBtn').addEventListener('click',startGame);
document.querySelector('#createRoomBtn').addEventListener('click',createFreshRoom);
document.querySelector('#joinRoomBtn').addEventListener('click',()=>{requestMusicPlayback();connectToRoom(document.querySelector('#roomCode').value,document.querySelector('#playerName').value.trim());});
document.querySelector('#roomCode').addEventListener('input',event=>event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));
document.querySelector('#leaveRoomBtn').addEventListener('click',()=>leaveRoom());
document.querySelector('#createNewRoomBtn').addEventListener('click',createFreshRoom);
document.querySelector('#returnBtn').addEventListener('click',returnToOrigin);

const fireflyGeo=new THREE.BufferGeometry(),flyCount=420,flyPos=new Float32Array(flyCount*3),flyBase=new Float32Array(flyCount*3),flyPhases=new Float32Array(flyCount);
for(let i=0;i<flyCount;i++){const k=i*3;flyBase[k]=(Math.random()-.5)*75;flyBase[k+1]=.35+Math.random()*7.5;flyBase[k+2]=(Math.random()-.5)*75;flyPos[k]=flyBase[k];flyPos[k+1]=flyBase[k+1];flyPos[k+2]=flyBase[k+2];flyPhases[i]=Math.random()*Math.PI*2;}
fireflyGeo.setAttribute('position',new THREE.BufferAttribute(flyPos,3));
const fireflies=new THREE.Points(fireflyGeo,new THREE.PointsMaterial({color:0xe9ef8f,size:.085,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}));fireflies.frustumCulled=false;scene.add(fireflies);

const rainDropCount=180,rainPositions=new Float32Array(rainDropCount*6),rainSpeeds=new Float32Array(rainDropCount);
for(let i=0;i<rainDropCount;i++){
  const x=(Math.random()-.5)*34,y=Math.random()*18,z=(Math.random()-.5)*34,k=i*6;rainPositions[k]=rainPositions[k+3]=x;rainPositions[k+1]=y;rainPositions[k+4]=y-.65;rainPositions[k+2]=rainPositions[k+5]=z;rainSpeeds[i]=11+Math.random()*8;
}
const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
const rainMaterial=new THREE.LineBasicMaterial({color:0xb9d2d3,transparent:true,opacity:0,depthWrite:false});
const rainField=new THREE.LineSegments(rainGeometry,rainMaterial);rainField.frustumCulled=false;scene.add(rainField);

const nightSky=new THREE.Color(0x211440),daySky=new THREE.Color(0x24563a),twilightSky=new THREE.Color(0x8b6250),overcastDay=new THREE.Color(0x536862),overcastNight=new THREE.Color(0x1a1535),mistTint=new THREE.Color(0x9a5d78),environmentColor=new THREE.Color(),weatherTint=new THREE.Color();
const statusText=document.querySelector('.status span'),statusDot=document.querySelector('.status i');

function weatherAt(x,z){
  const rx=Math.floor(x/WEATHER_REGION_SIZE),rz=Math.floor(z/WEATHER_REGION_SIZE),key=`${rx}:${rz}`,random=rng(hash(rx*137+4019,rz*181-2281)),roll=random();
  return {key,name:roll<.38?'clear':roll<.65?'cloudy':roll<.84?'mist':'rain'};
}

function updateEnvironment(dt,t){
  const localWeather=weatherAt(hero.position.x,hero.position.z),target=weatherProfiles[localWeather.name];
  if(weatherState.key!==localWeather.key){weatherState.key=localWeather.key;weatherState.name=localWeather.name;}
  weatherState.sun=THREE.MathUtils.damp(weatherState.sun,target.sun,.72,dt);weatherState.fog=THREE.MathUtils.damp(weatherState.fog,target.fog,.72,dt);weatherState.rain=THREE.MathUtils.damp(weatherState.rain,target.rain,.9,dt);weatherState.cloud=THREE.MathUtils.damp(weatherState.cloud,target.cloud,.72,dt);weatherState.mist=THREE.MathUtils.damp(weatherState.mist,target.mist,.48,dt);
  const phase=(.3+t/DAY_LENGTH)%1,solar=-Math.cos(phase*Math.PI*2),daylight=THREE.MathUtils.smoothstep(solar,-.18,.28),dawnDistance=Math.min(Math.abs(phase-.25),Math.abs(phase-.75)),twilight=THREE.MathUtils.clamp(1-dawnDistance/.085,0,1)*(1-weatherState.cloud*.45);worldCycleState.phase=phase;worldCycleState.time=timeAffinityAt(phase);
  environmentColor.copy(nightSky).lerp(daySky,daylight).lerp(twilightSky,twilight*.38);weatherTint.copy(overcastNight).lerp(overcastDay,daylight);environmentColor.lerp(weatherTint,weatherState.cloud*.55);environmentColor.lerp(mistTint,weatherState.mist*(.42+daylight*.22));
  scene.background.copy(environmentColor);scene.fog.color.copy(environmentColor);scene.fog.density=weatherState.fog*(1.12-daylight*.12);renderer.toneMappingExposure=.76+daylight*.31-weatherState.cloud*.045;
  const orbit=phase*Math.PI*2;sun.position.set(hero.position.x+Math.cos(orbit)*34,hero.position.y+18+Math.max(0,solar)*28,hero.position.z+Math.sin(orbit)*26);sun.target.position.set(hero.position.x,hero.position.y,hero.position.z);sun.target.updateMatrixWorld();sun.intensity=(.06+2.14*daylight)*weatherState.sun;sun.color.set(twilight>.15?0xffc58f:0xffedba);
  hemisphereLight.intensity=.42+daylight*(1.16-weatherState.cloud*.22);hemisphereLight.color.set(daylight>.3?0xb7d6aa:0x9789c4);hemisphereLight.groundColor.set(daylight>.3?0x182015:0x171026);
  heroSpotlight.position.set(hero.position.x+4,hero.position.y+10,hero.position.z+5);heroSpotlight.target.position.set(hero.position.x,hero.position.y+.75,hero.position.z);heroSpotlight.target.updateMatrixWorld();heroSpotlight.intensity=8+(1-daylight)*105;heroSpotlight.color.set(twilight>.18?0xffd3b0:0xd9ccff);
  const fireflyStrength=THREE.MathUtils.clamp(.98-daylight*.96-weatherState.rain*.42,.018,.92);fireflies.material.opacity=fireflyStrength*(.84+Math.sin(t*2.1)*.16);
  const animatedFlyPositions=fireflyGeo.attributes.position.array;
  for(let i=0;i<flyCount;i++){
    const k=i*3,phaseOffset=flyPhases[i];flyBase[k]=hero.position.x+THREE.MathUtils.euclideanModulo(flyBase[k]-hero.position.x+38,76)-38;flyBase[k+2]=hero.position.z+THREE.MathUtils.euclideanModulo(flyBase[k+2]-hero.position.z+38,76)-38;
    animatedFlyPositions[k]=flyBase[k]+Math.sin(t*.42+phaseOffset)*.42;animatedFlyPositions[k+1]=flyBase[k+1]+Math.sin(t*.9+phaseOffset)*.2;animatedFlyPositions[k+2]=flyBase[k+2]+Math.cos(t*.36+phaseOffset)*.42;
  }fireflyGeo.attributes.position.needsUpdate=true;
  rainField.position.set(hero.position.x,hero.position.y,hero.position.z);rainMaterial.opacity=weatherState.rain*.52;
  const rainArray=rainGeometry.attributes.position.array;
  for(let i=0;i<rainDropCount;i++){const k=i*6,fall=rainSpeeds[i]*dt;rainArray[k+1]-=fall;rainArray[k+4]-=fall;if(rainArray[k+1]<0){const y=15+Math.random()*4;rainArray[k+1]=y;rainArray[k+4]=y-.65;}}rainGeometry.attributes.position.needsUpdate=true;
  const period=phase<.2||phase>=.86?'深夜':phase<.32?'清晨':phase<.46?'上午':phase<.63?'午後':phase<.76?'黃昏':'入夜';statusText.textContent=`${period} · ${weatherProfiles[weatherState.name].label}`;statusDot.style.background=weatherState.name==='rain'?'#7fb2c3':weatherState.name==='mist'?'#e59ab8':weatherState.name==='cloudy'?'#a7aca0':'#d1d86b';statusDot.style.boxShadow=`0 0 12px ${statusDot.style.background}`;
}

const wallet=document.querySelector('.wallet');
function pulseWallet(){
  wallet.classList.remove('coin-pulse');void wallet.offsetWidth;wallet.classList.add('coin-pulse');
}
wallet.addEventListener('animationend',()=>wallet.classList.remove('coin-pulse'));

function respawnCollectedCoin(coin){
  const data=coin.userData,respawn=coinRespawns.get(data.coinId);if(!respawn||performance.now()<respawn.readyAt)return false;
  const tile=tiles.find(candidate=>candidate.userData.worldTX===data.worldTX&&candidate.userData.worldTZ===data.worldTZ);if(!tile)return false;
  const random=rng(hash(data.worldTX+respawn.cycle*149,data.worldTZ-respawn.cycle*211)^coinLayoutSeed),originReservations=data.worldTX===0&&data.worldTZ===0?[{...ORIGIN_LAYOUT.tent,radius:4.2},{...ORIGIN_LAYOUT.merchant,radius:4.2},{...ORIGIN_LAYOUT.doctor,radius:2.4},{x:0,z:0,radius:2.2}]:[];
  let localX=0,localZ=0,found=false;
  for(let attempt=0;attempt<36;attempt++){
    localX=(random()-.5)*(TILE-3);localZ=(random()-.5)*(TILE-3);const worldX=data.worldTX*TILE+localX,worldZ=data.worldTZ*TILE+localZ;
    if(originReservations.some(area=>Math.hypot(localX-area.x,localZ-area.z)<area.radius+.35))continue;
    if(Math.hypot(worldX-hero.position.x,worldZ-hero.position.z)<2.5||!entitySpotIsFree(worldX,worldZ,.35))continue;
    if(activeCoins.some(other=>other!==coin&&!other.userData.collected&&other.userData.worldTX===data.worldTX&&other.userData.worldTZ===data.worldTZ&&Math.hypot(localX-other.position.x,localZ-other.position.z)<1.1))continue;
    found=true;break;
  }
  if(!found)return false;
  coin.position.set(localX,.12,localZ);coin.rotation.set(0,0,0);coin.scale.setScalar(.02);coin.visible=true;data.baseY=.12;data.spawnTime=0;data.phase=random()*Math.PI*2;data.collecting=false;data.collectTime=0;data.collected=false;data.respawnCycle=respawn.cycle;tile.userData.props.add(coin);collectedCoins.delete(data.coinId);coinRespawns.delete(data.coinId);return true;
}

function updateCoins(dt,t){
  const worldPosition=new THREE.Vector3();
  activeCoins.forEach(coin=>{
    if(coin.userData.collected){respawnCollectedCoin(coin);return;}
    if(coin.userData.collecting){
      coin.userData.collectTime+=dt;const progress=Math.min(coin.userData.collectTime/.78,1),ease=1-Math.pow(1-progress,3);
      coin.rotation.y+=dt*(12+progress*12);coin.rotation.z+=dt*5;
      coin.position.y=coin.userData.collectStartY+ease*2.8;
      coin.scale.setScalar(coin.userData.collectStartScale*Math.max(.02,1-ease));
      if(progress>=1){coin.userData.collected=true;coin.removeFromParent();}
      return;
    }
    if(coin.userData.spawnTime<.58){
      coin.userData.spawnTime+=dt;const progress=Math.min(coin.userData.spawnTime/.58,1),offset=progress-1,ease=1+2.70158*offset*offset*offset+1.70158*offset*offset;
      coin.scale.setScalar(coin.userData.baseScale*Math.max(.015,ease));
    }
    coin.rotation.y+=dt*2.5;coin.position.y=coin.userData.baseY+Math.sin(t*2.4+coin.userData.phase)*.1;
    coin.getWorldPosition(worldPosition);const horizontal=Math.hypot(worldPosition.x-hero.position.x,worldPosition.z-hero.position.z);
    if(horizontal<.9&&Math.abs(worldPosition.y-hero.position.y)<1.25){
      coin.userData.collecting=true;coin.userData.collectTime=0;coin.userData.collectStartY=coin.position.y;coin.userData.collectStartScale=coin.scale.x;
      collectedCoins.add(coin.userData.coinId);
      const cycle=(coin.userData.respawnCycle||0)+1,delay=COIN_RESPAWN_MIN_MS+Math.random()*(COIN_RESPAWN_MAX_MS-COIN_RESPAWN_MIN_MS);coinRespawns.set(coin.userData.coinId,{readyAt:performance.now()+delay,cycle});
      setCoinBalance(coinBalance+coin.userData.value,true);
      trackGameEvent('coin collected',{coin_value:coin.userData.value,coin_balance:coinBalance,multiplayer:Boolean(currentRoom)});
    }
  });
}

function positionOverlay(element,animal,height=1.48){
  const point=new THREE.Vector3(animal.position.x,animal.position.y+height,animal.position.z).project(camera);
  const visible=point.z>=-1&&point.z<=1&&point.x>=-1.15&&point.x<=1.15&&point.y>=-1.15&&point.y<=1.15;
  element.classList.toggle('offscreen',!visible);if(!visible)return;
  element.style.left=`${(point.x*.5+.5)*innerWidth}px`;element.style.top=`${(-point.y*.5+.5)*innerHeight}px`;
}

function ensureCryBubble(animal){
  if(cryBubbles.has(animal))return cryBubbles.get(animal);
  const bubble=document.createElement('div');bubble.className='animal-cry hidden';document.querySelector('#app').append(bubble);cryBubbles.set(animal,bubble);return bubble;
}

function updateAnimalOverlays(dt){
  const nearbyWild=animals.filter(animal=>animal.position.distanceTo(hero.position)<12),cryingAnimals=new Set([...followers,...nearbyWild,...cryBubbles.keys()]);if(battle)cryingAnimals.add(battle.enemy);
  cryingAnimals.forEach(animal=>{
    const relevant=followers.includes(animal)||nearbyWild.includes(animal)||battle?.enemy===animal,low=relevant&&!animal.userData.dead&&animal.userData.hp/animal.userData.maxHp<=SEVERE_INJURY_RATIO,bubble=ensureCryBubble(animal);
    animal.userData.cryCooldown=(animal.userData.cryCooldown||0)-dt;
    if(low&&animal.userData.cryCooldown<=0){
      bubble.textContent=(animalVoices[animal.userData.species]||['嗚嗚……'])[0];bubble.dataset.timer=1.65;animal.userData.cryCooldown=4+Math.random()*3;bubble.classList.remove('hidden');
    }
    let timer=Number(bubble.dataset.timer||0);if(timer>0){timer-=dt;bubble.dataset.timer=timer;positionOverlay(bubble,animal,1.75);if(timer<=0)bubble.classList.add('hidden');}else bubble.classList.add('hidden');
  });
  if(huntPrompt){huntBubble.classList.remove('hidden');positionSpeechBubble(huntBubble,huntPrompt.target,huntPrompt.target.userData.boss?Math.max(3.2,huntPrompt.target.userData.bossFactor*.82):1.65);}
  if(battleActionState?.context==='battle'&&(!battle||battle.ending))closeBattleAction();
  if(battleActionState){battleActionBubble.classList.remove('hidden');positionSpeechBubble(battleActionBubble,hero,2.25);if(battleActionState.mode==='message'){battleActionState.timer-=dt;if(battleActionState.timer<=0)closeBattleAction();}}
  else battleActionBubble.classList.add('hidden');
  const activeBoss=battle?.enemy?.userData.boss&&!battle.enemy.userData.dead?battle.enemy:null;
  bossHealth.classList.toggle('hidden',!activeBoss);
  if(activeBoss){bossHealthName.textContent=activeBoss.userData.displayName;bossHealthFill.style.width=`${THREE.MathUtils.clamp(activeBoss.userData.hp/activeBoss.userData.maxHp*100,0,100)}%`;}
  let messageTimer=Number(battleBanner.dataset.timer||0);if(messageTimer>0){messageTimer-=dt;battleBanner.dataset.timer=messageTimer;if(messageTimer<=0)battleBanner.classList.add('hidden');}
}

const clock=new THREE.Clock();
let walkPhase=0,walkWeight=0;
let verticalVelocity=0,grounded=true;
function surfaceHeightAt(x,z,ceiling=Infinity){
  let height=0;
  platformColliders.forEach(c=>{if(Math.abs(x-c.x)<=c.halfX&&Math.abs(z-c.z)<=c.halfZ&&c.top<=ceiling&&c.top>height)height=c.top;});
  return height;
}

function collisionPenetrationAt(x,z,radius=.42,footY=hero.position.y,bodyHeight=1.65,ignore=null){
  let penetration=0;
  platformColliders.forEach(c=>{
    if(footY>=c.top-.06||footY+bodyHeight<=(c.bottom||0)+.03)return;
    const px=c.halfX+radius-Math.abs(x-c.x),pz=c.halfZ+radius-Math.abs(z-c.z);
    if(px>0&&pz>0)penetration+=Math.min(px,pz);
  });
  obstacleColliders.forEach(c=>{
    if(footY>=c.top-.06)return;
    const dx=x-c.x,dz=z-c.z;
    if(c.type==='circle'){const depth=c.radius+radius-Math.hypot(dx,dz);if(depth>0)penetration+=depth;return;}
    const cos=Math.cos(c.rotation),sin=Math.sin(c.rotation);
    const localX=dx*cos+dz*sin,localZ=-dx*sin+dz*cos;
    const px=c.halfX+radius-Math.abs(localX),pz=c.halfZ+radius-Math.abs(localZ);
    if(px>0&&pz>0)penetration+=Math.min(px,pz);
  });
  const dynamicBlockers=[merchant,doctor,...shopSlots.map(slot=>slot.animal),...bosses.filter(boss=>!boss.userData.dead)].filter(Boolean);
  dynamicBlockers.forEach(object=>{if(object===ignore)return;const blockerRadius=object===merchant||object===doctor ? .68 : (object.userData.collisionRadius||.62),depth=blockerRadius+radius-Math.hypot(x-object.position.x,z-object.position.z);if(depth>0)penetration+=depth;});
  return penetration;
}

function blockedByWorld(x,z,radius=.42,footY=hero.position.y,bodyHeight=1.65,ignore=null){
  return collisionPenetrationAt(x,z,radius,footY,bodyHeight,ignore)>0;
}

function moveHero(dir,distance){
  let currentDepth=collisionPenetrationAt(hero.position.x,hero.position.z);
  const nextX=hero.position.x+dir.x*distance;
  const nextZ=hero.position.z+dir.z*distance;
  const xDepth=collisionPenetrationAt(nextX,hero.position.z);
  if(xDepth<.0001||xDepth<currentDepth-.0001){hero.position.x=nextX;currentDepth=xDepth;}
  const zDepth=collisionPenetrationAt(hero.position.x,nextZ);
  if(zDepth<.0001||zDepth<currentDepth-.0001)hero.position.z=nextZ;
}

function resolvePlatformSideOverlap(){
  const radius=.42;
  for(let pass=0;pass<2;pass++)platformColliders.forEach(c=>{
    if(hero.position.y>=c.top-.06||hero.position.y+1.65<=(c.bottom||0)+.03)return;
    const dx=hero.position.x-c.x,dz=hero.position.z-c.z;
    const px=c.halfX+radius-Math.abs(dx),pz=c.halfZ+radius-Math.abs(dz);
    if(px<=0||pz<=0)return;
    if(px<pz)hero.position.x=c.x+(Math.sign(dx)||1)*(c.halfX+radius+.002);
    else hero.position.z=c.z+(Math.sign(dz)||1)*(c.halfZ+radius+.002);
  });
}

function updateJump(dt){
  if(grounded){
    const support=surfaceHeightAt(hero.position.x,hero.position.z,hero.position.y+.12);
    if(Math.abs(hero.position.y-support)<.14) hero.position.y=support;
    else {grounded=false;verticalVelocity=0;}
  }
  if(!grounded){
    const previous=hero.position.y;
    verticalVelocity-=18*dt;
    const next=previous+verticalVelocity*dt;
    if(verticalVelocity<=0){
      const landing=surfaceHeightAt(hero.position.x,hero.position.z,previous+.05);
      if(next<=landing){hero.position.y=landing;verticalVelocity=0;grounded=true;return;}
    }
    hero.position.y=next;
    if(hero.position.y<0){hero.position.y=0;verticalVelocity=0;grounded=true;}
  }
}

function updateBossTracker(){
  const tracker=document.querySelector('#bossTracker'),nearby=bosses.filter(boss=>!boss.userData.dead).sort((a,b)=>a.position.distanceToSquared(hero.position)-b.position.distanceToSquared(hero.position));
  if(!nearby.length){tracker.textContent='附近暫時沒有發現首領蹤跡';return;}
  const boss=nearby[0],dx=boss.position.x-hero.position.x,dz=boss.position.z-hero.position.z,distance=Math.round(Math.hypot(dx,dz)),directions=['北','東北','東','東南','南','西南','西','西北'],direction=directions[(Math.round(Math.atan2(dx,dz)/(Math.PI/4))+8)%8];
  tracker.textContent=distance<16?`${boss.userData.displayName} · 氣息就在附近`:`${boss.userData.displayName} · ${direction}方約 ${distance}m`;
}

function animate(){
  requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;
  const previousHeroX=hero.position.x,previousHeroZ=hero.position.z;
  if(moving){const delta=target.clone().sub(hero.position);delta.y=0;const dist=delta.length();if(dist>.15){const dir=delta.normalize();moveHero(dir,Math.min(5.2*dt,dist));hero.rotation.y=Math.atan2(dir.x,dir.z);}else{moving=false;marker.visible=false;}}
  updateWalkingSound(started&&grounded&&Math.hypot(hero.position.x-previousHeroX,hero.position.z-previousHeroZ)>.001);
  walkWeight=THREE.MathUtils.damp(walkWeight,moving?1:0,10,dt);
  if(moving) walkPhase+=dt*9.5;
  if(heroModel) heroModel.position.y=Math.abs(Math.sin(walkPhase))*walkWeight*.055;
  animateWalkRig(walkPhase,walkWeight);
  marker.scale.setScalar(1+Math.sin(t*5)*.08); ring.material.opacity=.55+Math.sin(t*5)*.25;
  updateAnimals(dt);updateNpcs(dt);resolveRoamingEntitySeparation();updateFollowers(dt);updateBattle(dt);updateAnimalInjuryEffects(t);updateLevelUpEffects(dt);updateCombatParticles(dt);updateSharedEncounters(dt);updateSharedBosses(dt);updateDeathsAndRespawns(dt);updateShop(dt);updateDoctor(dt);updateCoins(dt,t);
  arrangeTiles();updateJump(dt);resolvePlatformSideOverlap();
  updateEnvironment(dt,t+worldTimeOffset);
  updateRemotePlayers(dt);sendPlayerState(t);
  const shadowY=surfaceHeightAt(hero.position.x,hero.position.z,hero.position.y+.05);
  shadow.position.set(hero.position.x,shadowY+.015,hero.position.z);
  shadow.material.opacity=.35*Math.max(.25,1-(hero.position.y-shadowY)/4);
  recycleDistantAnimals();
  const desired=new THREE.Vector3(hero.position.x+12,hero.position.y+11,hero.position.z+16);camera.position.lerp(desired,1-Math.pow(.001,dt));camera.lookAt(hero.position.x,hero.position.y+1.8,hero.position.z);
  updateTreeCameraOcclusion(dt);
  updateConversation(dt);updateAnimalOverlays(dt);
  updateOnlinePlayerCard(false,t);
  localSaveElapsed+=dt;if(localSaveElapsed>=1.5){localSaveElapsed=0;saveLocalGame();}
  updateBossTracker();
  document.querySelector('#coords').textContent=`N ${String(Math.abs(Math.round(hero.position.z))).padStart(2,'0')} · E ${String(Math.abs(Math.round(hero.position.x))).padStart(2,'0')}`;
  renderer.render(scene,camera);
}

async function init(){
  setCoinBalance(coinBalance);setPotionCount(potionCount);
  arrangeTiles(true);
  animate();
  loadPlatformerPack();
  loadOriginTent();
  const heroReady=loadObj('characters','character-female-b').then(heroObj=>{
    const model=prepModel(heroObj,2.25);model.rotation.y=0;buildWalkRig(model);hero.add(model);heroModel=model;
  }).catch(err=>console.error('Hero model loading error:',err));
  const remotePlayerReady=loadObj('characters','character-female-f').then(obj=>{
    remoteCharacterTemplate=obj;[...pendingRemotePlayers.values()].forEach(addRemotePlayer);
  }).catch(err=>console.error('Remote player model loading error:',err));
  const animalLoads=animalData.map((data,i)=>loadObj('animals',data[0]).then(obj=>{
    animalTemplates.set(data[0],cloneModelUnique(obj));
    for(let copy=0;copy<2;copy++){
      const a=prepModel(copy===0?obj:cloneModelUnique(animalTemplates.get(data[0])),data[1]);a.userData.species=data[0];a.userData.displayName=animalNames[data[0]];a.userData.spawnId=i*2+copy;a.userData.spawnCycle=0;a.userData.collisionRadius=.62;initializeAnimalStats(a,true);buildAnimalFootRig(a);placeAnimal(a,true);initAnimalMotion(a);scene.add(a);animals.push(a);
    }
    [...pendingSharedEncounters.values()].filter(encounter=>encounter.species===data[0]).forEach(ensureSharedEncounter);
  }).catch(err=>console.error(`${data[0]} loading error:`,err)));
  npcData.forEach((data,i)=>loadObj('characters',data[0]).then(obj=>{
    const npc=new THREE.Group(),model=prepModel(obj,2.25);model.rotation.y=0;npc.add(model);
    npc.userData.isNpc=true;npc.userData.displayName=data[1];npc.userData.model=model;npc.userData.rig=createCharacterWalkRig(model);npc.userData.spawnCycle=0;npc.userData.collisionRadius=.68;
    npc.userData.motion={home:new THREE.Vector2(),target:new THREE.Vector2(),wait:1+Math.random()*2,speed:.65+Math.random()*.25,phase:Math.random()*Math.PI*2,weight:0,walking:false};
    placeNpc(npc,i,true);scene.add(npc);npcs.push(npc);
  }).catch(err=>console.error(`${data[0]} loading error:`,err)));
  const merchantReady=loadObj('characters','character-male-f').then(obj=>{
    merchant=new THREE.Group();const model=prepModel(obj,2.25);model.rotation.y=0;merchant.add(model);merchant.position.set(ORIGIN_LAYOUT.merchant.x,0,ORIGIN_LAYOUT.merchant.z);merchant.rotation.y=0;merchant.userData.displayName='森林商人';merchant.userData.isNpc=true;merchant.userData.collisionRadius=.68;scene.add(merchant);
  }).catch(err=>console.error('Merchant loading error:',err));
  const doctorReady=loadObj('characters','character-male-e').then(obj=>{
    doctor=new THREE.Group();const model=prepModel(obj,2.25);model.rotation.y=0;doctor.add(model);doctor.userData.displayName='森林醫生';doctor.userData.isNpc=true;doctor.userData.collisionRadius=.68;
    const origin=ORIGIN_LAYOUT.doctor;let x=origin.x,z=origin.z;for(let attempt=0;attempt<12&&!entitySpotIsFree(x,z,.68,doctor);attempt++){const angle=attempt*.8;x=origin.x+Math.cos(angle)*(2+attempt*.25);z=origin.z+Math.sin(angle)*(2+attempt*.25);}doctor.position.set(x,0,z);doctor.rotation.y=0;scene.add(doctor);
  }).catch(err=>console.error('Doctor loading error:',err));
  Promise.all([merchantReady,doctorReady,Promise.allSettled(animalLoads)]).then(()=>{restoreLocalCompanions();shopSlots.forEach(spawnShopAnimal);clearDoctorArea();updateBossRegions();refreshBossArenas();relocateEmbeddedEntities();});
  Promise.allSettled([remotePlayerReady,...animalLoads]).then(()=>{networkAssetsReady=true;notifyMultiplayerReady();});
  await Promise.race([heroReady,new Promise(resolve=>setTimeout(resolve,1600))]);
  document.querySelector('#loader').classList.add('done');
}
init();

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide',()=>{endAnalyticsSession();saveLocalGame(true);});
