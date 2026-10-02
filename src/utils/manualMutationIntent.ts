export type ManualIntent = { id: string; fingerprint: string };
type Storage = {
  read: (slot: string) => Promise<ManualIntent | null>;
  write: (slot: string, intent: ManualIntent | null) => Promise<void>;
  lock: <T>(slot: string, work: () => Promise<T>) => Promise<T>;
};

export function isDurableManualMutation(method: string | undefined, url: string | undefined): boolean {
  if (!method || ['get', 'head', 'options'].includes(method.toLowerCase())) return false;
  return /^\/(?:products(?:\/[^/]+(?:\/restock)?)?|debtors(?:\/[^/]+(?:\/adjust)?)?|subscriptions(?:\/activate|\/deactivate\/[^/]+)?|auth\/admins\/[^/]+)\/?$/.test(url ?? '');
}

function canonical(value: unknown): string {
  // Normalize exactly as JSON transport does (dates, undefined fields, etc.).
  const plain = JSON.parse(JSON.stringify(value ?? null));
  const sort = (item: any): any => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(plain));
}

/** Persist identity before dispatch, without persisting request bodies or credentials. */
export function createManualMutationRegistry(storage: Storage, newId: () => string,
  digest: (text: string) => Promise<string>, assertActive: () => void) {
  return {
    async claim(slot: string, body: unknown): Promise<ManualIntent> {
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      const text = canonical(data);
      // Password changes reuse the pending ID without saving a password hash.
      // The server's immutable receipt detects any changed secret payload.
      const fingerprint = /"(?:password|token|secret|blockCode)"\s*:/.test(text)
        ? 'credential-change' : await digest(text);
      assertActive();
      return storage.lock(slot, async () => {
        assertActive();
        const saved = await storage.read(slot);
        assertActive();
        if (saved) {
          if (!saved.id || !saved.fingerprint) throw Error('Tasdiqlanmagan amal saqlovi buzilgan; tekshirish kerak');
          if (saved.fingerprint !== fingerprint) throw Error('Avval tasdiqlanmagan amalni aynan oldingi ma’lumotlar bilan qayta tekshiring');
          return saved;
        }
        const intent = { id: newId(), fingerprint };
        await storage.write(slot, intent);
        assertActive();
        return intent;
      });
    },
    async acknowledge(slot: string, id: string) {
      assertActive();
      await storage.lock(slot, async () => {
        assertActive();
        const saved = await storage.read(slot);
        assertActive();
        if (saved?.id === id) await storage.write(slot, null);
        assertActive();
      });
    },
  };
}

export function isDefinitiveMutationRejection(status: number | undefined, body: any): boolean {
  return !!status && [400, 403, 404, 409, 422].includes(status) && body?.success === false
    && !['IDEMPOTENCY_CONFLICT', 'OPERATION_IN_PROGRESS', 'LEGACY_RECEIPT_RECONCILIATION_REQUIRED'].includes(body?.error?.code);
}
