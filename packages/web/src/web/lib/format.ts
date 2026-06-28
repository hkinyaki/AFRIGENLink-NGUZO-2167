export function tzs(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}TZS ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

export function shortDate(d: number | string | Date): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
