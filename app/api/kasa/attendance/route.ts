import {getDevice} from "@/lib/auth/kasa";
import {staffAttendance} from "@/lib/staff-attendance";
import {hit} from "@/lib/ratelimit";
import {z} from "zod";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const bodySchema=z.object({staffId:z.uuid(),pin:z.string().regex(/^\d{4,6}$/),direction:z.enum(["status","in","out"]),sessionId:z.uuid().optional(),requestId:z.uuid().optional()});
export async function POST(req:Request){
 const device=await getDevice();if(!device)return Response.json({error:"Önce bu cihazı işletmeye eşleyin."},{status:401,headers});
 if(req.headers.get("origin")!==new URL(process.env.APP_URL||req.url).origin)return Response.json({error:"Kaynak doğrulanamadı."},{status:403,headers});
 const parsed=bodySchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return Response.json({error:"Personel ve PIN bilgilerini kontrol edin."},{status:400,headers});
 if(await hit(`attendance-device:${device.id}`,1)>120||await hit(`attendance-pin:${device.tenantId}:${parsed.data.staffId}`,1)>10)return Response.json({error:"Çok fazla PIN denemesi. Bir dakika sonra tekrar deneyin."},{status:429,headers});
 try{return Response.json(await staffAttendance(device,parsed.data),{headers});}
 catch(e){return Response.json({error:e instanceof Error?e.message:"Giriş/çıkış kaydedilemedi."},{status:400,headers});}
}
