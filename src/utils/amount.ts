export function amountAfterOnePercentFee(amount: number): number {
  return amount - amount * 0.01;
}
