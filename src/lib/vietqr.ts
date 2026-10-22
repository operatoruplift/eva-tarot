/** Exact payload decoded from the payment image supplied by Eva Tarot's owner. */
export const SOURCE_DONATION_QR = '00020101021138540010A00000072701240006970407011068864399990208QRIBFTTA53037045802VN8300840063047F8B';

export function qrChecksum(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function field(tag: string, value: string): string {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > 99) throw new Error('The bank-transfer detail is too long.');
  return `${tag}${String(bytes).padStart(2, '0')}${value}`;
}

/** Encodes only bank routing, amount and reference, never a legal name. */
export function buildVietQR({ bankBin, accountNumber, amountVnd, reference }: {
  bankBin: string; accountNumber: string; amountVnd?: number; reference?: string;
}): string {
  if (!/^\d{6}$/.test(bankBin) || !/^\d{6,19}$/.test(accountNumber)) throw new Error('The bank account details could not be read.');
  if (amountVnd !== undefined && (!Number.isSafeInteger(amountVnd) || amountVnd < 1 || amountVnd > 500_000_000)) throw new Error('Enter a valid whole amount in VND.');
  if (reference !== undefined && !/^[A-Za-z0-9 -]{1,25}$/.test(reference)) throw new Error('The transfer reference could not be read.');
  if (bankBin === '970407' && accountNumber === '6886439999' && amountVnd === undefined && !reference) return SOURCE_DONATION_QR;
  const recipient = field('00', bankBin) + field('01', accountNumber);
  const merchant = field('00', 'A000000727') + field('01', recipient) + field('02', 'QRIBFTTA');
  const payload = field('00', '01') + field('01', amountVnd !== undefined || reference ? '12' : '11')
    + field('38', merchant) + field('53', '704')
    + (amountVnd !== undefined ? field('54', String(amountVnd)) : '')
    + field('58', 'VN') + (reference ? field('62', field('08', reference)) : '') + '6304';
  return payload + qrChecksum(payload);
}
