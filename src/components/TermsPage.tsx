import { ArrowLeft } from 'lucide-react';
import { Brand } from './Brand';
import { CommerceLanguage } from './CommerceLanguage';
import { useLanguage } from '../lib/i18n';
import './commerce.css';

export function TermsPage({ onHome }: { onHome: () => void }) {
  const { language } = useLanguage();
  const vi = language === 'vi';
  const tr = (en: string, vn: string) => vi ? vn : en;
  return <div className="commerce-page">
    <header className="commerce-header"><button className="commerce-brand" onClick={onHome} aria-label={tr('Eva Tarot home', 'Trang chủ Eva Tarot')}><Brand /></button><CommerceLanguage /></header>
    <main className="commerce-main commerce-terms">
      <button className="commerce-back" onClick={onHome}><ArrowLeft size={16} />{tr('Back to explore', 'Về trang khám phá')}</button>
      <div className="commerce-placeholder" role="note">
        <span className="commerce-eyebrow">{tr('Placeholder', 'Bản tạm')}</span>
        <h1>{tr('The owner still needs to write this page.', 'Chủ ứng dụng vẫn cần viết nội dung trang này.')}</h1>
        <p>{tr('This is not Eva Tarot’s official refund policy or terms of service. Do not treat it as legal advice. Replace every section below with the owner’s own text before relying on it.', 'Đây không phải chính sách hoàn tiền hay điều khoản dịch vụ chính thức của Eva Tarot. Đừng xem đây là tư vấn pháp lý. Hãy thay toàn bộ phần bên dưới bằng nội dung của chủ ứng dụng trước khi sử dụng.')}</p>
      </div>
      <section className="commerce-panel">
        <h2>{tr('What a payment is for', 'Khoản thanh toán dùng để làm gì')}</h2>
        <p>{tr('TODO(owner): Describe AI reply credits, human consultations, and voluntary donations in your own words. Credits are for completed online replies on the device that paid. A consultation is a separate booking with a person. A donation does not add credits or book a session.', 'TODO(chủ ứng dụng): Viết lại bằng lời của bạn về lượt trả lời AI, buổi tư vấn trực tiếp và khoản ủng hộ tùy tâm. Lượt AI dùng cho câu trả lời trực tuyến hoàn tất trên thiết bị đã thanh toán. Tư vấn là lịch hẹn với người thật. Ủng hộ không cộng lượt và không đặt lịch.')}</p>
      </section>
      <section className="commerce-panel">
        <h2>{tr('When a payment counts', 'Khi nào khoản thanh toán được tính')}</h2>
        <p>{tr('TODO(owner): Explain that a bank transfer is pending until you match the amount and the unique transfer memo. Say how long that usually takes.', 'TODO(chủ ứng dụng): Giải thích chuyển khoản vẫn ở trạng thái chờ cho đến khi bạn đối chiếu đúng số tiền và nội dung chuyển khoản riêng của đơn. Nêu thời gian thường mất bao lâu.')}</p>
      </section>
      <section className="commerce-panel">
        <h2>{tr('Refunds', 'Hoàn tiền')}</h2>
        <p>{tr('TODO(owner): Write the refund rules. This placeholder does not promise a refund, a deadline, or a method.', 'TODO(chủ ứng dụng): Viết quy tắc hoàn tiền. Bản tạm này không hứa hoàn tiền, thời hạn hay cách hoàn.')}</p>
      </section>
      <section className="commerce-panel">
        <h2>{tr('Changing or cancelling a consultation', 'Đổi hoặc hủy buổi tư vấn')}</h2>
        <p>{tr('TODO(owner): Write how someone asks to move or cancel a human consultation, and what happens to the payment.', 'TODO(chủ ứng dụng): Viết cách khách xin dời hoặc hủy buổi tư vấn trực tiếp, và khoản thanh toán được xử lý thế nào.')}</p>
      </section>
      <section className="commerce-panel">
        <h2>{tr('Contact', 'Liên hệ')}</h2>
        <p>{tr('TODO(owner): Add the support email or other contact you want customers to use for payment questions.', 'TODO(chủ ứng dụng): Thêm email hỗ trợ hoặc cách liên hệ bạn muốn khách dùng khi có câu hỏi về thanh toán.')}</p>
      </section>
      <footer className="commerce-footer"><p>{tr('Tarot offers a way to reflect. It cannot guarantee outcomes or tell you what someone else is thinking.', 'Tarot giúp bạn nhìn lại câu chuyện của mình, không bảo đảm kết quả hay đọc được suy nghĩ của người khác.')}</p></footer>
    </main>
  </div>;
}
