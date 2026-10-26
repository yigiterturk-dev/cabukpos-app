import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {foldTabs,openDeliveries,type TabEv,type TabEvent} from '@/lib/core/tab';
import {isDeliveryActive,courierSummary} from '@/lib/core/dispatch';
import {readyDeliveryEvents} from '@/lib/core/delivery';
import {kasaDb} from '@/lib/offline/db';
import {pruneTabEvents} from '@/lib/offline/tabs';
const at=Date.parse('2026-10-25T12:00:00+03:00');
function fixture(id:string,paid:string[],courier=true){
 const evs:TabEv[]=[{type:'open',kind:'paket',guests:0},
 ...['a','b'].map(lineId=>({type:'add' as const,lineId,productId:lineId,name:lineId,unitPrice:1000,vatRate:10 as const,qtyMilli:1000,options:[],note:null,stationId:null})),
 {type:'send',ticketId:'first',lineIds:['a'],stationId:null},{type:'send',ticketId:'second',lineIds:['b'],stationId:null},
 ...(courier?[{type:'courier' as const,staffId:'courier'}]:[]),
 {type:'paid',saleId:'sale',lines:paid.map(lineId=>({lineId,qtyMilli:1000,discount:0})),amount:paid.length*1000}];
 const rows=evs.map((ev,seq):TabEvent=>({id:`${id}-${seq}`,tabId:id,tableId:null,at:new Date(at+seq).toISOString(),staffId:'staff',approvedBy:null,seq:seq+1,ev}));
 return{rows,tab:foldTabs(rows).get(id)!};
}
test('hazır işlemi önceden ödenmiş ürünün mutfak biletini de hazırlar',()=>{
 const f=fixture('partial',['a']);
 assert.equal(f.tab.closed,false);
 assert.deepEqual(readyDeliveryEvents(f.tab,()=> 'unused').filter(e=>e.type==='kitchen').map(e=>e.ticketId).sort(),['first','second']);
});
test('tamamı ödenmiş atanmış paket hazırlanır ve kurye iş yükünde kalır',()=>{
 const f=fixture('paid',['a','b']);assert.equal(f.tab.closed,true);assert.equal(f.tab.remaining,0);
 assert.equal(isDeliveryActive(f.tab),true);
 assert.equal(courierSummary([f.tab],[{id:'courier',name:'Kurye'}],'2026-10-25',at)[0].active,1);
 assert.equal(readyDeliveryEvents(f.tab,()=> 'unused').filter(e=>e.type==='kitchen').length,2);
 assert.equal(openDeliveries(new Map([[f.tab.id,f.tab]]),at+25*3600000).length,1);
});
test('ödenmiş gel-al ve teslim edilmiş paket tekrar hazırlığa veya aktif işe açılmaz',()=>{
 const pickup=fixture('pickup',['a','b'],false).tab;
 const f=fixture('delivered',['a','b']);
 const delivered=foldTabs([...f.rows,{...f.rows[0],id:'done',seq:99,ev:{type:'delivered',method:'kart'}}]).get(f.tab.id)!;
 for(const tab of [pickup,delivered]){assert.equal(isDeliveryActive(tab),false);assert.deepEqual(readyDeliveryEvents(tab,()=> 'unused'),[]);}
});
test('yerel temizlik ödenmiş ama teslimi bekleyen paket geçmişini korur',async()=>{
 const d=kasaDb();await d.delete();await d.open();
 try{
  const pending=fixture('pending',['a','b']),pickup=fixture('pickup',['a','b'],false);
  await d.tabEvents.bulkPut([...pending.rows,...pickup.rows]);
  await pruneTabEvents(at+25*3600000);
  assert.equal(await d.tabEvents.where('tabId').equals('pending').count(),pending.rows.length);
  assert.equal(await d.tabEvents.where('tabId').equals('pickup').count(),0);
 }finally{await d.delete();}
});

test('ödenmiş pakette kurye kaldırılınca yeniden atama bekleyen iş kaybolmaz',()=>{
 const f=fixture('reassign',['a','b']);
 const tab=foldTabs([...f.rows,{...f.rows[0],id:'unassign',seq:99,ev:{type:'courier',staffId:null}}]).get(f.tab.id)!;
 assert.equal(tab.delivery.courierId,null);assert.equal(isDeliveryActive(tab),true);
 assert.equal(openDeliveries(new Map([[tab.id,tab]]),at+25*3600000).length,1);
 assert.equal(readyDeliveryEvents(tab,()=> 'unused').filter(e=>e.type==='kitchen').length,2);
});
