import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { useLanguage } from '../lib/i18n';
import { formatVnd, type CommerceCatalog } from '../lib/commerce';
import { availableCreditProducts } from '../lib/credit-ui';
import './credit-paywall.css';

export function CreditPaywall({ catalog, loading, unavailable, onClose, onPricing }: {
  catalog: CommerceCatalog | null;
  loading: boolean;
  unavailable: boolean;
  onClose: () => void;
  onPricing: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === 'vi';
  const products = availableCreditProducts(catalog);
  const title = vi ? 'Tiếp tục khi bạn sẵn sàng.' : 'Continue when you’re ready.';
  return <Modal title={title} onClose={onClose} className="credit-paywall">
    <div className="credit-paywall-art" aria-hidden="true"><span /><img src="/cards/the-star.jpg" alt="" /><Sparkles size={23} /></div>
    <span className="eyebrow">{vi ? 'THÊM MỘT GÓC NHÌN' : 'A LITTLE MORE PERSPECTIVE'}</span>
    <h2>{title}</h2>
    <p>{vi ? 'Câu hỏi và những lá bài vẫn ở trong cuộc trò chuyện này. Bạn có thể thêm lượt để cùng Eva tìm hiểu tiếp, hoặc quay lại sau.' : 'Your question and cards stay in this conversation. Add credits to explore it further with Eva, or come back later.'}</p>
    <ul className="credit-paywall-details">
      <li><Check size={17} /><span>{vi ? '1 câu trả lời hoàn tất = 1 lượt, kể cả câu hỏi tiếp theo.' : '1 completed reply = 1 credit, including follow-ups.'}</span></li>
      <li><Check size={17} /><span>{vi ? 'Số lá bài không làm tăng số lượt. Câu trả lời thất bại không bị tính lượt.' : 'The number of cards does not change the cost. Failed replies are not charged.'}</span></li>
      <li><Check size={17} /><span>{vi ? 'Chuyển khoản QR, Eva cộng lượt sau khi xác nhận đã nhận tiền.' : 'Pay by bank-transfer QR. Credits arrive after your payment is manually confirmed.'}</span></li>
    </ul>
    {!unavailable && products.length > 0 && <ul className="credit-paywall-packages" aria-label={vi ? 'Các gói lượt hiện tại' : 'Current credit packages'}>{products.map(product => <li key={product.id}><span>{vi ? product.title_vi : product.title_en}<small>{vi ? `${product.credits} lượt trả lời` : `${product.credits} ${product.credits === 1 ? 'reply' : 'replies'}`}</small></span><strong>{formatVnd(product.price_vnd, vi)}</strong></li>)}</ul>}
    {(loading || unavailable || !products.length) && <p className="credit-paywall-availability" role="status">{loading ? (vi ? 'Đang kiểm tra các gói hiện tại…' : 'Checking current packages…') : (vi ? 'Mở bảng giá để kiểm tra gói và trạng thái thanh toán mới nhất.' : 'Open pricing to check the latest packages and payment status.')}</p>}
    <a className="primary-button credit-paywall-primary" href="#pricing" onClick={event=>{event.currentTarget.closest('dialog')?.close();onPricing();}}>{vi ? 'Xem các gói & thanh toán' : 'View packages & payment'}<ArrowRight size={18} /></a>
    <button className="text-button credit-paywall-dismiss" type="button" onClick={onClose}>{vi ? 'Quay lại cuộc trò chuyện' : 'Back to my conversation'}</button>
    <p className="credit-paywall-footnote">{vi ? 'Eva chỉ trả lời tiếp khi bạn nhấn Thử lại hoặc gửi tin nhắn. Không tự động mua hay gửi lại câu hỏi.' : 'You choose when to retry or send a message. Nothing is purchased or sent automatically.'}</p>
  </Modal>;
}
