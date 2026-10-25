export const STAFF_PERMISSIONS={sale:"Satış ve tahsilat",shift:"Kasa vardiyası aç / kapat",refund:"İadeyi onayla",discount:"Adisyon indirimi",comp:"İkram",cancel:"Adisyon / paket iptali",void:"Mutfağa gönderilen ürünü iptal et",drawer:"Çekmeceyi aç",safeDrop:"Kasadan kasaya para aktar"} as const;
export type StaffPermission=keyof typeof STAFF_PERMISSIONS;
export type StaffPermissions=Partial<Record<StaffPermission,boolean>>;
type Person={role:string;active?:boolean;permissions?:StaffPermissions|null};
export function staffCan(person:Person|null|undefined,key:StaffPermission){
 if(!person||person.active===false)return false;
 const override=person.permissions?.[key];if(typeof override==="boolean")return override;
 return ["sale","shift","safeDrop"].includes(key)||person.role==="mudur";
}
export function permissionForTab(type:string,sentVoid=false):StaffPermission|null{
 return type==="void"?(sentVoid?"void":null):(["discount","comp","cancel"].includes(type)?type as StaffPermission:null);
}
