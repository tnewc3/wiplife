import type {TemplateId, Hairstyle, Outfit, Expression, BrowStyle, EyeShape, LashStyle, NoseShape, FacialHair, Hat, Eyewear, Earrings, SkinColor, HairColor, EyeColor, ClothingColor, HatColor, AgeStage, Sex} from './ids';
export type {TemplateId, Hairstyle, Outfit, Expression, BrowStyle, EyeShape, LashStyle, NoseShape, FacialHair, Hat, Eyewear, Earrings, SkinColor, HairColor, EyeColor, ClothingColor, HatColor, AgeStage, Sex};
export interface Appearance {
  templateId: TemplateId;
  hairstyle: Hairstyle; outfit: Outfit; expression: Expression; browStyle: BrowStyle;
  eyeShape: EyeShape; lashStyle: LashStyle; noseShape: NoseShape; facialHair: FacialHair;
  hat: Hat; eyewear: Eyewear; earrings: Earrings;
  skin: SkinColor; hair: HairColor; eyes: EyeColor; clothing: ClothingColor; hatColor: HatColor;
  hairVisible: boolean;
}
export type AppearanceInput = Partial<Appearance> & Pick<Appearance, 'templateId'>;
export interface Layer { image: string; masks: Record<string,string>; opacity_mask?: string }
export interface Variant {name?: string; layers: Record<string,Layer>; reference?: number[]; hat_compatible?: boolean}
export interface HatVariant extends Variant {hairstyles: Record<string,Variant>}
export interface LashVariant {base_eyes: Layer; natural: Variant; full: Variant}
export interface Template {
 id: TemplateId; age: AgeStage; sex: Sex; label: string;
 draw_order: string[]; optional: string[]; layers: Record<string,Layer>; references: Record<string,number[]>;
 hairstyles: Record<string,Variant>; outfits: Record<string,Variant>;
 accessories: {eyewear: Record<string,Variant>; earrings: Record<string,Variant>};
 expressions: Record<string,Variant>; brow_styles: Record<string,Variant>; eye_shapes: Record<string,Variant>;
 lashes: Record<string,LashVariant>; nose_shapes: Record<string,Variant>;
 facial_hair: Record<string,Variant>; hats: Record<string,HatVariant>;
}
export interface Option {id:string; name:string}
export interface Manifest {
 revision:number; canvas:[number,number]; age_order:AgeStage[]; templates:Template[];
 hairstyles:Option[]; outfits:Option[]; expressions:Option[]; brow_styles:Option[]; eye_shapes:Option[];
 lash_styles:Option[]; nose_shapes:Option[]; facial_hair_styles:Option[]; hat_styles:Option[];
 accessory_options:{eyewear:Option[];earrings:Option[]};
}
export interface Palette extends Option {color:string; lips?:string; brows?:string}
export interface Palettes {skin:Palette[];hair:Palette[];eyes:Palette[];clothing:Palette[];hats:Palette[]}
export interface Catalog {manifest:Manifest; palettes:Palettes}
export interface Notice {field:keyof Appearance; requested:unknown; applied:unknown; message:string}
export interface ColorRule {target:string;reference:number[];contrast:number;chroma:number}
export type ColorConfig=Record<string,ColorRule>;
export interface ResolvedPortrait {appearance:Appearance; notices:Notice[]; template:Template; colors:ColorConfig}
