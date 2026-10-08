import { cards } from './tarot.ts';
import { tarotVi } from './tarot-vi.ts';

export type CardGuidance = Readonly<{
  meaning: string;
  good: string;
  challenge: string;
  advice: string;
  direction: string;
}>;
type Sides = readonly [good: string, challenge: string, advice: string, direction: string];
type BilingualSides = { en: Sides; vi: Sides };

// Original practical reflections on Rider–Waite–Smith imagery. A difficult side
// is a tension to consider, not a reversed card or an assertion about the future.
// Historical imagery reference: Waite, The Pictorial Key to the Tarot, Parts II–III.
// https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_3
const guidance: Record<number, BilingualSides> = {
  0: { // The Fool
    en: ['Curiosity can open a path that an old routine has hidden.', 'Excitement may make you overlook the cliff: limits, preparation, or consequences.', 'Welcome a beginning while checking what would make the first step safe.', 'Try one low-stakes version of your idea and decide what you need to learn from it.'],
    vi: ['Sự tò mò có thể mở lối mà thói quen cũ đã che khuất.', 'Hào hứng có thể khiến bạn quên nhìn vách đá: giới hạn, chuẩn bị hoặc hệ quả.', 'Đón khởi đầu mới và kiểm tra điều giúp bước đầu được an toàn.', 'Thử ý tưởng ở quy mô ít rủi ro, rồi xác định điều bạn cần học từ lần thử đó.'],
  },
  1: { // The Magician
    en: ['Your existing skills and resources can turn an intention into something tangible.', 'Scattered effort or polished promises can replace the work itself.', 'Choose a clear aim and use what is already on your table.', 'List three resources you have, then use one to complete a small task today.'],
    vi: ['Kỹ năng và nguồn lực đang có giúp bạn biến ý định thành điều cụ thể.', 'Nỗ lực phân tán hoặc lời hứa đẹp có thể thay thế việc thực sự bắt tay làm.', 'Chọn mục tiêu rõ ràng và dùng những gì đã ở trên bàn của bạn.', 'Liệt kê ba nguồn lực sẵn có, rồi dùng một nguồn để hoàn thành việc nhỏ hôm nay.'],
  },
  2: { // The High Priestess
    en: ['Quiet attention can reveal feelings and details that haste misses.', 'Silence may become avoidance, or intuition may be mistaken for evidence.', 'Listen inwardly without deciding that every impression is a fact.', 'Write down your hunch, the facts you know, and one question that could clarify the gap.'],
    vi: ['Sự chú tâm yên lặng giúp bạn nhận ra cảm xúc và chi tiết bị vội vàng bỏ sót.', 'Im lặng có thể thành né tránh, hoặc trực giác bị nhầm với bằng chứng.', 'Lắng nghe bên trong nhưng đừng xem mọi cảm nhận là sự thật.', 'Ghi linh cảm, những điều biết chắc và một câu hỏi giúp làm rõ khoảng trống.'],
  },
  3: { // The Empress
    en: ['Care, creativity, and a nourishing environment give growth room to happen.', 'Giving too much or expecting constant productivity can drain the very source of care.', 'Include your own needs in what you nurture.', 'Choose one neglected need and give it a practical resource: food, time, space, or help.'],
    vi: ['Chăm sóc, sáng tạo và môi trường nuôi dưỡng tạo chỗ cho sự phát triển.', 'Cho đi quá nhiều hoặc đòi mình luôn tạo ra kết quả có thể làm cạn nguồn chăm sóc.', 'Bao gồm nhu cầu của bản thân trong những điều bạn nuôi dưỡng.', 'Chọn một nhu cầu bị bỏ quên và dành cho nó thức ăn, thời gian, không gian hoặc sự giúp đỡ.'],
  },
  4: { // The Emperor
    en: ['Clear responsibilities and boundaries can create dependable stability.', 'Too much control can turn helpful structure into rigidity.', 'Build a framework that supports people instead of controlling every detail.', 'Set one clear boundary or routine, and choose a time to review whether it helps.'],
    vi: ['Trách nhiệm và ranh giới rõ ràng có thể tạo sự ổn định đáng tin.', 'Kiểm soát quá mức có thể biến cấu trúc hữu ích thành cứng nhắc.', 'Xây khuôn khổ nâng đỡ con người thay vì kiểm soát từng chi tiết.', 'Đặt một ranh giới hoặc nếp sinh hoạt rõ ràng, rồi hẹn lúc xem lại hiệu quả.'],
  },
  5: { // The Hierophant
    en: ['A trusted teacher or shared practice can offer useful knowledge and belonging.', 'Following a rule only because it is familiar can silence your own values.', 'Learn from a tradition while keeping permission to question it.', 'Ask a knowledgeable person one specific question, then compare the answer with your values.'],
    vi: ['Người hướng dẫn đáng tin hoặc thực hành chung có thể đem lại kiến thức và sự gắn kết.', 'Làm theo luật chỉ vì quen thuộc có thể khiến giá trị của bạn bị lấn át.', 'Học từ truyền thống và vẫn cho phép mình đặt câu hỏi.', 'Hỏi người có kiến thức một câu cụ thể, rồi đối chiếu câu trả lời với giá trị của bạn.'],
  },
  6: { // The Lovers
    en: ['Honest connection and choices aligned with your values can strengthen trust.', 'Attraction or a wish to please may obscure a genuine mismatch.', 'Look for mutual willingness, not just a compelling ideal.', 'Name one non-negotiable value and discuss how both people or options would respect it.'],
    vi: ['Kết nối chân thành và lựa chọn hợp giá trị có thể củng cố niềm tin.', 'Sức hút hoặc mong muốn làm vừa lòng có thể che một điểm không phù hợp.', 'Tìm sự tự nguyện từ cả hai phía, thay vì chỉ nhìn một lý tưởng hấp dẫn.', 'Nêu một giá trị không thể đánh đổi và trao đổi cách mỗi bên hoặc lựa chọn sẽ tôn trọng nó.'],
  },
  7: { // The Chariot
    en: ['A chosen direction can bring competing impulses into useful focus.', 'Pushing ahead at any cost can turn determination into strain or tunnel vision.', 'Steer deliberately and adjust when the road gives new information.', 'Pick one priority for this week and remove one competing commitment from its path.'],
    vi: ['Hướng đi được chọn rõ có thể đưa những thôi thúc khác nhau về cùng mục tiêu.', 'Tiến bằng mọi giá dễ biến quyết tâm thành căng thẳng hoặc tầm nhìn hẹp.', 'Chủ động điều hướng và điều chỉnh khi có thông tin mới trên đường.', 'Chọn một ưu tiên trong tuần và gỡ bớt một cam kết đang tranh chỗ với nó.'],
  },
  8: { // Strength
    en: ['Patient courage can help you meet a strong feeling without being ruled by it.', 'Suppressing emotion or enduring too much may be mistaken for strength.', 'Combine compassion with a firm limit; gentleness does not require self-abandonment.', 'Before a difficult exchange, name your feeling and rehearse one calm boundary sentence.'],
    vi: ['Can đảm cùng kiên nhẫn giúp bạn đón cảm xúc mạnh mà không bị nó dẫn dắt.', 'Kìm nén cảm xúc hoặc chịu đựng quá nhiều dễ bị nhầm là mạnh mẽ.', 'Kết hợp lòng trắc ẩn với giới hạn vững; dịu dàng không đòi bỏ quên bản thân.', 'Trước cuộc trao đổi khó, gọi tên cảm xúc và tập một câu nêu ranh giới bình tĩnh.'],
  },
  9: { // The Hermit
    en: ['Reflection and experience can illuminate the next manageable step.', 'Useful solitude can slip into isolation or endless analysis.', 'Take space to hear yourself while keeping a route back to trusted people.', 'Set aside ten quiet minutes, write one insight, and choose one person to share it with.'],
    vi: ['Chiêm nghiệm và kinh nghiệm có thể soi sáng bước tiếp theo vừa sức.', 'Khoảng riêng hữu ích có thể thành cô lập hoặc phân tích mãi không thôi.', 'Dành chỗ lắng nghe mình và vẫn giữ đường kết nối với người đáng tin.', 'Dành mười phút yên tĩnh, ghi một điều nhận ra và chọn một người để chia sẻ.'],
  },
  10: { // Wheel of Fortune
    en: ['Recognizing cycles can help you adapt when circumstances change.', 'Trying to control every turn, or surrendering all agency to luck, can leave you stuck.', 'Separate changing circumstances from the choices still available to you.', 'Make two lists: what is changing, and what you can influence this week. Act on one item in the second.'],
    vi: ['Nhận ra chu kỳ giúp bạn thích nghi khi hoàn cảnh thay đổi.', 'Cố kiểm soát mọi vòng quay hoặc phó mặc hết cho may rủi đều có thể khiến bạn mắc kẹt.', 'Phân biệt hoàn cảnh đang đổi với những lựa chọn vẫn thuộc về mình.', 'Lập hai danh sách: điều đang đổi và điều bạn có thể tác động tuần này. Làm một việc ở danh sách thứ hai.'],
  },
  11: { // Justice
    en: ['Fair consideration of evidence can support a clear, accountable choice.', 'Self-judgment or a rigid idea of fairness can ignore context and human needs.', 'Apply the same reasonable standard to yourself and to others.', 'Write the relevant facts, your responsibility, and one fair corrective action.'],
    vi: ['Cân nhắc bằng chứng công bằng giúp lựa chọn rõ ràng và có trách nhiệm.', 'Tự phán xét hoặc quan niệm công bằng cứng nhắc có thể bỏ qua bối cảnh và nhu cầu con người.', 'Áp dụng cùng một chuẩn mực hợp lý cho mình và người khác.', 'Ghi những sự thật liên quan, phần trách nhiệm của bạn và một hành động sửa đổi công bằng.'],
  },
  12: { // The Hanged Man
    en: ['A deliberate pause can reveal an option hidden by urgency.', 'Waiting can become indefinite sacrifice or a way to postpone a necessary decision.', 'Try a different perspective and put a boundary around the pause.', 'Reframe the problem from another viewpoint, then set a date to review your decision.'],
    vi: ['Tạm dừng có chủ ý có thể mở ra lựa chọn bị sự khẩn trương che khuất.', 'Chờ đợi có thể thành hy sinh vô hạn hoặc trì hoãn quyết định cần thiết.', 'Thử góc nhìn khác và đặt giới hạn cho khoảng dừng.', 'Diễn đạt lại vấn đề từ góc nhìn khác, rồi đặt ngày xem xét quyết định.'],
  },
  13: { // Death
    en: ['Accepting an ending can free time and attention for what comes next.', 'Grief or fear of change can make a familiar but exhausted pattern hard to release.', 'Let an ending be real without rushing yourself past its emotional cost.', 'Name one thing that has ended and one supportive action that would help you close that chapter.'],
    vi: ['Chấp nhận kết thúc có thể giải phóng thời gian và sự chú ý cho chặng tiếp theo.', 'Đau buồn hoặc sợ thay đổi khiến khuôn mẫu quen nhưng cạn sức khó được buông bỏ.', 'Thừa nhận kết thúc mà không ép mình vượt qua cái giá cảm xúc quá nhanh.', 'Gọi tên một điều đã kết thúc và một việc nâng đỡ giúp bạn khép lại chương ấy.'],
  },
  14: { // Temperance
    en: ['Small, measured adjustments can bring competing needs into a sustainable rhythm.', 'Seeking perfect balance or endless compromise can prevent a needed change.', 'Test a workable mixture instead of swinging between extremes.', 'Adjust one part of your routine for a week and observe whether your energy becomes steadier.'],
    vi: ['Điều chỉnh nhỏ, vừa phải giúp các nhu cầu khác nhau cùng tồn tại trong nhịp bền vững.', 'Tìm cân bằng hoàn hảo hoặc thỏa hiệp mãi có thể cản thay đổi cần thiết.', 'Thử sự kết hợp dùng được thay vì dao động giữa hai cực.', 'Điều chỉnh một phần nếp sống trong một tuần và xem năng lượng có ổn định hơn không.'],
  },
  15: { // The Devil
    en: ['Naming an attachment can make previously hidden choices easier to see.', 'Shame, pressure, or a rewarding habit may keep a costly pattern in place.', 'Look honestly at the pattern without using it as a label for your worth.', 'Identify one trigger and arrange one small interruption or source of support before it recurs.'],
    vi: ['Gọi tên sự ràng buộc giúp những lựa chọn từng bị che khuất dễ được nhìn thấy.', 'Xấu hổ, áp lực hoặc thói quen có phần thưởng có thể giữ một khuôn mẫu gây hao tổn.', 'Nhìn thẳng vào khuôn mẫu mà không dùng nó để phán xét giá trị bản thân.', 'Nhận diện một tác nhân khởi phát và chuẩn bị một cách ngắt nhịp hoặc nguồn hỗ trợ trước khi nó lặp lại.'],
  },
  16: { // The Tower
    en: ['A challenged assumption can reveal what needs a more honest foundation.', 'Disruption may leave you overwhelmed or tempted to rebuild too quickly.', 'Stabilize what is immediate before drawing a sweeping conclusion.', 'Name the most urgent practical need, contact one source of help, and postpone a nonessential decision.'],
    vi: ['Giả định bị thử thách có thể làm rõ điều cần một nền tảng trung thực hơn.', 'Xáo trộn có thể khiến bạn choáng ngợp hoặc muốn xây lại quá vội.', 'Ổn định điều trước mắt rồi mới rút kết luận lớn.', 'Xác định nhu cầu thực tế cấp thiết nhất, tìm một nguồn hỗ trợ và hoãn một quyết định chưa cần thiết.'],
  },
  17: { // The Star
    en: ['Gentle replenishment can restore openness and a sense of possibility.', 'Hope may become passive waiting, or pressure to feel better before you do.', 'Give hope a small daily practice without demanding immediate recovery.', 'Choose one replenishing activity and make a realistic place for it in the next few days.'],
    vi: ['Sự bồi đắp nhẹ nhàng có thể khôi phục cởi mở và cảm giác còn khả năng phía trước.', 'Hy vọng có thể thành chờ thụ động hoặc áp lực phải thấy khá hơn ngay.', 'Gắn hy vọng với thực hành nhỏ hằng ngày mà không đòi hồi phục tức thì.', 'Chọn một hoạt động tiếp sức và dành cho nó khoảng thời gian thực tế trong vài ngày tới.'],
  },
  18: { // The Moon
    en: ['Attention to dreams and feelings can reveal a concern worth exploring.', 'Uncertainty can encourage projection, fear, or treating a feeling as proof.', 'Allow uncertainty while checking assumptions against observable information.', 'Write one fact and one fear separately, then ask a neutral question to clarify what is missing.'],
    vi: ['Chú ý giấc mơ và cảm xúc có thể chỉ ra nỗi bận tâm đáng tìm hiểu.', 'Điều chưa rõ dễ khơi sự phóng chiếu, sợ hãi hoặc việc xem cảm giác là bằng chứng.', 'Cho phép sự bất định tồn tại và đối chiếu giả định với điều quan sát được.', 'Viết riêng một sự thật và một nỗi sợ, rồi đặt câu hỏi trung tính để làm rõ điều còn thiếu.'],
  },
  19: { // The Sun
    en: ['Clarity and enjoyment can renew confidence in what is already working.', 'Forced optimism may gloss over a real problem or another person’s limits.', 'Welcome genuine pleasure while remaining honest about what still needs care.', 'Repeat one activity that makes you feel like yourself and acknowledge one concrete success.'],
    vi: ['Sáng tỏ và niềm vui có thể tiếp sức cho sự tự tin vào điều đang tốt đẹp.', 'Lạc quan gượng ép có thể bỏ qua vấn đề thật hoặc giới hạn của người khác.', 'Đón niềm vui chân thật và vẫn thành thật về điều còn cần chăm sóc.', 'Lặp lại một hoạt động giúp bạn là chính mình và ghi nhận một thành quả cụ thể.'],
  },
  20: { // Judgement
    en: ['Honest review can turn experience into a more intentional new chapter.', 'Harsh self-judgment or waiting for a perfect calling can block a useful response.', 'Take responsibility for a lesson without reducing yourself to a past mistake.', 'Write one lesson from the past and one different action you will take when it matters again.'],
    vi: ['Nhìn lại trung thực có thể biến trải nghiệm thành một chương mới có chủ đích.', 'Phán xét bản thân khắt khe hoặc chờ tiếng gọi hoàn hảo có thể cản hành động hữu ích.', 'Nhận trách nhiệm với bài học mà không thu mình thành lỗi lầm đã qua.', 'Ghi một bài học từ quá khứ và một hành động khác bạn sẽ chọn khi gặp lại tình huống ấy.'],
  },
  21: { // The World
    en: ['Recognizing completion helps you integrate effort and carry its lessons forward.', 'Chasing the next goal immediately can hide accomplishment or leave loose ends.', 'Mark what is complete before deciding what a new cycle needs.', 'Close one unfinished administrative detail and record three things this chapter taught you.'],
    vi: ['Ghi nhận hoàn thành giúp bạn kết nối nỗ lực và mang bài học đi tiếp.', 'Đuổi theo mục tiêu mới ngay có thể che thành quả hoặc để việc cũ dang dở.', 'Đánh dấu điều đã hoàn tất trước khi quyết định chu kỳ mới cần gì.', 'Khép lại một chi tiết còn dang dở và ghi ba điều chương này đã dạy bạn.'],
  },
  22: { // Ace of Wands
    en: ['A fresh spark can supply the energy to begin creating.', 'Inspiration can fade if it is mistaken for a finished plan.', 'Give the idea a small real-world test while enthusiasm is available.', 'Spend twenty minutes making a rough first version instead of announcing a large commitment.'],
    vi: ['Tia cảm hứng mới có thể mang năng lượng để bắt đầu sáng tạo.', 'Cảm hứng dễ tắt nếu bị nhầm với một kế hoạch đã hoàn chỉnh.', 'Thử ý tưởng trong thực tế ở quy mô nhỏ khi nhiệt huyết còn có.', 'Dành hai mươi phút làm bản nháp đầu tiên thay vì tuyên bố một cam kết lớn.'],
  },
  23: { // Two of Wands
    en: ['A wider view helps you choose deliberately rather than follow habit.', 'Planning from a safe distance can replace actual exploration.', 'Compare realistic possibilities without requiring certainty about the whole route.', 'Compare two options on time, resources, and values, then investigate the least-known detail.'],
    vi: ['Góc nhìn rộng giúp bạn chọn có chủ ý thay vì chỉ theo thói quen.', 'Lập kế hoạch từ nơi an toàn có thể thay thế việc thật sự khám phá.', 'So sánh các khả năng thực tế mà không đòi chắc chắn về cả hành trình.', 'Đối chiếu hai phương án về thời gian, nguồn lực và giá trị, rồi tìm hiểu chi tiết còn mơ hồ nhất.'],
  },
  24: { // Three of Wands
    en: ['Foresight and collaboration can extend the reach of an effort already begun.', 'Expectation may outrun capacity, or waiting may become passive.', 'Prepare for the next stage while letting results take their time.', 'Identify the next milestone and contact one person whose input could help you reach it.'],
    vi: ['Tầm nhìn và hợp tác có thể mở rộng nỗ lực đã bắt đầu.', 'Kỳ vọng có thể vượt khả năng, hoặc chờ đợi trở nên thụ động.', 'Chuẩn bị chặng tiếp theo và vẫn để kết quả có thời gian hình thành.', 'Xác định cột mốc kế tiếp và liên hệ một người có thể góp ý giúp bạn tới đó.'],
  },
  25: { // Four of Wands
    en: ['A shared milestone can strengthen belonging and confidence in your foundation.', 'Pressure to create a perfect celebration can eclipse real connection.', 'Let the occasion reflect the people involved rather than an ideal image.', 'Arrange a simple way to mark one milestone with someone who contributed to it.'],
    vi: ['Cột mốc chung có thể củng cố cảm giác thuộc về và niềm tin vào nền tảng.', 'Áp lực ăn mừng hoàn hảo có thể lấn át kết nối thật.', 'Để dịp này phản ánh những người tham gia thay vì một hình ảnh lý tưởng.', 'Sắp xếp cách giản dị để ghi nhận một cột mốc với người đã góp sức.'],
  },
  26: { // Five of Wands
    en: ['Different approaches can sharpen skills and reveal useful alternatives.', 'Unclear aims can turn healthy challenge into exhausting competition.', 'Distinguish a productive disagreement from a contest nobody needs to win.', 'Agree on one shared goal and give each person a turn to explain their proposed approach.'],
    vi: ['Những cách làm khác nhau có thể rèn kỹ năng và mở ra phương án hữu ích.', 'Mục tiêu mơ hồ có thể biến thử thách lành mạnh thành cạnh tranh mệt mỏi.', 'Phân biệt bất đồng có ích với cuộc thi không ai cần thắng.', 'Thống nhất một mục tiêu chung và để mỗi người lần lượt giải thích cách làm của mình.'],
  },
  27: { // Six of Wands
    en: ['Visible progress and encouragement can help you trust your work.', 'Dependence on applause can make every setback feel like a loss of worth.', 'Receive recognition and acknowledge the people and practice behind it.', 'Record one achievement in concrete terms and thank one person who helped make it possible.'],
    vi: ['Tiến bộ được nhìn thấy và sự động viên giúp bạn tin hơn vào công sức.', 'Phụ thuộc lời khen khiến mỗi trở ngại dễ bị xem là mất giá trị bản thân.', 'Đón sự ghi nhận và nhớ những người cùng sự rèn luyện phía sau thành quả.', 'Ghi cụ thể một thành tựu và cảm ơn một người đã góp phần làm nên điều đó.'],
  },
  28: { // Seven of Wands
    en: ['A clear conviction can help you defend something that matters.', 'Treating every difference as an attack can keep you permanently braced.', 'Choose which boundary deserves your effort and let lesser contests pass.', 'State one boundary in a single sentence and decide what you will do if it is not respected.'],
    vi: ['Niềm tin rõ ràng giúp bạn bảo vệ điều có ý nghĩa.', 'Xem mọi khác biệt là tấn công có thể khiến bạn luôn căng mình.', 'Chọn ranh giới xứng đáng với công sức và bỏ qua tranh chấp ít quan trọng.', 'Nói một ranh giới bằng một câu và xác định việc bạn sẽ làm nếu nó không được tôn trọng.'],
  },
  29: { // Eight of Wands
    en: ['Clear communication can turn rising momentum into useful progress.', 'Speed can multiply misunderstandings or create more urgency than is necessary.', 'Respond promptly where it matters, but verify the message before acting.', 'Confirm one deadline or instruction in writing and complete the most time-sensitive task first.'],
    vi: ['Giao tiếp rõ ràng giúp biến đà chuyển động thành tiến bộ hữu ích.', 'Tốc độ có thể nhân hiểu lầm hoặc tạo sự khẩn cấp không cần thiết.', 'Phản hồi kịp lúc ở việc quan trọng, nhưng xác nhận thông tin trước khi làm.', 'Xác nhận bằng văn bản một thời hạn hoặc chỉ dẫn, rồi làm việc cần đúng lúc nhất trước.'],
  },
  30: { // Nine of Wands
    en: ['Experience can help you prepare and persist through a difficult final stretch.', 'Old hurt may leave you guarding against danger that is no longer present.', 'Use what you learned without asking yourself to remain on duty constantly.', 'Choose one sensible safeguard, then schedule a genuine break from checking the situation.'],
    vi: ['Kinh nghiệm giúp bạn chuẩn bị và bền bỉ qua chặng cuối khó khăn.', 'Tổn thương cũ có thể khiến bạn đề phòng mối nguy không còn hiện diện.', 'Dùng điều đã học mà không bắt mình phải luôn túc trực.', 'Chọn một biện pháp bảo vệ hợp lý, rồi dành khoảng nghỉ thực sự khỏi việc kiểm tra tình hình.'],
  },
  31: { // Ten of Wands
    en: ['Your commitment has carried meaningful work a considerable distance.', 'Taking responsibility for everything can hide overload until your capacity is exhausted.', 'Measure the load honestly and share it before accepting more.', 'List your obligations and delegate, reduce, or postpone one that does not need to be yours.'],
    vi: ['Sự tận tâm đã đưa công việc ý nghĩa đi được một chặng dài.', 'Nhận trách nhiệm mọi thứ có thể che quá tải cho đến khi bạn cạn sức.', 'Nhìn thật lòng vào gánh nặng và chia sẻ trước khi nhận thêm.', 'Liệt kê các trách nhiệm và giao bớt, giảm hoặc hoãn một việc không nhất thiết thuộc về bạn.'],
  },
  32: { // Page of Wands
    en: ['A beginner’s curiosity makes unfamiliar ideas easier to approach.', 'Constantly seeking novelty can prevent an interest from becoming a skill.', 'Explore freely, then choose one idea to follow beyond the first spark.', 'Try one introductory lesson or small experiment and write down what you want to explore next.'],
    vi: ['Sự tò mò của người mới giúp bạn dễ tiếp cận ý tưởng chưa quen.', 'Mải tìm cái mới có thể khiến sở thích chưa kịp thành kỹ năng.', 'Khám phá cởi mở rồi chọn một ý tưởng để đi tiếp sau tia hứng khởi đầu.', 'Thử một bài học nhập môn hoặc thí nghiệm nhỏ, rồi ghi điều bạn muốn tìm hiểu tiếp.'],
  },
  33: { // Knight of Wands
    en: ['Enthusiasm and courage can get a stalled idea moving.', 'Impulsiveness can produce a strong start with little follow-through.', 'Give bold action a direction, a limit, and a plan for the less exciting work.', 'Choose one action to take now and one follow-up commitment you can keep next week.'],
    vi: ['Nhiệt huyết và can đảm có thể giúp ý tưởng đang đình trệ chuyển động.', 'Bốc đồng dễ tạo khởi đầu mạnh nhưng ít sự theo đuổi đến cùng.', 'Cho hành động táo bạo hướng đi, giới hạn và kế hoạch cho phần việc ít thú vị.', 'Chọn một việc làm ngay và một cam kết tiếp nối mà bạn có thể giữ vào tuần tới.'],
  },
  34: { // Queen of Wands
    en: ['Warm confidence can make room for both your creativity and other people.', 'Performing confidence or overextending socially can disconnect you from your own energy.', 'Let your interest be visible without requiring everyone’s approval.', 'Share one piece of work or idea you care about, then protect time to recharge.'],
    vi: ['Tự tin ấm áp có thể dành chỗ cho cả sáng tạo của bạn và người khác.', 'Cố tỏ ra tự tin hoặc giao tiếp quá sức dễ làm bạn xa mức năng lượng thật.', 'Để điều mình yêu thích được nhìn thấy mà không đòi mọi người đồng tình.', 'Chia sẻ một sản phẩm hoặc ý tưởng bạn quan tâm, rồi giữ thời gian nạp lại năng lượng.'],
  },
  35: { // King of Wands
    en: ['A clear vision can inspire people and give creative work direction.', 'Impatience or attachment to your own vision can crowd out other contributions.', 'Lead by example and leave room for capable people to shape the result.', 'Explain the goal and why it matters, then invite one person to propose how to achieve it.'],
    vi: ['Tầm nhìn rõ có thể truyền cảm hứng và định hướng công việc sáng tạo.', 'Thiếu kiên nhẫn hoặc bám chặt tầm nhìn riêng có thể lấn át đóng góp khác.', 'Dẫn dắt bằng làm gương và để người có năng lực góp phần định hình kết quả.', 'Giải thích mục tiêu cùng ý nghĩa của nó, rồi mời một người đề xuất cách thực hiện.'],
  },
  36: { // Ace of Cups
    en: ['Emotional openness can make room for care, connection, or creative renewal.', 'A new feeling can be idealized before you know what can sustain it.', 'Welcome what you feel and let trust develop through experience.', 'Make one sincere, low-pressure gesture of care and notice how it is received.'],
    vi: ['Cởi mở cảm xúc tạo chỗ cho chăm sóc, kết nối hoặc sáng tạo mới.', 'Cảm xúc mới có thể bị lý tưởng hóa trước khi bạn biết điều nuôi nó bền lâu.', 'Đón cảm xúc và để niềm tin phát triển qua trải nghiệm.', 'Thực hiện một cử chỉ quan tâm chân thành, không gây áp lực và quan sát cách nó được đón nhận.'],
  },
  37: { // Two of Cups
    en: ['Mutual attention can support a respectful partnership or repair a connection.', 'A wish for closeness can make unequal effort difficult to acknowledge.', 'Look for reciprocity in actions as well as words.', 'Invite a conversation in which each person names one need and one thing they can offer.'],
    vi: ['Chú ý đến nhau có thể nâng đỡ quan hệ tôn trọng hoặc hàn gắn kết nối.', 'Mong muốn gần gũi có thể khiến bạn khó thừa nhận nỗ lực không cân bằng.', 'Tìm sự tương hỗ trong hành động cũng như lời nói.', 'Mời một cuộc trao đổi để mỗi người nêu một nhu cầu và một điều mình có thể đóng góp.'],
  },
  38: { // Three of Cups
    en: ['Friendship and shared enjoyment can remind you that support is available.', 'Pressure to fit in or overcommit can dilute the connection you wanted.', 'Choose company that welcomes your actual energy and boundaries.', 'Contact a friend for a simple gathering or conversation that feels easy to accept.'],
    vi: ['Tình bạn và niềm vui chung có thể nhắc bạn rằng sự hỗ trợ vẫn ở đây.', 'Áp lực hòa nhập hoặc nhận quá nhiều hẹn dễ làm nhạt kết nối bạn mong.', 'Chọn người đón nhận mức năng lượng và ranh giới thật của bạn.', 'Liên hệ một người bạn để có cuộc gặp hoặc trò chuyện giản dị, dễ đón nhận.'],
  },
  39: { // Four of Cups
    en: ['A pause can help you understand dissatisfaction instead of reacting automatically.', 'Withdrawal may make a useful offer invisible or feel harder to receive.', 'Respect the need for space while staying curious about one available option.', 'Identify whether you need rest, change, or support, then respond to one offer on those terms.'],
    vi: ['Tạm dừng giúp bạn hiểu sự không hài lòng thay vì phản ứng theo quán tính.', 'Thu mình có thể khiến lời đề nghị hữu ích bị bỏ qua hoặc khó đón nhận.', 'Tôn trọng nhu cầu khoảng riêng và vẫn tò mò về một lựa chọn đang có.', 'Xác định bạn cần nghỉ, đổi mới hay hỗ trợ, rồi phản hồi một lời đề nghị dựa trên nhu cầu đó.'],
  },
  40: { // Five of Cups
    en: ['Acknowledging disappointment can begin a more honest relationship with what remains.', 'Focusing only on loss may make remaining support difficult to see.', 'Let grief and appreciation coexist without asking one to cancel the other.', 'Name what you miss, then reach toward one person or resource that is still available.'],
    vi: ['Thừa nhận thất vọng giúp bạn gắn bó trung thực hơn với điều còn lại.', 'Chỉ chú ý mất mát có thể khiến sự nâng đỡ còn có trở nên khó thấy.', 'Để đau buồn và trân trọng cùng tồn tại mà không buộc cái này xóa cái kia.', 'Gọi tên điều bạn nhớ tiếc, rồi tìm đến một người hoặc nguồn lực vẫn còn sẵn.'],
  },
  41: { // Six of Cups
    en: ['A kind memory can reconnect you with simple pleasure or a value worth keeping.', 'Nostalgia can edit out the past’s difficulties or make the present seem inadequate.', 'Bring forward the quality you value rather than trying to recreate everything.', 'Choose one caring gesture from a good memory and adapt it to your life today.'],
    vi: ['Ký ức ấm áp giúp bạn trở lại niềm vui giản dị hoặc giá trị đáng giữ.', 'Hoài niệm có thể bỏ qua khó khăn xưa hoặc khiến hiện tại có vẻ thiếu thốn.', 'Mang theo phẩm chất bạn quý thay vì cố tái hiện mọi thứ.', 'Chọn một cử chỉ quan tâm từ ký ức đẹp và điều chỉnh cho cuộc sống hôm nay.'],
  },
  42: { // Seven of Cups
    en: ['Imagination can reveal possibilities you had not allowed yourself to consider.', 'Too many appealing or frightening scenarios can obscure what is realistic.', 'Test an option against evidence before giving it your commitment.', 'Narrow the list to two possibilities and verify one concrete fact about each.'],
    vi: ['Tưởng tượng có thể mở khả năng mà bạn chưa từng cho phép mình cân nhắc.', 'Quá nhiều kịch bản hấp dẫn hoặc đáng sợ dễ che điều thực tế.', 'Đối chiếu một phương án với bằng chứng trước khi cam kết.', 'Thu danh sách còn hai khả năng và kiểm chứng một thông tin cụ thể của mỗi phương án.'],
  },
  43: { // Eight of Cups
    en: ['Honest reassessment can help you seek something more meaningful.', 'Leaving too quickly may confuse temporary frustration with a lasting mismatch.', 'Understand what is missing before deciding whether to repair, renegotiate, or leave.', 'Write the unmet need and one realistic attempt to address it before choosing your next move.'],
    vi: ['Đánh giá lại trung thực giúp bạn tìm điều có ý nghĩa hơn.', 'Rời đi quá nhanh có thể nhầm thất vọng tạm thời với sự không phù hợp lâu dài.', 'Hiểu điều còn thiếu trước khi chọn hàn gắn, thỏa thuận lại hoặc rời đi.', 'Ghi nhu cầu chưa được đáp ứng và một cách thực tế để giải quyết trước khi chọn bước tiếp.'],
  },
  44: { // Nine of Cups
    en: ['Recognizing enough can let you enjoy what effort has already brought.', 'Seeking satisfaction only through acquisition or approval may leave a deeper need untouched.', 'Savor a real pleasure and ask what contentment means to you.', 'Name one thing that is enough today and enjoy it without adding another condition.'],
    vi: ['Nhận ra sự đủ đầy giúp bạn tận hưởng điều nỗ lực đã đem lại.', 'Chỉ tìm hài lòng qua sở hữu hoặc công nhận có thể bỏ sót nhu cầu sâu hơn.', 'Tận hưởng niềm vui thật và hỏi sự mãn nguyện có nghĩa gì với mình.', 'Nêu một điều đã đủ hôm nay và tận hưởng nó mà không đặt thêm điều kiện.'],
  },
  45: { // Ten of Cups
    en: ['Shared values and everyday care can create a lasting sense of belonging.', 'An ideal picture of harmony may discourage honest discussion of differences.', 'Build connection through real participation rather than a perfect family image.', 'Ask someone close what helps them feel at home, and agree on one repeatable act of care.'],
    vi: ['Giá trị chung và chăm sóc hằng ngày có thể tạo cảm giác thuộc về bền lâu.', 'Bức tranh hòa hợp lý tưởng có thể ngăn trao đổi thật về khác biệt.', 'Xây gắn kết bằng sự tham gia thực tế thay vì hình ảnh gia đình hoàn hảo.', 'Hỏi người thân điều giúp họ thấy như ở nhà và cùng chọn một việc chăm sóc có thể duy trì.'],
  },
  46: { // Page of Cups
    en: ['Gentle curiosity can give an unexpected feeling or creative idea a voice.', 'Sensitivity may become overinterpretation or reluctance to risk an honest expression.', 'Treat the feeling as something to explore, not something that must be immediately explained.', 'Write a few unpolished lines about what you feel, then share one sentence if it feels appropriate.'],
    vi: ['Tò mò dịu dàng có thể giúp cảm xúc hoặc ý tưởng bất ngờ được cất tiếng.', 'Nhạy cảm dễ thành suy diễn hoặc ngần ngại bày tỏ chân thành.', 'Xem cảm xúc là điều để khám phá, không phải thứ phải giải thích ngay.', 'Viết vài dòng tự nhiên về cảm xúc, rồi chia sẻ một câu nếu thấy phù hợp.'],
  },
  47: { // Knight of Cups
    en: ['A heartfelt invitation can turn feeling into meaningful contact.', 'A beautiful ideal may outrun consistent action or realistic expectations.', 'Let sincerity show in a specific offer that another person can freely accept or decline.', 'Make one clear invitation with a practical time or next step, without assuming the response.'],
    vi: ['Lời mời chân thành có thể biến cảm xúc thành sự kết nối ý nghĩa.', 'Lý tưởng đẹp có thể đi trước hành động nhất quán hoặc kỳ vọng thực tế.', 'Thể hiện sự chân thành bằng đề nghị cụ thể mà người khác được tự do nhận hoặc từ chối.', 'Đưa một lời mời rõ cùng thời gian hoặc bước tiếp thực tế, không mặc định câu trả lời.'],
  },
  48: { // Queen of Cups
    en: ['Attentive empathy can help you understand what is felt beneath the words.', 'Absorbing everyone’s emotions can blur where your responsibility ends.', 'Listen warmly and check which feelings and tasks actually belong to you.', 'After supporting someone, name your own feeling and one boundary that will help you recover.'],
    vi: ['Thấu cảm chú tâm giúp bạn hiểu cảm xúc nằm sau lời nói.', 'Hấp thụ cảm xúc của mọi người có thể làm mờ điểm kết thúc trách nhiệm của bạn.', 'Lắng nghe ấm áp và xem cảm xúc, việc làm nào thực sự thuộc về mình.', 'Sau khi nâng đỡ ai đó, gọi tên cảm xúc riêng và một ranh giới giúp bạn lấy lại năng lượng.'],
  },
  49: { // King of Cups
    en: ['Emotional steadiness can make a difficult situation safer to discuss.', 'Appearing calm at all costs may conceal an unspoken need or hurt.', 'Regulate your response without denying the feeling underneath it.', 'Pause before answering, name the feeling privately, and make one measured request aloud.'],
    vi: ['Điềm tĩnh cảm xúc có thể giúp tình huống khó trở nên an toàn hơn để trao đổi.', 'Cố tỏ bình thản bằng mọi giá có thể giấu nhu cầu hoặc tổn thương chưa được nói.', 'Điều chỉnh cách đáp lại mà không phủ nhận cảm xúc bên dưới.', 'Dừng trước khi trả lời, tự gọi tên cảm xúc rồi nói một đề nghị có chừng mực.'],
  },
  50: { // Ace of Swords
    en: ['A precise insight can cut through a confusing question.', 'Certainty can harden too quickly, or a true point can be delivered without care.', 'Check the evidence and use clarity to solve the issue rather than to dominate it.', 'Write the decision in one sentence, with the strongest fact supporting it and one unanswered question.'],
    vi: ['Nhận định chính xác có thể tháo gỡ một câu hỏi mơ hồ.', 'Sự chắc chắn có thể cứng lại quá nhanh, hoặc ý đúng được nói thiếu quan tâm.', 'Kiểm tra bằng chứng và dùng sự rõ ràng để giải quyết thay vì lấn át.', 'Viết quyết định bằng một câu, kèm sự thật hỗ trợ mạnh nhất và một câu hỏi còn bỏ ngỏ.'],
  },
  51: { // Two of Swords
    en: ['A considered pause can protect you from a rushed choice.', 'Avoiding information or difficult feelings can keep the choice suspended indefinitely.', 'Notice what you are not yet willing to look at, and approach it in manageable pieces.', 'Identify the missing piece of information and set a specific time to seek it before deciding.'],
    vi: ['Khoảng dừng có cân nhắc giúp tránh lựa chọn vội.', 'Né thông tin hoặc cảm xúc khó có thể khiến lựa chọn treo mãi.', 'Nhận ra điều mình chưa muốn nhìn và tiếp cận từng phần vừa sức.', 'Xác định thông tin còn thiếu và đặt lúc cụ thể để tìm nó trước khi quyết định.'],
  },
  52: { // Three of Swords
    en: ['Naming a hurt honestly can make room for support and eventual repair.', 'Replaying the wound can make one painful event feel like the whole truth about you.', 'Acknowledge the pain without treating the card as evidence of betrayal.', 'Tell a trusted person what happened and ask for the kind of listening you need today.'],
    vi: ['Gọi tên tổn thương trung thực giúp mở chỗ cho nâng đỡ và dần hàn gắn.', 'Lặp lại nỗi đau trong tâm trí dễ khiến một việc buồn thành toàn bộ sự thật về bạn.', 'Thừa nhận nỗi đau mà không xem lá bài là bằng chứng phản bội.', 'Kể với người đáng tin điều đã xảy ra và nói cách lắng nghe bạn cần hôm nay.'],
  },
  53: { // Four of Swords
    en: ['Deliberate rest can restore perspective before the next demand.', 'A useful retreat can become avoidance if there is no route back.', 'Give rest a protected place and postpone analysis until you have more capacity.', 'Set a short period without messages or tasks, then choose when to revisit one pending issue.'],
    vi: ['Nghỉ có chủ ý có thể khôi phục góc nhìn trước yêu cầu tiếp theo.', 'Lùi lại hữu ích có thể thành né tránh nếu không có đường quay lại.', 'Bảo vệ khoảng nghỉ và hoãn phân tích đến khi có thêm sức.', 'Dành một khoảng không tin nhắn hay công việc, rồi chọn lúc quay lại một vấn đề đang chờ.'],
  },
  54: { // Five of Swords
    en: ['Recognizing the cost of a conflict can help you choose a wiser response.', 'Winning a point may damage trust or prolong a contest nobody benefits from.', 'Decide whether repair, a boundary, or disengagement best serves what matters.', 'Pause the argument and state the practical outcome you want, without attacking anyone’s character.'],
    vi: ['Nhận ra cái giá của xung đột giúp bạn chọn cách đáp lại sáng suốt hơn.', 'Thắng một ý có thể làm hỏng niềm tin hoặc kéo dài cuộc tranh không ai được lợi.', 'Cân nhắc hàn gắn, ranh giới hay rời tranh luận phục vụ điều quan trọng nhất.', 'Tạm dừng tranh cãi và nêu kết quả thực tế bạn muốn, không công kích con người.'],
  },
  55: { // Six of Swords
    en: ['Practical help can carry you toward a steadier situation even before sadness has passed.', 'Expecting a change of place to remove every old difficulty may lead to disappointment.', 'Accept assistance and carry forward the lessons you will still need.', 'Plan the next small transition with one concrete support: transport, information, time, or company.'],
    vi: ['Giúp đỡ thực tế có thể đưa bạn tới chỗ vững hơn dù nỗi buồn chưa qua.', 'Mong đổi nơi sẽ xóa mọi khó khăn cũ có thể dẫn đến thất vọng.', 'Nhận hỗ trợ và mang theo những bài học vẫn cần cho chặng tới.', 'Lên bước chuyển nhỏ với một hỗ trợ cụ thể: phương tiện, thông tin, thời gian hoặc người đồng hành.'],
  },
  56: { // Seven of Swords
    en: ['Careful strategy can protect privacy and avoid an unnecessary confrontation.', 'Secrecy or shortcuts may shift the cost onto someone else or weaken trust.', 'Distinguish sensible discretion from avoiding an agreement you need to honor.', 'Review one unclear agreement and put the responsibilities or boundaries into plain language.'],
    vi: ['Chiến lược cẩn thận giúp bảo vệ riêng tư và tránh đối đầu không cần thiết.', 'Giấu giếm hoặc đường tắt có thể đẩy cái giá sang người khác hoặc làm yếu niềm tin.', 'Phân biệt kín đáo hợp lý với né thỏa thuận bạn cần tôn trọng.', 'Xem lại một thỏa thuận chưa rõ và diễn đạt trách nhiệm hoặc ranh giới bằng lời dễ hiểu.'],
  },
  57: { // Eight of Swords
    en: ['Looking closely at a restriction can reveal a limited but real choice.', 'Fear or missing information may make every route seem closed; some external barriers may also be real.', 'Do not blame yourself for feeling stuck; separate assumptions from obstacles that need help.', 'Name one real barrier and one assumption, then ask someone informed about an available option.'],
    vi: ['Nhìn kỹ giới hạn có thể làm lộ một lựa chọn nhỏ nhưng có thật.', 'Sợ hãi hoặc thiếu thông tin khiến mọi lối như đóng; một số rào cản bên ngoài cũng có thể thật.', 'Đừng trách mình vì mắc kẹt; tách giả định khỏi trở ngại cần hỗ trợ.', 'Nêu một rào cản thật và một giả định, rồi hỏi người có hiểu biết về lựa chọn đang có.'],
  },
  58: { // Nine of Swords
    en: ['Bringing a private worry into a caring conversation can reduce its isolation.', 'Repeated worst-case thoughts may feel convincing without adding new evidence.', 'Treat distress with compassion and distinguish the feared scenario from what you know.', 'Write the worry in daylight, mark the verified facts, and ask a trusted person for support.'],
    vi: ['Mang nỗi lo riêng vào cuộc trò chuyện tử tế có thể giảm cô độc.', 'Suy nghĩ về kịch bản xấu nhất lặp đi lặp lại dễ có vẻ đúng dù không thêm bằng chứng.', 'Đón khổ tâm bằng cảm thông và tách kịch bản sợ hãi khỏi điều biết chắc.', 'Ghi nỗi lo vào ban ngày, đánh dấu sự thật đã kiểm chứng và nhờ người đáng tin nâng đỡ.'],
  },
  59: { // Ten of Swords
    en: ['Recognizing that a pattern has ended can stop further energy being poured into it.', 'Exhaustion can make an ending feel like proof that nothing can improve.', 'Acknowledge the limit and prioritize recovery; the image is not a prediction of physical harm.', 'Stop one effort that is clearly exhausted and arrange the most immediate practical support you need.'],
    vi: ['Nhận ra khuôn mẫu đã kết thúc giúp ngừng dồn thêm năng lượng vào nó.', 'Kiệt sức có thể khiến kết thúc như bằng chứng rằng không gì tốt lên được.', 'Thừa nhận giới hạn và ưu tiên hồi phục; hình ảnh không dự báo tổn hại thể chất.', 'Dừng một nỗ lực rõ ràng đã cạn và sắp xếp hỗ trợ thực tế cấp thiết nhất cho bạn.'],
  },
  60: { // Page of Swords
    en: ['Curiosity and alert observation can uncover information that changes your understanding.', 'Suspicion or rapid conclusions can turn investigation into unnecessary conflict.', 'Ask a precise question and check the source before repeating a claim.', 'Verify one uncertain statement with an original source or the person directly involved.'],
    vi: ['Tò mò và quan sát tỉnh táo có thể tìm thông tin làm đổi cách hiểu.', 'Nghi ngờ hoặc kết luận vội có thể biến tìm hiểu thành xung đột không cần.', 'Hỏi chính xác và kiểm tra nguồn trước khi nhắc lại một nhận định.', 'Kiểm chứng một điều chưa chắc qua nguồn gốc hoặc người trực tiếp liên quan.'],
  },
  61: { // Knight of Swords
    en: ['Determination can help you speak up and act on a clear priority.', 'Urgency may outrun listening, nuance, or the consequences of your words.', 'Keep the courage and add a brief check before charging ahead.', 'Draft your message, remove one unnecessary accusation, and confirm the action you are asking for.'],
    vi: ['Quyết tâm giúp bạn lên tiếng và hành động vì ưu tiên rõ ràng.', 'Khẩn trương dễ vượt việc lắng nghe, sắc thái và hệ quả lời nói.', 'Giữ can đảm và thêm một bước kiểm tra ngắn trước khi tiến tới.', 'Soạn lời nhắn, bỏ một lời quy kết không cần và làm rõ hành động bạn đang đề nghị.'],
  },
  62: { // Queen of Swords
    en: ['Experience can support direct communication and a boundary that is fair.', 'Self-protection can become a sharpness that leaves little room for another perspective.', 'Be precise about the issue while keeping the person’s dignity intact.', 'State one fact, one boundary, and one workable next step without adding a character judgment.'],
    vi: ['Kinh nghiệm nâng đỡ giao tiếp trực tiếp và ranh giới công bằng.', 'Tự bảo vệ có thể thành sắc lạnh, ít chỗ cho góc nhìn khác.', 'Nói chính xác về vấn đề và vẫn giữ phẩm giá người đối diện.', 'Nêu một sự thật, một ranh giới và một bước làm được, không thêm phán xét về con người.'],
  },
  63: { // King of Swords
    en: ['Clear standards and evidence can make a difficult decision more consistent.', 'Detachment or rigid authority can overlook the people affected by the decision.', 'Combine principled reasoning with attention to context and impact.', 'Write the criteria for your decision and check that you would apply them fairly to everyone.'],
    vi: ['Chuẩn mực và bằng chứng rõ giúp quyết định khó được nhất quán hơn.', 'Xa cách hoặc quyền lực cứng nhắc có thể bỏ qua người chịu ảnh hưởng.', 'Kết hợp lý lẽ có nguyên tắc với sự chú ý bối cảnh và tác động.', 'Viết tiêu chí quyết định và kiểm tra liệu bạn có áp dụng chúng công bằng cho mọi người không.'],
  },
  64: { // Ace of Pentacles
    en: ['A tangible opportunity can become a foundation through steady care.', 'A promising beginning can be mistaken for guaranteed material success.', 'Evaluate what the opportunity actually requires before investing more.', 'Check the time, cost, and skills required, then take one affordable first step.'],
    vi: ['Cơ hội cụ thể có thể thành nền tảng khi được chăm sóc đều đặn.', 'Khởi đầu hứa hẹn dễ bị nhầm là thành công vật chất chắc chắn.', 'Đánh giá điều cơ hội thực sự đòi hỏi trước khi đầu tư thêm.', 'Kiểm tra thời gian, chi phí và kỹ năng cần có, rồi làm một bước đầu vừa khả năng.'],
  },
  65: { // Two of Pentacles
    en: ['Flexibility can help you respond to changing demands without abandoning your priorities.', 'Constant juggling can conceal that the total load no longer fits your capacity.', 'Adjust the number of commitments as well as how efficiently you manage them.', 'Compare this week’s commitments with your available hours and renegotiate one that does not fit.'],
    vi: ['Linh hoạt giúp bạn đáp ứng yêu cầu đổi thay mà không bỏ ưu tiên.', 'Xoay xở liên tục có thể che việc tổng gánh nặng đã vượt khả năng.', 'Điều chỉnh số cam kết cùng với cách quản lý chúng hiệu quả.', 'So cam kết tuần này với thời gian thật sự có và thỏa thuận lại một việc không vừa.'],
  },
  66: { // Three of Pentacles
    en: ['Complementary skills and useful feedback can improve the work.', 'Unclear roles or dismissing someone’s expertise can weaken collaboration.', 'Make the shared standard and each person’s contribution explicit.', 'Hold a brief check-in to agree on the result, responsibilities, and one point for feedback.'],
    vi: ['Kỹ năng bổ sung và góp ý hữu ích có thể nâng chất lượng công việc.', 'Vai trò mơ hồ hoặc coi nhẹ chuyên môn người khác có thể làm yếu hợp tác.', 'Nói rõ tiêu chuẩn chung và phần đóng góp của mỗi người.', 'Trao đổi ngắn để thống nhất kết quả, trách nhiệm và một thời điểm nhận góp ý.'],
  },
  67: { // Four of Pentacles
    en: ['Careful stewardship can protect a resource or boundary you genuinely need.', 'Holding too tightly may reduce trust, flexibility, or your ability to enjoy what you have.', 'Distinguish a reasonable reserve from control driven only by fear.', 'Decide what amount of time, money, or energy needs protecting and where one small release is possible.'],
    vi: ['Gìn giữ cẩn thận có thể bảo vệ nguồn lực hoặc ranh giới bạn thực sự cần.', 'Giữ quá chặt dễ làm giảm niềm tin, linh hoạt hoặc khả năng tận hưởng điều đang có.', 'Phân biệt dự phòng hợp lý với kiểm soát chỉ do sợ hãi.', 'Xác định phần thời gian, tiền hoặc sức cần giữ và chỗ có thể nới một chút.'],
  },
  68: { // Five of Pentacles
    en: ['Acknowledging strain can open a path toward practical help and solidarity.', 'Shame or exclusion may make support feel undeserved or out of reach.', 'Treat a difficult circumstance as a need for assistance, not a measure of personal worth.', 'Identify one immediate need and contact a relevant support service, community, or trusted person.'],
    vi: ['Thừa nhận khó khăn có thể mở đường tới giúp đỡ thực tế và sự đồng hành.', 'Xấu hổ hoặc bị gạt ra ngoài có thể khiến hỗ trợ như không xứng đáng hoặc quá xa.', 'Xem hoàn cảnh khó là nhu cầu được giúp, không phải thước đo giá trị con người.', 'Xác định một nhu cầu trước mắt và liên hệ dịch vụ hỗ trợ, cộng đồng hoặc người đáng tin phù hợp.'],
  },
  69: { // Six of Pentacles
    en: ['A fair exchange can help resources reach where they are needed.', 'Unequal power or hidden conditions can complicate apparent generosity.', 'Make the terms of giving or receiving clear without using shame.', 'Clarify what is a gift, what is a loan or obligation, and what both sides can realistically offer.'],
    vi: ['Trao đổi công bằng giúp nguồn lực đến nơi đang cần.', 'Quyền lực lệch hoặc điều kiện ẩn có thể khiến sự rộng lượng trở nên phức tạp.', 'Làm rõ điều kiện cho và nhận mà không dùng sự xấu hổ.', 'Làm rõ điều là quà, điều là khoản vay hay nghĩa vụ và mỗi bên thực tế có thể đóng góp gì.'],
  },
  70: { // Seven of Pentacles
    en: ['A thoughtful review can show where patient effort is producing value.', 'Past investment may make it hard to stop an approach that is no longer useful.', 'Judge the next investment by evidence and present priorities, not just effort already spent.', 'Choose one sign of progress and a review date; decide what result would justify continuing or changing course.'],
    vi: ['Xem lại có cân nhắc giúp thấy nơi nỗ lực kiên nhẫn đang tạo giá trị.', 'Đầu tư đã qua có thể khiến khó dừng cách làm không còn hữu ích.', 'Xét phần đầu tư tiếp theo theo bằng chứng và ưu tiên hiện tại, không chỉ công đã bỏ.', 'Chọn một dấu hiệu tiến bộ và ngày xem lại; xác định kết quả nào đáng để tiếp tục hoặc đổi hướng.'],
  },
  71: { // Eight of Pentacles
    en: ['Focused practice and feedback can turn effort into reliable skill.', 'Perfectionism or repetitive work without learning can drain motivation.', 'Practice one specific technique and use mistakes as information.', 'Schedule a short practice session with one measurable skill and ask for targeted feedback afterward.'],
    vi: ['Luyện tập tập trung và góp ý có thể biến nỗ lực thành kỹ năng đáng tin.', 'Cầu toàn hoặc lặp việc mà không học có thể làm cạn động lực.', 'Luyện một kỹ thuật cụ thể và dùng lỗi sai như thông tin.', 'Dành buổi tập ngắn cho một kỹ năng quan sát được và xin góp ý đúng trọng tâm sau đó.'],
  },
  72: { // Nine of Pentacles
    en: ['Cultivated stability can give you freedom to enjoy what you have built.', 'Self-reliance can become isolation, or maintaining an image can overshadow real comfort.', 'Appreciate your independence while allowing support and companionship.', 'Notice one comfort your effort created and make time to enjoy it, alone or with someone you choose.'],
    vi: ['Ổn định được vun đắp cho bạn tự do tận hưởng điều đã xây dựng.', 'Tự chủ có thể thành cô lập, hoặc giữ hình ảnh lấn át sự dễ chịu thật.', 'Trân trọng độc lập và vẫn cho phép sự hỗ trợ, đồng hành.', 'Nhận ra một sự dễ chịu do công sức tạo nên và dành lúc tận hưởng, một mình hoặc với người bạn chọn.'],
  },
  73: { // Ten of Pentacles
    en: ['Shared resources and long-term thinking can create support that outlasts one person’s effort.', 'Inherited expectations may preserve security while excluding someone’s needs.', 'Examine which traditions and arrangements serve the people involved now.', 'Discuss one long-term household or community responsibility and document who will handle it.'],
    vi: ['Nguồn lực chung và tầm nhìn dài hạn tạo sự nâng đỡ vượt khỏi nỗ lực một người.', 'Kỳ vọng thừa hưởng có thể giữ an toàn nhưng gạt nhu cầu của ai đó ra ngoài.', 'Xem truyền thống và cách sắp xếp nào đang phục vụ những người liên quan hôm nay.', 'Trao đổi một trách nhiệm dài hạn của gia đình hoặc cộng đồng và ghi rõ ai sẽ đảm nhận.'],
  },
  74: { // Page of Pentacles
    en: ['A learner’s attention can turn a practical goal into something achievable.', 'Collecting information without applying it may postpone useful experience.', 'Make the goal small enough to practice rather than merely research.', 'Choose one lesson, tool, or technique and apply it to a real task this week.'],
    vi: ['Sự chú tâm của người học giúp mục tiêu thực tế thành điều có thể đạt.', 'Chỉ gom thông tin mà không áp dụng có thể trì hoãn trải nghiệm hữu ích.', 'Thu mục tiêu đủ nhỏ để luyện chứ không chỉ nghiên cứu.', 'Chọn một bài học, công cụ hoặc kỹ thuật và áp dụng vào việc thật trong tuần này.'],
  },
  75: { // Knight of Pentacles
    en: ['Reliable, repeatable work can build progress that survives changes in motivation.', 'A routine may become rigid or continue after it has stopped serving its purpose.', 'Keep the dependable core and adjust the part that is no longer useful.', 'Set one small recurring task and review after a week whether the method needs changing.'],
    vi: ['Công việc đáng tin, lặp đều giúp tiến bộ không phụ thuộc hoàn toàn vào hứng thú.', 'Thói quen có thể cứng nhắc hoặc kéo dài dù không còn phục vụ mục đích.', 'Giữ phần cốt lõi đáng tin và điều chỉnh phần đã hết hữu ích.', 'Đặt một việc nhỏ lặp lại và sau một tuần xem cách làm có cần thay đổi không.'],
  },
  76: { // Queen of Pentacles
    en: ['Practical care can make daily life more comfortable and sustainable.', 'Caring for everyone else can leave your own needs unfunded or unnoticed.', 'Include your body, space, and resources in the circle of care.', 'Improve one everyday support for yourself: prepare a meal, clear a resting place, or ask for practical help.'],
    vi: ['Chăm sóc thực tế giúp đời sống hằng ngày dễ chịu và bền vững hơn.', 'Chăm mọi người có thể khiến nhu cầu riêng không được dành nguồn lực hay chú ý.', 'Đưa cơ thể, không gian và nguồn lực của mình vào vòng chăm sóc.', 'Cải thiện một hỗ trợ thường ngày cho mình: chuẩn bị bữa ăn, dọn chỗ nghỉ hoặc nhờ giúp việc cụ thể.'],
  },
  77: { // King of Pentacles
    en: ['Experience and responsible stewardship can make resources dependable for others too.', 'Accumulation, status, or fear of loss may replace the wellbeing they were meant to support.', 'Define a successful outcome in terms of stability and real benefit, not appearance alone.', 'Review one resource commitment and choose how it can support a clear, sustainable long-term need.'],
    vi: ['Kinh nghiệm và quản lý có trách nhiệm giúp nguồn lực trở nên đáng tin cho cả người khác.', 'Tích lũy, địa vị hoặc sợ mất có thể thay thế đời sống tốt mà chúng vốn cần nâng đỡ.', 'Định nghĩa kết quả tốt bằng ổn định và lợi ích thật, không chỉ vẻ ngoài.', 'Xem lại một cam kết nguồn lực và chọn cách nó nâng đỡ nhu cầu dài hạn rõ ràng, bền vững.'],
  },
};

/** Canonical guidance for display and model context; unknown IDs fail explicitly. */
export function getCardGuidance(cardId: number, language: string = 'en'): CardGuidance {
  const card = Number.isInteger(cardId) ? cards.find(candidate => candidate.id === cardId) : undefined;
  const entry = guidance[cardId];
  if (!card || !entry) throw new RangeError('Choose a valid card from the 78-card Eva Tarot deck.');
  const vietnamese = language === 'vi';
  const [good, challenge, advice, direction] = vietnamese ? entry.vi : entry.en;
  return { meaning: vietnamese ? tarotVi[cardId].meaning : card.meaning, good, challenge, advice, direction };
}
