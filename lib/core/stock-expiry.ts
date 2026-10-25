import {consumption,type RecipeItem,type Recipes} from "./recipe";
import {istToday} from "./report";
export type ExpirySafety={checkedDay:string;lots:{productId:string;name:string;expiresOn:string}[];recipes:RecipeItem[]};
export type ExpiryLine={productId:string|null;qtyMilli:number;options?:{id:string}[]};
export function expiryProblem(lines:ExpiryLine[],safety:ExpirySafety,day=istToday()):string|null{
 const byProduct:Recipes=new Map(),byOption:Recipes=new Map();
 for(const r of safety.recipes){const map=r.productId?byProduct:byOption,key=r.productId??r.optionId;if(key)map.set(key,[...(map.get(key)??[]),r]);}
 const used=new Set<string>();
 for(const l of lines){if(l.qtyMilli<=0)continue;if(l.productId&&!byProduct.has(l.productId))used.add(l.productId);for(const[id,qty]of consumption(l,byProduct,byOption))if(qty>0)used.add(id);}
 const blocked=safety.lots.filter(l=>l.expiresOn<day&&used.has(l.productId));
 if(!blocked.length)return null;
 return `SKT’si geçmiş stok: ${[...new Set(blocked.map(l=>l.name))].slice(0,5).join(", ")}. Satıştan önce bu partileri kullanımdan ayırıp imha kaydını tamamlayın.`;
}
