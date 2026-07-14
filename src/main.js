import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import './style.css';

const canvas = document.querySelector('#world');
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
const TILE = 32, GRID = 5;
const DAY_LENGTH=240,WEATHER_REGION_SIZE=TILE*3;
const weatherProfiles={
  clear:{label:'晴朗',sun:1,fog:.017,rain:0,cloud:.02},
  cloudy:{label:'陰天',sun:.58,fog:.022,rain:0,cloud:.72},
  mist:{label:'霧天',sun:.42,fog:.036,rain:0,cloud:.55},
  rain:{label:'雨天',sun:.36,fog:.028,rain:1,cloud:.9}
};
const weatherState={key:'',name:'clear',sun:1,fog:.017,rain:0,cloud:.02};
const leafMats = [0x244e2d,0x315e35,0x406b3a].map(c => new THREE.MeshStandardMaterial({color:c,roughness:1}));
const rockMat = new THREE.MeshStandardMaterial({color:0x667064,roughness:1});
const groundMat = new THREE.MeshStandardMaterial({color:0x29452c,roughness:1});
const rockGeo = new THREE.DodecahedronGeometry(1,0);
const shrubGeo = new THREE.IcosahedronGeometry(.65,1);
const platformTemplates=new Map(),decorTemplates=new Map(),coinTemplates=new Map(),platformColliders=[],obstacleColliders=[],activeCoins=[];
const bossArenaGroup=new THREE.Group();scene.add(bossArenaGroup);
const BOSS_ARENA_CLEAR_RADIUS=14,BOSS_ARENA_RING_RADIUS=15.8,BOSS_ARENA_LOAD_RADIUS=98;
const collectedCoins=new Set();
const coinDefs=[['coin-bronze',1],['coin-bronze',1],['coin-silver',3],['coin-gold',5]];
let coinBalance=0;
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
  const random=rng(hash(tx,tz)),occupied=[];
  const isFree=(x,z,radius)=>occupied.every(o=>Math.hypot(x-o.x,z-o.z)>radius+o.radius+.25);
  const reserve=(x,z,radius)=>occupied.push({x,z,radius});
  const findSpot=(radius,range=TILE-3,clearCenter=true)=>{
    for(let attempt=0;attempt<24;attempt++){
      const x=(random()-.5)*range,z=(random()-.5)*range;
      if(clearCenter&&Math.abs(x)<4&&Math.abs(z)<4)continue;
      if(isFree(x,z,radius))return [x,z];
    }
    return null;
  };
  if(tx===0&&tz===0)reserve(-8,1,4.2);

  platformDefs.forEach((def,i)=>{
    let spot;
    if(tx===0&&tz===0)spot=[[4.5,1.5],[-5,-4],[2,-7]][i];
    else spot=findSpot(Math.max(def.halfX,def.halfZ),TILE-8,false);
    if(!spot)return;const [x,z]=spot,rotation=i===1&&random()>.5?Math.PI/2:0;
    reserve(x,z,Math.max(def.halfX,def.halfZ));addGrassBlock(tile,props,def,x,z,0,rotation);
  });

  for(let i=0;i<15;i++){
    const [name,baseScale]=treeDefs[Math.floor(random()*treeDefs.length)],template=decorTemplates.get(name);if(!template)continue;
    const treeScale=baseScale*(.75+random()*.5),spot=findSpot(treeScale*.5,TILE-2);if(!spot)continue;
    const [x,z]=spot,tree=template.clone(true);tree.scale.setScalar(treeScale);tree.position.set(x,0,z);tree.rotation.y=random()*Math.PI*2;tree.userData.blocking=true;tree.userData.arenaClearable=true;props.add(tree);
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
    const id=`${tx}:${tz}:${i}`,template=coinTemplates.get(name);if(!template||collectedCoins.has(id))return;
    const spot=findSpot(.35,TILE-3,false);if(!spot)return;
    const coin=template.clone(true);coin.scale.setScalar(.02);coin.position.set(spot[0],.12,spot[1]);coin.userData={coinId:id,value,baseY:.12,baseScale:1.35,spawnTime:0,phase:random()*Math.PI*2,collecting:false,collectTime:0};props.add(coin);tile.userData.coins.push(coin);reserve(spot[0],spot[1],.35);
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

function rebuildWorldColliders(arenas=[]){
  platformColliders.length=0;obstacleColliders.length=0;
  tiles.forEach(tile=>tile.userData.colliders.forEach(c=>{const collider={...c,x:c.x+tile.position.x,z:c.z+tile.position.z},bound=Math.hypot(c.halfX,c.halfZ);if(!arenas.some(arena=>blockerInsideBossArena(collider.x,collider.z,bound,arena)))platformColliders.push(collider);}));
  tiles.forEach(tile=>tile.userData.obstacles.forEach(c=>{const collider={...c,x:c.x+tile.position.x,z:c.z+tile.position.z},bound=c.type==='circle'?c.radius:Math.hypot(c.halfX,c.halfZ);if(!arenas.some(arena=>blockerInsideBossArena(collider.x,collider.z,bound,arena)))obstacleColliders.push(collider);}));
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
      tree.scale.setScalar(scale);tree.position.set(x,0,z);tree.rotation.y=random()*Math.PI*2;bossArenaGroup.add(tree);obstacleColliders.push({type:'circle',x,z,radius:scale*.25,top:99,bossArena:true});
    }
  });
  animals.filter(animal=>!animal.userData.boss&&!animal.userData.dead&&arenas.some(arena=>Math.hypot(animal.position.x-arena.x,animal.position.z-arena.z)<BOSS_ARENA_CLEAR_RADIUS)).forEach(animal=>{animal.userData.spawnCycle++;placeAnimal(animal,true);});
  npcs.forEach((npc,index)=>{if(arenas.some(arena=>Math.hypot(npc.position.x-arena.x,npc.position.z-arena.z)<BOSS_ARENA_CLEAR_RADIUS))placeNpc(npc,index,true);});
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
let remoteCharacterTemplate=null,multiplayerSocket=null,localPlayerId='',currentRoom='',lastNetworkSend=0;
const remotePlayers=new Map(),pendingRemotePlayers=new Map();
const sharedBossStates=new Map();
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
  player.userData.targetPosition=player.position.clone();player.userData.targetRotation=player.rotation.y;player.userData.networkMoving=Boolean(state.moving);player.userData.rig=createCharacterWalkRig(model);player.userData.phase=0;player.userData.weight=0;player.userData.model=model;player.userData.companions=new Map();
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
  hud.classList.toggle('hidden',!currentRoom);document.querySelector('#roomLabel').textContent=`ROOM ${currentRoom||'------'}`;document.querySelector('#playerCount').textContent=`${Math.min(4,remotePlayers.size+1)} / 4 PLAYERS`;
}

function setCoopStatus(message,error=false){const status=document.querySelector('#coopStatus');status.textContent=message;status.classList.toggle('error',error);}

function sendPlayerState(t){
  if(!currentRoom||multiplayerSocket?.readyState!==WebSocket.OPEN||t-lastNetworkSend<.1)return;lastNetworkSend=t;
  const companions=followers.filter(animal=>!animal.userData.dead).map((animal,index)=>{animal.userData.networkId||=`${localPlayerId}-${Date.now().toString(36)}-${index}`;return {id:animal.userData.networkId,species:animal.userData.species,x:animal.position.x,y:animal.position.y,z:animal.position.z,rotation:animal.rotation.y,moving:Boolean(animal.userData.isWalking||animal.userData.walkWeight>.15)};});
  multiplayerSocket.send(JSON.stringify({type:'state',state:{x:hero.position.x,y:hero.position.y,z:hero.position.z,rotation:hero.rotation.y,moving:moving||!grounded,companions}}));
  const enemy=battle?.enemy;if(enemy?.userData.sharedEncounterId&&enemy.userData.sharedControllerId===localPlayerId)multiplayerSocket.send(JSON.stringify({type:'encounter_move',id:enemy.userData.sharedEncounterId,x:enemy.position.x,y:enemy.position.y,z:enemy.position.z,rotation:enemy.rotation.y}));
}

function applySharedBossState(region,ratio){
  const previous=sharedBossStates.get(region)??1;ratio=Math.min(previous,ratio);sharedBossStates.set(region,ratio);const boss=bosses.find(animal=>animal.userData.bossRegion===region);
  if(!boss)return;boss.userData.hp=Math.min(boss.userData.hp,boss.userData.maxHp*ratio);
  if(ratio<=0&&!boss.userData.dead)killAnimal(boss,false);
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
  animal.userData.maxHp=data.maxHp;animal.userData.hp=Math.min(animal.userData.hp,data.hp);animal.userData.sharedControllerId=data.controllerId||animal.userData.sharedControllerId;animal.userData.sharedTargetPosition??=animal.position.clone();animal.userData.sharedTargetPosition.set(data.x,data.y||0,data.z);animal.userData.sharedTargetRotation=data.rotation||0;pendingSharedEncounters.delete(data.id);
  if(data.dead&&!animal.userData.dead)killAnimal(animal,false);return animal;
}

function updateSharedEncounters(dt){
  animals.filter(animal=>animal.userData.sharedEncounterId&&!animal.userData.dead&&animal.userData.sharedControllerId!==localPlayerId).forEach(animal=>{
    const target=animal.userData.sharedTargetPosition;if(!target)return;const distance=animal.position.distanceTo(target);if(distance>8)animal.position.copy(target);else animal.position.lerp(target,1-Math.pow(.0005,dt));
    let turn=animal.userData.sharedTargetRotation-animal.rotation.y;turn=Math.atan2(Math.sin(turn),Math.cos(turn));animal.rotation.y+=turn*(1-Math.pow(.001,dt));
  });
}

function leaveRoom(showMessage=true){
  if(multiplayerSocket){multiplayerSocket.onclose=null;multiplayerSocket.close();multiplayerSocket=null;}
  remotePlayers.forEach((_,id)=>removeRemotePlayer(id));pendingRemotePlayers.clear();currentRoom='';localPlayerId='';updateRoomHud();
  if(showMessage)setCoopStatus('已離開房間，現在是單人漫遊。');
}

function startGame(){started=true;document.querySelector('#intro').classList.add('hidden');document.querySelector('#hint').classList.remove('faded');}

function connectToRoom(room,name,create=false){
  if(multiplayerSocket)leaveRoom(false);const code=room.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(code.length<4){setCoopStatus('請輸入 4–6 位房間代碼。',true);return;}
  document.querySelectorAll('.coop-panel button').forEach(button=>button.disabled=true);setCoopStatus('正在連接森林旅伴…');
  const protocol=location.protocol==='https:'?'wss':'ws',socket=new WebSocket(`${protocol}://${location.host}/multiplayer`);multiplayerSocket=socket;
  socket.onopen=()=>socket.send(JSON.stringify({type:'join',room:code,name:name||'旅人',create}));
  socket.onmessage=event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='welcome'){localPlayerId=message.id;currentRoom=message.room;Object.entries(message.world?.bosses||{}).forEach(([region,ratio])=>applySharedBossState(region,ratio));(message.world?.encounters||[]).forEach(ensureSharedEncounter);message.players.forEach(addRemotePlayer);updateRoomHud();setCoopStatus(`已加入房間 ${currentRoom}`);startGame();}
    else if(message.type==='player_joined')addRemotePlayer(message.player);
    else if(message.type==='player_left')removeRemotePlayer(message.id);
    else if(message.type==='state'){const player=remotePlayers.get(message.id);if(player){player.userData.targetPosition.set(message.state.x,message.state.y,message.state.z);player.userData.targetRotation=message.state.rotation;player.userData.networkMoving=message.state.moving;syncRemoteCompanions(player,message.state.companions||[]);}else{const pending=pendingRemotePlayers.get(message.id);if(pending){pending.state=message.state;pendingRemotePlayers.set(message.id,pending);}}}
    else if(message.type==='boss_state')applySharedBossState(message.region,message.hpRatio);
    else if(message.type==='encounter_state')ensureSharedEncounter(message.encounter);
    else if(message.type==='error'){setCoopStatus(message.message||'無法加入房間。',true);socket.close();}
  };
  socket.onerror=()=>setCoopStatus('連線失敗，請確認合作伺服器已啟動。',true);
  socket.onclose=()=>{document.querySelectorAll('.coop-panel button').forEach(button=>button.disabled=false);if(multiplayerSocket===socket){multiplayerSocket=null;remotePlayers.forEach((_,id)=>removeRemotePlayer(id));pendingRemotePlayers.clear();currentRoom='';localPlayerId='';updateRoomHud();if(started)showBattleMessage('合作連線中斷，已切換為單人模式。',2.8);}};
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
const animalPersonalityDefs={
  fierce:{label:'勇猛好戰',willingness:1,attackChance:.76,evadeChance:.08,dodgeChance:.1,roamTime:.55,chainLimit:3},
  wary:{label:'謹慎避戰',willingness:.28,attackChance:.25,evadeChance:.52,dodgeChance:.64,roamTime:1.25,chainLimit:2},
  playful:{label:'靈活好動',willingness:.62,attackChance:.43,evadeChance:.3,dodgeChance:.54,roamTime:1.05,chainLimit:2},
  steady:{label:'沉著穩健',willingness:.7,attackChance:.5,evadeChance:.2,dodgeChance:.3,roamTime:.8,chainLimit:2}
};
const animals=[],animalTemplates=new Map(),followers=[],fallenFollowers=[],bosses=[],shopSlots=[0,1,2].map(index=>({index,animal:null,restockTimer:0}));
const animalRespawns=[];
const bossRegions=new Map(),BOSS_REGION_SIZE=TILE*4;
let merchant=null,doctor=null,doctorState=null,purchaseState=null,huntPrompt=null,battle=null,battleActionState=null;

function initializeAnimalStats(animal,wild=false){
  const base=animalBaseStats[animal.userData.species]||{hp:45,attack:10,defense:4,speed:6.5};
  animal.userData.level=animal.userData.level||1;animal.userData.xp=animal.userData.xp||0;
  animal.userData.maxHp=animal.userData.maxHp||base.hp;animal.userData.hp=animal.userData.hp??animal.userData.maxHp;
  animal.userData.attack=animal.userData.attack||base.attack;animal.userData.defense=animal.userData.defense||base.defense;animal.userData.combatSpeed=animal.userData.combatSpeed||base.speed;
  const personalityKeys=Object.keys(animalPersonalityDefs);animal.userData.personality=animal.userData.personality||personalityKeys[Math.floor(Math.random()*personalityKeys.length)];
  animal.userData.baseScale=animal.userData.baseScale||animal.scale.x;animal.userData.fatigue=0;animal.userData.exhausted=false;animal.userData.verticalVelocity=animal.userData.verticalVelocity||0;animal.userData.grounded=animal.userData.grounded??true;animal.userData.jumpCooldown=animal.userData.jumpCooldown||0;animal.userData.wild=wild;animal.userData.dead=false;animal.userData.restingForRecovery=false;animal.userData.cryCooldown=2+Math.random()*3;
}

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

function placeAnimal(a,initial=false){
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
    if(a.userData.dead||huntPrompt?.target===a||battle?.enemy===a)return;
    if(a.userData.sharedEncounterId){if(a.userData.motion){a.userData.motion.walking=false;a.userData.motion.weight=THREE.MathUtils.damp(a.userData.motion.weight,0,7,dt);animateAnimalFeet(a,a.userData.motion.phase,a.userData.motion.weight);}return;}
    a.userData.fatigue=Math.max(0,(a.userData.fatigue||0)-dt*.06);a.userData.exhausted=false;
    const motion=a.userData.motion;
    if(!motion)return;
    const healthRatio=a.userData.hp/a.userData.maxHp;
    if(healthRatio<=.25)a.userData.restingForRecovery=true;
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
  [{speaker:'npc',text:'草地平台上看見的星星，似乎比地面更多。'},{speaker:'hero',text:'那我今晚也跳上去看看。'},{speaker:'npc',text:'小心別驚醒旁邊睡覺的兔子。'}]
];
const merchantConversations=[
  [{speaker:'npc',text:'今天的森林很安靜，適合慢慢散步。'},{speaker:'hero',text:'你每天都會在這裡嗎？'},{speaker:'npc',text:'只要動物需要一個家，我就會留在這裡。'}],
  [{speaker:'npc',text:'銀色 coin 在月光下特別容易找到。'},{speaker:'hero',text:'謝謝你的提示。'},{speaker:'npc',text:'不用客氣，路上小心。'}],
  [{speaker:'npc',text:'每隻動物都有自己的個性，不一定要買東西，也可以先和牠們相處。'},{speaker:'hero',text:'我會好好認識牠們的。'}]
];
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
  const healthHint={speaker:'hero',text:healthText},growthHint={speaker:'hero',text:growthText},personalityHint={speaker:'hero',text:personalityText};
  return [
    [{speaker:'npc',text:hello},{speaker:'hero',text:'我也很高興能和你一起旅行。'},{speaker:'npc',text:reply},healthHint],
    [{speaker:'npc',text:reply},{speaker:'hero',text:'前面的森林好像有新味道，對嗎？'},{speaker:'npc',text:hello},growthHint],
    [{speaker:'npc',text:`${hello} ${reply}`},{speaker:'hero',text:'放心，我會一直陪著你的。'},{speaker:'npc',text:reply},personalityHint]
  ];
}
const npcBubble=document.createElement('div'),heroBubble=document.createElement('div');
npcBubble.className='speech-bubble hidden';heroBubble.className='speech-bubble hero-speech hidden';
document.querySelector('#app').append(npcBubble,heroBubble);
let conversation=null;

function relocateEmbeddedEntities(){
  animals.forEach(a=>{if(blockedByWorld(a.position.x,a.position.z,a.userData.collisionRadius||.4,0,a.userData.boss?Math.max(3,a.userData.bossFactor*1.1):1.1,a)){if(a.userData.boss)repositionBoss(a,bossRegions.get(a.userData.bossRegion));else placeAnimal(a,true);}});
  npcs.forEach((npc,i)=>{if(blockedByWorld(npc.position.x,npc.position.z,npc.userData.collisionRadius||.42,0))placeNpc(npc,i,true);});
  placeDoctorSafely();
}

function placeDoctorSafely(){
  if(!doctor||!blockedByWorld(doctor.position.x,doctor.position.z,.68,0,1.65,doctor))return;
  let x=8,z=1;for(let attempt=0;attempt<16;attempt++){const angle=attempt*.78,radius=attempt?2+attempt*.28:0,cx=8+Math.cos(angle)*radius,cz=1+Math.sin(angle)*radius;if(entitySpotIsFree(cx,cz,.68,doctor)){x=cx;z=cz;break;}}doctor.position.set(x,0,z);
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
  const roamers=[...npcs,...animals.filter(a=>!a.userData.dead&&battle?.enemy!==a&&huntPrompt?.target!==a)];
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
  if(purchaseState)closePurchase();if(doctorState)closeDoctor();if(huntPrompt)closeHuntPrompt();conversation={npc,script:scripts[Math.floor(Math.random()*scripts.length)],index:0,elapsed:0};moving=false;marker.visible=false;
}

function positionSpeechBubble(element,object,height){
  const point=new THREE.Vector3(object.position.x,object.position.y+height,object.position.z).project(camera);
  if(point.z<-1||point.z>1){element.classList.add('hidden');return;}
  element.style.left=`${(point.x*.5+.5)*innerWidth}px`;element.style.top=`${(-point.y*.5+.5)*innerHeight}px`;
}

function advanceConversation(){
  if(!conversation)return;
  conversation.elapsed=0;conversation.index++;
  if(conversation.index>=conversation.script.length){conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');}
}

function updateConversation(dt){
  if(!conversation){npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');return;}
  const {npc,script}=conversation,dx=npc.position.x-hero.position.x,dz=npc.position.z-hero.position.z;
  npc.rotation.y=Math.atan2(-dx,-dz);hero.rotation.y=Math.atan2(dx,dz);conversation.elapsed+=dt;
  if(conversation.elapsed>2.7){advanceConversation();if(!conversation)return;}
  const line=script[conversation.index],npcSpeaking=line.speaker==='npc',bubble=npcSpeaking?npcBubble:heroBubble;
  npcBubble.classList.toggle('hidden',!npcSpeaking);heroBubble.classList.toggle('hidden',npcSpeaking);
  bubble.textContent=line.text;bubble.dataset.speaker=npcSpeaking?npc.userData.displayName:'小森';
  positionSpeechBubble(npcBubble,npc,npc.userData.following?1.55:2.25);positionSpeechBubble(heroBubble,hero,2.25);
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
  shopText.textContent=`這隻${animal.userData.displayName}的售價是 ${animal.userData.price} 枚 coin。你想買下牠嗎？`;
  buyButton.disabled=false;shopActions.style.display='flex';shopBubble.classList.remove('hidden');
}

function closePurchase(){purchaseState=null;shopBubble.classList.add('hidden');}
cancelButton.addEventListener('click',closePurchase);
buyButton.addEventListener('click',()=>{
  const slot=purchaseState?.slot,animal=slot?.animal;if(!animal)return;
  if(coinBalance<animal.userData.price){shopText.textContent='你的 coin 還不夠，再去森林裡找找吧。等你準備好再來。';buyButton.disabled=false;return;}
  coinBalance-=animal.userData.price;document.querySelector('#coinCount').textContent=coinBalance;
  animal.userData.shopAnimal=false;animal.userData.following=true;animal.userData.phase=Math.random()*Math.PI*2;animal.userData.walkWeight=0;animal.userData.verticalVelocity=0;animal.userData.grounded=true;animal.userData.jumpCooldown=0;animal.position.y=0;followers.push(animal);
  slot.animal=null;slot.restockTimer=12+Math.random()*10;
  purchaseState={slot:null,anchor:merchant,thanksTimer:2.8};shopBubble.dataset.speaker='森林商人';shopText.textContent='謝謝你！請好好照顧牠。新的動物過一段時間才會來。';shopActions.style.display='none';
});

const doctorBubble=document.createElement('div'),doctorText=document.createElement('div'),doctorActions=document.createElement('div');
doctorBubble.className='speech-bubble shop-bubble doctor-bubble hidden';doctorBubble.dataset.speaker='森林醫生';doctorActions.className='shop-actions doctor-actions';doctorBubble.append(doctorText,doctorActions);document.querySelector('#app').append(doctorBubble);

function setCoinBalance(value,pulse=false){
  coinBalance=Math.max(0,value);document.querySelector('#coinCount').textContent=coinBalance;if(pulse)pulseWallet();
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
    doctorButton('全部治療 $20',()=>{
      const companions=followers.filter(animal=>!animal.userData.dead),patients=companions.filter(animal=>animal.userData.hp<animal.userData.maxHp-.01);if(!companions.length)return showDoctorResult('你現在沒有隨行動物。');if(!patients.length)return showDoctorResult('大家都很健康，現在不需要治療。');
      if(coinBalance<20)return showDoctorResult('你的 coin 不足 20 枚。');
      setCoinBalance(coinBalance-20);companions.forEach(animal=>{animal.userData.hp=animal.userData.maxHp;animal.userData.restingForRecovery=false;});showDoctorResult('治療完成了。大家現在都恢復精神了。');
    }),
    doctorButton('復活一隻 $150',showReviveChoices,!fallenFollowers.length),
    doctorButton('升級一隻 $500',showUpgradeChoices,!followers.some(animal=>!animal.userData.dead)),
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
  if(coinBalance<150)return showDoctorResult('復活需要 150 枚 coin，你現在還不夠。');
  setCoinBalance(coinBalance-150);fallenFollowers.splice(fallenFollowers.indexOf(animal),1);animal.userData.dead=false;animal.userData.deathTime=0;animal.userData.hp=animal.userData.maxHp;animal.userData.following=true;animal.userData.restingForRecovery=false;animal.userData.exhausted=false;animal.userData.grounded=true;animal.userData.verticalVelocity=0;animal.userData.walkWeight=0;animal.quaternion.identity();animateAnimalFeet(animal,0,0);
  let x=doctor.position.x+1.5,z=doctor.position.z+1.4;for(let attempt=0;attempt<10&&!entitySpotIsFree(x,z,.62,animal);attempt++){const angle=attempt*.8;x=doctor.position.x+Math.cos(angle)*(1.8+attempt*.2);z=doctor.position.z+Math.sin(angle)*(1.8+attempt*.2);}
  animal.position.set(x,0,z);animal.scale.setScalar(animal.userData.baseScale*.015);animal.userData.teleport={phase:'in',time:0,x,z};scene.add(animal);followers.push(animal);showDoctorResult(`${animal.userData.displayName}醒過來了。請繼續好好照顧牠。`);
}

function showUpgradeChoices(){
  if(!doctorState)return;const choices=followers.filter(animal=>!animal.userData.dead);if(!choices.length)return showDoctorResult('目前沒有可以升級的隨行動物。');
  doctorState={mode:'upgrade'};doctorText.textContent='你希望讓哪一隻動物成長？';
  doctorActions.replaceChildren(...choices.map(animal=>doctorButton(`${animal.userData.displayName} · Lv.${animal.userData.level}`,()=>doctorUpgrade(animal))),doctorButton('返回',showDoctorMenu));
}

function doctorUpgrade(animal){
  if(!followers.includes(animal)||animal.userData.dead)return showDoctorResult('這隻動物目前無法接受訓練。');
  if(coinBalance<500)return showDoctorResult('升級需要 500 枚 coin，你現在還不夠。');
  setCoinBalance(coinBalance-500);animal.userData.level++;animal.userData.maxHp+=8;animal.userData.hp=Math.min(animal.userData.maxHp,animal.userData.hp+8);animal.userData.attack+=2;animal.userData.defense+=1;animal.userData.combatSpeed+=.15;
  const special=(animalVoices[animal.userData.species]||['嗷嗚——！','嗚——！'])[1];emitAnimalSound(animal,`✦ ${special}——！ ${special} ✦`,2.7);showDoctorResult(`${animal.userData.displayName}完成訓練了，看起來比之前更可靠。`);
}

const huntBubble=document.createElement('div'),huntText=document.createElement('div'),huntActions=document.createElement('div'),huntYes=document.createElement('button'),huntNo=document.createElement('button');
huntBubble.className='speech-bubble shop-bubble hunt-bubble hidden';huntBubble.dataset.speaker='狩獵';huntActions.className='shop-actions';huntYes.textContent='是，開始戰鬥';huntNo.textContent='不要';huntActions.append(huntYes,huntNo);huntBubble.append(huntText,huntActions);document.querySelector('#app').append(huntBubble);
const battleBanner=document.createElement('div');battleBanner.className='battle-banner hidden';document.querySelector('#app').append(battleBanner);
const bossHealth=document.createElement('div'),bossHealthName=document.createElement('span'),bossHealthFill=document.createElement('i');
bossHealth.className='boss-health hidden';bossHealthName.textContent='地區首領';bossHealth.append(bossHealthName,bossHealthFill);document.querySelector('#app').append(bossHealth);
const battleActionBubble=document.createElement('div'),battleActionText=document.createElement('div'),battleActionButtons=document.createElement('div'),cheerButton=document.createElement('button'),swapButton=document.createElement('button'),escapeButton=document.createElement('button');
battleActionBubble.className='speech-bubble shop-bubble battle-action-bubble hidden';battleActionBubble.dataset.speaker='小森';battleActionButtons.className='shop-actions';cheerButton.textContent='加油';swapButton.textContent='換手';escapeButton.textContent='逃走';battleActionButtons.append(cheerButton,swapButton,escapeButton);battleActionBubble.append(battleActionText,battleActionButtons);document.querySelector('#app').append(battleActionBubble);
const cryBubbles=new Map(),dyingAnimals=[];

function closeHuntPrompt(){
  if(huntPrompt?.target?.userData.motion)huntPrompt.target.userData.motion.wait=1.2;
  huntPrompt=null;huntBubble.classList.add('hidden');
}

function openHuntPrompt(animal){
  if(!animal||animal.userData.dead||battle)return;
  if(purchaseState)closePurchase();if(doctorState)closeDoctor();conversation=null;npcBubble.classList.add('hidden');heroBubble.classList.add('hidden');
  huntPrompt={target:animal};moving=false;marker.visible=false;animal.userData.motion.walking=false;
  huntBubble.dataset.speaker=animal.userData.boss?'地區首領':'狩獵';
  huntText.textContent=animal.userData.boss?`${animal.userData.displayName}散發著危險的氣息。要讓你的動物挑戰牠嗎？`: `要讓你的動物狩獵這隻 ${animal.userData.displayName} 嗎？戰鬥可能令動物受傷或死亡。`;
  huntActions.style.display='flex';huntBubble.classList.remove('hidden');
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
    const special=(animalVoices[animal.userData.species]||['嗷嗚——！','嗚——！'])[1];animal.userData.cryCooldown=4;
    emitAnimalSound(animal,`✦ ${special}——！ ${special} ✦`,2.7);
  }
  return levels;
}

function showBattleMessage(message,duration=1.8){
  battleBanner.textContent=message;battleBanner.dataset.timer=duration;battleBanner.classList.remove('hidden');
}

function selectBattleAllies(candidates){
  const roll=Math.random(),count=Math.min(candidates.length,roll<.86?1:roll<.97?2:3),pool=[...candidates],selected=[];
  while(selected.length<count&&pool.length){
    const weights=pool.map(animal=>{
      const personality=animalPersonalityDefs[animal.userData.personality]||animalPersonalityDefs.steady,health=THREE.MathUtils.clamp(animal.userData.hp/animal.userData.maxHp,0,1);
      return Math.max(.002,personality.willingness*Math.pow(health,2.35)*(1-(animal.userData.fatigue||0)*.4));
    });
    const total=weights.reduce((sum,value)=>sum+value,0);let pick=Math.random()*total,index=0;
    for(;index<weights.length-1;index++){pick-=weights[index];if(pick<=0)break;}
    selected.push(pool.splice(index,1)[0]);
  }
  return selected;
}

function battleWillingness(animal){
  const personality=animalPersonalityDefs[animal.userData.personality]||animalPersonalityDefs.steady,health=THREE.MathUtils.clamp(animal.userData.hp/animal.userData.maxHp,0,1);
  return personality.willingness*Math.pow(health,2.35)*(1-(animal.userData.fatigue||0)*.4);
}

function createCombatState(index=0){
  return {state:'standoff',cooldown:.8+Math.random()*1.6,time:0,duration:0,strafe:index%2?1:-1,wanderAngle:Math.random()*Math.PI*2,attackChain:0,target:null,targetLock:0,chargeX:0,chargeZ:1,rollX:0,rollZ:0,rollSide:1,rollFacingY:0,rollBaseY:0,rollLift:.65,hitX:0,hitZ:0,hitFacingY:0,hitBaseY:0,hitLift:.65,hitCritical:false,hasHit:false};
}

function closeBattleAction(){
  battleActionState=null;battleActionBubble.classList.add('hidden');battleActionButtons.style.display='flex';
}

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
  battleActionState={mode:'menu'};moving=false;marker.visible=false;battleActionBubble.dataset.speaker='小森';battleActionText.textContent='現在想做甚麼？';battleActionButtons.style.display='flex';swapButton.style.display=battleReserves().length?'inline-block':'none';battleActionBubble.classList.remove('hidden');
}

function switchBattleAnimal(){
  if(!battle)return closeBattleAction();
  const incoming=battleReserves().sort((a,b)=>battleWillingness(b)-battleWillingness(a))[0];
  if(!incoming){battleActionText.textContent='現在沒有其他動物可以換手。';battleActionButtons.style.display='none';battleActionState={mode:'message',timer:1.8};return;}
  const outgoing=[...battle.allies].filter(a=>!a.userData.dead).sort((a,b)=>battleWillingness(a)-battleWillingness(b))[0];
  if(!outgoing)return closeBattleAction();
  resetCombatRollPose(outgoing);const index=battle.allies.indexOf(outgoing),position=outgoing.position.clone(),retreat=safeFollowerRetreatSpot(Math.max(0,followers.indexOf(outgoing)));
  outgoing.userData.exhausted=false;outgoing.userData.returningFromBattle=true;startFollowerTeleport(outgoing,retreat.x,retreat.z);
  cancelFollowerTeleport(incoming);incoming.position.copy(position);incoming.position.y=surfaceHeightAt(position.x,position.z,position.y+.2);incoming.scale.setScalar(incoming.userData.baseScale);incoming.userData.grounded=true;incoming.userData.verticalVelocity=0;incoming.userData.restingForRecovery=false;incoming.userData.exhausted=false;incoming.userData.isWalking=false;
  battle.allies[index]=incoming;battle.states.delete(outgoing);battle.states.set(incoming,createCombatState(index));battle.startingHp.delete(outgoing);battle.startingHp.set(incoming,incoming.userData.hp);
  battle.states.forEach(state=>{state.target=null;state.targetLock=0;if(state.state==='aim'||state.state==='charge')state.state='standoff';});
  closeBattleAction();showBattleMessage(`${outgoing.userData.displayName}退下，${incoming.userData.displayName}接手戰鬥！`,2.2);
}

function escapeBattle(teleportFollowers=true,announce=true){
  if(!battle)return;
  const escaping=battle.allies.filter(animal=>!animal.userData.dead),enemy=battle.enemy;
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
swapButton.addEventListener('click',switchBattleAnimal);
escapeButton.addEventListener('click',()=>escapeBattle(true,true));

function startBattle(){
  const enemy=huntPrompt?.target;if(!enemy||enemy.userData.dead)return closeHuntPrompt();
  const candidates=followers.filter(a=>!a.userData.dead&&a.userData.hp/a.userData.maxHp>=.25);
  if(!candidates.length){huntText.textContent='你的動物目前太虛弱了。先讓牠停下來休息回血吧。';huntActions.style.display='none';return;}
  const allies=selectBattleAllies(candidates);
  if(currentRoom&&!enemy.userData.boss&&multiplayerSocket?.readyState===WebSocket.OPEN){
    enemy.userData.sharedEncounterId||=`${enemy.userData.species}:${Math.round(enemy.position.x*2)}:${Math.round(enemy.position.z*2)}`;
    enemy.userData.sharedControllerId||=localPlayerId;
    multiplayerSocket.send(JSON.stringify({type:'encounter_start',encounter:{id:enemy.userData.sharedEncounterId,species:enemy.userData.species,x:enemy.position.x,y:enemy.position.y,z:enemy.position.z,maxHp:enemy.userData.maxHp}}));
  }
  closeHuntPrompt();moving=false;marker.visible=false;
  const combatants=[...allies,enemy],states=new Map();
  combatants.forEach((animal,index)=>states.set(animal,createCombatState(index)));
  enemy.userData.motion.walking=false;allies.forEach(a=>{cancelFollowerTeleport(a);a.userData.restingForRecovery=false;a.userData.isWalking=false;});
  battle={enemy,allies,states,startingHp:new Map(allies.map(animal=>[animal,animal.userData.hp])),elapsed:0,ending:0};
  showBattleMessage(`${allies.map(a=>a.userData.displayName).join('、')} VS ${enemy.userData.displayName}`,2.2);
}

huntNo.addEventListener('click',closeHuntPrompt);
huntYes.addEventListener('click',startBattle);

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
  const attackChance=personality.attackChance*(1-animal.userData.fatigue*.55),roll=Math.random();state.time=0;
  if(roll<attackChance){
    state.state='aim';state.duration=.24+Math.random()*.18;state.hasHit=false;state.attackChain++;animal.userData.fatigue=Math.min(1,animal.userData.fatigue+.2+state.attackChain*.035);
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
  const exposed=victim.userData.exhausted,critical=Math.random()<(exposed ? .22 : .12),multiplier=(exposed?1.65:1)*(critical?1.5:1),damage=Math.max(2,Math.round((attacker.userData.attack*(.85+Math.random()*.3)-victim.userData.defense*.45)*multiplier));
  if(victim.userData.sharedEncounterId&&currentRoom&&multiplayerSocket?.readyState===WebSocket.OPEN){
    multiplayerSocket.send(JSON.stringify({type:'encounter_hit',id:victim.userData.sharedEncounterId,damage}));
    showBattleMessage(`${critical?'暴擊！':''}${attacker.userData.displayName} 衝撞命中${exposed?'疲勞破綻':''}，造成 ${damage} 傷害`,critical?1.7:1.15);startCombatHitReaction(attacker,victim,critical);return;
  }
  victim.userData.hp=Math.max(0,victim.userData.hp-damage);
  if(victim.userData.boss&&currentRoom&&multiplayerSocket?.readyState===WebSocket.OPEN)multiplayerSocket.send(JSON.stringify({type:'boss_state',region:victim.userData.bossRegion,hpRatio:victim.userData.hp/victim.userData.maxHp}));
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
  if(broadcastShared&&animal.userData.boss&&currentRoom&&multiplayerSocket?.readyState===WebSocket.OPEN)multiplayerSocket.send(JSON.stringify({type:'boss_state',region:animal.userData.bossRegion,hpRatio:0}));
  if(animal.userData.boss){const state=bossRegions.get(animal.userData.bossRegion);if(state)state.defeated=true;}
  else if(animal.userData.wild&&!animal.userData.sharedEncounterId)animalRespawns.push({species:animal.userData.species,spawnId:animal.userData.spawnId,timer:24+Math.random()*14});
}

function finishBattle(playerWon){
  if(!battle||battle.ending)return;
  battle.ending=1.8;[...battle.allies,battle.enemy].filter(a=>!a.userData.dead).forEach(resetCombatRollPose);
  if(playerWon){
    const survivors=battle.allies.filter(a=>!a.userData.dead),reward=battle.enemy.userData.boss?90+battle.enemy.userData.level*15:14+battle.enemy.userData.level*7,coinReward=battle.enemy.userData.boss?120+battle.enemy.userData.level*10:6+battle.enemy.userData.level*4,startTotal=battle.allies.reduce((sum,a)=>sum+(battle.startingHp.get(a)||a.userData.maxHp),0),remainingTotal=survivors.reduce((sum,a)=>sum+a.userData.hp,0),averageHealth=survivors.reduce((sum,a)=>sum+a.userData.hp/a.userData.maxHp,0)/Math.max(1,survivors.length),retained=remainingTotal/Math.max(1,startTotal);
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
  const enemyLocallyControlled=!enemy.userData.sharedEncounterId||enemy.userData.sharedControllerId===localPlayerId;
  const combatants=[...aliveAllies,...(enemyLocallyControlled?[enemy]:[])].filter(a=>!a.userData.dead);
  combatants.forEach((animal,index)=>{
    const state=battle.states.get(animal);if(!state)return;
    state.targetLock=Math.max(0,state.targetLock-dt);
    const attacking=state.state==='aim'||state.state==='charge',lockedTarget=state.target&&!state.target.userData.dead&&(attacking||state.targetLock>0)?state.target:null,opponent=lockedTarget||livingBattleTarget(animal);if(!opponent)return;
    if(!lockedTarget){state.target=opponent;state.targetLock=.85+Math.random()*.7;}
    const dx=opponent.position.x-animal.position.x,dz=opponent.position.z-animal.position.z,dist=Math.max(.001,Math.hypot(dx,dz)),dirX=dx/dist,dirZ=dz/dist;
    let walking=false;state.time+=dt;
    if(state.state==='standoff'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.045);
      state.cooldown-=dt;const desired=2.5+(animal===enemy ? .15 : index*.12);
      if(dist>desired+.35)walking=moveCombatAnimalFacing(animal,dirX,dirZ,Math.min(animal.userData.combatSpeed*.35*dt,dist-desired));
      else if(dist<desired-.35)walking=moveCombatAnimalFacing(animal,-dirX,-dirZ,animal.userData.combatSpeed*.25*dt);
      else walking=moveCombatAnimalFacing(animal,-dirZ*state.strafe,dirX*state.strafe,.34*dt);
      if(state.cooldown<=0){state.target=opponent;chooseBattleAction(animal,state);}
    }else if(state.state==='aim'){
      turnCombatAnimal(animal,dirX,dirZ,.32);
      if(state.time>=state.duration){state.chargeX=dirX;state.chargeZ=dirZ;animal.rotation.y=Math.atan2(dirX,dirZ);state.state='charge';state.time=0;state.hasHit=false;}
    }else if(state.state==='charge'){
      walking=moveCombatAnimal(animal,state.chargeX,state.chargeZ,animal.userData.combatSpeed*dt);maybeStartCombatJump(animal,state.chargeX,state.chargeZ);
      const impactDistance=(animal.userData.collisionRadius||.62)+(opponent.userData.collisionRadius||.62)+.04;
      if(!state.hasHit&&dist<=impactDistance){state.hasHit=true;damageAnimal(animal,opponent);state.state='retreat';state.time=0;}
      else if(state.time>1.25){state.state='retreat';state.time=0;}
    }else if(state.state==='retreat'){
      walking=moveCombatAnimalFacing(animal,-dirX,-dirZ,animal.userData.combatSpeed*.55*dt);
      if(state.time>.48){state.state='standoff';state.cooldown=.35+Math.random()*.8;state.time=0;state.strafe*=-1;}
    }else if(state.state==='evade'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.09);
      const evadeX=-dirX*.72-dirZ*state.strafe*.7,evadeZ=-dirZ*.72+dirX*state.strafe*.7,length=Math.hypot(evadeX,evadeZ);
      walking=moveCombatAnimalFacing(animal,evadeX/length,evadeZ/length,animal.userData.combatSpeed*.7*dt);
      if(state.time>=state.duration){state.state='standoff';state.cooldown=.45+Math.random()*1.1;state.time=0;}
    }else if(state.state==='wander'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.075);
      const wanderX=Math.sin(state.wanderAngle),wanderZ=Math.cos(state.wanderAngle);walking=moveCombatAnimalFacing(animal,wanderX,wanderZ,animal.userData.combatSpeed*.38*dt);
      if(state.time>=state.duration){state.state='standoff';state.cooldown=.55+Math.random()*1.25;state.time=0;state.strafe*=-1;}
    }else if(state.state==='hit'){
      const progress=Math.min(state.time/state.duration,1),pushSpeed=(state.hitCritical?2.8:2.2)*(1-progress);
      moveCombatAnimal(animal,state.hitX,state.hitZ,pushSpeed*dt,state.hitBaseY);setCombatHitPose(animal,state,progress);
      if(progress>=1){animal.position.y=state.hitBaseY;animal.rotation.set(0,state.hitFacingY,0);state.state='standoff';state.cooldown=.55+Math.random()*.8;state.time=0;}
    }else if(state.state==='roll'){
      animal.userData.fatigue=Math.max(0,animal.userData.fatigue-dt*.035);const progress=Math.min(state.time/state.duration,1);
      walking=moveCombatAnimal(animal,state.rollX,state.rollZ,animal.userData.combatSpeed*1.15*dt,state.rollBaseY);
      if(walking)setCombatRollPose(animal,state,progress);
      if(!walking||progress>=1){animal.position.y=state.rollBaseY;animal.rotation.set(0,state.rollFacingY,0);state.state='standoff';state.cooldown=.35+Math.random()*.75;state.time=0;}
    }else{
      animal.userData.fatigue=Math.max(.12,animal.userData.fatigue-dt*.3);walking=moveCombatAnimalFacing(animal,-dirZ*state.strafe,dirX*state.strafe,.12*dt);
      if(state.time>=state.duration){animal.userData.exhausted=false;state.attackChain=0;state.state='standoff';state.cooldown=.8+Math.random()*1.2;state.time=0;}
    }
    if(state.state!=='roll'&&state.state!=='hit'){animal.userData.jumpCooldown=Math.max(0,(animal.userData.jumpCooldown||0)-dt);updateFollowerVertical(animal,dt);}
    animal.userData.phase=(animal.userData.phase||0)+dt*(walking?11:3);animal.userData.walkWeight=THREE.MathUtils.damp(animal.userData.walkWeight||0,walking?1:0,10,dt);animateAnimalFeet(animal,animal.userData.phase,animal.userData.walkWeight);
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
  const random=rng(hash(state.rx*71+19,state.rz*83-41)),radius=boss.userData.collisionRadius||3;let x=state.x,z=state.z;
  for(let attempt=0;attempt<18;attempt++){
    const angle=random()*Math.PI*2,distance=attempt?5+random()*22:0,cx=state.x+Math.cos(angle)*distance,cz=state.z+Math.sin(angle)*distance;
    const farEnoughFromPlayer=state.object||Math.hypot(cx-hero.position.x,cz-hero.position.z)>18+radius,fixedNpcsClear=[merchant,doctor].filter(Boolean).every(npc=>Math.hypot(cx-npc.position.x,cz-npc.position.z)>BOSS_ARENA_RING_RADIUS+4);
    if(farEnoughFromPlayer&&fixedNpcsClear&&entitySpotIsFree(cx,cz,radius,boss)){x=cx;z=cz;break;}
  }
  boss.position.set(x,0,z);state.x=x;state.z=z;boss.userData.arenaX=x;boss.userData.arenaZ=z;if(boss.userData.motion){boss.userData.motion.home.set(x,z);boss.userData.motion.target.set(x,z);}
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

function updateFollowers(dt){
  followers.forEach((animal,i)=>{
    if(animal.userData.dead)return;
    if(animal.userData.victoryCry){
      animal.userData.victoryCry.delay-=dt;if(animal.userData.victoryCry.delay<=0){emitAnimalSound(animal,animal.userData.victoryCry.text,2.2);delete animal.userData.victoryCry;}
    }
    if(battle?.allies.includes(animal))return;
    if(updateFollowerTeleport(animal,dt))return;
    const returning=!!animal.userData.returningFromBattle;
    animal.userData.fatigue=Math.max(0,(animal.userData.fatigue||0)-dt*.075);animal.userData.exhausted=false;
    const healthRatio=animal.userData.hp/animal.userData.maxHp;
    if(healthRatio<=.25&&!returning)animal.userData.restingForRecovery=true;
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
    if(returning&&dist<.45)animal.userData.returningFromBattle=false;
    let walking=dist>.18,blocked=false;animal.userData.jumpCooldown=Math.max(0,animal.userData.jumpCooldown-dt);
    if(dist>11&&!returning&&!blockedByWorld(tx,tz,.62,0,1.1)&&followerSeparationPenalty(tx,tz,animal)===0){startFollowerTeleport(animal,tx,tz);walking=false;}
    else if(walking){
      const dirX=dx/dist,dirZ=dz/dist,step=Math.min((returning?2.25:4)*dt,dist),nx=animal.position.x+dirX*step,nz=animal.position.z+dirZ*step;
      let currentPenalty=followerSeparationPenalty(animal.position.x,animal.position.z,animal),nextPenalty=followerSeparationPenalty(nx,animal.position.z,animal);
      if(!blockedByWorld(nx,animal.position.z,.62,animal.position.y,1.1)&&(nextPenalty<.001||nextPenalty<currentPenalty)){animal.position.x=nx;currentPenalty=nextPenalty;}else blocked=true;
      nextPenalty=followerSeparationPenalty(animal.position.x,nz,animal);
      if(!blockedByWorld(animal.position.x,nz,.62,animal.position.y,1.1)&&(nextPenalty<.001||nextPenalty<currentPenalty))animal.position.z=nz;else blocked=true;
      if(blocked&&animal.userData.grounded&&animal.userData.jumpCooldown<=0){animal.userData.verticalVelocity=7.5;animal.userData.grounded=false;animal.userData.jumpCooldown=.9;}
      animal.rotation.y=Math.atan2(dirX,dirZ);animal.userData.phase+=dt*8;
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

function updateDoctor(){
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
    target.copy(bestHit);moving=true;marker.position.copy(bestHit);marker.position.y+=.04;marker.visible=true;document.querySelector('#hint').classList.add('faded');
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
  showBattleMessage('已返回霧林區域的起點。',2.2);
}

function setTarget(e){
  if(!started||e.button!==0)return;
  if(conversation){advanceConversation();return;}
  if(battle){setPointerRay(e);if(!battle.ending&&clickedHero()){openBattleAction();return;}if(battleActionState?.mode==='menu')return;moveTargetFromPointer(e);return;}
  setPointerRay(e);const shopSlot=clickedShopSlot();
  if(shopSlot&&shopSlot.animal.position.distanceTo(hero.position)<=4){openPurchase(shopSlot);return;}
  const follower=clickedFollower();
  if(follower&&follower.position.distanceTo(hero.position)<=3.4){startConversation(follower,animalConversationsFor(follower));return;}
  const npc=clickedNpc();
  if(npc&&npc.position.distanceTo(hero.position)<=3.4){if(npc===doctor)showDoctorMenu();else startConversation(npc,npc===merchant?merchantConversations:conversations);return;}
  const wild=clickedWildAnimal();
  const wildInteractionDistance=wild?.userData.boss?(wild.userData.collisionRadius||3)+5:4.8;
  if(wild&&wild.position.distanceTo(hero.position)<=wildInteractionDistance){
    if(followers.some(animal=>!animal.userData.dead))openHuntPrompt(wild);else showBattleMessage('先從商人那裡帶一隻動物同行，才能進行狩獵。',2.8);
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
  if(huntPrompt||battleActionState?.mode==='menu')return;
  if(grounded){verticalVelocity=7.8;grounded=false;}
});
document.querySelector('#beginBtn').addEventListener('click',startGame);
document.querySelector('#createRoomBtn').addEventListener('click',()=>{
  const code=Math.random().toString(36).slice(2,8).toUpperCase();document.querySelector('#roomCode').value=code;connectToRoom(code,document.querySelector('#playerName').value.trim(),true);
});
document.querySelector('#joinRoomBtn').addEventListener('click',()=>connectToRoom(document.querySelector('#roomCode').value,document.querySelector('#playerName').value.trim()));
document.querySelector('#roomCode').addEventListener('input',event=>event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));
document.querySelector('#leaveRoomBtn').addEventListener('click',()=>leaveRoom());
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

const nightSky=new THREE.Color(0x211440),daySky=new THREE.Color(0x24563a),twilightSky=new THREE.Color(0x8b6250),overcastDay=new THREE.Color(0x536862),overcastNight=new THREE.Color(0x1a1535),mistTint=new THREE.Color(0x204832),environmentColor=new THREE.Color(),weatherTint=new THREE.Color();
const statusText=document.querySelector('.status span'),statusDot=document.querySelector('.status i');

function weatherAt(x,z){
  const rx=Math.floor(x/WEATHER_REGION_SIZE),rz=Math.floor(z/WEATHER_REGION_SIZE),key=`${rx}:${rz}`,random=rng(hash(rx*137+4019,rz*181-2281)),roll=random();
  return {key,name:roll<.38?'clear':roll<.65?'cloudy':roll<.84?'mist':'rain'};
}

function updateEnvironment(dt,t){
  const localWeather=weatherAt(hero.position.x,hero.position.z),target=weatherProfiles[localWeather.name];
  if(weatherState.key!==localWeather.key){weatherState.key=localWeather.key;weatherState.name=localWeather.name;}
  weatherState.sun=THREE.MathUtils.damp(weatherState.sun,target.sun,.72,dt);weatherState.fog=THREE.MathUtils.damp(weatherState.fog,target.fog,.72,dt);weatherState.rain=THREE.MathUtils.damp(weatherState.rain,target.rain,.9,dt);weatherState.cloud=THREE.MathUtils.damp(weatherState.cloud,target.cloud,.72,dt);
  const phase=(.3+t/DAY_LENGTH)%1,solar=-Math.cos(phase*Math.PI*2),daylight=THREE.MathUtils.smoothstep(solar,-.18,.28),dawnDistance=Math.min(Math.abs(phase-.25),Math.abs(phase-.75)),twilight=THREE.MathUtils.clamp(1-dawnDistance/.085,0,1)*(1-weatherState.cloud*.45);
  environmentColor.copy(nightSky).lerp(daySky,daylight).lerp(twilightSky,twilight*.38);weatherTint.copy(overcastNight).lerp(overcastDay,daylight);environmentColor.lerp(weatherTint,weatherState.cloud*.55);if(weatherState.name==='mist')environmentColor.lerp(mistTint,.42+daylight*.22);
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
  const period=phase<.2||phase>=.86?'深夜':phase<.32?'清晨':phase<.46?'上午':phase<.63?'午後':phase<.76?'黃昏':'入夜';statusText.textContent=`${period} · ${weatherProfiles[weatherState.name].label}`;statusDot.style.background=weatherState.name==='rain'?'#7fb2c3':weatherState.name==='mist'?'#b8c2b5':weatherState.name==='cloudy'?'#a7aca0':'#d1d86b';statusDot.style.boxShadow=`0 0 12px ${statusDot.style.background}`;
}

const wallet=document.querySelector('.wallet');
function pulseWallet(){
  wallet.classList.remove('coin-pulse');void wallet.offsetWidth;wallet.classList.add('coin-pulse');
}
wallet.addEventListener('animationend',()=>wallet.classList.remove('coin-pulse'));

function updateCoins(dt,t){
  const worldPosition=new THREE.Vector3();
  activeCoins.forEach(coin=>{
    if(coin.userData.collected)return;
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
      coinBalance+=coin.userData.value;document.querySelector('#coinCount').textContent=coinBalance;pulseWallet();
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
    const relevant=followers.includes(animal)||nearbyWild.includes(animal)||battle?.enemy===animal,low=relevant&&!animal.userData.dead&&animal.userData.hp/animal.userData.maxHp<=.25,bubble=ensureCryBubble(animal);
    animal.userData.cryCooldown=(animal.userData.cryCooldown||0)-dt;
    if(low&&animal.userData.cryCooldown<=0){
      bubble.textContent=(animalVoices[animal.userData.species]||['嗚嗚……'])[0];bubble.dataset.timer=1.65;animal.userData.cryCooldown=4+Math.random()*3;bubble.classList.remove('hidden');
    }
    let timer=Number(bubble.dataset.timer||0);if(timer>0){timer-=dt;bubble.dataset.timer=timer;positionOverlay(bubble,animal,1.75);if(timer<=0)bubble.classList.add('hidden');}else bubble.classList.add('hidden');
  });
  if(huntPrompt){huntBubble.classList.remove('hidden');positionSpeechBubble(huntBubble,huntPrompt.target,huntPrompt.target.userData.boss?Math.max(3.2,huntPrompt.target.userData.bossFactor*.82):1.65);}
  if(battleActionState?.mode==='menu'&&(!battle||battle.ending))closeBattleAction();
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
  if(moving){const delta=target.clone().sub(hero.position);delta.y=0;const dist=delta.length();if(dist>.15){const dir=delta.normalize();moveHero(dir,Math.min(5.2*dt,dist));hero.rotation.y=Math.atan2(dir.x,dir.z);}else{moving=false;marker.visible=false;}}
  walkWeight=THREE.MathUtils.damp(walkWeight,moving?1:0,10,dt);
  if(moving) walkPhase+=dt*9.5;
  if(heroModel) heroModel.position.y=Math.abs(Math.sin(walkPhase))*walkWeight*.055;
  animateWalkRig(walkPhase,walkWeight);
  marker.scale.setScalar(1+Math.sin(t*5)*.08); ring.material.opacity=.55+Math.sin(t*5)*.25;
  updateAnimals(dt);updateNpcs(dt);resolveRoamingEntitySeparation();updateFollowers(dt);updateBattle(dt);updateSharedEncounters(dt);updateDeathsAndRespawns(dt);updateShop(dt);updateDoctor();updateCoins(dt,t);
  arrangeTiles();updateJump(dt);resolvePlatformSideOverlap();
  updateEnvironment(dt,t);
  updateRemotePlayers(dt);sendPlayerState(t);
  const shadowY=surfaceHeightAt(hero.position.x,hero.position.z,hero.position.y+.05);
  shadow.position.set(hero.position.x,shadowY+.015,hero.position.z);
  shadow.material.opacity=.35*Math.max(.25,1-(hero.position.y-shadowY)/4);
  recycleDistantAnimals();
  const desired=new THREE.Vector3(hero.position.x+12,hero.position.y+11,hero.position.z+16);camera.position.lerp(desired,1-Math.pow(.001,dt));camera.lookAt(hero.position.x,hero.position.y+1.8,hero.position.z);
  updateConversation(dt);updateAnimalOverlays(dt);
  updateBossTracker();
  document.querySelector('#coords').textContent=`N ${String(Math.abs(Math.round(hero.position.z))).padStart(2,'0')} · E ${String(Math.abs(Math.round(hero.position.x))).padStart(2,'0')}`;
  renderer.render(scene,camera);
}

async function init(){
  arrangeTiles(true);
  animate();
  loadPlatformerPack();
  const heroReady=loadObj('characters','character-female-b').then(heroObj=>{
    const model=prepModel(heroObj,2.25);model.rotation.y=0;buildWalkRig(model);hero.add(model);heroModel=model;
  }).catch(err=>console.error('Hero model loading error:',err));
  loadObj('characters','character-female-a').then(obj=>{
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
    merchant=new THREE.Group();const model=prepModel(obj,2.25);model.rotation.y=0;merchant.add(model);merchant.position.set(-8,0,1);merchant.rotation.y=0;merchant.userData.displayName='森林商人';merchant.userData.isNpc=true;scene.add(merchant);
  }).catch(err=>console.error('Merchant loading error:',err));
  const doctorReady=loadObj('characters','character-female-d').then(obj=>{
    doctor=new THREE.Group();const model=prepModel(obj,2.25);model.rotation.y=0;doctor.add(model);doctor.userData.displayName='森林醫生';doctor.userData.isNpc=true;doctor.userData.collisionRadius=.68;
    let x=8,z=1;for(let attempt=0;attempt<12&&!entitySpotIsFree(x,z,.68,doctor);attempt++){const angle=attempt*.8;x=7+Math.cos(angle)*(2+attempt*.25);z=1+Math.sin(angle)*(2+attempt*.25);}doctor.position.set(x,0,z);doctor.rotation.y=0;scene.add(doctor);
  }).catch(err=>console.error('Doctor loading error:',err));
  Promise.all([merchantReady,doctorReady,Promise.allSettled(animalLoads)]).then(()=>{shopSlots.forEach(spawnShopAnimal);clearDoctorArea();updateBossRegions();refreshBossArenas();relocateEmbeddedEntities();});
  await Promise.race([heroReady,new Promise(resolve=>setTimeout(resolve,1600))]);
  document.querySelector('#loader').classList.add('done');
}
init();

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
