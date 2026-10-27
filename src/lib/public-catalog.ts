import type { CommerceCatalog, CommerceProduct, CommerceSettings } from './commerce';
import { SOURCE_DONATION_QR } from './vietqr.ts';

/** Owner-supplied bank details; this public QR has no amount or order reference. */
export const PUBLIC_DONATION_DETAILS: CommerceSettings = Object.freeze({
  bank_name: 'Techcombank', bank_bin: '970407', account_number: '6886439999',
  qr_payload: SOURCE_DONATION_QR,
  qr_image: '/payments/donation-qr.svg', donations_enabled: true,
});

/**
 * TODO(owner): Confirm the one-question price. The stored amount is 25000 VND.
 * It was transcribed from the supplied price sheet and looks truncated or unclear.
 * Do not guess a replacement. The owner must set the intended amount before
 * treating this package as final.
 */
export const ONE_QUESTION_PRICE_VND = 25000;
export const ONE_QUESTION_PRICE_TODO = 'TODO(owner): Confirm the one-question price. The stored amount is 25000 VND, transcribed from the supplied price sheet, and it looks truncated or unclear. Do not guess a replacement.';

// Reference prices transcribed from the supplied price sheet. The static copy
// stays inactive so an outage cannot charge anyone. Sale rows are served only
// by the payment service.
const rows = [
  ['one-question', 'One question', '1 câu hỏi', ONE_QUESTION_PRICE_VND, 1, 'questions', 'credits'],
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

function descriptions(kind: 'credits' | 'consultation', forSale: boolean): [string, string] {
  if (!forSale) {
    return kind === 'credits'
      ? ['Preview only. Credit purchases are not open.', 'Chỉ để tham khảo. Chưa mở bán lượt sử dụng.']
      : ['Reference price for a separate consultation. Booking is not open.', 'Giá tham khảo cho phiên tư vấn riêng. Chưa mở đặt lịch.'];
  }
  return kind === 'credits'
    ? ['Completed online AI replies for this device. Each follow-up reply uses one credit. Pay by bank transfer; credits are added after the transfer is verified.', 'Lượt trả lời AI trực tuyến cho thiết bị này. Mỗi câu trả lời tiếp theo dùng một lượt. Chuyển khoản; lượt được cộng sau khi giao dịch được xác nhận.']
    : ['A human consultation with Eva. Pay by bank transfer, then Eva confirms the booking. This is not an instant AI credit.', 'Buổi tư vấn trực tiếp với Eva. Chuyển khoản, rồi Eva xác nhận lịch. Đây không phải lượt AI tức thì.'];
}

export function catalogProducts(forSale: boolean): CommerceProduct[] {
  return rows.map(([id, title_en, title_vi, price_vnd, credits, category, kind], index) => {
    const [description_en, description_vi] = descriptions(kind, forSale);
    return {
      id, title_en, title_vi, price_vnd, credits, category, kind, description_en, description_vi,
      active: forSale, sort_order: (index + 1) * 10,
    };
  });
}

export const PUBLIC_REFERENCE_CATALOG: CommerceCatalog = {
  settings: PUBLIC_DONATION_DETAILS,
  products: catalogProducts(false),
};

/** Local checkout defaults. Production still reads these fields from Supabase. */
export const SALE_SETTINGS: CommerceSettings = Object.freeze({
  ...PUBLIC_DONATION_DETAILS,
  pricing_mode: 'free_trial',
  free_trial_credits: 1,
  donation_suggested_vnd: [25000, 50000, 100000],
  account_name: '',
  support_email: '',
  announcement_en: '',
  announcement_vi: '',
  hero_title_en: 'A little clarity, one conversation at a time.',
  hero_title_vi: 'Một cuộc trò chuyện, thêm một chút rõ ràng.',
  hero_description_en: 'Explore what is on your mind with tarot readings that speak to your real life.',
  hero_description_vi: 'Cùng những lá bài nhìn lại điều bạn đang băn khoăn, bằng lời giải dễ hiểu và gần gũi.',
});

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
