// xwerse-partner-guide.js — Partner Program "How it works" content (English / हिन्दी / Hinglish).
// Used by /PartnerGuide and by the first-time onboarding on /Partner. Lines starting with "• " render as bullets.
(function () {
  var LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['hx', 'Hinglish']];
  var UI = {
    en: { title: 'Partner Program: How it works', sub: 'Everything you need to know before you start. Read it once, come back whenever you have a doubt.', lang: 'Language', step: 'Step {n} of {m}', next: 'Next', back: 'Back', agree: 'I have read and understood all sections, and I agree to follow the Partner Program rules.', startQuiz: 'Continue to the quiz', guide: 'How it works', toc: 'Contents', onbTitle: 'Before you join', onbSub: 'Please read the guide first. After that, a short quiz confirms you are ready to start.', quizTitle: 'Readiness quiz', quizSub: 'Answer {n} questions. You need at least {p} correct to join.', submit: 'Submit answers', answered: 'Please answer every question.', passed: 'Well done. You are ready.', failed: 'Not yet: {c} of {n} correct, {p} needed. Please review the marked topics and try again.', retry: 'Review the guide and retry', joining: 'Creating your partner account…', review: 'Review this topic', home: 'Back to XwerseMovies', joinNow: 'Join the Partner Program', correct: 'correct' },
    hi: { title: 'पार्टनर प्रोग्राम: यह कैसे काम करता है', sub: 'शुरू करने से पहले आपको जो कुछ जानना ज़रूरी है, सब यहाँ है। एक बार पढ़ लें, और कभी भी संदेह हो तो दोबारा देखें।', lang: 'भाषा', step: 'चरण {n} / {m}', next: 'आगे', back: 'पीछे', agree: 'मैंने सभी भाग पढ़ और समझ लिए हैं, और मैं पार्टनर प्रोग्राम के नियमों का पालन करूँगा/करूँगी।', startQuiz: 'क्विज़ पर जाएँ', guide: 'यह कैसे काम करता है', toc: 'विषय-सूची', onbTitle: 'जुड़ने से पहले', onbSub: 'कृपया पहले गाइड पढ़ें। उसके बाद एक छोटा क्विज़ यह पुष्टि करेगा कि आप शुरू करने के लिए तैयार हैं।', quizTitle: 'तैयारी क्विज़', quizSub: '{n} प्रश्नों के उत्तर दें। जुड़ने के लिए कम से कम {p} सही होने चाहिए।', submit: 'उत्तर जमा करें', answered: 'कृपया सभी प्रश्नों का उत्तर दें।', passed: 'बहुत बढ़िया। आप तैयार हैं।', failed: 'अभी नहीं: {n} में से {c} सही, {p} ज़रूरी हैं। कृपया चिह्नित विषय दोबारा पढ़ें और फिर प्रयास करें।', retry: 'गाइड दोबारा पढ़ें और फिर प्रयास करें', joining: 'आपका पार्टनर खाता बन रहा है…', review: 'यह विषय दोबारा पढ़ें', home: 'XwerseMovies पर वापस जाएँ', joinNow: 'पार्टनर प्रोग्राम से जुड़ें', correct: 'सही' },
    hx: { title: 'Partner Program: Ye kaise kaam karta hai', sub: 'Shuru karne se pehle jo kuch jaanna zaroori hai, sab yahin hai. Ek baar padh lijiye, aur kabhi bhi doubt ho to dobara dekh lijiye.', lang: 'Language', step: 'Step {n} / {m}', next: 'Aage', back: 'Peeche', agree: 'Maine saare sections padh aur samajh liye hain, aur main Partner Program ke rules follow karunga/karungi.', startQuiz: 'Quiz par jayein', guide: 'Ye kaise kaam karta hai', toc: 'Contents', onbTitle: 'Join karne se pehle', onbSub: 'Pehle guide padhiye. Uske baad ek chhota quiz confirm karega ki aap shuru karne ke liye ready hain.', quizTitle: 'Readiness quiz', quizSub: '{n} sawalon ke jawab dijiye. Join karne ke liye kam se kam {p} sahi hone chahiye.', submit: 'Jawab submit karein', answered: 'Kripya har sawal ka jawab dijiye.', passed: 'Bahut badhiya. Aap ready hain.', failed: 'Abhi nahi: {n} mein se {c} sahi, {p} zaroori hain. Marked topics dobara padhiye aur phir try kijiye.', retry: 'Guide dobara padhein aur retry karein', joining: 'Aapka partner account ban raha hai…', review: 'Ye topic dobara padhein', home: 'XwerseMovies par wapas', joinNow: 'Partner Program join karein', correct: 'sahi' }
  };
  var S = [
    { id: 'what', icon: '🤝', t: { en: 'What the Partner Program is', hi: 'पार्टनर प्रोग्राम क्या है', hx: 'Partner Program kya hai' }, b: {
      en: ['The Partner Program lets you earn by bringing new viewers to XwerseMovies. You receive a personal link for every eligible title. When people you bring watch that title, you earn a share of the advertising revenue it generates.',
        '• You do not need any technical knowledge. Your dashboard gives you ready links and shows your numbers.',
        '• You are paid from real revenue, not from a fixed price per click or per view. This keeps the programme sustainable and fair for everyone.',
        '• Everything is tracked automatically. Nothing needs to be requested or approved for each title.'],
      hi: ['पार्टनर प्रोग्राम से आप XwerseMovies पर नए दर्शक लाकर कमाई कर सकते हैं। हर पात्र टाइटल के लिए आपको एक व्यक्तिगत लिंक मिलता है। जब आपके लाए हुए लोग वह टाइटल देखते हैं, तो उससे होने वाली विज्ञापन आय में आपको हिस्सा मिलता है।',
        '• इसके लिए किसी तकनीकी जानकारी की ज़रूरत नहीं है। आपके डैशबोर्ड पर तैयार लिंक और आपके आँकड़े मिलते हैं।',
        '• भुगतान वास्तविक आय से होता है, प्रति क्लिक या प्रति व्यू किसी तय दर से नहीं। इससे प्रोग्राम टिकाऊ और सभी के लिए निष्पक्ष रहता है।',
        '• सब कुछ अपने-आप ट्रैक होता है। हर टाइटल के लिए अलग से अनुमति माँगने की ज़रूरत नहीं।'],
      hx: ['Partner Program se aap XwerseMovies par naye viewers laakar kamai kar sakte hain. Har eligible title ke liye aapko ek personal link milta hai. Jab aapke laaye hue log wo title dekhte hain, to usse hone wali ad revenue mein aapko hissa milta hai.',
        '• Iske liye koi technical knowledge nahi chahiye. Dashboard par ready links aur aapke numbers milte hain.',
        '• Payment real revenue se hota hai, per click ya per view fixed rate se nahi. Isse program sustainable aur sabke liye fair rehta hai.',
        '• Sab kuch automatically track hota hai. Har title ke liye alag se permission lene ki zaroorat nahi.'] } },

    { id: 'earn', icon: '💰', t: { en: 'How your earnings are calculated', hi: 'आपकी कमाई कैसे तय होती है', hx: 'Aapki earnings kaise calculate hoti hain' }, b: {
      en: ['Every week, the ad network pays XwerseMovies a real amount for the views of our free movies. Your earnings are 50% of that amount, divided in proportion to the counted views you brought.',
        '• Your share = real weekly ad revenue × 50% × (your weighted views ÷ all weighted views of that week).',
        '• All counted views take part in the split, including views that did not come from any partner. This protects the programme from inflated payouts.',
        '• Not every country pays the same. Views from countries with higher ad rates carry a higher weight, views from lower-paying countries a lower weight.',
        '• Because the amount depends on real revenue, there is no fixed rate per view. A good week for the ad network is a good week for you.'],
      hi: ['हर सप्ताह विज्ञापन नेटवर्क हमारी मुफ़्त फ़िल्मों के व्यू के बदले XwerseMovies को वास्तविक राशि देता है। आपकी कमाई उस राशि का 50% होती है, जो आपके लाए गए गिने गए व्यू के अनुपात में बाँटी जाती है।',
        '• आपका हिस्सा = उस सप्ताह की वास्तविक विज्ञापन आय × 50% × (आपके भारित व्यू ÷ उस सप्ताह के सभी भारित व्यू)।',
        '• बँटवारे में सभी गिने गए व्यू शामिल होते हैं, उनके भी जो किसी पार्टनर से नहीं आए। इससे भुगतान बढ़ा-चढ़ाकर नहीं दिए जा सकते।',
        '• हर देश में दर एक जैसी नहीं होती। अधिक विज्ञापन दर वाले देशों के व्यू का भार अधिक, और कम दर वाले देशों के व्यू का भार कम होता है।',
        '• राशि वास्तविक आय पर निर्भर है, इसलिए प्रति व्यू कोई तय दर नहीं है। विज्ञापन नेटवर्क के लिए अच्छा सप्ताह आपके लिए भी अच्छा सप्ताह होता है।'],
      hx: ['Har hafte ad network hamari free movies ke views ke badle XwerseMovies ko real amount deta hai. Aapki earnings us amount ka 50% hoti hain, jo aapke laaye hue counted views ke ratio mein baanti jaati hai.',
        '• Aapka hissa = us hafte ki real ad revenue × 50% × (aapke weighted views ÷ us hafte ke saare weighted views).',
        '• Split mein saare counted views shamil hote hain, unke bhi jo kisi partner se nahi aaye. Isse payouts badha-chadhakar nahi diye ja sakte.',
        '• Har country ka rate same nahi hota. Zyada ad rate wali countries ke views ka weight zyada, aur kam rate wali countries ke views ka weight kam hota hai.',
        '• Amount real revenue par depend karta hai, isliye per view koi fixed rate nahi hai. Ad network ke liye achha hafta aapke liye bhi achha hafta hota hai.'] } },

    { id: 'links', icon: '🔗', t: { en: 'Your links and viewer attribution', hi: 'आपके लिंक और दर्शक की पहचान', hx: 'Aapke links aur viewer attribution' }, b: {
      en: ['In the Links section of your dashboard you find one link per eligible title. Share it anywhere: WhatsApp, Telegram, Instagram, your own channel or website.',
        '• Eligible titles are the free movies hosted on our free video player. The list appears automatically and new uploads are added by themselves. Series and other titles do not earn.',
        '• When a signed-in viewer with a verified email opens your link for a title they have never watched before, that viewer is permanently attached to you for that title.',
        '• If a viewer already used another partner link for the same title, the first link stays. The latest link never replaces it.',
        '• A viewer who had already watched that title earlier cannot be attached to anyone.',
        '• You cannot earn from yourself. Watching through your own link, or through a second account or on your own network, is blocked and detected.'],
      hi: ['आपके डैशबोर्ड के लिंक सेक्शन में हर पात्र टाइटल के लिए एक लिंक मिलता है। इसे कहीं भी शेयर करें: WhatsApp, Telegram, Instagram, अपना चैनल या वेबसाइट।',
        '• पात्र टाइटल वे मुफ़्त फ़िल्में हैं जो हमारे मुफ़्त वीडियो प्लेयर पर चलती हैं। सूची अपने-आप बनती है और नई अपलोड की गई फ़िल्में खुद जुड़ जाती हैं। सीरीज़ और अन्य टाइटल से कमाई नहीं होती।',
        '• जब साइन-इन किया हुआ और ईमेल वेरिफ़ाइड दर्शक आपके लिंक से कोई ऐसा टाइटल खोलता है जो उसने पहले कभी नहीं देखा, तो वह उस टाइटल के लिए हमेशा के लिए आपसे जुड़ जाता है।',
        '• यदि दर्शक उसी टाइटल के लिए पहले किसी दूसरे पार्टनर का लिंक इस्तेमाल कर चुका है, तो पहला लिंक ही मान्य रहता है। बाद का लिंक उसे बदल नहीं सकता।',
        '• जिस दर्शक ने वह टाइटल पहले देखा हो, वह किसी से नहीं जोड़ा जा सकता।',
        '• आप खुद से कमाई नहीं कर सकते। अपने ही लिंक, दूसरे खाते या अपने ही नेटवर्क से देखना रोका और पहचाना जाता है।'],
      hx: ['Dashboard ke Links section mein har eligible title ka ek link milta hai. Isse kahin bhi share kijiye: WhatsApp, Telegram, Instagram, apna channel ya website.',
        '• Eligible titles wo free movies hain jo hamare free video player par chalti hain. List automatically banti hai aur nayi upload hui movies khud add ho jaati hain. Series aur baaki titles se earning nahi hoti.',
        '• Jab signed-in aur verified email wala viewer aapke link se koi aisa title kholta hai jo usne pehle kabhi nahi dekha, to wo us title ke liye hamesha ke liye aapse jud jaata hai.',
        '• Agar viewer usi title ke liye pehle kisi aur partner ka link use kar chuka hai, to pehla link hi valid rehta hai. Baad ka link usse replace nahi karta.',
        '• Jis viewer ne wo title pehle dekha ho, wo kisi se attach nahi hota.',
        '• Aap khud se earn nahi kar sakte. Apne hi link, dusre account ya apne hi network se dekhna block aur detect kiya jaata hai.'] } },

    { id: 'views', icon: '✅', t: { en: 'What counts as a valid view', hi: 'कौन-सा व्यू मान्य है', hx: 'Kaun sa view valid hai' }, b: {
      en: ['Only genuine views are counted. A view is valid when all of the following are true:',
        '• The viewer is signed in and has a verified email address.',
        '• The viewer has really watched for at least 60 seconds. The server checks this, so opening a page or skipping forward does not count.',
        '• No VPN or proxy is in use.',
        '• No ad-blocker is active. Ads are what fund the programme, so a view without ads earns nothing.',
        '• Each user and each internet connection (IP address) has at most 2 counted views in any 24 hours. Further views are still welcome but are not counted.',
        'The Reports on your dashboard show why a view was not counted (for example too short, VPN, ad-blocker or daily limit), so you can guide your audience.'],
      hi: ['केवल वास्तविक व्यू गिने जाते हैं। कोई व्यू तभी मान्य है जब नीचे दी गई सभी बातें सही हों:',
        '• दर्शक साइन-इन है और उसका ईमेल वेरिफ़ाइड है।',
        '• दर्शक ने कम से कम 60 सेकंड वास्तव में देखा हो। यह सर्वर जाँचता है, इसलिए सिर्फ़ पेज खोलने या आगे स्किप करने से व्यू नहीं गिना जाता।',
        '• VPN या प्रॉक्सी इस्तेमाल न हो रहा हो।',
        '• कोई ऐड-ब्लॉकर सक्रिय न हो। प्रोग्राम विज्ञापनों से चलता है, इसलिए बिना विज्ञापन वाले व्यू से कमाई नहीं होती।',
        '• हर यूज़र और हर इंटरनेट कनेक्शन (IP) के अधिकतम 2 व्यू किसी भी 24 घंटे में गिने जाते हैं। इसके बाद के व्यू का स्वागत है, पर वे गिने नहीं जाते।',
        'आपके डैशबोर्ड की रिपोर्ट बताती है कि कोई व्यू क्यों नहीं गिना गया (जैसे बहुत छोटा, VPN, ऐड-ब्लॉकर या दैनिक सीमा), ताकि आप अपने दर्शकों को सही मार्गदर्शन दे सकें।'],
      hx: ['Sirf genuine views count hote hain. Koi view tabhi valid hai jab neeche di gayi saari baatein sahi hon:',
        '• Viewer signed-in ho aur uska email verified ho.',
        '• Viewer ne kam se kam 60 seconds sach mein dekha ho. Ye server check karta hai, isliye sirf page kholne ya aage skip karne se view count nahi hota.',
        '• VPN ya proxy use na ho raha ho.',
        '• Koi ad-blocker active na ho. Program ads se chalta hai, isliye bina ads wale view se earning nahi hoti.',
        '• Har user aur har internet connection (IP) ke maximum 2 views kisi bhi 24 ghante mein count hote hain. Uske baad ke views welcome hain, par count nahi hote.',
        'Dashboard ki Reports batati hain ki koi view kyun count nahi hua (jaise bahut chhota, VPN, ad-blocker ya daily limit), taaki aap apni audience ko sahi guide kar sakein.'] } },

    { id: 'settle', icon: '📅', t: { en: 'Estimates and weekly settlement', hi: 'अनुमान और साप्ताहिक सेटलमेंट', hx: 'Estimates aur weekly settlement' }, b: {
      en: ['Your dashboard shows live estimates. They are deliberately conservative and are meant for guidance only. The final amount is fixed in the weekly settlement.',
        '• Weeks run from Monday to Sunday (UTC). After a week ends, our team enters the real revenue reported by the ad network, and the amount is divided as described above.',
        '• Each week moves through clear stages: Checking (being reviewed), Approved (locked by the admin) and Confirmed (the ad network has paid us).',
        '• Estimates can differ from the final amount. Final numbers can be higher or lower, depending on the real revenue of that week.',
        '• Every settlement is reviewed and only the admin can approve it. All changes are logged.'],
      hi: ['आपके डैशबोर्ड पर लाइव अनुमान दिखते हैं। ये जानबूझकर थोड़े कम रखे जाते हैं और केवल मार्गदर्शन के लिए हैं। अंतिम राशि साप्ताहिक सेटलमेंट में तय होती है।',
        '• सप्ताह सोमवार से रविवार (UTC) तक चलता है। सप्ताह खत्म होने के बाद हमारी टीम विज्ञापन नेटवर्क की वास्तविक आय दर्ज करती है और राशि ऊपर बताए तरीके से बाँटी जाती है।',
        '• हर सप्ताह साफ़ चरणों से गुज़रता है: जाँच में (समीक्षा हो रही है), स्वीकृत (एडमिन द्वारा लॉक) और पुष्ट (विज्ञापन नेटवर्क ने हमें भुगतान कर दिया)।',
        '• अनुमान और अंतिम राशि में अंतर हो सकता है। अंतिम आँकड़े उस सप्ताह की वास्तविक आय के अनुसार अधिक या कम हो सकते हैं।',
        '• हर सेटलमेंट की समीक्षा होती है और केवल एडमिन ही उसे स्वीकृत कर सकता है। सभी बदलाव लॉग में दर्ज होते हैं।'],
      hx: ['Dashboard par live estimates dikhte hain. Ye jaanbujhkar thode kam rakhe jaate hain aur sirf guidance ke liye hain. Final amount weekly settlement mein tay hota hai.',
        '• Week Monday se Sunday (UTC) tak chalta hai. Week khatam hone ke baad hamari team ad network ki real revenue enter karti hai aur amount upar bataye tarike se baanta jaata hai.',
        '• Har week clear stages se guzarta hai: Checking (review ho raha hai), Approved (admin ne lock kiya) aur Confirmed (ad network ne hamein payment kar diya).',
        '• Estimate aur final amount mein fark ho sakta hai. Final numbers us hafte ki real revenue ke hisaab se zyada ya kam ho sakte hain.',
        '• Har settlement review hoti hai aur sirf admin approve kar sakta hai. Saare changes log mein darj hote hain.'] } },

    { id: 'payout', icon: '🏦', t: { en: 'Payouts: how and when you get paid', hi: 'भुगतान: कैसे और कब मिलेगा', hx: 'Payouts: kaise aur kab milega' }, b: {
      en: ['Money becomes available to withdraw in your Payouts section once the following are done: the week is approved, the ad network has paid us for it, and the hold period has passed (14 days by default, shown on your dashboard).',
        '• Payment methods: UPI, or USDT on the TRC20 or BEP20 network. Save your details in the Payouts section first.',
        '• Minimum payout: ₹500 (UPI) or $5 (USDT). INR amounts use the live exchange rate.',
        '• You can have one open payout request at a time. A request uses your full available balance.',
        '• Your first payout is checked by hand before it is sent. This is a one-time safety step.',
        '• Double-check your address and network. A transfer sent to a wrong address or wrong network cannot be recovered, and we cannot reverse it.',
        '• Your payout history, with the transaction reference, is always visible in your dashboard.'],
      hi: ['आपके भुगतान सेक्शन में राशि तब निकासी के लिए उपलब्ध होती है जब ये पूरे हों: सप्ताह स्वीकृत हो चुका हो, विज्ञापन नेटवर्क ने हमें उसका भुगतान कर दिया हो, और होल्ड अवधि बीत चुकी हो (डिफ़ॉल्ट 14 दिन, आपके डैशबोर्ड पर दिखती है)।',
        '• भुगतान के तरीके: UPI, या TRC20 / BEP20 नेटवर्क पर USDT। पहले भुगतान सेक्शन में अपना विवरण सेव करें।',
        '• न्यूनतम भुगतान: ₹500 (UPI) या $5 (USDT)। रुपये की राशि लाइव विनिमय दर से तय होती है।',
        '• एक समय में केवल एक खुला भुगतान अनुरोध हो सकता है। अनुरोध आपके पूरे उपलब्ध बैलेंस का होता है।',
        '• आपका पहला भुगतान भेजने से पहले हाथ से जाँचा जाता है। यह एक बार का सुरक्षा कदम है।',
        '• अपना पता और नेटवर्क दोबारा जाँच लें। ग़लत पते या ग़लत नेटवर्क पर भेजी राशि वापस नहीं आ सकती, और हम उसे वापस नहीं कर सकते।',
        '• ट्रांज़ैक्शन रेफ़रेंस के साथ आपका भुगतान इतिहास हमेशा डैशबोर्ड पर दिखता है।'],
      hx: ['Payouts section mein paisa tab withdraw ke liye available hota hai jab ye sab ho jayein: week approved ho, ad network ne uska payment hamein kar diya ho, aur hold period beet chuka ho (default 14 din, dashboard par dikhta hai).',
        '• Payment methods: UPI, ya TRC20 / BEP20 network par USDT. Pehle Payouts section mein apni details save kijiye.',
        '• Minimum payout: ₹500 (UPI) ya $5 (USDT). Rupee amount live exchange rate se tay hota hai.',
        '• Ek samay par sirf ek open payout request ho sakti hai. Request aapke poore available balance ki hoti hai.',
        '• Aapka pehla payout bhejne se pehle haath se check kiya jaata hai. Ye ek baar ka safety step hai.',
        '• Apna address aur network dobara check kijiye. Galat address ya galat network par bheja gaya paisa wapas nahi aa sakta, aur hum use reverse nahi kar sakte.',
        '• Transaction reference ke saath aapki payout history hamesha dashboard par dikhti hai.'] } },

    { id: 'rules', icon: '🛡️', t: { en: 'Rules and fair play', hi: 'नियम और निष्पक्ष व्यवहार', hx: 'Rules aur fair play' }, b: {
      en: ['The programme works because the traffic is real. Please follow these rules:',
        '• Do not watch or click through your own links, and do not use second accounts, friends or devices on your network to create views.',
        '• Do not use bots, scripts, auto-refresh, VPNs, proxies or any tool that fakes views, locations or watch time.',
        '• Do not pay or reward people for watching, and do not mislead people about what they will see.',
        '• Do not share your account or code. Payouts go only to the payout details saved in your account.',
        'We monitor traffic quality automatically and manually. If we find fake or suspicious traffic, we may put the account on hold or ban it, and cancel the related earnings. Genuine partners have nothing to worry about.'],
      hi: ['प्रोग्राम तभी चलता है जब ट्रैफ़िक असली हो। कृपया इन नियमों का पालन करें:',
        '• अपने ही लिंक से न देखें, और व्यू बनाने के लिए दूसरे खाते, मित्र या अपने नेटवर्क के उपकरणों का उपयोग न करें।',
        '• बॉट, स्क्रिप्ट, ऑटो-रिफ़्रेश, VPN, प्रॉक्सी या ऐसे किसी भी टूल का उपयोग न करें जो व्यू, लोकेशन या देखने का समय नकली बनाता हो।',
        '• देखने के लिए लोगों को पैसे या इनाम न दें, और लोगों को यह न बताएँ कि वे कुछ ऐसा देखेंगे जो वास्तव में नहीं है।',
        '• अपना खाता या कोड किसी को साझा न करें। भुगतान केवल आपके खाते में सेव किए गए भुगतान विवरण पर ही भेजा जाता है।',
        'हम ट्रैफ़िक की गुणवत्ता की स्वचालित और मैन्युअल निगरानी करते हैं। नकली या संदिग्ध ट्रैफ़िक मिलने पर खाते को होल्ड या बैन किया जा सकता है और संबंधित कमाई रद्द की जा सकती है। असली पार्टनर्स को चिंता की कोई बात नहीं।'],
      hx: ['Program tabhi chalta hai jab traffic real ho. Kripya in rules ko follow kijiye:',
        '• Apne hi links se na dekhein, aur views banane ke liye dusre accounts, doston ya apne network ke devices ka use na karein.',
        '• Bots, scripts, auto-refresh, VPN, proxy ya aisa koi bhi tool use na karein jo views, location ya watch time fake kare.',
        '• Dekhne ke liye logon ko paise ya reward na dein, aur logon ko galat batakar na bulayein ki wo kya dekhenge.',
        '• Apna account ya code kisi ko share na karein. Payout sirf aapke account mein saved payout details par hi jaata hai.',
        'Hum traffic quality ko automatic aur manual dono tarah monitor karte hain. Fake ya suspicious traffic milne par account ko hold ya ban kiya ja sakta hai aur us se judi earnings cancel ho sakti hain. Genuine partners ko chinta ki koi baat nahi.'] } },

    { id: 'faq', icon: '❓', t: { en: 'Common questions', hi: 'अक्सर पूछे जाने वाले प्रश्न', hx: 'Aksar poochhe jaane wale sawal' }, b: {
      en: ['• My view was not counted. Why? Open Reports on your dashboard. It lists the reason: too short, VPN or proxy, ad-blocker, email not verified, or the daily limit of 2 views.',
        '• I do not see a title in my Links. Only free movies on our free player are eligible. The list updates automatically.',
        '• The estimate is lower or higher than my final amount. Estimates are kept conservative. The final amount follows the real revenue of the week.',
        '• Money shows as Held. It is waiting for the ad network to pay us and for the hold period to pass. Then it moves to Available.',
        '• Can I change my UPI or USDT details? Yes, in the Payouts section. Always double-check them before you request a payout.',
        '• Someone I referred was already watching the title. Then the viewer cannot be attached to you, by design.',
        '• Need more help? Use the Contact page and include your partner code.'],
      hi: ['• मेरा व्यू क्यों नहीं गिना गया? डैशबोर्ड की रिपोर्ट खोलें। वहाँ कारण लिखा होता है: बहुत छोटा, VPN या प्रॉक्सी, ऐड-ब्लॉकर, ईमेल वेरिफ़ाइड नहीं, या 2 व्यू की दैनिक सीमा।',
        '• मुझे लिंक में कोई टाइटल नहीं दिख रहा। केवल हमारे मुफ़्त प्लेयर वाली मुफ़्त फ़िल्में पात्र हैं। सूची अपने-आप अपडेट होती है।',
        '• अनुमान मेरी अंतिम राशि से कम या ज़्यादा है। अनुमान सावधानी से कम रखे जाते हैं। अंतिम राशि उस सप्ताह की वास्तविक आय के अनुसार होती है।',
        '• राशि "होल्ड" दिख रही है। यह विज्ञापन नेटवर्क से हमारे भुगतान और होल्ड अवधि पूरी होने की प्रतीक्षा में है। उसके बाद वह "उपलब्ध" हो जाती है।',
        '• क्या मैं UPI या USDT विवरण बदल सकता/सकती हूँ? हाँ, भुगतान सेक्शन में। भुगतान अनुरोध से पहले उन्हें दोबारा ज़रूर जाँचें।',
        '• मेरा लाया दर्शक वह टाइटल पहले से देख रहा था। तब नियम के अनुसार वह आपसे नहीं जुड़ सकता।',
        '• और मदद चाहिए? संपर्क पेज का उपयोग करें और अपना पार्टनर कोड लिखें।'],
      hx: ['• Mera view count kyun nahi hua? Dashboard ki Reports kholiye. Wahan reason likha hota hai: bahut chhota, VPN ya proxy, ad-blocker, email verified nahi, ya 2 views ki daily limit.',
        '• Mujhe Links mein koi title nahi dikh raha. Sirf hamare free player wali free movies eligible hain. List automatically update hoti hai.',
        '• Estimate mere final amount se kam ya zyada hai. Estimates conservative rakhe jaate hain. Final amount us hafte ki real revenue ke hisaab se hota hai.',
        '• Amount "Held" dikh raha hai. Ye ad network se hamare payment aur hold period poora hone ka wait kar raha hai. Uske baad "Available" ho jaata hai.',
        '• Kya main UPI ya USDT details badal sakta/sakti hoon? Haan, Payouts section mein. Payout request se pehle unhe dobara zaroor check kijiye.',
        '• Mera laaya viewer wo title pehle se dekh raha tha. To rule ke hisaab se wo aapse attach nahi ho sakta.',
        '• Aur help chahiye? Contact page use kijiye aur apna partner code likhiye.'] } }
  ];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sectionHtml(sec, lang) {
    var lines = sec.b[lang] || sec.b.en, out = '', inList = false;
    lines.forEach(function (l) {
      if (l.indexOf('• ') === 0) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + esc(l.slice(2)) + '</li>'; }
      else { if (inList) { out += '</ul>'; inList = false; } out += '<p>' + esc(l) + '</p>'; }
    });
    if (inList) out += '</ul>';
    return '<div class="pg-sec" id="sec-' + sec.id + '"><h2>' + sec.icon + ' ' + esc(sec.t[lang] || sec.t.en) + '</h2>' + out + '</div>';
  }
  var cur = 'en'; try { var sv = localStorage.getItem('xv_pglang'); if (sv && UI[sv]) cur = sv; } catch (e) {}
  window.PG = {
    LANGS: LANGS, UI: UI, S: S, esc: esc, sectionHtml: sectionHtml,
    lang: function () { return cur; },
    setLang: function (l) { if (UI[l]) { cur = l; try { localStorage.setItem('xv_pglang', l); } catch (e) {} } },
    t: function (k, vars) { var s = (UI[cur] || UI.en)[k] || UI.en[k] || ''; for (var v in (vars || {})) s = s.replace('{' + v + '}', vars[v]); return s; },
    langBar: function (fn) { return '<div class="pg-lang"><span>' + esc(UI[cur].lang) + ':</span>' + LANGS.map(function (x) { return '<button class="pg-lb' + (x[0] === cur ? ' on' : '') + '" onclick="' + fn + '(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>'; },
    css: '.pg-lang{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 16px;font-size:.85rem;color:rgba(255,255,255,.65)}.pg-lb{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:6px 14px;cursor:pointer;font-size:.85rem}.pg-lb.on{background:#e50914;border-color:#e50914}.pg-sec{margin:0 0 22px}.pg-sec h2{font-size:1.1rem;margin:0 0 10px}.pg-sec p,.pg-sec li{font-size:.92rem;line-height:1.7;color:rgba(255,255,255,.82)}.pg-sec ul{padding-left:20px;margin:6px 0}.pg-sec li{margin-bottom:6px}'
  };
})();
