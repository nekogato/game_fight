import posthog from 'posthog-js';

const token=import.meta.env.VITE_POSTHOG_TOKEN;
const host=import.meta.env.VITE_POSTHOG_HOST;
const enabled=Boolean(token)&&import.meta.env.PROD;
const ANONYMOUS_PLAYER_ID_KEY='forest-anonymous-player-id';

export function getAnonymousPlayerId(){
  try{
    let id=localStorage.getItem(ANONYMOUS_PLAYER_ID_KEY);
    if(!id){id=crypto.randomUUID();localStorage.setItem(ANONYMOUS_PLAYER_ID_KEY,id);}
    return id;
  }catch{
    return crypto.randomUUID();
  }
}

if(enabled){
  posthog.init(token,{
    api_host:host||'https://eu.i.posthog.com',
    defaults:'2026-05-30',
    autocapture:false,
    capture_pageview:false,
    capture_pageleave:false,
    disable_session_recording:true
  });
  posthog.identify(getAnonymousPlayerId());
}

export function trackGameEvent(event,properties={},options={}){
  if(!enabled)return;
  posthog.capture(event,{...properties,game_version:'1',environment:'production'},options);
}

export function analyticsEnabled(){return enabled;}
