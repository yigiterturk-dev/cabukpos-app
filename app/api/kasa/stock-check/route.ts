import {z} from "zod";
import {withTenant} from "@/db";
import {getDevice} from "@/lib/auth/kasa";
import {hit} from "@/lib/ratelimit";
import {saleExpiryProblem} from "@/lib/stock-expiry";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const input=z.object({lines:z.array(z.object({productId:z.uuid().nullable(),qtyMilli:z.number().int().positive().max(2147483647),options:z.array(z.object({id:z.uuid()})).max(50).optional()})).min(1).max(500)});
export async function POST(req:Request){
 const device=await getDevice();if(!device)return Response.json({error:"Cihaz eşlemesi bulunamadı."},{status:401,headers});
 if(req.headers.get("origin")!==new URL(process.env.APP_URL||req.url).origin)return Response.json({error:"Kaynak doğrulanamadı."},{status:403,headers});
 if(await hit(`stock-check:${device.id}`,1)>300)return Response.json({error:"Çok fazla stok kontrolü. Biraz sonra tekrar deneyin."},{status:429,headers});
 const body=input.safeParse(await req.json().catch(()=>null));if(!body.success)return Response.json({error:"Sepet bilgisi geçersiz."},{status:400,headers});
 const error=await withTenant(device.tenantId,tx=>saleExpiryProblem(tx,device.storeId,body.data.lines));
 return error?Response.json({error},{status:409,headers}):Response.json({ok:true},{headers});
}
