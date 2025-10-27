type CurrencyFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export const formatCurrency = (
  value: number,
  { minimumFractionDigits = 0, maximumFractionDigits = minimumFractionDigits }: CurrencyFormatOptions = {},
) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
