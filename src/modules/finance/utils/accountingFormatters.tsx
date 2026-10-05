import React from 'react';

export function formatAccountingCurrency(
  val: number | string | null | undefined,
  currency: string = 'AED',
  defaultClass: string = 'font-mono'
) {
  const num = Number(val || 0);
  const formatted = Math.abs(num).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (num < -0.0001) {
    return (
      <span className="text-rose-600 font-bold font-mono">
        ({currency} {formatted})
      </span>
    );
  }
  return (
    <span className={defaultClass}>
      {currency} {formatted}
    </span>
  );
}
