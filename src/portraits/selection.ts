import * as Engine from './vendor/recolor';
import type {Appearance, AppearanceInput, Catalog, Notice, ResolvedPortrait, Template, TemplateId} from './types';
export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
 templateId:'male_young_adult',hairstyle:'original',outfit:'original',expression:'original',browStyle:'original',
 eyeShape:'original',lashStyle:'original',noseShape:'original',facialHair:'none',hat:'none',eyewear:'none',earrings:'none',
 skin:'original',hair:'original',eyes:'original',clothing:'original',hatColor:'original',hairVisible:true,
});
const own=(record:object,key:string)=>Object.prototype.hasOwnProperty.call(record,key);
export class AppearanceError extends Error {
 constructor(message:string,readonly notices:Notice[]=[]){super(message);this.name='AppearanceError'}
}
function templateFor(catalog:Catalog,id:unknown):Template {
 const t=catalog.manifest.templates.find(t=>t.id===id);
 if(!t)throw new AppearanceError(`Unknown portrait template: ${String(id)}`);
 return t;
}
/** Normalize a saved or UI appearance. Unknown templates always fail. Other
 * unavailable choices fall back with explicit notices, or fail in strict mode. */
export function normalizeAppearance(catalog:Catalog,input:AppearanceInput,strict=false):{appearance:Appearance;notices:Notice[]} {
 const t=templateFor(catalog,input.templateId),a:Appearance={...DEFAULT_APPEARANCE};const notices:Notice[]=[];
 for(const k of Object.keys(a) as (keyof Appearance)[]){if(input[k]!==undefined)Object.assign(a,{[k]:input[k]})}
 const select=(field:keyof Appearance,allowed:string[],fallback:string)=>{
  const requested=a[field];if(typeof requested==='string'&&allowed.includes(requested))return;
  Object.assign(a,{[field]:fallback});notices.push({field,requested,applied:fallback,message:`${field} is unavailable for ${t.id}; using ${fallback}.`});
 };
 select('hairstyle',['original',...Object.keys(t.hairstyles)],'original');
 select('outfit',['original',...Object.keys(t.outfits)],'original');
 select('expression',['original',...Object.keys(t.expressions)],'original');
 select('browStyle',['original',...Object.keys(t.brow_styles)],'original');
 select('eyeShape',['original',...Object.keys(t.eye_shapes)],'original');
 select('lashStyle',own(t.lashes,a.eyeShape)?['original','none','natural','full']:['original'],'original');
 select('noseShape',['original',...Object.keys(t.nose_shapes)],'original');
 select('facialHair',['none',...Object.keys(t.facial_hair)],'none');
 select('eyewear',['none',...Object.keys(t.accessories.eyewear)],'none');
 select('earrings',['none',...Object.keys(t.accessories.earrings)],'none');
 const hats=Object.keys(t.hats).filter(h=>own(t.hats[h]!.hairstyles,a.hairstyle));
 select('hat',['none',...hats],'none');
 for(const [field,role]of [['skin','skin'],['hair','hair'],['eyes','eyes'],['clothing','clothing'],['hatColor','hats']] as const){select(field,['original',...catalog.palettes[role].map(p=>p.id)],'original')}
 if(typeof a.hairVisible!=='boolean'){const requested=a.hairVisible;a.hairVisible=true;notices.push({field:'hairVisible',requested,applied:true,message:'hairVisible must be a boolean; using true.'})}
 if(strict&&notices.length)throw new AppearanceError('Unsupported appearance choices',notices);
 return {appearance:a,notices};
}
export function resolvePortrait(catalog:Catalog,input:AppearanceInput,strict=false):ResolvedPortrait {
 const {appearance:a,notices}=normalizeAppearance(catalog,input,strict);
 // Always start from the original template; never accumulate edited selections.
 let t=templateFor(catalog,a.templateId);
 t=Engine.applyStyle(t,a.hairstyle);t=Engine.applyOutfit(t,a.outfit);
 t=Engine.applyAccessories(t,a.eyewear,a.earrings);t=Engine.applyExpression(t,a.expression);
 t=Engine.applyBrows(t,a.browStyle);t=Engine.applyEyes(t,a.eyeShape);t=Engine.applyLashes(t,a.lashStyle,a.eyeShape);
 t=Engine.applyNose(t,a.noseShape);t=Engine.applyFacialHair(t,a.facialHair);t=Engine.applyHat(t,a.hat,a.hairstyle);
 // No optional accessories are drawn unless applyAccessories selected them.
 t={...t,draw_order:t.draw_order.filter(n=>!t.optional.includes(n)&&(!n.startsWith('hair_')||a.hairVisible))};
 return {appearance:a,notices,template:t,colors:Engine.settings(t,catalog.palettes,a.skin,a.hair,a.eyes,a.clothing,a.hatColor)};
}
/** Lists only options supported by this template. Hat choices depend on hair. */
export function availableOptions(catalog:Catalog,templateId:TemplateId,hairstyle:string='original') {
 const t=templateFor(catalog,templateId);
 return {
  hairstyles:['original',...Object.keys(t.hairstyles)],outfits:['original',...Object.keys(t.outfits)],
  expressions:['original',...Object.keys(t.expressions)],brows:['original',...Object.keys(t.brow_styles)],
  eyeShapes:['original',...Object.keys(t.eye_shapes)],lashes:['original','none','natural','full'],
  noses:['original',...Object.keys(t.nose_shapes)],facialHair:['none',...Object.keys(t.facial_hair)],
  eyewear:['none',...Object.keys(t.accessories.eyewear)],earrings:['none',...Object.keys(t.accessories.earrings)],
  hats:['none',...Object.keys(t.hats).filter(h=>own(t.hats[h]!.hairstyles,hairstyle))],
 };
}
/** Save IDs only, never image paths or pixels. */
export function serializeAppearance(catalog:Catalog,input:AppearanceInput):string {
 const {appearance}=normalizeAppearance(catalog,input,true);
 return JSON.stringify({schemaVersion:1,assetRevision:catalog.manifest.revision,appearance});
}
export function deserializeAppearance(catalog:Catalog,json:string,strict=false){
 let value:unknown;try{value=JSON.parse(json)}catch{throw new AppearanceError('Invalid appearance JSON')}
 if(!value||typeof value!=='object')throw new AppearanceError('Appearance save must be an object');
 const save=value as {schemaVersion?:unknown;appearance?:unknown;assetRevision?:unknown};
 if(save.schemaVersion!==1)throw new AppearanceError('Unsupported appearance save version');
 if(!save.appearance||typeof save.appearance!=='object'||Array.isArray(save.appearance))throw new AppearanceError('Missing saved appearance');
 const normalized=normalizeAppearance(catalog,save.appearance as AppearanceInput,strict);
 return {...normalized,savedAssetRevision:save.assetRevision,revisionChanged:save.assetRevision!==catalog.manifest.revision};
}
