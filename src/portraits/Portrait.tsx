'use client';
import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {AppearanceInput} from './types';
import type {PortraitRenderer,RenderedPortrait} from './renderer';
export interface PortraitProps {
 renderer:PortraitRenderer;appearance:AppearanceInput;size?:number;alt?:string;className?:string;style?:CSSProperties;
 onReady?:(result:RenderedPortrait)=>void;onError?:(error:Error)=>void;
}
/** Canvas swaps only after a complete render; cancelled older requests never
 * overwrite a newer appearance. Create/share the renderer outside this component. */
export function Portrait({renderer,appearance,size=256,alt='Character portrait',className,style,onReady,onError}:PortraitProps){
 const canvas=useRef<HTMLCanvasElement>(null);const callbacks=useRef({onReady,onError});callbacks.current={onReady,onError};
 const [busy,setBusy]=useState(true),[error,setError]=useState<string|null>(null);
 const key=JSON.stringify(appearance);
 useEffect(()=>{
  const controller=new AbortController();let active=true;setBusy(true);setError(null);
  void renderer.render(JSON.parse(key) as AppearanceInput,{size,signal:controller.signal}).then(result=>{
   if(!active||!canvas.current)return;const target=canvas.current;target.width=target.height=size;
   target.getContext('2d')!.drawImage(result.canvas,0,0);setBusy(false);callbacks.current.onReady?.(result);
  }).catch((reason:unknown)=>{
   if(!active)return;const error=reason instanceof Error?reason:new Error(String(reason));
   const target=canvas.current;target?.getContext('2d')?.clearRect(0,0,target.width,target.height);
   setBusy(false);setError(error.message);callbacks.current.onError?.(error);
  });
  return()=>{active=false;controller.abort()};
 },[renderer,key,size]);
 return <span className={className} style={{display:'inline-block',...style}} aria-busy={busy}>
  <canvas ref={canvas} role="img" aria-label={alt} style={{display:'block',width:size,height:size,maxWidth:'100%',objectFit:'contain'}}/>
  {error&&<span role="alert">Portrait unavailable: {error}</span>}
 </span>;
}
