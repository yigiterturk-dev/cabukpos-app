// lib/data — sunucu veri katmanı (server-only). Tümü withTenant + eq(businessId) scope'lu.
// 2d'de store.tsx bu fonksiyonlara bağlanacak (ilk yükleme: loadBusinessState; mutasyonlar:
// optimistic UI + await mutator).

export { loadBusinessState } from "./load";
export { seedBusinessToDb, createBusinessProfile } from "./seed-db";
export {
  addService,
  updateService,
  deleteService,
  addStaff,
  updateStaff,
  deleteStaff,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  addAppointment,
  updateAppointmentStatus,
  setApproval,
  updateAppointment,
  deleteAppointment,
  addCampaign,
  toggleCampaign,
  deleteCampaign,
  sendCampaign,
  updateReminderSettings,
  changePlan,
  getCurrentPlan,
  updateBusinessProfile,
  addPayment,
  deletePayment,
  addExpense,
  deleteExpense,
} from "./mutations";
