import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

const root=fileURLToPath(new URL('.',import.meta.url));
const production=process.env.NODE_ENV==='production';
const rooms=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.obj':'text/plain','.mtl':'text/plain'};
let vite;

const server=createServer(async(req,res)=>{
  if(!production)return vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let path=join(root,'dist',pathname==='/'?'index.html':pathname.replace(/^\/+/,''));
    if(!(await stat(path)).isFile())path=join(root,'dist','index.html');
    const data=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(data);
  }catch{res.statusCode=404;res.end('Not found');}
});

if(!production)vite=await createViteServer({root,server:{middlewareMode:true},appType:'spa'});

const wss=new WebSocketServer({server,path:'/multiplayer'});
const send=(socket,payload)=>socket.readyState===WebSocket.OPEN&&socket.send(JSON.stringify(payload));
const cleanText=(value,max=12)=>String(value||'').replace(/[<>]/g,'').trim().slice(0,max);
const cleanRoom=value=>cleanText(value,6).toUpperCase().replace(/[^A-Z0-9]/g,'');
const publicPlayer=client=>({id:client.id,name:client.name,state:client.state});
const broadcast=(room,payload,except)=>room?.forEach(client=>{if(client.socket!==except)send(client.socket,payload);});

function leave(client){
  if(!client.room)return;
  const room=rooms.get(client.room);room?.delete(client.id);
  room?.encounters?.forEach(encounter=>{if(encounter.controllerId===client.id){encounter.controllerId=room.values().next().value?.id||'';broadcast(room,{type:'encounter_state',encounter});}});
  broadcast(room,{type:'player_left',id:client.id});
  if(!room?.size)rooms.delete(client.room);
  client.room='';
}

wss.on('connection',socket=>{
  const client={socket,id:crypto.randomUUID().slice(0,8),name:'旅人',room:'',state:{x:0,y:0,z:0,rotation:0,moving:false}};
  socket.on('message',raw=>{
    let message;try{message=JSON.parse(raw.toString());}catch{return;}
    if(message.type==='join'){
      leave(client);const code=cleanRoom(message.room);
      if(code.length<4)return send(socket,{type:'error',message:'房間代碼無效。'});
      let room=rooms.get(code);
      if(message.create&&room)return send(socket,{type:'error',message:'這個房間代碼已被使用，請再建立一次。'});
      if(!message.create&&!room)return send(socket,{type:'error',message:'找不到這個房間，請檢查代碼。'});
      if(!room){room=new Map();room.bosses=new Map();room.encounters=new Map();rooms.set(code,room);}
      if(room.size>=4)return send(socket,{type:'error',message:'房間已滿。'});
      client.room=code;client.name=cleanText(message.name)||'旅人';room.set(client.id,client);
      send(socket,{type:'welcome',id:client.id,room:code,players:[...room.values()].filter(p=>p!==client).map(publicPlayer),world:{bosses:Object.fromEntries(room.bosses),encounters:[...room.encounters.values()]}});
      broadcast(room,{type:'player_joined',player:publicPlayer(client)},socket);
      return;
    }
    if(message.type==='state'&&client.room){
      const source=message.state||{},number=value=>Number.isFinite(Number(value))?Number(value):0;
      const companions=Array.isArray(source.companions)?source.companions.slice(0,12).map(pet=>({id:cleanText(pet.id,32),species:cleanText(pet.species,24),x:number(pet.x),y:number(pet.y),z:number(pet.z),rotation:number(pet.rotation),moving:Boolean(pet.moving)})).filter(pet=>pet.id&&pet.species):[];
      client.state={x:number(source.x),y:number(source.y),z:number(source.z),rotation:number(source.rotation),moving:Boolean(source.moving),companions};
      broadcast(rooms.get(client.room),{type:'state',id:client.id,state:client.state},socket);
      return;
    }
    if(message.type==='boss_state'&&client.room){
      const room=rooms.get(client.room),region=cleanText(message.region,32);if(!region)return;
      const previous=room.bosses.get(region)??1,ratio=Math.max(0,Math.min(previous,Number(message.hpRatio)||0));room.bosses.set(region,ratio);broadcast(room,{type:'boss_state',region,hpRatio:ratio,attackerId:client.id});return;
    }
    if(message.type==='encounter_start'&&client.room){
      const room=rooms.get(client.room),source=message.encounter||{},id=cleanText(source.id,48),species=cleanText(source.species,24),number=value=>Number.isFinite(Number(value))?Number(value):0;if(!id||!species)return;
      let encounter=room.encounters.get(id);if(!encounter){const maxHp=Math.max(10,Math.min(2000,Math.round(number(source.maxHp)||40)));encounter={id,species,x:number(source.x),y:number(source.y),z:number(source.z),rotation:0,hp:maxHp,maxHp,dead:false,controllerId:client.id};room.encounters.set(id,encounter);}
      broadcast(room,{type:'encounter_state',encounter});return;
    }
    if(message.type==='encounter_move'&&client.room){
      const room=rooms.get(client.room),id=cleanText(message.id,48),encounter=room.encounters.get(id);if(!encounter||encounter.dead||encounter.controllerId!==client.id)return;
      const number=value=>Number.isFinite(Number(value))?Number(value):0;encounter.x=number(message.x);encounter.y=number(message.y);encounter.z=number(message.z);encounter.rotation=number(message.rotation);broadcast(room,{type:'encounter_state',encounter},socket);return;
    }
    if(message.type==='encounter_hit'&&client.room){
      const room=rooms.get(client.room),id=cleanText(message.id,48),encounter=room.encounters.get(id);if(!encounter||encounter.dead)return;
      const damage=Math.max(1,Math.min(300,Math.round(Number(message.damage)||1)));encounter.hp=Math.max(0,encounter.hp-damage);encounter.dead=encounter.hp<=0;broadcast(room,{type:'encounter_state',encounter,attackerId:client.id,damage});
    }
  });
  socket.on('close',()=>leave(client));socket.on('error',()=>leave(client));
});

const port=Number(process.env.PORT)||5173;
server.listen(port,'0.0.0.0',()=>console.log(`Forest co-op server: http://localhost:${port}`));
