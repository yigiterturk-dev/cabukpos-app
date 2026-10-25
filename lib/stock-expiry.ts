import {and,eq,gt,isNotNull} from "drizzle-orm";
import {schema,type Tx} from "@/db";
import {istToday} from "@/lib/core/report";
import {expiryProblem,type ExpiryLine,type ExpirySafety} from "@/lib/core/stock-expiry";
export async function loadExpirySafety(tx:Tx,storeId:string):Promise<ExpirySafety>{
 const lots=await tx.select({productId:schema.stockLots.productId,name:schema.products.name,expiresOn:schema.stockLots.expiresOn}).from(schema.stockLots).innerJoin(schema.products,eq(schema.products.id,schema.stockLots.productId)).where(and(eq(schema.stockLots.storeId,storeId),gt(schema.stockLots.remaining,0),isNotNull(schema.stockLots.expiresOn))).orderBy(schema.stockLots.id);
 const recipes=await tx.select({productId:schema.recipeItems.productId,optionId:schema.recipeItems.optionId,ingredientId:schema.recipeItems.ingredientId,qtyMilli:schema.recipeItems.qtyMilli}).from(schema.recipeItems).orderBy(schema.recipeItems.id);
 return {checkedDay:istToday(),lots:lots.map(l=>({...l,expiresOn:l.expiresOn!})),recipes};
}
export async function saleExpiryProblem(tx:Tx,storeId:string,lines:ExpiryLine[]){return expiryProblem(lines,await loadExpirySafety(tx,storeId));}
