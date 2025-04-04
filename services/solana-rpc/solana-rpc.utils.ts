export function formatRawToHuman(amount: string, decimals: number): string {
  if (!amount) return "0";
  
  const bigAmount = BigInt(amount);
  if (bigAmount === BigInt(0)) return "0";
  
  // Convert to string and pad with leading zeros if needed
  let amountStr = bigAmount.toString();
  while (amountStr.length <= decimals) {
    amountStr = "0" + amountStr;
  }
  
  // Insert decimal point
  const integerPart = amountStr.slice(0, amountStr.length - decimals) || "0";
  const decimalPart = amountStr.slice(amountStr.length - decimals);
  
  // Trim trailing zeros in decimal part
  const trimmedDecimal = decimalPart.replace(/0+$/, "");
  
  // Return formatted amount
  return trimmedDecimal.length > 0
    ? `${integerPart}.${trimmedDecimal}`
    : integerPart;
}

export function formatHumanToRaw(amount: string, decimals: number): string {
  if (!amount || amount === "0") return "0";
  
  // Split the amount into integer and decimal parts
  const [integerPart, decimalPart = ""] = amount.split(".");
  
  // Pad the decimal part with zeros if needed
  let paddedDecimal = decimalPart;
  while (paddedDecimal.length < decimals) {
    paddedDecimal += "0";
  }
  
  // Truncate if longer than decimals
  paddedDecimal = paddedDecimal.slice(0, decimals);
  
  // Combine integer and decimal parts
  const rawAmount = integerPart + paddedDecimal;
  
  // Remove leading zeros
  return rawAmount.replace(/^0+/, "") || "0";
} 