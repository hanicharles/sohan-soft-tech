export function upiPaymentUri(
  payeeId: string,
  payeeName: string,
  amountPaise: number,
  reference: string,
) {
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(payeeId))
    throw new Error("Enter a valid institution UPI ID.");
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0)
    throw new Error("UPI requests need a positive outstanding amount.");
  const amount =
    Math.floor(amountPaise / 100) +
    "." +
    String(amountPaise % 100).padStart(2, "0");
  return (
    "upi://pay?" +
    new URLSearchParams({
      pa: payeeId,
      pn: payeeName.slice(0, 100),
      am: amount,
      cu: "INR",
      tn: reference.slice(0, 80),
      tr: reference.slice(0, 80),
    }).toString()
  );
}
