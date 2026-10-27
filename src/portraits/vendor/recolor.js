/* Engine-neutral pixel helper. Inputs: unpremultiplied sRGB RGBA bytes, grayscale masks.
   Original alpha and pixel positions never change. See README.md for loading masks. */
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rgbToLab(rgb){let c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});const[r,g,b]=c,l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);return[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]}
function labToRgb([L,a,b]){const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;return[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(v=>{v=clamp(v,0,1);return 255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055)})}
const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function settings(template,palettes,skin='original',hair='original',eyes='original',clothing='original',hatColor='original'){
 const result={};
 if(skin!=='original'){const p=palettes.skin.find(x=>x.id===skin);if(!p)throw Error('Unknown skin palette');result.skin={target:p.color,contrast:.82,chroma:.25};result.lips={target:p.lips,contrast:.70,chroma:.35}}
 if(hair!=='original'){const p=palettes.hair.find(x=>x.id===hair);if(!p)throw Error('Unknown hair palette');result.hair={target:p.color,contrast:.85,chroma:.22};result.brows={target:p.brows,contrast:.80,chroma:.20}}
 if(eyes!=='original'){const p=palettes.eyes.find(x=>x.id===eyes);if(!p)throw Error('Unknown eye palette');result.iris={target:p.color,contrast:.80,chroma:.20}}
 if(clothing!=='original'){const p=palettes.clothing.find(x=>x.id===clothing);if(!p)throw Error('Unknown clothing palette');result.clothing={target:p.color,contrast:.90,chroma:.20}}
 if(hair!=='original'&&template.references.facial_hair){const p=palettes.hair.find(x=>x.id===hair);result.facial_hair={target:p.color,contrast:.85,chroma:.22}}
 if(hatColor!=='original'&&template.references.hat){const p=palettes.hats.find(x=>x.id===hatColor);if(!p)throw Error('Unknown hat palette');result.hat={target:p.color,contrast:.85,chroma:.2}}
 for(const role of Object.keys(result))result[role].reference=template.references[role];return result;
}
function recolorRGBA(source,masks,config){
 const out=new Uint8ClampedArray(source),pixels=source.length/4;
 for(const[role,mask]of Object.entries(masks)){
  const opt=config[role];if(!opt)continue;if(mask.length!==pixels)throw Error('Mask dimensions do not match source');
  const ref=rgbToLab(opt.reference),target=rgbToLab(hexRgb(opt.target)),cache=new Map();
  for(let i=0;i<pixels;i++){const k=i*4,w=mask[i]/255;if(!w||!source[k+3])continue;const r=source[k],g=source[k+1],b=source[k+2],key=(r<<16)|(g<<8)|b;let changed=cache.get(key);
   if(!changed){let lab=rgbToLab([r,g,b]);lab=[clamp(target[0]+(lab[0]-ref[0])*opt.contrast,.03,.98),target[1]+(lab[1]-ref[1])*opt.chroma,target[2]+(lab[2]-ref[2])*opt.chroma];changed=labToRgb(lab);cache.set(key,changed)}
   out[k]=clamp(Math.round(out[k]+(changed[0]-r)*w),0,255);out[k+1]=clamp(Math.round(out[k+1]+(changed[1]-g)*w),0,255);out[k+2]=clamp(Math.round(out[k+2]+(changed[2]-b)*w),0,255);
  }
 }
 return out;
}
function applyStyle(template,hairstyle='original'){
 if(hairstyle==='original')return template;
 const variant=template.hairstyles&&template.hairstyles[hairstyle];if(!variant)throw Error('Hairstyle unavailable for '+template.id);
 const out={...template,layers:{...template.layers},references:{...template.references,hair:variant.reference}};
 delete out.layers.hair_front;delete out.layers.hair_back;Object.assign(out.layers,variant.layers);
 out.draw_order=template.draw_order.filter(n=>!n.startsWith('hair_'));
 if(out.layers.hair_back)out.draw_order.unshift('hair_back');if(out.layers.hair_front)out.draw_order.push('hair_front');return out;
}
function applyOutfit(template,outfit='original'){
 if(outfit==='original')return template;
 const variant=template.outfits&&template.outfits[outfit];if(!variant)throw Error('Outfit unavailable for '+template.id);
 const out={...template,layers:{...template.layers},references:{...template.references,clothing:variant.reference}};
 for(const name of Object.keys(out.layers))if(name.startsWith('top_'))delete out.layers[name];Object.assign(out.layers,variant.layers);
 out.draw_order=template.draw_order.filter(n=>!n.startsWith('top_'));
 const neck=out.draw_order.indexOf('neck_shoulders');out.draw_order.splice(neck+1,0,'top_front');if(out.layers.top_back)out.draw_order.splice(neck,0,'top_back');return out;
}
function applyAccessories(template,eyewear='none',earrings='none'){
 const out={...template,layers:{...template.layers},draw_order:template.draw_order.filter(n=>!n.startsWith('accessory_')),optional:(template.optional||[]).filter(n=>!n.startsWith('accessory_'))};
 for(const n of Object.keys(out.layers))if(n.startsWith('accessory_'))delete out.layers[n];
 for(const[category,selection]of [['eyewear',eyewear],['earrings',earrings]]){
  if(selection==='none')continue;
  const variant=template.accessories&&template.accessories[category]&&template.accessories[category][selection];if(!variant)throw Error('Unknown '+category+': '+selection);
  Object.assign(out.layers,variant.layers);
 }
 if(out.layers.accessory_earrings)out.draw_order.splice(out.draw_order.indexOf('head')+1,0,'accessory_earrings');
 if(out.layers.accessory_eyewear){const front=out.draw_order.indexOf('hair_front');out.draw_order.splice(front<0?out.draw_order.length:front,0,'accessory_eyewear')}
 return out;
}
function applyExpression(template,expression='original'){
 if(expression==='original')return template;
 const variant=template.expressions&&template.expressions[expression];if(!variant)throw Error('Unknown expression: '+expression);
 return {...template,layers:{...template.layers,mouth:variant.layers.mouth},references:{...template.references,lips:variant.reference}};
}
function applyBrows(template,browStyle='original'){
 if(browStyle==='original')return template;
 const variant=template.brow_styles&&template.brow_styles[browStyle];if(!variant)throw Error('Unknown brow style: '+browStyle);
 return {...template,layers:{...template.layers,eyebrows:variant.layers.eyebrows},references:{...template.references,brows:variant.reference}};
}
function applyEyes(template,eyeShape='original'){
 if(eyeShape==='original')return template;
 const variant=template.eye_shapes&&template.eye_shapes[eyeShape];if(!variant)throw Error('Unknown eye shape: '+eyeShape);
 return {...template,layers:{...template.layers,eyes:variant.layers.eyes}};
}
function applyLashes(template,lashStyle='original',eyeShape='original'){
 if(lashStyle==='original')return template;
 if(!['none','natural','full'].includes(lashStyle))throw Error('Unknown lash style: '+lashStyle);
 const variant=template.lashes&&template.lashes[eyeShape];if(!variant)throw Error('Unknown lash eye shape: '+eyeShape);
 const out={...template,layers:{...template.layers,eyes:variant.base_eyes},draw_order:template.draw_order.filter(n=>n!=='eyelashes'&&!n.startsWith('lashes_'))};
 for(const n of Object.keys(out.layers))if(n==='eyelashes'||n.startsWith('lashes_'))delete out.layers[n];
 if(lashStyle!=='none'){Object.assign(out.layers,variant[lashStyle].layers);out.draw_order.splice(out.draw_order.indexOf('eyes')+1,0,'eyelashes')}
 return out;
}
function applyNose(template,noseShape='original'){
 if(noseShape==='original')return template;
 const variant=template.nose_shapes&&template.nose_shapes[noseShape];if(!variant)throw Error('Unknown nose shape: '+noseShape);
 return {...template,layers:{...template.layers,nose:variant.layers.nose}};
}
function applyFacialHair(template,style='none'){
 const out={...template,layers:{...template.layers},draw_order:template.draw_order.filter(n=>!n.startsWith('facial_hair_'))};
 for(const n of Object.keys(out.layers))if(n.startsWith('facial_hair_'))delete out.layers[n];
 if(style==='none')return out;
 const variant=template.facial_hair&&template.facial_hair[style];if(!variant)throw Error('Facial hair unavailable for '+template.id+': '+style);
 Object.assign(out.layers,variant.layers);out.draw_order.splice(out.draw_order.indexOf('nose'),0,...Object.keys(variant.layers));return out;
}
function applyHat(template,hat='none',hairstyle='original'){
 const out={...template,references:{...template.references},layers:{},draw_order:template.draw_order.filter(n=>!n.startsWith('hat_'))};
 for(const[name,layer]of Object.entries(template.layers)){if(name.startsWith('hat_'))continue;out.layers[name]={...layer};if(name.startsWith('hair_'))delete out.layers[name].opacity_mask}
 if(template._hat_original_hair)Object.assign(out.layers,template._hat_original_hair);
 if(hat==='none')return out;
 out._hat_original_hair=Object.fromEntries(Object.entries(out.layers).filter(([n])=>n.startsWith('hair_')));
 const variant=template.hats&&template.hats[hat];if(!variant)throw Error('Hat unavailable for '+template.id+': '+hat);
 Object.assign(out.layers,variant.layers);out.references.hat=variant.reference;
 const fitted=variant.hairstyles&&variant.hairstyles[hairstyle];if(!fitted)throw Error('Hairstyle unavailable under hat: '+hairstyle);Object.assign(out.layers,fitted.layers);
 if(variant.layers.hat_back)out.draw_order.splice(out.draw_order.indexOf('neck_shoulders'),0,'hat_back');out.draw_order.push('hat_front');return out;
}
function applyOpacityMask(source,mask){
 if(source.length!==mask.length*4)throw Error('Opacity mask dimensions do not match source');
 const out=new Uint8ClampedArray(source);for(let i=0;i<mask.length;i++)out[i*4+3]=Math.floor(source[i*4+3]*mask[i]/255+.5);return out;
}
export {settings,recolorRGBA,rgbToLab,labToRgb,applyStyle,applyOutfit,applyAccessories,applyExpression,applyBrows,applyEyes,applyLashes,applyNose,applyFacialHair,applyHat,applyOpacityMask};
