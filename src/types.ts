export type Person = {
  id: string;
  name: string; // initial or short name, e.g. "R"
};

export type BillEntry = {
  personId: string;
  amount: number; // integer rupiah — this person's own order subtotal
};

export type SurchargeMode = 'fromTotal' | 'fromPercent';

export type Bill = {
  id: string;
  name: string; // "Lunch", "Coffee", ...
  payerId: string; // who fronted the money
  entries: BillEntry[]; // only the people who ordered at this stop
  mode: SurchargeMode;
  total?: number; // mode 'fromTotal': actual amount paid
  servicePercent?: number; // mode 'fromPercent': applied to subtotal first
  taxPercent?: number; // mode 'fromPercent': applied to (subtotal + service)
};

export type AppState = {
  people: Person[];
  bills: Bill[];
};

/** A named, saved snapshot of a whole day's split (the history feature). */
export type SavedSession = {
  id: string;
  name: string;
  savedAt: number; // epoch ms
  state: AppState;
};
