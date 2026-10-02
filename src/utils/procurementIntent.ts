const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));
export interface ProcurementItem {
  productId?: string; name: string; unit: 'dona' | 'kg'; quantity: number; buyPrice: number;
}
export interface ProcurementIntent { id?: string; items: ProcurementItem[] }
export function validateProcurementItems(items: ProcurementItem[]) {
  if (!items.length || items.length > 500) throw Error('Savatda 1–500 ta mahsulot bo‘lishi kerak');
  for (const item of items) {
    if (!item.name.trim() || !['dona', 'kg'].includes(item.unit) || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.buyPrice) || item.buyPrice < 0 || (item.unit === 'dona' && !Number.isInteger(item.quantity)) ||
        Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 1e-6) throw Error('Nomi, miqdori yoki xarid narxi noto‘g‘ri');
  }
}
/** Persist intent before dispatch; an unknown outcome is retried with exactly the same ID/body. */
export function createProcurementIntent(storage: { read: () => Promise<ProcurementIntent | null>; write: (intent: ProcurementIntent) => Promise<void>; lock?: <T>(work:()=>Promise<T>)=>Promise<T> },
  newId: () => string, assertActive: () => void) {
  let current: ProcurementIntent = { items: [] };
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>) => {
    const locked = () => storage.lock ? storage.lock(work) : work();
    const result = tail.then(locked, locked); tail = result.catch(() => {}); return result;
  };
  return {
    load: () => serial(async () => {
      assertActive(); const saved = await storage.read(); assertActive();
      if (saved) { if (saved.items.length) validateProcurementItems(saved.items); current = saved; }
      return clone(current);
    }),
    saveDraft: (items: ProcurementItem[]) => serial(async () => {
      assertActive(); const latest = await storage.read(); assertActive();
      if (latest && JSON.stringify(latest) !== JSON.stringify(current)) throw Error('Savat boshqa oynada o‘zgardi; qayta oching');
      if (current.id) throw Error('Avval yuborilgan kirim tasdig‘ini tekshiring');
      if (items.length) validateProcurementItems(items);
      const next = { items: clone(items) }; await storage.write(next); assertActive(); current = next;
      return clone(current);
    }),
    confirm: (send: (id: string, items: ProcurementItem[]) => Promise<{ localId: string }>) => serial(async () => {
      assertActive(); const latest = await storage.read(); assertActive();
      if (latest) current = latest;
      validateProcurementItems(current.items);
      if (!current.id) {
        const next = { ...current, id: newId() }; await storage.write(next); assertActive(); current = next;
      }
      const sent = clone(current); const receipt = await send(sent.id!, sent.items); assertActive();
      if (!receipt?.localId) throw Error('Server kirimni tasdiqlamadi. Shu amal bilan qayta tekshiring');
      await storage.write({ items: [] }); assertActive(); current = { items: [] };
      return receipt;
    }),
  };
}
