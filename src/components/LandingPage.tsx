import type { MouseEvent } from 'react';
import { ArrowDown, ArrowRight, BookOpen, CalendarDays, Check, ChevronDown, Globe2, Heart, MessageCircle, ShieldCheck, Smartphone, Sparkles, Sprout, Sun } from 'lucide-react';
import { Brand, Logo } from './Brand';
import { useLanguage } from '../lib/i18n';
import './landing.css';

export type LandingPageProps = {
  onStart: () => void;
  onPricing: () => void;
  onDonate: () => void;
  content?: {
    hero_title_en?: string;
    hero_title_vi?: string;
    hero_description_en?: string;
    hero_description_vi?: string;
    support_email?: string;
  };
};

const copy = {
  en: {
    nav: ['How it works', 'Your space', 'Questions'],
    start: 'Start a conversation',
    open: 'Open Eva',
    eyebrow: 'TAROT, IN YOUR OWN WORDS',
    title: 'A little clarity.',
    titleEm: 'A lot more you.',
    intro: 'For the things you keep turning over in your mind. Share your story, draw your cards, and find a next step that makes sense in your life.',
    explore: 'Take a little look around',
    note: 'AI-powered reflection · English & Tiếng Việt',
    preview: 'A peek inside Eva',
    sample: 'Sample conversation',
    prompt: 'Work has been a lot lately. I care about doing well, but I’m exhausted. Where do I start?',
    sampleName: 'Temperance · finding your balance',
    response: 'Temperance is about finding a pace you can keep. For you, that might mean asking which task really needs to be finished today, instead of treating everything as equally urgent.',
    sampleAction: 'A small next step',
    sampleActionText: '“I can finish one of these today. Which one should come first?”',
    sampleInput: 'What’s on your mind?',
    storyFirst: 'Your story comes first.',
    realLife: 'The cards, brought down to earth.',
    strip: ['Your context matters', 'All 78 Rider–Waite–Smith cards', 'A clear next step'],
    howEyebrow: 'A MOMENT TO MAKE SENSE OF THINGS',
    howTitle: 'Come as you are.\nStart where you are.',
    howIntro: 'You don’t need to know tarot. You don’t even need the perfect question.',
    steps: [
      { title: 'Tell Eva what’s happening.', text: 'A relationship that feels confusing. A decision at work. A feeling you can’t quite put into words. Write it the way you’d tell a friend.' },
      { title: 'Make a little room to reflect.', text: 'Shuffle and draw from the full deck. Choose a quick check-in or a deeper spread, then see the cards appear in your conversation.' },
      { title: 'Leave with something useful.', text: 'Understand what each card means, how it fits what you shared, what to be careful of, and what you could actually do next.' },
    ],
    meaningEyebrow: 'LESS MYSTERY. MORE MEANING.',
    meaningTitle: '“Okay, but what does\nthat mean for me?”',
    meaningIntro: 'That’s the question Eva is here for. Traditional card meanings are the starting point. Your words give the reading its context.',
    cardName: 'The Sun',
    cardDetail: 'Clarity · warmth · seeing what’s here',
    meaningParts: ['The meaning, in plain words', 'What could help you', 'The difficult side to watch for', 'Advice that fits your situation', 'One clear direction to try'],
    grounded: 'A reading helps you consider possibilities. It can’t know another person’s thoughts or promise what will happen.',
    spaceEyebrow: 'YOUR OWN LITTLE CORNER',
    spaceTitle: 'More than a one-off reading.',
    spaceIntro: 'A place to return to, notice what changes, and keep the things that matter to you.',
    spaceFeatures: [
      { title: 'Keep the conversation going', text: 'Ask a follow-up, add something you forgot, or say “that doesn’t fit.” The conversation can build on what you’ve shared.' },
      { title: 'Find your past moments', text: 'Revisit saved conversations and use the calendar to keep notes, look back at a day, or write something for a future date.' },
      { title: 'A calmer space on your phone', text: 'A light, simple app you can add to your home screen. English and Vietnamese are fully supported.' },
    ],
    storage: 'Conversations save in this browser. Export a backup to keep another copy or move to a new device. Your first visit on a new domain has its own browser storage.',
    pricingEyebrow: 'A LITTLE ROOM FOR YOUR QUESTIONS',
    pricingTitle: 'Choose what\nyou want to explore.',
    pricingText: 'Browse the reading options and current prices before you choose. Payment details and the status of your request are explained along the way.',
    pricingButton: 'Explore readings & prices',
    donationTitle: 'Want to show Eva a little love?',
    donationText: 'An optional contribution helps support the project. It’s always your choice.',
    donationButton: 'Support Eva',
    faqEyebrow: 'A FEW THINGS YOU MIGHT WONDER',
    faqTitle: 'Make yourself at home.',
    faqs: [
      { q: 'Do I need to know anything about tarot?', a: 'No. Start with what’s on your mind. Eva explains each card in everyday language and connects it to the situation you describe. You can always ask for a simpler explanation or a practical example.' },
      { q: 'Is Eva an AI reader or a human reader?', a: 'Eva’s chat uses AI. It interprets the drawn cards using traditional Rider–Waite–Smith meanings and the context you share. AI can get things wrong; tell Eva when something doesn’t fit, and use your own judgment about any advice.' },
      { q: 'Can the cards tell me exactly what will happen?', a: 'No reading can guarantee a future event or reveal someone else’s private thoughts. Eva uses tarot as a way to reflect on your situation, consider different possibilities, and think through your choices.' },
      { q: 'Where do my conversations save?', a: 'Your reading history and personal notes save in your browser on this device. Clearing site data, using a different browser, or visiting a different domain can mean that history isn’t visible there. Use Export all my data in settings to keep a backup, and Import a backup to restore it.' },
      { q: 'Can I use Eva like an app?', a: 'Yes. Open Eva on your phone and choose Add to home screen in settings or your browser menu. Online AI readings need an internet connection. The card reference library and saved content may be available offline after they have loaded.' },
      { q: 'How do payments and donations work?', a: 'Open the pricing page to see the current reading catalog, payment instructions, and confirmation process. Donations are optional support for this project. Sending a bank transfer is not, by itself, confirmation that a paid service has been activated.' },
    ],
    closingEyebrow: 'YOU DON’T HAVE TO HAVE IT ALL FIGURED OUT',
    closingTitle: 'Just start with\nwhat’s on your mind.',
    closingText: 'There’s room for your questions here.',
    footerTag: 'A softer space for a fresh perspective.',
    privacy: 'Privacy',
    privacyText: 'Only share what you feel comfortable sharing. When you choose the online reader, your current question, drawn cards, and relevant conversation context are sent to the server and AI provider to generate a reply. Local browser data is separate from server processing. Customer and payment information you submit is used to manage your request. This page does not intentionally collect your reading text for analytics.',
    terms: 'Using Eva',
    termsText: 'Eva is an AI reflection tool. Readings can be mistaken and do not replace professional medical, mental health, legal, or financial advice. You decide what to take from a reading. Review the current prices and service details before paying. Donations are voluntary support for the project and are not advertised as tax-deductible charitable gifts.',
    backTop: 'Back to the beginning',
  },
  vi: {
    nav: ['Cách sử dụng', 'Góc của bạn', 'Thắc mắc'],
    start: 'Bắt đầu trò chuyện',
    open: 'Mở Eva',
    eyebrow: 'TAROT, TỪ CÂU CHUYỆN CỦA BẠN',
    title: 'Hiểu mình hơn.',
    titleEm: 'Nhẹ lòng một chút.',
    intro: 'Có chuyện cứ nghĩ mãi chưa biết gỡ từ đâu? Kể Eva nghe, rút vài lá bài, rồi cùng tìm một bước tiếp theo phù hợp với cuộc sống của bạn.',
    explore: 'Khám phá Eva một chút',
    note: 'Chiêm nghiệm cùng AI · Tiếng Việt & English',
    preview: 'Một góc nhỏ trong Eva',
    sample: 'Hội thoại minh họa',
    prompt: 'Dạo này công việc nhiều quá. Mình muốn làm cho tốt nhưng mệt thật sự. Mình nên bắt đầu từ đâu?',
    sampleName: 'Temperance · tìm lại nhịp phù hợp',
    response: 'Temperance nói về một nhịp làm việc mà bạn có thể duy trì. Với chuyện bạn kể, có thể bắt đầu bằng việc hỏi việc nào thật sự cần xong hôm nay, thay vì coi mọi việc đều gấp như nhau.',
    sampleAction: 'Thử một bước nhỏ',
    sampleActionText: '“Hôm nay em làm xong được một trong hai việc này. Mình ưu tiên việc nào trước ạ?”',
    sampleInput: 'Bạn đang nghĩ điều gì?',
    storyFirst: 'Bắt đầu từ câu chuyện của bạn.',
    realLife: 'Giải bài sao cho gần với đời thường.',
    strip: ['Lắng nghe điều bạn chia sẻ', 'Đủ 78 lá Rider–Waite–Smith', 'Có bước tiếp theo rõ ràng'],
    howEyebrow: 'DÀNH MỘT CHÚT THỜI GIAN CHO MÌNH',
    howTitle: 'Bạn cứ là bạn.\nBắt đầu từ chuyện hôm nay.',
    howIntro: 'Không cần biết về tarot. Cũng không cần nghĩ ra một câu hỏi thật hay.',
    steps: [
      { title: 'Kể Eva nghe chuyện của bạn.', text: 'Một mối quan hệ chưa rõ ràng. Một quyết định trong công việc. Hay cảm giác chưa biết gọi tên. Cứ viết như đang kể với một người bạn.' },
      { title: 'Chậm lại một chút, rồi rút bài.', text: 'Xáo và rút từ bộ bài đầy đủ. Bạn có thể xem nhanh hoặc chọn trải bài sâu hơn. Các lá bài sẽ xuất hiện ngay trong cuộc trò chuyện.' },
      { title: 'Mang theo điều có thể áp dụng.', text: 'Hiểu từng lá nói gì, liên quan thế nào đến chuyện bạn kể, điều gì cần lưu ý và bạn có thể làm gì tiếp theo.' },
    ],
    meaningEyebrow: 'GIẢI THÍCH RÕ, GẦN VỚI CUỘC SỐNG',
    meaningTitle: '“Vậy với chuyện của mình,\nlá này nghĩa là sao?”',
    meaningIntro: 'Đó là điều Eva muốn giúp bạn hiểu. Nghĩa truyền thống của lá bài là điểm bắt đầu. Câu chuyện bạn chia sẻ giúp lời giải gần với bạn hơn.',
    cardName: 'The Sun · Mặt Trời',
    cardDetail: 'Rõ ràng · ấm áp · nhìn điều đang có',
    meaningParts: ['Ý nghĩa bằng lời dễ hiểu', 'Điều có thể giúp bạn', 'Mặt khó và điều cần lưu ý', 'Lời khuyên đúng với hoàn cảnh', 'Một hướng đi cụ thể để thử'],
    grounded: 'Lá bài gợi cách nhìn để bạn cân nhắc. Lá bài không đọc được suy nghĩ của người khác hay đảm bảo chuyện tương lai.',
    spaceEyebrow: 'MỘT GÓC NHỎ CỦA RIÊNG BẠN',
    spaceTitle: 'Có thể quay lại, kể tiếp.',
    spaceIntro: 'Để nhìn lại điều đã thay đổi và giữ những điều bạn thấy có ý nghĩa.',
    spaceFeatures: [
      { title: 'Cứ hỏi tiếp nếu chưa rõ', text: 'Hỏi thêm, bổ sung chuyện còn thiếu hoặc nói “chỗ này chưa đúng với mình”. Cuộc trò chuyện có thể tiếp nối từ những gì bạn đã chia sẻ.' },
      { title: 'Tìm lại những ngày đã qua', text: 'Mở lại hội thoại đã lưu, xem lịch và ghi chú cho một ngày cũ hoặc viết điều muốn nhắc mình vào một ngày sắp tới.' },
      { title: 'Dùng trên điện thoại thật nhẹ nhàng', text: 'Giao diện sáng, đơn giản, có thể thêm vào màn hình chính. Hỗ trợ đầy đủ tiếng Việt và tiếng Anh.' },
    ],
    storage: 'Hội thoại được lưu trong trình duyệt này. Bạn nên xuất bản sao lưu để giữ thêm một bản hoặc chuyển thiết bị. Khi mở tên miền mới lần đầu, dữ liệu trình duyệt được lưu riêng.',
    pricingEyebrow: 'DÀNH CHỖ CHO NHỮNG CÂU HỎI CỦA BẠN',
    pricingTitle: 'Chọn điều bạn\nmuốn tìm hiểu.',
    pricingText: 'Xem các lựa chọn và giá hiện tại trước khi quyết định. Hướng dẫn thanh toán và trạng thái yêu cầu được giải thích trong từng bước.',
    pricingButton: 'Xem dịch vụ & bảng giá',
    donationTitle: 'Muốn gửi Eva một chút yêu thương?',
    donationText: 'Một khoản đóng góp tự nguyện giúp duy trì dự án. Bạn luôn là người quyết định.',
    donationButton: 'Ủng hộ Eva',
    faqEyebrow: 'CÓ THỂ BẠN ĐANG THẮC MẮC',
    faqTitle: 'Cứ tìm hiểu từ từ nhé.',
    faqs: [
      { q: 'Mình chưa biết gì về tarot thì dùng được không?', a: 'Được chứ. Cứ bắt đầu bằng chuyện bạn đang nghĩ. Eva giải thích từng lá bằng lời đời thường và liên hệ với hoàn cảnh bạn kể. Bạn có thể hỏi lại để được giải thích đơn giản hơn hoặc xin một ví dụ cụ thể.' },
      { q: 'Eva là AI hay người giải bài?', a: 'Trò chuyện trong Eva sử dụng AI, dựa trên nghĩa truyền thống của bộ Rider–Waite–Smith và câu chuyện bạn chia sẻ. AI có thể hiểu sai. Nếu điều gì chưa phù hợp, bạn cứ nói lại và tự cân nhắc trước khi làm theo lời khuyên.' },
      { q: 'Lá bài có nói chính xác chuyện gì sẽ xảy ra không?', a: 'Không có lời giải nào đảm bảo một chuyện tương lai hoặc biết chắc suy nghĩ riêng của người khác. Eva dùng tarot để giúp bạn nhìn lại hoàn cảnh, cân nhắc các khả năng và suy nghĩ về lựa chọn của mình.' },
      { q: 'Hội thoại của mình được lưu ở đâu?', a: 'Lịch sử xem bài và ghi chú được lưu trong trình duyệt trên thiết bị này. Nếu xóa dữ liệu trang, đổi trình duyệt hoặc đổi tên miền, bạn có thể không thấy lịch sử cũ ở đó. Vào cài đặt, chọn Xuất toàn bộ dữ liệu để giữ bản sao và Nhập bản sao lưu để khôi phục.' },
      { q: 'Có thể dùng Eva như ứng dụng không?', a: 'Có. Mở Eva trên điện thoại rồi chọn Thêm vào màn hình chính trong cài đặt hoặc trình đơn trình duyệt. Giải bài bằng AI trực tuyến cần kết nối internet. Thư viện lá bài và nội dung đã lưu có thể xem ngoại tuyến sau khi đã tải.' },
      { q: 'Thanh toán và ủng hộ như thế nào?', a: 'Mở trang bảng giá để xem các dịch vụ hiện có, hướng dẫn thanh toán và quy trình xác nhận. Ủng hộ dự án là hoàn toàn tự nguyện. Việc chuyển khoản chưa đồng nghĩa với việc một dịch vụ trả phí đã được kích hoạt.' },
    ],
    closingEyebrow: 'KHÔNG CẦN PHẢI NGHĨ THÔNG MỌI CHUYỆN NGAY',
    closingTitle: 'Cứ bắt đầu từ\nđiều bạn đang nghĩ.',
    closingText: 'Ở đây có chỗ cho câu chuyện của bạn.',
    footerTag: 'Một góc dịu dàng để nhìn mọi chuyện rõ hơn.',
    privacy: 'Quyền riêng tư',
    privacyText: 'Chỉ chia sẻ những gì bạn thấy thoải mái. Khi chọn giải bài trực tuyến, câu hỏi, các lá đã rút và ngữ cảnh hội thoại liên quan được gửi đến máy chủ và nhà cung cấp AI để tạo câu trả lời. Dữ liệu lưu trong trình duyệt tách biệt với việc xử lý trên máy chủ. Thông tin khách hàng và thanh toán bạn gửi được dùng để quản lý yêu cầu. Trang này không chủ ý thu thập nội dung giải bài để làm số liệu phân tích.',
    terms: 'Sử dụng Eva',
    termsText: 'Eva là công cụ chiêm nghiệm sử dụng AI. Lời giải có thể sai và không thay thế tư vấn chuyên môn về y tế, sức khỏe tinh thần, pháp lý hay tài chính. Bạn tự quyết định điều muốn đón nhận từ lời giải. Xem giá và chi tiết dịch vụ hiện tại trước khi thanh toán. Khoản ủng hộ là đóng góp tự nguyện cho dự án, không được quảng cáo là quyên góp từ thiện được khấu trừ thuế.',
    backTop: 'Về đầu trang',
  },
} as const;

export function LandingPage({ onStart, onPricing, onDonate, content }: LandingPageProps) {
  const { language, setLanguage } = useLanguage();
  const c = copy[language === 'vi' ? 'vi' : 'en'];
  const customTitle = (language === 'vi' ? content?.hero_title_vi : content?.hero_title_en)?.trim();
  const description = (language === 'vi' ? content?.hero_description_vi : content?.hero_description_en)?.trim() || c.intro;
  const email = content?.support_email?.trim();
  const supportEmail = email && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : null;
  const scrollTo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    if (id === 'eva-landing-main') target?.focus({ preventScroll: true });
  };
  const stepIcons = [MessageCircle, Sparkles, Sprout];
  const spaceIcons = [MessageCircle, CalendarDays, Smartphone];

  return <div className={`eva-landing${language === 'vi' ? ' eva-landing--vi' : ''}`} lang={language === 'vi' ? 'vi' : 'en'}>
    <a className="landing-skip" href="#eva-landing-main" onClick={scrollTo('eva-landing-main')}>{language === 'vi' ? 'Đến nội dung chính' : 'Skip to content'}</a>
    <header className="landing-header" id="eva-landing-top">
      <a className="landing-brand-link" href="#eva-landing-top" onClick={scrollTo('eva-landing-top')} aria-label="Eva Tarot"><Brand/></a>
      <nav className="landing-nav" aria-label={language === 'vi' ? 'Điều hướng trang' : 'Page navigation'}>
        {['eva-how-it-works', 'eva-your-space', 'eva-questions'].map((id, i) => <a key={id} href={`#${id}`} onClick={scrollTo(id)}>{c.nav[i]}</a>)}
      </nav>
      <div className="landing-header-actions">
        <button type="button" className="landing-language" aria-label={language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'} onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}><Globe2 size={15} aria-hidden="true"/><span lang="en" className={language !== 'vi' ? 'is-current' : ''}>EN</span><span className="landing-language-divider" aria-hidden="true">/</span><span lang="vi" className={language === 'vi' ? 'is-current' : ''}>VI</span></button>
        <button type="button" className="landing-button landing-button--header" onClick={onStart}>{c.open}<ArrowRight size={16} aria-hidden="true"/></button>
      </div>
    </header>

    <main id="eva-landing-main" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow"><span aria-hidden="true">✧</span>{c.eyebrow}</span>
          <h1 id="landing-title">{customTitle || <>{c.title}<br/><em>{c.titleEm}</em></>}</h1>
          <p className="landing-hero-intro">{description}</p>
          <div className="landing-hero-actions"><button type="button" className="landing-button" onClick={onStart}>{c.start}<ArrowRight size={19} aria-hidden="true"/></button><a href="#eva-how-it-works" onClick={scrollTo('eva-how-it-works')} className="landing-explore">{c.explore}<ArrowDown size={15} aria-hidden="true"/></a></div>
          <p className="landing-hero-note"><span className="landing-status-dot" aria-hidden="true"/>{c.note}</p>
        </div>
        <div className="landing-hero-art" aria-label={c.preview}>
          <div className="landing-orbit landing-orbit--outer" aria-hidden="true"/><div className="landing-orbit landing-orbit--inner" aria-hidden="true"/><div className="landing-sun-disc" aria-hidden="true"/>
          <span className="landing-art-spark landing-art-spark--one" aria-hidden="true">✧</span><span className="landing-art-spark landing-art-spark--two" aria-hidden="true">✦</span>
          <div className="landing-story-note"><Heart size={16} aria-hidden="true"/>{c.storyFirst}</div>
          <div className="landing-chat-preview">
            <div className="landing-preview-top"><span className="landing-preview-brand"><Logo size={30}/><span>eva<span>tarot</span></span></span><span className="landing-sample-label">{c.sample}</span></div>
            <p className="landing-preview-user">{c.prompt}</p>
            <div className="landing-preview-cards" aria-label={language === 'vi' ? 'Các lá bài minh họa: The Star, Temperance, The Sun' : 'Sample cards: The Star, Temperance, The Sun'}>
              <img src="/cards/the-star.jpg" alt={language === 'vi' ? 'Lá The Star' : 'The Star card'} width="92" height="158"/>
              <img src="/cards/temperance.jpg" alt={language === 'vi' ? 'Lá Temperance' : 'Temperance card'} width="92" height="158"/>
              <img src="/cards/the-sun.jpg" alt={language === 'vi' ? 'Lá The Sun' : 'The Sun card'} width="92" height="158"/>
            </div>
            <div className="landing-preview-answer"><span className="landing-preview-author"><Logo size={20}/>{c.sampleName}</span><p>{c.response}</p><div className="landing-preview-action"><Sprout size={15} aria-hidden="true"/><div><strong>{c.sampleAction}</strong><span>{c.sampleActionText}</span></div></div></div>
            <button type="button" className="landing-preview-input" onClick={onStart}><span>{c.sampleInput}</span><span className="landing-preview-send"><ArrowRight size={16} aria-hidden="true"/></span></button>
          </div>
          <div className="landing-real-life-note"><Sun size={19} aria-hidden="true"/>{c.realLife}</div>
        </div>
      </section>

      <div className="landing-values" aria-label={language === 'vi' ? 'Điều Eva mang lại' : 'What guides Eva'}>{c.strip.map((item, i) => <span key={item}>{i === 0 ? <Heart size={16} aria-hidden="true"/> : i === 1 ? <BookOpen size={16} aria-hidden="true"/> : <Sprout size={17} aria-hidden="true"/>}{item}</span>)}</div>

      <section className="landing-section landing-how" id="eva-how-it-works" aria-labelledby="landing-how-title">
        <div className="landing-section-intro"><span className="landing-eyebrow">{c.howEyebrow}</span><h2 id="landing-how-title">{c.howTitle}</h2><p>{c.howIntro}</p></div>
        <div className="landing-steps">{c.steps.map((step, i) => { const Icon = stepIcons[i]; return <article className="landing-step" key={step.title}><div className="landing-step-top"><span className="landing-step-number">0{i + 1}</span><Icon size={25} strokeWidth={1.4} aria-hidden="true"/></div><h3>{step.title}</h3><p>{step.text}</p></article>; })}</div>
      </section>

      <section className="landing-section landing-meaning" aria-labelledby="landing-meaning-title">
        <div className="landing-meaning-art"><div className="landing-meaning-halo" aria-hidden="true"/><div className="landing-meaning-ring" aria-hidden="true"/><span className="landing-meaning-spark" aria-hidden="true">✧</span><figure className="landing-sun-card"><img src="/cards/the-sun.jpg" alt={language === 'vi' ? 'Minh họa lá The Sun trong bộ Rider–Waite–Smith' : 'The Sun illustration from the Rider–Waite–Smith deck'} width="220" height="378" loading="lazy"/><figcaption><span>{c.cardName}</span><small>{c.cardDetail}</small></figcaption></figure><div className="landing-mini-lotus" aria-hidden="true"><Logo size={48}/></div></div>
        <div className="landing-meaning-copy"><span className="landing-eyebrow">{c.meaningEyebrow}</span><h2 id="landing-meaning-title">{c.meaningTitle}</h2><p>{c.meaningIntro}</p><ul className="landing-meaning-list">{c.meaningParts.map((part, i) => <li key={part}><span>0{i + 1}</span>{part}<Check size={15} aria-hidden="true"/></li>)}</ul><p className="landing-grounded-note"><Sprout size={18} aria-hidden="true"/>{c.grounded}</p></div>
      </section>

      <section className="landing-section landing-space" id="eva-your-space" aria-labelledby="landing-space-title"><div className="landing-section-intro"><span className="landing-eyebrow">{c.spaceEyebrow}</span><h2 id="landing-space-title">{c.spaceTitle}</h2><p>{c.spaceIntro}</p></div><div className="landing-space-features">{c.spaceFeatures.map((feature, i) => {const Icon = spaceIcons[i]; return <article key={feature.title}><span className={`landing-feature-icon landing-feature-icon--${i}`}><Icon size={25} strokeWidth={1.5} aria-hidden="true"/></span><h3>{feature.title}</h3><p>{feature.text}</p></article>;})}</div><p className="landing-storage-note"><ShieldCheck size={19} aria-hidden="true"/>{c.storage}</p></section>

      <section className="landing-section landing-pricing" aria-labelledby="landing-pricing-title"><div><span className="landing-eyebrow">{c.pricingEyebrow}</span><h2 id="landing-pricing-title">{c.pricingTitle}</h2></div><div className="landing-pricing-copy"><p>{c.pricingText}</p><button type="button" className="landing-button" onClick={onPricing}>{c.pricingButton}<ArrowRight size={18} aria-hidden="true"/></button></div></section>
      <aside className="landing-donation"><span className="landing-donation-icon"><Heart size={25} strokeWidth={1.5} aria-hidden="true"/></span><div><h3>{c.donationTitle}</h3><p>{c.donationText}</p></div><button type="button" onClick={onDonate}>{c.donationButton}<ArrowRight size={16} aria-hidden="true"/></button></aside>

      <section className="landing-section landing-faq" id="eva-questions" aria-labelledby="landing-faq-title"><div className="landing-faq-heading"><span className="landing-eyebrow">{c.faqEyebrow}</span><h2 id="landing-faq-title">{c.faqTitle}</h2><Logo size={100}/></div><div className="landing-faq-items">{c.faqs.map(faq => <details key={faq.q}><summary>{faq.q}<ChevronDown size={18} aria-hidden="true"/></summary><p>{faq.a}</p></details>)}</div></section>

      <section className="landing-closing" aria-labelledby="landing-closing-title"><div className="landing-closing-orbit" aria-hidden="true"/><Logo size={70}/><span className="landing-eyebrow">{c.closingEyebrow}</span><h2 id="landing-closing-title">{c.closingTitle}</h2><p>{c.closingText}</p><button type="button" className="landing-button" onClick={onStart}>{c.start}<ArrowRight size={19} aria-hidden="true"/></button></section>
    </main>

    <footer className="landing-footer"><div className="landing-footer-top"><div><Brand/><p>{c.footerTag}</p></div><a href="#eva-landing-top" onClick={scrollTo('eva-landing-top')}>{c.backTop}<ArrowRight size={15} aria-hidden="true"/></a></div><div className="landing-policies"><details><summary>{c.privacy}<ChevronDown size={15} aria-hidden="true"/></summary><p>{c.privacyText}</p></details><details><summary>{c.terms}<ChevronDown size={15} aria-hidden="true"/></summary><p>{c.termsText}</p></details></div><div className="landing-footer-contact">{supportEmail && <a href={`mailto:${supportEmail}`}>{language === 'vi' ? 'Liên hệ Eva' : 'Get in touch'}<ArrowRight size={14} aria-hidden="true"/></a>}</div><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Eva Tarot</span><span>evatarot.xyz</span><span>English · Tiếng Việt</span></div></footer>
  </div>;
}
