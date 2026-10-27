import {recolorRGBA,applyOpacityMask} from './vendor/recolor';
import {resolvePortrait} from './selection';
import type {AppearanceInput,Catalog,Manifest,Palettes,ResolvedPortrait} from './types';
export interface RenderOptions {size?:number;signal?:AbortSignal;strict?:boolean}
export interface RenderedPortrait extends ResolvedPortrait {canvas:HTMLCanvasElement}
export interface RendererOptions {assetBaseUrl:string;cacheBytes?:number}
type PixelAsset={data:Uint8ClampedArray;width:number;height:number};
type Cached={data:PixelAsset|Uint8Array;bytes:number};
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Portrait render aborted','AbortError')}
function baseURL(value:string){
 const base=typeof document==='undefined'?undefined:document.baseURI;
 const url=new URL(value,base);if(!url.pathname.endsWith('/'))url.pathname+='/';return url.href;
}
function assetURL(base:string,path:string){
 if(!path||path.startsWith('/')||path.includes('..')||path.includes('\\')||path.includes(':'))throw Error(`Invalid asset path: ${path}`);
 return new URL(path,base).href;
}
export async function loadCatalog(assetBaseUrl:string,signal?:AbortSignal):Promise<Catalog>{
 const base=baseURL(assetBaseUrl);
 const read=async(path:string)=>{const res=await fetch(assetURL(base,path),signal?{signal}:{});if(!res.ok)throw Error(`Cannot load ${path}: HTTP ${res.status}`);return res.json()};
 const [manifest,palettes]=await Promise.all([read('manifest.json'),read('palettes.json')]) as [Manifest,Palettes];
 if(!Array.isArray(manifest.templates)||manifest.canvas?.[0]!==1024||manifest.canvas?.[1]!==1024)throw Error('Unsupported portrait catalog');
 for(const role of ['skin','hair','eyes','clothing','hats'] as const){if(!Array.isArray(palettes[role]))throw Error(`Missing palette: ${role}`)}
 return {manifest,palettes};
}
/** Share one renderer between portraits. The retained decoded-pixel LRU defaults
 * to 64 MiB; render-local canvases and in-flight images are additional memory. */
export class PortraitRenderer {
 readonly catalog:Catalog;readonly assetBaseUrl:string;readonly cacheBytes:number;
 private cache=new Map<string,Cached>();private inFlight=new Map<string,Promise<PixelAsset|Uint8Array>>();
 private usedBytes=0;private generation=0;
 constructor(catalog:Catalog,options:RendererOptions){
  this.catalog=catalog;this.assetBaseUrl=baseURL(options.assetBaseUrl);this.cacheBytes=options.cacheBytes??64*1024*1024;
  if(!Number.isFinite(this.cacheBytes)||this.cacheBytes<0)throw Error('cacheBytes must be nonnegative');
 }
 clearCache(){this.generation++;this.cache.clear();this.inFlight.clear();this.usedBytes=0}
 get cacheStats(){return {entries:this.cache.size,bytes:this.usedBytes,limit:this.cacheBytes}}
 private async asset(path:string,mask:boolean):Promise<PixelAsset|Uint8Array>{
  const key=(mask?'mask:':'image:')+path,hit=this.cache.get(key);
  if(hit){this.cache.delete(key);this.cache.set(key,hit);return hit.data}
  const existing=this.inFlight.get(key);if(existing)return existing;
  const generation=this.generation;
  const request=(async()=>{
   const response=await fetch(assetURL(this.assetBaseUrl,path));if(!response.ok)throw Error(`Cannot load portrait asset ${path}: HTTP ${response.status}`);
   const bitmap=await createImageBitmap(await response.blob());let result:PixelAsset|Uint8Array;
   try{
    if(bitmap.width!==1024||bitmap.height!==1024)throw Error(`Wrong asset dimensions: ${path}`);
    const scratch=document.createElement('canvas');scratch.width=bitmap.width;scratch.height=bitmap.height;
    const ctx=scratch.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas 2D unavailable');
    ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,1024,1024);
    if(mask){const bytes=new Uint8Array(1024*1024);for(let i=0;i<bytes.length;i++)bytes[i]=pixels.data[i*4]!;result=bytes}
    else result={data:pixels.data,width:1024,height:1024};
   }finally{bitmap.close()}
   const bytes=result instanceof Uint8Array?result.byteLength:result.data.byteLength;
   if(generation===this.generation&&bytes<=this.cacheBytes){
    while(this.usedBytes+bytes>this.cacheBytes&&this.cache.size){const oldest=this.cache.keys().next().value!;this.usedBytes-=this.cache.get(oldest)!.bytes;this.cache.delete(oldest)}
    this.cache.set(key,{data:result,bytes});this.usedBytes+=bytes;
   }
   return result;
  })();
  this.inFlight.set(key,request);
  try{return await request}finally{if(this.inFlight.get(key)===request)this.inFlight.delete(key)}
 }
 async render(input:AppearanceInput,options:RenderOptions={}):Promise<RenderedPortrait>{
  checkAbort(options.signal);const size=options.size??1024;
  if(!Number.isInteger(size)||size<1||size>2048)throw Error('Portrait size must be an integer from 1 to 2048');
  const resolved=resolvePortrait(this.catalog,input,options.strict);const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D unavailable');
  const tile=document.createElement('canvas');tile.width=tile.height=1024;const tc=tile.getContext('2d')!;
  // Start every layer image and mask this portrait needs at once (P1): fetched one after another, a cold start pays a round trip for each of them.
  const wanted:Promise<unknown>[]=[];
  for(const name of resolved.template.draw_order){
   const layer=resolved.template.layers[name];if(!layer)continue;
   wanted.push(this.asset(layer.image,false));
   for(const [role,path]of Object.entries(layer.masks))if(resolved.colors[role])wanted.push(this.asset(path,true));
   if(layer.opacity_mask)wanted.push(this.asset(layer.opacity_mask,true));
  }
  void Promise.allSettled(wanted);
  for(const name of resolved.template.draw_order){
   checkAbort(options.signal);const layer=resolved.template.layers[name];if(!layer)throw Error(`Missing layer: ${name}`);
   const source=await this.asset(layer.image,false) as PixelAsset;checkAbort(options.signal);
   const masks:Record<string,Uint8Array>={};
   for(const [role,path]of Object.entries(layer.masks)){
    if(!resolved.colors[role])continue;masks[role]=await this.asset(path,true) as Uint8Array;checkAbort(options.signal);
   }
   let colored=recolorRGBA(source.data,masks,resolved.colors);
   if(layer.opacity_mask){const mask=await this.asset(layer.opacity_mask,true) as Uint8Array;checkAbort(options.signal);colored=applyOpacityMask(colored,mask)}
   tc.putImageData(new ImageData(new Uint8ClampedArray(colored),1024,1024),0,0);ctx.drawImage(tile,0,0);
   // Yield between layers so input/abort events can interrupt long recolors.
   await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  checkAbort(options.signal);
  if(size===1024)return {...resolved,canvas};
  const resized=document.createElement('canvas');resized.width=resized.height=size;const rc=resized.getContext('2d')!;
  rc.imageSmoothingEnabled=true;rc.imageSmoothingQuality='high';rc.drawImage(canvas,0,0,size,size);return {...resolved,canvas:resized};
 }
 async exportPNG(input:AppearanceInput,options:RenderOptions={}):Promise<Blob>{
  const {canvas}=await this.render(input,options);checkAbort(options.signal);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'));
  checkAbort(options.signal);return blob;
 }
}
