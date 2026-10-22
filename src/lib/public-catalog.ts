import type { CommerceCatalog, CommerceProduct, CommerceSettings } from './commerce';
import { SOURCE_DONATION_QR } from './vietqr.ts';

/** Owner-supplied bank details; this public QR has no amount or order reference. */
export const PUBLIC_DONATION_DETAILS: CommerceSettings = Object.freeze({
  bank_name: 'Techcombank', bank_bin: '970407', account_number: '6886439999',
  qr_payload: SOURCE_DONATION_QR,
  qr_image: '/payments/donation-qr.svg', donations_enabled: true,
});

// Reference prices transcribed from the supplied price sheet. These are never
// a checkout authority: every row stays inactive until served by commerce.
const rows = [
  ['one-question', 'One question', '1 câu hỏi', 25000, 1, 'questions', 'credits'],
  ['three-questions', 'Three questions', '3 câu hỏi', 60000, 3, 'questions', 'credits'],
  ['five-questions', 'Five questions', '5 câu hỏi', 95000, 5, 'questions', 'credits'],
  ['love-reading', 'Relationship consultation', 'Tình cảm', 70000, 0, 'love', 'consultation'],
  ['work-reading', 'Work or study consultation', 'Học tập – công việc', 70000, 0, 'work', 'consultation'],
  ['life-reading', 'Life or choices consultation', 'Cuộc sống và lựa chọn', 70000, 0, 'life', 'consultation'],
  ['one-month', 'One-month overview', 'Tổng quan 1 tháng', 100000, 0, 'packages', 'consultation'],
  ['three-months', 'Three-month overview', 'Tổng quan 3 tháng', 250000, 0, 'packages', 'consultation'],
  ['six-months', 'Six-month overview', 'Tổng quan 6 tháng', 450000, 0, 'packages', 'consultation'],
  ['mother-baby', 'Mother and baby consultation', 'Mẹ và bé', 150000, 0, 'other', 'consultation'],
  ['lenormand', 'Lenormand · three questions', 'Lenormand · 3 câu hỏi', 100000, 0, 'other', 'consultation'],
  ['astrology', 'Lifetime astrology consultation', 'Tử vi trọn đời', 600000, 0, 'other', 'consultation'],
] as const;
export const PUBLIC_REFERENCE_CATALOG: CommerceCatalog = {
  settings: PUBLIC_DONATION_DETAILS,
  products: rows.map(([id, title_en, title_vi, price_vnd, credits, category, kind], index) => ({
    id, title_en, title_vi, price_vnd, credits, category, kind, active: false, sort_order: (index + 1) * 10,
    description_en: kind === 'credits' ? 'Preview only. Credit purchases are not open.' : 'Reference price for a separate consultation. Booking is not open.',
    description_vi: kind === 'credits' ? 'Chỉ để tham khảo. Chưa mở bán lượt sử dụng.' : 'Giá tham khảo cho phiên tư vấn riêng. Chưa mở đặt lịch.',
  })),
};

/** A static price or cached catalog must never enable charging during an outage. */
export function canPurchaseProduct(product: CommerceProduct, settings: CommerceSettings, connected: boolean): boolean {
  if (!connected || !product.active || !['paid', 'free_trial', 'consultations'].includes(String(settings.pricing_mode))) return false;
  return product.kind === 'consultation' || (product.kind === 'credits' && settings.pricing_mode !== 'consultations');
}

/** A known server pause takes precedence over the public donation reference. */
export function publicDonationsAllowed(settings?: CommerceSettings): boolean {
  return settings?.donations_enabled !== false;
}

/** Only an explicit missing configuration may expose the original public QR.
 * A normal outage cannot safely infer a current recipient or donation policy. */
export function publicDonationFallbackAllowed(settings: CommerceSettings | undefined, configurationMissing: boolean, hasServerCatalog: boolean): boolean {
  return configurationMissing && !hasServerCatalog && publicDonationsAllowed(settings);
}
