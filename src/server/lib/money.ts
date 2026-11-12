/** Totals for one vendor. Amounts are whole rupees. */
export function vendorTotals(
  totalAmount: number,
  payments: ReadonlyArray<{ amount: number; paidAt: Date | string | null; dueAt: Date | string | null }>,
) {
  let paid = 0;
  let scheduled = 0;
  for (const p of payments) {
    if (p.paidAt) paid += p.amount;
    else scheduled += p.amount;
  }
  const balance = Math.max(0, totalAmount - paid);
  return {
    paid,
    /** Instalments entered but not yet paid. */
    scheduled,
    balance,
    /** Owed but not yet put on any instalment. */
    unscheduled: Math.max(0, balance - scheduled),
    overpaid: Math.max(0, paid - totalAmount),
  };
}

/** "₹1,25,000" — Indian digit grouping. */
export function rupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}
