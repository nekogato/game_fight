import posthog from 'posthog-js';

const token=import.meta.env.VITE_POSTHOG_TOKEN;
const directHost=import.meta.env.VITE_POSTHOG_HOST||'https://eu.i.posthog.com';
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
  const apiHost=import.meta.env.VITE_POSTHOG_USE_PROXY==='false'?directHost:`${window.location.origin}/forest-signal`;
  posthog.init(token,{
    api_host:apiHost,
    ui_host:'https://eu.posthog.com',
    defaults:'2026-05-30',
    autocapture:false,
    capture_pageview:false,
    capture_pageleave:false,
    disable_session_recording:true,
    disable_external_dependency_loading:true,
    disable_surveys:true,
    disable_product_tours:true,
    advanced_disable_flags:true
  });
  posthog.identify(getAnonymousPlayerId());
}

export function trackGameEvent(event,properties={},options={}){
  if(!enabled)return;
  posthog.capture(event,{...properties,game_version:'1',environment:'production'},options);
}

export function analyticsEnabled(){return enabled;}
