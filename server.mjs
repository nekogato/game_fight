import { createServer } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

const root=fileURLToPath(new URL('.',import.meta.url));
const production=process.env.NODE_ENV==='production';
const rooms=new Map();
const dataDirectory=resolve(process.env.DATA_DIR||join(root,'.data')),roomsFile=join(dataDirectory,'rooms.json');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.obj':'text/plain; charset=utf-8','.mtl':'text/plain; charset=utf-8'};
const publicAssetFolders=new Set(['animals','characters','platformer','tent']);
const posthogProxyPrefix='/forest-signal',posthogApiHost='eu.i.posthog.com',posthogAssetHost='eu-assets.i.posthog.com';
let vite;

function createRoom(startedAt=Date.now()){
  const room=new Map();room.bosses=new Map();room.bossPositions=new Map();room.encounters=new Map();room.startedAt=startedAt;room.lastActive=Date.now();return room;
}

function worldSnapshot(room){return {timeElapsed:Math.max(0,(Date.now()-room.startedAt)/1000),bosses:Object.fromEntries(room.bosses),bossPositions:Object.fromEntries(room.bossPositions),encounters:[...room.encounters.values()]};}

let persistTimer=null;
function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(persistRooms,600);}
async function persistRooms(){
  persistTimer=null;const payload={savedAt:Date.now(),rooms:Object.fromEntries([...rooms].map(([code,room])=>[code,{startedAt:room.startedAt,lastActive:room.lastActive,bosses:Object.fromEntries(room.bosses),bossPositions:Object.fromEntries(room.bossPositions),encounters:[...room.encounters.values()]}]))},temporary=`${roomsFile}.tmp`;
  try{await mkdir(dataDirectory,{recursive:true});await writeFile(temporary,JSON.stringify(payload));await rename(temporary,roomsFile);}catch(error){console.error('Room persistence error:',error.message);}
}

async function restoreRooms(){
  try{const number=(value,min,max,fallback=0)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback,payload=JSON.parse(await readFile(roomsFile,'utf8'));for(const [code,data] of Object.entries(payload.rooms||{})){const room=createRoom(Number(data.startedAt)||Date.now());room.lastActive=Number(data.lastActive)||Date.now();room.bosses=new Map(Object.entries(data.bosses||{}).map(([region,ratio])=>[region,Math.max(0,Math.min(1,Number(ratio)||0))]));room.bossPositions=new Map(Object.entries(data.bossPositions||{}).map(([region,value])=>[region,{x:number(value?.x,-100000,100000,0),y:number(value?.y,-10,20,0),z:number(value?.z,-100000,100000,0),rotation:number(value?.rotation,-Math.PI*4,Math.PI*4,0),arenaX:number(value?.arenaX,-100000,100000,0),arenaZ:number(value?.arenaZ,-100000,100000,0),controllerId:'',lastMoveAt:0}]));room.encounters=new Map((data.encounters||[]).filter(item=>item?.id).map(item=>[item.id,item]));rooms.set(code,room);}}
  catch(error){if(error.code!=='ENOENT')console.error('Room restore error:',error.message);}
}

await restoreRooms();

async function serveFile(req,res,path,cache=false){
  const data=await readFile(path);res.statusCode=200;res.setHeader('Content-Type',mime[extname(path).toLowerCase()]||'application/octet-stream');if(cache)res.setHeader('Cache-Control','public, max-age=86400');res.end(req.method==='HEAD'?undefined:data);
}

async function proxyPostHogRequest(req,res,url){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store'});res.end();return;}
  if(!['GET','HEAD','POST'].includes(req.method||'')){res.writeHead(405,{'Content-Type':'text/plain; charset=utf-8'});res.end('Method not allowed');return;}
  const pathname=url.pathname.slice(posthogProxyPrefix.length)||'/',upstreamHost=pathname.startsWith('/static/')||pathname.startsWith('/array/')?posthogAssetHost:posthogApiHost,target=new URL(`${pathname}${url.search}`,`https://${upstreamHost}`),headers=new Headers();
  for(const [name,value] of Object.entries(req.headers)){
    if(value===undefined||['host','cookie','connection','content-length','x-forwarded-for','x-real-ip'].includes(name.toLowerCase()))continue;
    (Array.isArray(value)?value:[value]).forEach(item=>headers.append(name,String(item)));
  }
  headers.set('host',upstreamHost);if(req.headers.host)headers.set('x-forwarded-host',req.headers.host);
  let body;
  if(req.method==='POST'){
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>256*1024){res.writeHead(413,{'Content-Type':'text/plain; charset=utf-8'});res.end('Payload too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);
  }
  try{
    const upstream=await fetch(target,{method:req.method,headers,body,redirect:'follow'}),responseHeaders={};
    upstream.headers.forEach((value,name)=>{if(!['content-encoding','content-length','transfer-encoding','connection','set-cookie'].includes(name.toLowerCase()))responseHeaders[name]=value;});
    responseHeaders['cache-control']??='no-store';res.writeHead(upstream.status,responseHeaders);res.end(req.method==='HEAD'?undefined:Buffer.from(await upstream.arrayBuffer()));
  }catch(error){console.error('PostHog proxy error:',error.message);res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Analytics gateway unavailable');}
}

const server=createServer(async(req,res)=>{
  try{
    const requestUrl=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(requestUrl.pathname);
    if(pathname===posthogProxyPrefix||pathname.startsWith(`${posthogProxyPrefix}/`))return proxyPostHogRequest(req,res,requestUrl);
    if(!production)return vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});
    const relative=pathname.replace(/^\/+/,'');
    const folder=relative.split('/')[0];
    if(publicAssetFolders.has(folder)){
      const assetRoot=resolve(root,folder),assetPath=resolve(root,relative);
      if(assetPath!==assetRoot&&!assetPath.startsWith(`${assetRoot}${sep}`))throw new Error('Invalid asset path');
      if(!(await stat(assetPath)).isFile())throw new Error('Asset not found');
      return serveFile(req,res,assetPath,true);
    }
    const distRoot=resolve(root,'dist'),distPath=resolve(distRoot,relative||'index.html');
    if(distPath.startsWith(`${distRoot}${sep}`)&&(await stat(distPath).catch(()=>null))?.isFile())return serveFile(req,res,distPath,true);
    return serveFile(req,res,join(distRoot,'index.html'));
  }catch{res.statusCode=404;res.end('Not found');}
});

if(!production)vite=await createViteServer({root,server:{middlewareMode:true},appType:'spa'});

const wss=new WebSocketServer({server,path:'/multiplayer',maxPayload:64*1024});
const send=(socket,payload)=>socket.readyState===WebSocket.OPEN&&socket.send(JSON.stringify(payload));
const cleanText=(value,max=12)=>String(value||'').replace(/[<>]/g,'').trim().slice(0,max);
const cleanRoom=value=>cleanText(value,6).toUpperCase().replace(/[^A-Z0-9]/g,'');
const publicPlayer=client=>({id:client.id,name:client.name,state:client.state});
const broadcast=(room,payload,except)=>room?.forEach(client=>{if(client.socket!==except)send(client.socket,payload);});
const allowedSpecies=new Set(['animal-deer','animal-fox','animal-bunny','animal-panda','animal-hog','animal-monkey','animal-tiger','animal-parrot']);
const animalCombatStats={
  'animal-deer':{hp:52,attack:10,defense:4},'animal-fox':{hp:44,attack:11,defense:3},'animal-bunny':{hp:36,attack:8,defense:3},'animal-panda':{hp:68,attack:12,defense:6},
  'animal-hog':{hp:62,attack:13,defense:6},'animal-monkey':{hp:46,attack:10,defense:4},'animal-tiger':{hp:72,attack:15,defense:5},'animal-parrot':{hp:38,attack:9,defense:3}
};
const animalSpecies=[...allowedSpecies];
const finiteNumber=(value,min,max,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;};
function allowRate(client,key,limit,windowMs){const now=Date.now(),entry=client.rates.get(key);if(!entry||now-entry.start>=windowMs){client.rates.set(key,{start:now,count:1});return true;}if(entry.count>=limit)return false;entry.count++;return true;}
function authorizedCompanion(client,id){return client.state.companions?.find(companion=>companion.id===cleanText(id,32));}
function serverDamage(attackerSpecies,defenderSpecies){const attack=animalCombatStats[attackerSpecies]?.attack||8,defense=animalCombatStats[defenderSpecies]?.defense||4,critical=Math.random()<.12;return {critical,damage:Math.max(2,Math.round((attack*(.85+Math.random()*.3)-defense*.45)*(critical?1.5:1)))};}
function seededRng(seed){let value=seed|0;return ()=>{value=Math.imul(value^value>>>15,1|value);value^=value+Math.imul(value^value>>>7,61|value);return ((value^value>>>14)>>>0)/4294967296;};}
function worldHash(x,z){return Math.imul(x,73856093)^Math.imul(z,19349663);}
function bossInfoForRegion(region){
  const match=/^(-?\d+):(-?\d+)$/.exec(region);if(!match)return null;const rx=Number(match[1]),rz=Number(match[2]);if(!Number.isSafeInteger(rx)||!Number.isSafeInteger(rz)||Math.abs(rx)>10000||Math.abs(rz)>10000||rx===0&&rz===0)return null;
  const random=seededRng(worldHash(rx*37+811,rz*43-1297));if(random()>=.68)return null;const species=animalSpecies[Math.floor(random()*animalSpecies.length)],factor=5+random()*5,x=(rx+.5)*128+(random()-.5)*94,z=(rz+.5)*128+(random()-.5)*94,maxHp=Math.round(animalCombatStats[species].hp*(5+factor*.65));return {species,maxHp,x,z};
}

function ensureBossPosition(room,region,bossInfo){
  let boss=room.bossPositions.get(region);if(!boss){boss={x:bossInfo.x,y:0,z:bossInfo.z,rotation:0,arenaX:bossInfo.x,arenaZ:bossInfo.z,controllerId:'',lastMoveAt:0};room.bossPositions.set(region,boss);}return boss;
}

function leave(client){
  if(!client.room)return;
  const room=rooms.get(client.room);room?.delete(client.id);
  room?.encounters?.forEach(encounter=>{if(encounter.controllerId===client.id){encounter.controllerId=room.values().next().value?.id||'';broadcast(room,{type:'encounter_state',encounter});}});
  room?.bossPositions?.forEach((boss,region)=>{if(boss.controllerId===client.id){boss.controllerId=room.values().next().value?.id||'';boss.lastMoveAt=0;broadcast(room,{type:'boss_state',region,hpRatio:room.bosses.get(region)??1,boss});}});
  broadcast(room,{type:'player_left',id:client.id});
  if(room){room.lastActive=Date.now();schedulePersist();}
  client.room='';
}

wss.on('connection',socket=>{
  socket.isAlive=true;socket.on('pong',()=>socket.isAlive=true);
  const client={socket,id:crypto.randomUUID().slice(0,8),name:'旅人',room:'',ready:false,rates:new Map(),lastHits:new Map(),state:{x:0,y:0,z:0,rotation:0,moving:false,companions:[]}};
  socket.on('message',raw=>{
    if(!allowRate(client,'all',120,1000))return socket.close(1008,'Too many messages');
    let message;try{message=JSON.parse(raw.toString());}catch{return;}
    if(message.type==='join'){
      leave(client);const code=cleanRoom(message.room);
      if(code.length<4)return send(socket,{type:'error',message:'房間代碼無效。'});
      let room=rooms.get(code);
      if(message.create&&room)return send(socket,{type:'error',message:'這個房間代碼已被使用，請再建立一次。'});
      if(!message.create&&!room)return send(socket,{type:'error',message:'找不到這個房間，請檢查代碼。'});
      if(!room){const suppliedTime=Number(message.worldTime),requestedTime=Number.isFinite(suppliedTime)?Math.max(0,Math.min(suppliedTime,8640000)):0;room=createRoom(Date.now()-requestedTime*1000);rooms.set(code,room);schedulePersist();}
      if(room.size>=4)return send(socket,{type:'error',message:'房間已滿。'});
      client.room=code;client.name=cleanText(message.name)||'旅人';client.ready=false;room.set(client.id,client);room.lastActive=Date.now();schedulePersist();
      room.encounters.forEach(encounter=>{if(!room.has(encounter.controllerId))encounter.controllerId=client.id;});
      room.bossPositions.forEach(boss=>{if(!room.has(boss.controllerId)){boss.controllerId='';boss.lastMoveAt=0;}});
      send(socket,{type:'welcome',id:client.id,room:code,players:[...room.values()].filter(p=>p!==client&&p.ready).map(publicPlayer),world:worldSnapshot(room)});
      return;
    }
    if(message.type==='client_ready'&&client.room){const room=rooms.get(client.room),firstReady=!client.ready;client.ready=true;if(firstReady)broadcast(room,{type:'player_joined',player:publicPlayer(client)},socket);return send(socket,{type:'world_sync',players:[...room.values()].filter(p=>p!==client&&p.ready).map(publicPlayer),world:worldSnapshot(room)});}
    if(message.type==='latency_ping'){if(allowRate(client,'latency',4,5000))send(socket,{type:'latency_pong',sentAt:finiteNumber(message.sentAt,0,1e12,0),serverTime:Date.now()});return;}
    if(message.type==='state'&&client.room){
      if(!client.ready||!allowRate(client,'state',20,1000))return;const source=message.state||{},x=finiteNumber(source.x,-100000,100000,client.state.x),y=finiteNumber(source.y,-10,200,client.state.y),z=finiteNumber(source.z,-100000,100000,client.state.z);
      const companions=Array.isArray(source.companions)?source.companions.slice(0,12).map(pet=>({id:cleanText(pet.id,32),species:cleanText(pet.species,24),x:finiteNumber(pet.x,x-30,x+30,x),y:finiteNumber(pet.y,-10,200,y),z:finiteNumber(pet.z,z-30,z+30,z),rotation:finiteNumber(pet.rotation,-Math.PI*4,Math.PI*4,0),moving:Boolean(pet.moving)})).filter(pet=>pet.id&&allowedSpecies.has(pet.species)):[];
      client.state={x,y,z,rotation:finiteNumber(source.rotation,-Math.PI*4,Math.PI*4,0),moving:Boolean(source.moving),companions};
      broadcast(rooms.get(client.room),{type:'state',id:client.id,state:client.state},socket);
      return;
    }
    if(message.type==='boss_hit'&&client.room){
      const room=rooms.get(client.room),region=cleanText(message.region,32),companion=authorizedCompanion(client,message.companionId),bossInfo=bossInfoForRegion(region);if(!region||!companion||!bossInfo)return;
      const hitKey=`boss:${region}:${companion.id}`,now=Date.now();if(now-(client.lastHits.get(hitKey)||0)<550)return;client.lastHits.set(hitKey,now);
      const boss=ensureBossPosition(room,region,bossInfo),result=serverDamage(companion.species,bossInfo.species),previous=room.bosses.get(region)??1,ratio=Math.max(0,previous-result.damage/bossInfo.maxHp);room.bosses.set(region,ratio);room.lastActive=now;schedulePersist();broadcast(room,{type:'boss_state',region,hpRatio:ratio,boss,attackerId:client.id,attackerName:client.name,damage:result.damage,critical:result.critical});return;
    }
    if(message.type==='boss_start'&&client.room){
      if(!allowRate(client,'boss_start',4,10000))return;const room=rooms.get(client.room),region=cleanText(message.region,32),bossInfo=bossInfoForRegion(region);if(!bossInfo)return;
      const boss=ensureBossPosition(room,region,bossInfo),now=Date.now();if(!boss.controllerId||!room.has(boss.controllerId)||now-(boss.lastMoveAt||0)>2000)boss.controllerId=client.id;boss.lastMoveAt=now;room.lastActive=now;schedulePersist();broadcast(room,{type:'boss_state',region,hpRatio:room.bosses.get(region)??1,boss});return;
    }
    if(message.type==='boss_move'&&client.room){
      if(!allowRate(client,'boss_move',15,1000))return;const room=rooms.get(client.room),region=cleanText(message.region,32),bossInfo=bossInfoForRegion(region),boss=room.bossPositions.get(region);if(!bossInfo||!boss||boss.controllerId!==client.id)return;
      const x=finiteNumber(message.x,boss.x-5,boss.x+5,boss.x),z=finiteNumber(message.z,boss.z-5,boss.z+5,boss.z);if(Math.hypot(x-boss.arenaX,z-boss.arenaZ)<=14){boss.x=x;boss.z=z;}boss.y=finiteNumber(message.y,-.1,10,boss.y);boss.rotation=finiteNumber(message.rotation,-Math.PI*4,Math.PI*4,boss.rotation);boss.lastMoveAt=Date.now();broadcast(room,{type:'boss_state',region,hpRatio:room.bosses.get(region)??1,boss},socket);return;
    }
    if(message.type==='encounter_start'&&client.room){
      const room=rooms.get(client.room),source=message.encounter||{},id=cleanText(source.id,48),species=cleanText(source.species,24),number=value=>Number.isFinite(Number(value))?Number(value):0;if(!id||!species)return;
      if(!allowedSpecies.has(species)||!allowRate(client,'encounter_start',6,10000))return;
      let encounter=room.encounters.get(id);if(!encounter){const level=Math.max(1,Math.min(100,Math.floor(number(source.level)||1))),maxHp=Math.max(10,Math.min(2000,Math.round(number(source.maxHp)||40)));encounter={id,species,level,x:finiteNumber(source.x,-100000,100000,0),y:finiteNumber(source.y,-10,200,0),z:finiteNumber(source.z,-100000,100000,0),rotation:0,hp:maxHp,maxHp,dead:false,controllerId:client.id};room.encounters.set(id,encounter);room.lastActive=Date.now();schedulePersist();}
      broadcast(room,{type:'encounter_state',encounter});return;
    }
    if(message.type==='encounter_move'&&client.room){
      if(!allowRate(client,'encounter_move',15,1000))return;const room=rooms.get(client.room),id=cleanText(message.id,48),encounter=room.encounters.get(id);if(!encounter||encounter.dead||encounter.controllerId!==client.id)return;
      encounter.x=finiteNumber(message.x,encounter.x-5,encounter.x+5,encounter.x);encounter.y=finiteNumber(message.y,-10,200,encounter.y);encounter.z=finiteNumber(message.z,encounter.z-5,encounter.z+5,encounter.z);encounter.rotation=finiteNumber(message.rotation,-Math.PI*4,Math.PI*4,encounter.rotation);broadcast(room,{type:'encounter_state',encounter},socket);return;
    }
    if(message.type==='encounter_hit'&&client.room){
      const room=rooms.get(client.room),id=cleanText(message.id,48),encounter=room.encounters.get(id),companion=authorizedCompanion(client,message.companionId);if(!encounter||encounter.dead||!companion)return;
      const hitKey=`encounter:${id}:${companion.id}`,now=Date.now();if(now-(client.lastHits.get(hitKey)||0)<450)return;client.lastHits.set(hitKey,now);
      const result=serverDamage(companion.species,encounter.species);encounter.hp=Math.max(0,encounter.hp-result.damage);encounter.dead=encounter.hp<=0;room.lastActive=now;schedulePersist();broadcast(room,{type:'encounter_state',encounter,attackerId:client.id,attackerName:client.name,damage:result.damage,critical:result.critical});
    }
  });
  socket.on('close',()=>leave(client));socket.on('error',()=>leave(client));
});

const port=Number(process.env.PORT)||5173;
server.listen(port,'0.0.0.0',()=>console.log(`Forest co-op server: http://localhost:${port}`));

const heartbeat=setInterval(()=>wss.clients.forEach(socket=>{if(socket.isAlive===false)return socket.terminate();socket.isAlive=false;socket.ping();}),15000);
const cleanup=setInterval(()=>{const cutoff=Date.now()-24*60*60*1000;for(const [code,room] of rooms)if(!room.size&&room.lastActive<cutoff)rooms.delete(code);schedulePersist();},60*60*1000);
server.on('close',()=>{clearInterval(heartbeat);clearInterval(cleanup);});
async function shutdown(){clearInterval(heartbeat);clearInterval(cleanup);if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}await persistRooms();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();}
process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
