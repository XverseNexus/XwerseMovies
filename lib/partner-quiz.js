// lib/partner-quiz.js — readiness quiz for new partners. Answers live ONLY on the server.
// Each question: topic (guide section id), c = index of the correct option, q / o in en · hi · hx.
const Q = (id, topic, c, q, o) => ({ id, topic, c, q, o });
const BANK = [
  Q('earn1', 'earn', 0,
    { en: 'How is a partner\'s money calculated?', hi: 'पार्टनर की कमाई कैसे तय होती है?', hx: 'Partner ki earning kaise calculate hoti hai?' },
    [{ en: '50% of the real ad revenue of the week, split by counted views', hi: 'सप्ताह की वास्तविक विज्ञापन आय का 50%, गिने गए व्यू के अनुपात में', hx: 'Hafte ki real ad revenue ka 50%, counted views ke ratio mein' },
     { en: 'A fixed amount for every click on the link', hi: 'लिंक पर हर क्लिक के लिए तय राशि', hx: 'Link par har click ke liye fixed amount' },
     { en: 'A fixed amount for every signup', hi: 'हर साइनअप के लिए तय राशि', hx: 'Har signup ke liye fixed amount' },
     { en: 'A fixed salary every month', hi: 'हर महीने तय वेतन', hx: 'Har mahine fixed salary' }]),
  Q('earn2', 'earn', 1,
    { en: 'Do views from every country count equally?', hi: 'क्या हर देश के व्यू का भार बराबर होता है?', hx: 'Kya har country ke views ka weight barabar hota hai?' },
    [{ en: 'Yes, every view is exactly the same', hi: 'हाँ, हर व्यू बिल्कुल बराबर है', hx: 'Haan, har view bilkul barabar hai' },
     { en: 'No, views from higher-paying countries carry more weight', hi: 'नहीं, अधिक दर वाले देशों के व्यू का भार अधिक होता है', hx: 'Nahi, zyada rate wali countries ke views ka weight zyada hota hai' },
     { en: 'No, only views from India count', hi: 'नहीं, केवल भारत के व्यू गिने जाते हैं', hx: 'Nahi, sirf India ke views count hote hain' },
     { en: 'Yes, but only on weekends', hi: 'हाँ, पर केवल सप्ताहांत में', hx: 'Haan, par sirf weekend par' }]),
  Q('earn3', 'earn', 2,
    { en: 'The week\'s pool is shared among which views?', hi: 'सप्ताह की राशि किन व्यू में बाँटी जाती है?', hx: 'Hafte ka amount kin views mein baanta jaata hai?' },
    [{ en: 'Only the views of the best partner', hi: 'केवल सबसे अच्छे पार्टनर के व्यू', hx: 'Sirf sabse achhe partner ke views' },
     { en: 'Only the views of partners who asked for it', hi: 'केवल उन पार्टनर के व्यू जिन्होंने माँगा हो', hx: 'Sirf un partners ke views jinhone maanga ho' },
     { en: 'All counted views of that week, including views that did not come from partners', hi: 'उस सप्ताह के सभी गिने गए व्यू, उनके भी जो पार्टनर से नहीं आए', hx: 'Us hafte ke saare counted views, unke bhi jo partners se nahi aaye' },
     { en: 'Only views from new users', hi: 'केवल नए यूज़र के व्यू', hx: 'Sirf naye users ke views' }]),
  Q('link1', 'links', 0,
    { en: 'A viewer used partner A\'s link for a title, and later opens partner B\'s link for the same title. Who gets the viewer?', hi: 'दर्शक ने किसी टाइटल के लिए पार्टनर A का लिंक इस्तेमाल किया, फिर बाद में उसी टाइटल के लिए पार्टनर B का लिंक खोला। दर्शक किसके साथ जुड़ा रहेगा?', hx: 'Viewer ne kisi title ke liye partner A ka link use kiya, phir baad mein usi title ke liye partner B ka link khola. Viewer kiske saath rahega?' },
    [{ en: 'Partner A, the first link stays', hi: 'पार्टनर A, पहला लिंक ही रहता है', hx: 'Partner A, pehla link hi rehta hai' },
     { en: 'Partner B, the latest link wins', hi: 'पार्टनर B, नया लिंक जीतता है', hx: 'Partner B, naya link jeetata hai' },
     { en: 'Both partners share it', hi: 'दोनों पार्टनर बाँटते हैं', hx: 'Dono partners share karte hain' },
     { en: 'Neither partner', hi: 'कोई नहीं', hx: 'Koi nahi' }]),
  Q('link2', 'links', 3,
    { en: 'Can you earn from your own views or from a second account of yours?', hi: 'क्या आप अपने खुद के व्यू या अपने दूसरे खाते से कमा सकते हैं?', hx: 'Kya aap apne khud ke views ya apne dusre account se kama sakte hain?' },
    [{ en: 'Yes, up to 10 views a day', hi: 'हाँ, रोज़ 10 व्यू तक', hx: 'Haan, roz 10 views tak' },
     { en: 'Yes, if I use a VPN', hi: 'हाँ, अगर मैं VPN इस्तेमाल करूँ', hx: 'Haan, agar main VPN use karoon' },
     { en: 'Yes, if I clear my browser data', hi: 'हाँ, अगर मैं ब्राउज़र डेटा साफ़ करूँ', hx: 'Haan, agar main browser data clear karoon' },
     { en: 'No, self-referral is blocked and detected', hi: 'नहीं, खुद से रेफ़रल रोका और पहचाना जाता है', hx: 'Nahi, self-referral block aur detect hota hai' }]),
  Q('link3', 'links', 1,
    { en: 'Which titles can earn money for partners?', hi: 'किन टाइटल से पार्टनर को कमाई होती है?', hx: 'Kin titles se partners ko earning hoti hai?' },
    [{ en: 'Every title on the website, including series', hi: 'वेबसाइट के सभी टाइटल, सीरीज़ सहित', hx: 'Website ke saare titles, series sahit' },
     { en: 'Free movies on our free video player, listed automatically in my Links', hi: 'हमारे मुफ़्त वीडियो प्लेयर वाली मुफ़्त फ़िल्में, जो मेरे लिंक में अपने-आप दिखती हैं', hx: 'Hamare free video player wali free movies, jo mere Links mein automatically dikhti hain' },
     { en: 'Only titles that I request one by one', hi: 'केवल वे टाइटल जो मैं एक-एक करके माँगूँ', hx: 'Sirf wo titles jo main ek-ek karke maangun' },
     { en: 'Only paid titles', hi: 'केवल पेड टाइटल', hx: 'Sirf paid titles' }]),
  Q('link4', 'links', 2,
    { en: 'A viewer had already watched the title before opening your link. What happens?', hi: 'दर्शक आपका लिंक खोलने से पहले वह टाइटल देख चुका था। क्या होगा?', hx: 'Viewer aapka link kholne se pehle wo title dekh chuka tha. Kya hoga?' },
    [{ en: 'He is attached to you for 24 hours', hi: 'वह 24 घंटे के लिए आपसे जुड़ जाता है', hx: 'Wo 24 ghante ke liye aapse jud jaata hai' },
     { en: 'He is attached to you forever', hi: 'वह हमेशा के लिए आपसे जुड़ जाता है', hx: 'Wo hamesha ke liye aapse jud jaata hai' },
     { en: 'He is not attached to anyone', hi: 'वह किसी से नहीं जुड़ता', hx: 'Wo kisi se attach nahi hota' },
     { en: 'He is attached to the admin', hi: 'वह एडमिन से जुड़ जाता है', hx: 'Wo admin se jud jaata hai' }]),
  Q('view1', 'views', 1,
    { en: 'How long must a viewer really watch for a view to be counted?', hi: 'व्यू गिने जाने के लिए दर्शक को वास्तव में कितना देखना होगा?', hx: 'View count hone ke liye viewer ko sach mein kitna dekhna hoga?' },
    [{ en: 'Just opening the page is enough', hi: 'सिर्फ़ पेज खोलना काफ़ी है', hx: 'Sirf page kholna kaafi hai' },
     { en: 'At least 60 seconds of real watching', hi: 'कम से कम 60 सेकंड का वास्तविक देखना', hx: 'Kam se kam 60 seconds ka real watching' },
     { en: 'At least 5 seconds', hi: 'कम से कम 5 सेकंड', hx: 'Kam se kam 5 seconds' },
     { en: 'The whole movie', hi: 'पूरी फ़िल्म', hx: 'Poori movie' }]),
  Q('view2', 'views', 1,
    { en: 'Which view will NOT be counted?', hi: 'कौन-सा व्यू नहीं गिना जाएगा?', hx: 'Kaun sa view count NAHI hoga?' },
    [{ en: 'A verified user who watches 90 seconds normally', hi: 'वेरिफ़ाइड यूज़र जो सामान्य रूप से 90 सेकंड देखे', hx: 'Verified user jo normally 90 seconds dekhe' },
     { en: 'A user who watches with an ad-blocker turned on', hi: 'यूज़र जो ऐड-ब्लॉकर चालू करके देखे', hx: 'User jo ad-blocker on karke dekhe' },
     { en: 'A user on mobile data', hi: 'मोबाइल डेटा पर यूज़र', hx: 'Mobile data par user' },
     { en: 'A user who watches on a phone', hi: 'फ़ोन पर देखने वाला यूज़र', hx: 'Phone par dekhne wala user' }]),
  Q('view3', 'views', 0,
    { en: 'How many counted views can one user (and one internet connection) have in 24 hours?', hi: 'एक यूज़र (और एक इंटरनेट कनेक्शन) के 24 घंटे में कितने व्यू गिने जा सकते हैं?', hx: 'Ek user (aur ek internet connection) ke 24 ghante mein kitne views count ho sakte hain?' },
    [{ en: 'At most 2', hi: 'अधिकतम 2', hx: 'Maximum 2' },
     { en: 'At most 20', hi: 'अधिकतम 20', hx: 'Maximum 20' },
     { en: 'Unlimited', hi: 'असीमित', hx: 'Unlimited' },
     { en: 'Only 1 per week', hi: 'सप्ताह में केवल 1', hx: 'Hafte mein sirf 1' }]),
  Q('settle1', 'settle', 2,
    { en: 'What are the earnings numbers on the dashboard?', hi: 'डैशबोर्ड पर दिख रही कमाई के आँकड़े क्या हैं?', hx: 'Dashboard par dikh rahe earnings ke numbers kya hain?' },
    [{ en: 'The final guaranteed amount', hi: 'अंतिम गारंटीशुदा राशि', hx: 'Final guaranteed amount' },
     { en: 'A random number', hi: 'एक यादृच्छिक संख्या', hx: 'Ek random number' },
     { en: 'Conservative estimates; the final amount is fixed in the weekly settlement', hi: 'सावधानी से रखे गए अनुमान; अंतिम राशि साप्ताहिक सेटलमेंट में तय होती है', hx: 'Conservative estimates; final amount weekly settlement mein tay hota hai' },
     { en: 'Only a count of clicks', hi: 'केवल क्लिक की गिनती', hx: 'Sirf clicks ki ginti' }]),
  Q('settle2', 'settle', 0,
    { en: 'Which days does a settlement week cover?', hi: 'सेटलमेंट सप्ताह किन दिनों को कवर करता है?', hx: 'Settlement week kin dino ko cover karta hai?' },
    [{ en: 'Monday to Sunday (UTC)', hi: 'सोमवार से रविवार (UTC)', hx: 'Monday se Sunday (UTC)' },
     { en: 'Friday to Thursday', hi: 'शुक्रवार से गुरुवार', hx: 'Friday se Thursday' },
     { en: 'A full month', hi: 'पूरा महीना', hx: 'Poora mahina' },
     { en: 'One day', hi: 'एक दिन', hx: 'Ek din' }]),
  Q('pay1', 'payout', 3,
    { en: 'What is the minimum payout?', hi: 'न्यूनतम भुगतान कितना है?', hx: 'Minimum payout kitna hai?' },
    [{ en: '₹10', hi: '₹10', hx: '₹10' }, { en: '₹100', hi: '₹100', hx: '₹100' }, { en: '₹5000', hi: '₹5000', hx: '₹5000' },
     { en: '₹500 (UPI) or $5 (USDT)', hi: '₹500 (UPI) या $5 (USDT)', hx: '₹500 (UPI) ya $5 (USDT)' }]),
  Q('pay2', 'payout', 1,
    { en: 'When does money become available to withdraw?', hi: 'राशि निकासी के लिए कब उपलब्ध होती है?', hx: 'Paisa withdraw ke liye kab available hota hai?' },
    [{ en: 'Immediately after every view', hi: 'हर व्यू के तुरंत बाद', hx: 'Har view ke turant baad' },
     { en: 'After the week is approved, the ad network has paid us, and the hold period has passed', hi: 'सप्ताह स्वीकृत होने, विज्ञापन नेटवर्क का भुगतान आने और होल्ड अवधि पूरी होने के बाद', hx: 'Week approve hone, ad network ka payment aane aur hold period poora hone ke baad' },
     { en: 'Only on the 1st of the year', hi: 'केवल साल की 1 तारीख़ को', hx: 'Sirf saal ki 1 tareekh ko' },
     { en: 'Whenever I ask support', hi: 'जब भी मैं सपोर्ट से कहूँ', hx: 'Jab bhi main support se kahoon' }]),
  Q('pay3', 'payout', 0,
    { en: 'You saved a wrong USDT address or network and money was sent there. What happens?', hi: 'आपने ग़लत USDT पता या नेटवर्क सेव किया और राशि वहाँ भेज दी गई। क्या होगा?', hx: 'Aapne galat USDT address ya network save kiya aur paisa wahan bhej diya gaya. Kya hoga?' },
    [{ en: 'It cannot be recovered, so I must double-check before requesting', hi: 'वह वापस नहीं मिल सकती, इसलिए अनुरोध से पहले दोबारा जाँचना ज़रूरी है', hx: 'Wo wapas nahi mil sakta, isliye request se pehle dobara check karna zaroori hai' },
     { en: 'XwerseMovies refunds it automatically', hi: 'XwerseMovies उसे अपने-आप लौटा देता है', hx: 'XwerseMovies use automatically refund kar deta hai' },
     { en: 'It returns after 24 hours', hi: 'वह 24 घंटे में लौट आती है', hx: 'Wo 24 ghante mein wapas aa jaata hai' },
     { en: 'The bank blocks it', hi: 'बैंक उसे रोक देता है', hx: 'Bank use rok deta hai' }]),
  Q('pay4', 'payout', 2,
    { en: 'How many open payout requests can you have at the same time?', hi: 'एक समय में कितने खुले भुगतान अनुरोध हो सकते हैं?', hx: 'Ek samay par kitni open payout requests ho sakti hain?' },
    [{ en: 'As many as I like', hi: 'जितने चाहें', hx: 'Jitni chahein' }, { en: 'Five', hi: 'पाँच', hx: 'Paanch' },
     { en: 'One', hi: 'एक', hx: 'Ek' }, { en: 'None, payouts are automatic', hi: 'कोई नहीं, भुगतान अपने-आप होता है', hx: 'Koi nahi, payout automatic hota hai' }]),
  Q('rule1', 'rules', 1,
    { en: 'What may happen if fake or suspicious traffic is found?', hi: 'नकली या संदिग्ध ट्रैफ़िक मिलने पर क्या हो सकता है?', hx: 'Fake ya suspicious traffic milne par kya ho sakta hai?' },
    [{ en: 'Nothing, views are views', hi: 'कुछ नहीं, व्यू तो व्यू है', hx: 'Kuch nahi, view to view hai' },
     { en: 'The account can be put on hold or banned and the related earnings cancelled', hi: 'खाता होल्ड या बैन हो सकता है और संबंधित कमाई रद्द हो सकती है', hx: 'Account hold ya ban ho sakta hai aur us se judi earnings cancel ho sakti hain' },
     { en: 'The partner receives a bonus', hi: 'पार्टनर को बोनस मिलता है', hx: 'Partner ko bonus milta hai' },
     { en: 'Only the viewer is warned', hi: 'केवल दर्शक को चेतावनी मिलती है', hx: 'Sirf viewer ko warning milti hai' }]),
  Q('rule2', 'rules', 0,
    { en: 'Which of these is allowed?', hi: 'इनमें से क्या अनुमत है?', hx: 'In mein se kya allowed hai?' },
    [{ en: 'Sharing my link honestly with people who may enjoy the movie', hi: 'अपना लिंक उन लोगों से ईमानदारी से साझा करना जिन्हें फ़िल्म पसंद आ सकती है', hx: 'Apna link un logon ke saath imaandari se share karna jinhe movie pasand aa sakti hai' },
     { en: 'Paying people to press play', hi: 'लोगों को प्ले दबाने के पैसे देना', hx: 'Logon ko play dabane ke paise dena' },
     { en: 'Using a script to refresh the page', hi: 'पेज रिफ़्रेश करने के लिए स्क्रिप्ट चलाना', hx: 'Page refresh karne ke liye script chalana' },
     { en: 'Using my own second account', hi: 'अपना दूसरा खाता इस्तेमाल करना', hx: 'Apna dusra account use karna' }]),
];
const PICK = 10, PASS = 8;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const LANG = (l) => (l === 'hi' || l === 'hx' ? l : 'en');

// → questions for the client (no answers). o[].i = the ORIGINAL option index, sent back when answering.
function getQuiz(lang) {
  const l = LANG(lang);
  const qs = shuffle(BANK).slice(0, PICK).map(q => ({ id: q.id, topic: q.topic, q: q.q[l], o: shuffle(q.o.map((o, i) => ({ i, t: o[l] }))) }));
  return { questions: qs, total: PICK, pass: PASS };
}
// answers: [{id, a}] → { passed, correct, total, wrong:[topic,...] }
function grade(answers) {
  if (!Array.isArray(answers)) return { passed: false, correct: 0, total: PICK, pass: PASS, wrong: [] };
  const seen = new Set(); let correct = 0; const wrong = [];
  for (const x of answers.slice(0, 40)) {
    const q = BANK.find(b => b.id === (x && x.id));
    if (!q || seen.has(q.id)) continue; seen.add(q.id);
    if (Number(x.a) === q.c) correct++; else wrong.push(q.topic);
  }
  // exactly PICK distinct questions must be answered
  const passed = seen.size === PICK && correct >= PASS;
  return { passed, correct, total: PICK, pass: PASS, wrong: [...new Set(wrong)] };
}
module.exports = { getQuiz, grade, PICK, PASS, BANK };
