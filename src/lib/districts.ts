// RojiSetu district registry (Day 9). The district topic may only settle on a
// REAL Indian district. Matching is approximate on purpose: spoken answers
// arrive through browser speech-to-text with mispronunciations ("puna",
// "पुण्यात", "ಬೆಂಗಳೂರಿನಲ್ಲಿ"), so we accept close spellings, never noise.
//
// Coverage is curated to the demo states for the seven kiosk languages
// (mr, kn, bn, ta, te, hi/en belt) - 190+ districts. Honest scope: a
// production deployment syncs this from the LGD (Local Government Directory).
// The 2-repair cap in chat-extract.ts is the escape valve: a perfectly valid
// district we have not listed yet is accepted raw on the third attempt.

export interface DistrictHit {
  en: string; // canonical English name
  state: string; // canonical English state name
}

// [canonical English, state, ...spelling aliases (native scripts + old names)]
const DISTRICTS: [string, string, ...string[]][] = [
  // --- Maharashtra (mr) ---
  ["Mumbai", "Maharashtra", "मुंबई", "mumbai city", "bombay"],
  ["Thane", "Maharashtra", "ठाणे"],
  ["Palghar", "Maharashtra", "पालघर"],
  ["Raigad", "Maharashtra", "रायगड", "raigarh"],
  ["Ratnagiri", "Maharashtra", "रत्नागिरी"],
  ["Sindhudurg", "Maharashtra", "सिंधुदुर्ग"],
  ["Nashik", "Maharashtra", "नाशिक", "nasik"],
  ["Dhule", "Maharashtra", "धुळे", "dhulia"],
  ["Nandurbar", "Maharashtra", "नंदुरबार"],
  ["Jalgaon", "Maharashtra", "जळगाव"],
  ["Ahmednagar", "Maharashtra", "अहमदनगर", "ahilyanagar", "अहिल्यानगर"],
  ["Pune", "Maharashtra", "पुणे", "पुना", "poona", "puna"],
  ["Satara", "Maharashtra", "सातारा"],
  ["Sangli", "Maharashtra", "सांगली"],
  ["Kolhapur", "Maharashtra", "कोल्हापूर", "कोल्हापुर"],
  ["Solapur", "Maharashtra", "सोलापूर", "सोलापुर", "sholapur"],
  ["Chhatrapati Sambhajinagar", "Maharashtra", "छत्रपती संभाजीनगर", "संभाजीनगर", "aurangabad", "औरंगाबाद"],
  ["Jalna", "Maharashtra", "जालना"],
  ["Beed", "Maharashtra", "बीड", "bid"],
  ["Latur", "Maharashtra", "लातूर"],
  ["Dharashiv", "Maharashtra", "धाराशिव", "उस्मानाबाद", "osmanabad", "usmanabad"],
  ["Nanded", "Maharashtra", "नांदेड"],
  ["Parbhani", "Maharashtra", "परभणी"],
  ["Hingoli", "Maharashtra", "हिंगोली"],
  ["Nagpur", "Maharashtra", "नागपूर", "नागपुर"],
  ["Wardha", "Maharashtra", "वर्धा"],
  ["Bhandara", "Maharashtra", "भंडारा"],
  ["Gondia", "Maharashtra", "गोंदिया"],
  ["Chandrapur", "Maharashtra", "चंद्रपूर", "चंद्रपुर"],
  ["Gadchiroli", "Maharashtra", "गडचिरोली"],
  ["Amravati", "Maharashtra", "अमरावती"],
  ["Akola", "Maharashtra", "अकोला"],
  ["Washim", "Maharashtra", "वाशिम"],
  ["Buldhana", "Maharashtra", "बुलढाणा", "बुलडाणा"],
  ["Yavatmal", "Maharashtra", "यवतमाळ"],
  // --- Karnataka (kn) ---
  ["Bengaluru Urban", "Karnataka", "ಬೆಂಗಳೂರು", "बंगलौर", "बेंगलुरु", "bangalore", "bengaluru"],
  ["Bengaluru Rural", "Karnataka", "ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ"],
  ["Ramanagara", "Karnataka", "ರಾಮನಗರ"],
  ["Kolar", "Karnataka", "कोलार"],
  ["Chikkaballapur", "Karnataka", "ಚಿಕ್ಕಬಳ್ಳಾಪುರ"],
  ["Tumakuru", "Karnataka", "ತುಮಕೂರು", "tumkur"],
  ["Chitradurga", "Karnataka", "ಚિત್ರದುર્ગ"],
  ["Davangere", "Karnataka", "ದಾವಣಗೆರೆ"],
  ["Shivamogga", "Karnataka", "ಶಿವಮೊಗ್ಗ", "shimoga"],
  ["Mysuru", "Karnataka", "ಮೈಸೂರು", "mysore", "मैसूर"],
  ["Mandya", "Karnataka", "ಮಂಡ್ಯ"],
  ["Hassan", "Karnataka", "हัसन", "ಹಾಸನ"],
  ["Kodagu", "Karnataka", "కోಡాగు", "ಕೊಡಗು", "coorg", "madikeri"],
  ["Chikkamagaluru", "Karnataka", "ಚಿಕ್ಕಮಗಳೂರು", "chikmagalur"],
  ["Dakshina Kannada", "Karnataka", "ದಕ್ಷಿಣ ಕನ್ನಡ", "mangalore", "mangaluru", "ಮಂಗಳೂರು"],
  ["Udupi", "Karnataka", "ಉಡುಪಿ"],
  ["Uttara Kannada", "Karnataka", "ಉತ್ತರ ಕನ್ನಡ", "karwar", "ಕಾರವಾರ"],
  ["Belagavi", "Karnataka", "बेळगावी", "ಬೆಳಗಾವಿ", "belgaum", "बेलगावी"],
  ["Vijayapura", "Karnataka", "ವಿಜಯಪುರ", "bijapur", "बिजापुर"],
  ["Bagalkot", "Karnataka", "बागलकोट", "ಬಾಗಲಕೋಟೆ"],
  ["Dharwad", "Karnataka", "धारवाड", "ಧಾರವಾಡ", "hubli", "hubballi", "ಹುಬ్బಳ್ಳಿ"],
  ["Gadag", "Karnataka", "गडग", "ಗಡಗ"],
  ["Haveri", "Karnataka", "हावेरी", "ಹಾವೇರಿ"],
  ["Kalaburagi", "Karnataka", "ಕಲಬುರಗಿ", "gulbarga"],
  ["Yadgir", "Karnataka", "यादगीर", "ಯಾದಗಿರಿ"],
  ["Bidar", "Karnataka", "बीदर", "ಬಿದರ್"],
  ["Ballari", "Karnataka", "बळ्ळारी", "ಬಳ್ಳಾರಿ", "bellary"],
  ["Vijayanagara", "Karnataka", "विजयनगर", "ವಿಜಯನಗರ", "hospete"],
  ["Koppal", "Karnataka", "कोप्पल", "ಕೊಪ್ಪಳ"],
  ["Raichur", "Karnataka", "रायचूर", "ರಾಯಚೂರು"],
  ["Chamarajanagar", "Karnataka", "ಚಾಮರಾಜನಗರ"],
  // --- West Bengal (bn) ---
  ["Kolkata", "West Bengal", "কলকাতা", "कलकत्ता", "calcutta"],
  ["Howrah", "West Bengal", "হাওড়া", "हावड़ा"],
  ["Hooghly", "West Bengal", "হুগলি", "हुगली", "hugli"],
  ["North 24 Parganas", "West Bengal", "উত্তর চব্বিশ পরগনা", "north 24 pargana"],
  ["South 24 Parganas", "West Bengal", "দক্ষিণ চব্বিশ পরগনা", "south 24 pargana"],
  ["Purba Bardhaman", "West Bengal", "পূর্ব বর্ধমান", "bardhaman", "burdwan", "बर्धमान"],
  ["Paschim Bardhaman", "West Bengal", "পশ্চিম বর্ধমান", "durgapur", "দুর্গাপুর", "asansol"],
  ["Murshidabad", "West Bengal", "মুর্শিদাবাদ", "मुर्शिदाबाद"],
  ["Nadia", "West Bengal", "নদিয়া", "नदिया", "krishnanagar"],
  ["Malda", "West Bengal", "মালদা", "मालदा"],
  ["Uttar Dinajpur", "West Bengal", "উত্তর দিনাজপুর", "रायगंज", "raiganj"],
  ["Dakshin Dinajpur", "West Bengal", "দক্ষিণ দিনাজপুর", "बालुरघाट", "balurghat"],
  ["Birbhum", "West Bengal", "বীরভূম", "बीरभूम", "bolpur", "शांति निकेतन", "shantiniketan"],
  ["Bankura", "West Bengal", "বাঁকুড়া", "बांकुड़ा"],
  ["Purulia", "West Bengal", "পুরুলিয়া", "पुरुलिया"],
  ["Jhargram", "West Bengal", "ঝাড়গ্রাম", "झारग्राम"],
  ["Purba Medinipur", "West Bengal", "পূর্ব মেদিনীপুর", "tamluk", "टमलुक"],
  ["Paschim Medinipur", "West Bengal", "পশ্চিম মেদিনীপুর", "midnapore", "मिदनापुर"],
  ["Jalpaiguri", "West Bengal", "জলপাইগুড়ি", "जलपाईगुड़ी"],
  ["Darjeeling", "West Bengal", "দার্জিলিং", "दार्जिलिंग"],
  ["Kalimpong", "West Bengal", "কালিম্পং", "कालिम्पोंग"],
  ["Cooch Behar", "West Bengal", "কোচবিহার", "कूचबिहार"],
  ["Alipurduar", "West Bengal", "আলিপুরদুয়ার", "अलीपुरदुार"],
  // --- Tamil Nadu (ta) ---
  ["Chennai", "Tamil Nadu", "சென்னை", "चेन्नई", "madras"],
  ["Chengalpattu", "Tamil Nadu", "செங்கல்பட்டு"],
  ["Kancheepuram", "Tamil Nadu", "காஞ்சிபுரம்", "kanchipuram"],
  ["Vellore", "Tamil Nadu", "வேலூர்", "वेल्लोर"],
  ["Ranipet", "Tamil Nadu", "ராணிப்பேட்டை"],
  ["Tirupattur", "Tamil Nadu", "திருப்பத்தூர்"],
  ["Tiruvannamalai", "Tamil Nadu", "திருவண்ணாமலை"],
  ["Villupuram", "Tamil Nadu", "விழுப்புரம்", "विलुप्पुरम"],
  ["Cuddalore", "Tamil Nadu", "கடலூர்", "कुड्डालोर"],
  ["Salem", "Tamil Nadu", "சேலம்", "सेलम"],
  ["Namakkal", "Tamil Nadu", "நாமக்கல்"],
  ["Erode", "Tamil Nadu", "ஈரோடு", "इरोड"],
  ["Tiruppur", "Tamil Nadu", "திருப்பூர்", "tirupur", "तिरुप्पुर"],
  ["Coimbatore", "Tamil Nadu", "கோயம்புத்தூர்", "covai", "कयंबतूर", "कोयंबटूर"],
  ["Nilgiris", "Tamil Nadu", "நீலகிரி", "ooty", "ऊटी", "udhagamandalam"],
  ["Tiruchirappalli", "Tamil Nadu", "திருச்சிராப்பள்ளி", "trichy", "तिरुचि", "तिरुचिरापल्ली"],
  ["Karur", "Tamil Nadu", "கரூர்"],
  ["Perambalur", "Tamil Nadu", "பெரம்பலூர்"],
  ["Ariyalur", "Tamil Nadu", "அரியலூர்"],
  ["Thanjavur", "Tamil Nadu", "தஞ்சாவூர்", "tanjore", "तंजावुर"],
  ["Nagapattinam", "Tamil Nadu", "நாகப்பட்டினம்"],
  ["Pudukkottai", "Tamil Nadu", "புதுக்கோட்டை"],
  ["Madurai", "Tamil Nadu", "மதுரை", "मदुरै"],
  ["Theni", "Tamil Nadu", "தேனி"],
  ["Dindigul", "Tamil Nadu", "திண்டுக்கல்"],
  ["Sivaganga", "Tamil Nadu", "சிவகங்கை"],
  ["Virudhunagar", "Tamil Nadu", "விருதுநகர்"],
  ["Ramanathapuram", "Tamil Nadu", "ராமநாதபுரம்"],
  ["Thoothukudi", "Tamil Nadu", "தூத்துக்குடி", "tuticorin", "तूतिकोरिन"],
  ["Tirunelveli", "Tamil Nadu", "திருநெல்வேலி", "तिरुनेलवेली", "tinnevelly"],
  ["Kanniyakumari", "Tamil Nadu", "கன்னியாகுமரி", "kanyakumari", "नगरकोइल", "nagercoil"],
  ["Dharmapuri", "Tamil Nadu", "தர்மபுரி"],
  ["Krishnagiri", "Tamil Nadu", "கிருஷ்ணகிரி"],
  // --- Telangana (te) ---
  ["Hyderabad", "Telangana", "హైదరాబాద్", "हैदराबाद"],
  ["Warangal", "Telangana", "వారంగల్", "वारंगल", "hanamkonda"],
  ["Nizamabad", "Telangana", "నిజామాబాద్", "निजामाबाद"],
  ["Karimnagar", "Telangana", "కరీంనగర్", "करीमनगर"],
  ["Khammam", "Telangana", "ఖమ్మం", "खम्मम"],
  ["Mahbubnagar", "Telangana", "మహబూబ్‌నగర్", "महबूबनगर", "palamuru"],
  ["Nalgonda", "Telangana", "నల్గొండ", "नलगोंडा"],
  ["Adilabad", "Telangana", "ఆదిలాబాద్", "आदिलाबाद"],
  ["Siddipet", "Telangana", "సిద్దిపేట"],
  ["Sangareddy", "Telangana", "సంగారెడ్డి"],
  ["Medak", "Telangana", "మెదక్"],
  ["Suryapet", "Telangana", "సూర్యాపేట"],
  ["Rangareddy", "Telangana", "రంగారెడ్డి"],
  ["Kothagudem", "Telangana", "కొత్తగూడెం"],
  // --- Andhra Pradesh (te) ---
  ["Visakhapatnam", "Andhra Pradesh", "విశాఖపట్నం", "vizag", "विशाखपट्टनम", "विशाखापत्तनम"],
  ["Vijayawada", "Andhra Pradesh", "విజయవాడ", "विजयवाडा", "bezawada"],
  ["Guntur", "Andhra Pradesh", "గుంటూరు", "गुंटूर"],
  ["Nellore", "Andhra Pradesh", "నెల్లూరు", "नेल्लोर"],
  ["Kurnool", "Andhra Pradesh", "కర్నూలు", "कर्नूल"],
  ["Anantapur", "Andhra Pradesh", "అనంతపురం", "anantapuram", "अनंतपुर"],
  ["Kadapa", "Andhra Pradesh", "కడప", "cuddapah", "कडप्पा"],
  ["Chittoor", "Andhra Pradesh", "చిత్తూరు", "चित्तूर"],
  ["Tirupati", "Andhra Pradesh", "తిరుపతి", "तिरुपति"],
  ["Kakinada", "Andhra Pradesh", "కాకినాడ", "కాకినాడా", "काकीनाडा"],
  ["Rajahmundry", "Andhra Pradesh", "రాజమహేంద్రవరం", "राजमुंदरी"],
  ["Ongole", "Andhra Pradesh", "ఒంగోలు", "ओंगोल"],
  ["Eluru", "Andhra Pradesh", "ఏలూరు", "एलुर"],
  ["Srikakulam", "Andhra Pradesh", "శ్రీకాకుళం", "श्रीकाकुलम"],
  ["Amaravati", "Andhra Pradesh", "అమరావతి", "అమరావతిలో"],
  // --- Hindi belt (hi/bn/en speakers) ---
  ["Delhi", "Delhi", "दिल्ली", "देहली", "new delhi", "नई दिल्ली"],
  ["Lucknow", "Uttar Pradesh", "लखनऊ"],
  ["Kanpur Nagar", "Uttar Pradesh", "कानपुर", "kanpur"],
  ["Prayagraj", "Uttar Pradesh", "प्रयागराज", "allahabad", "इलाहाबाद"],
  ["Varanasi", "Uttar Pradesh", "वाराणसी", "banaras", "kashi", "काशी"],
  ["Agra", "Uttar Pradesh", "आगरा"],
  ["Meerut", "Uttar Pradesh", "मेरठ"],
  ["Gorakhpur", "Uttar Pradesh", "गोरखपुर"],
  ["Jhansi", "Uttar Pradesh", "झांसी"],
  ["Mathura", "Uttar Pradesh", "मथुरा"],
  ["Noida", "Uttar Pradesh", "नोएडा", "gautam buddha nagar", "गौतम बुद्ध नगर"],
  ["Ghaziabad", "Uttar Pradesh", "गाज़ियाबाद", "गाजियाबाद"],
  ["Aligarh", "Uttar Pradesh", "अलीगढ़"],
  ["Bareilly", "Uttar Pradesh", "बरेली"],
  ["Moradabad", "Uttar Pradesh", "मुरादाबाद"],
  ["Azamgarh", "Uttar Pradesh", "आजमगढ़"],
  ["Ayodhya", "Uttar Pradesh", "अयोध्या", "faizabad", "फैजाबाद"],
  ["Patna", "Bihar", "पटना", "পাটনা"],
  ["Gaya", "Bihar", "गया"],
  ["Bhagalpur", "Bihar", "भागलपुर"],
  ["Muzaffarpur", "Bihar", "मुजफ्फरपुर"],
  ["Darbhanga", "Bihar", "दरभंगा"],
  ["Jaipur", "Rajasthan", "जयपुर"],
  ["Jodhpur", "Rajasthan", "जोधपुर"],
  ["Udaipur", "Rajasthan", "उदयपुर"],
  ["Kota", "Rajasthan", "कोटा"],
  ["Bikaner", "Rajasthan", "बीकानेर"],
  ["Ajmer", "Rajasthan", "अजमेर"],
  ["Bhopal", "Madhya Pradesh", "भोपाल"],
  ["Indore", "Madhya Pradesh", "इंदौर"],
  ["Gwalior", "Madhya Pradesh", "ग्वालियर"],
  ["Jabalpur", "Madhya Pradesh", "जबलपुर"],
  ["Ujjain", "Madhya Pradesh", "उज्जैन"],
  ["Raipur", "Chhattisgarh", "रायपुर"],
  ["Bilaspur", "Chhattisgarh", "बिलासपुर"],
  ["Durg", "Chhattisgarh", "दुर्ग", "bhilai", "भिलाई"],
  ["Ranchi", "Jharkhand", "रांची"],
  ["Jamshedpur", "Jharkhand", "जमशेदपुर", "east singhbhum"],
  ["Dhanbad", "Jharkhand", "धनबाद"],
  ["Bokaro", "Jharkhand", "बोकारो"],
  ["Amritsar", "Punjab", "अमृतसर"],
  ["Ludhiana", "Punjab", "लुधियाना"],
  ["Jalandhar", "Punjab", "जालंधर"],
  ["Patiala", "Punjab", "पटियाला"],
  ["Chandigarh", "Chandigarh", "चंडीगढ़"],
  ["Gurugram", "Haryana", "गुरुग्राम", "गुड़गांव", "gurgaon"],
  ["Faridabad", "Haryana", "फरीदाबाद"],
  ["Hisar", "Haryana", "हिसार"],
  ["Dehradun", "Uttarakhand", "देहरादून"],
  ["Haridwar", "Uttarakhand", "हरिद्वार"],
  ["Nainital", "Uttarakhand", "नैनीताल"],
  ["Shimla", "Himachal Pradesh", "शिमला"],
  ["Mandi", "Himachal Pradesh", "मंडी"],
  ["Dharamshala", "Himachal Pradesh", "धर्मशाला", "kangra", "कांगड़ा"],
  ["Srinagar", "Jammu and Kashmir", "श्रीनगर"],
  ["Jammu", "Jammu and Kashmir", "जम्मू"],
  ["Khordha", "Odisha", "भुवनेश्वर", "bhubaneswar"],
  ["Cuttack", "Odisha", "कटक"],
  ["Kamrup Metropolitan", "Assam", "गुवाहाटी", "guwahati"],
  ["East Khasi Hills", "Meghalaya", "शिलांग", "shillong"],
];

const SKIP_WORDS = new Set([
  "district", "dist", "state", "में", "का", "की", "के", "से", "राज्य", "जिला", "ज़िला", "जिल्हा",
  "जिल्ह्यात", "मध्ये", "জেলা", "এর", "আর", "तम", "जिल्ला", "जिल्लालो", "जिल्ल्यात",
]);

/**
 * Edit distance (two-row Levenshtein). Script-agnostic: works for both Latin
 * and Indic strings because it compares code points.
 */
function lev(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = new Array(b.length + 1);
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function normToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.!?।,;:()\[\]"'‘’“”…-]/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many edits are forgiven for a comparison of the shorter length n? */
function budget(n: number): number {
  if (n <= 3) return 1;
  return 2;
}

/**
 * Scan the answer word-by-word (and 2-word windows for compound names) over
 * every district spelling. Exact containment wins outright; otherwise the
 * closest spelling within its error budget wins. Returns the canonical hit
 * or null - chat-extract treats null as "not a district answer".
 */
export function resolveDistrict(text: string): DistrictHit | null {
  const norm = normToken(text);
  if (!norm) return null;

  let best: DistrictHit | null = null;
  let bestDist = Number.MAX_SAFE_INTEGER;
  let bestSpellLen = 0;

  const consider = (spellRaw: string, en: string, state: string) => {
    const spell = normToken(spellRaw);
    if (spell.length < 3) return;
    // exact containment first (strongest signal)
    if (norm.includes(spell)) {
      if (0 < bestDist || (0 === bestDist && spell.length > bestSpellLen)) {
        best = { en, state };
        bestDist = 0;
        bestSpellLen = spell.length;
      }
      return;
    }
    // approximate: single-token windows
    for (const token of norm.split(" ")) {
      if (token.length < 3 || SKIP_WORDS.has(token)) continue;
      const n = Math.min(token.length, spell.length);
      if (Math.abs(token.length - spell.length) > budget(n)) continue;
      const d = lev(token, spell);
      if (d <= budget(n)) {
        if (d < bestDist || (d === bestDist && spell.length > bestSpellLen)) {
          best = { en, state };
          bestDist = d;
          bestSpellLen = spell.length;
        }
      }
    }
    // two-token windows for compound names ("new delhi", "east khasi hills")
    const toks = norm.split(" ").filter((t) => t.length >= 2 && !SKIP_WORDS.has(t));
    for (let i = 0; i < toks.length - 1; i++) {
      const pair = toks[i] + " " + toks[i + 1];
      const n = Math.min(pair.length, spell.length);
      if (Math.abs(pair.length - spell.length) > budget(n) + 1) continue;
      const d = lev(pair, spell);
      if (d <= budget(n) + 1) {
        const key = d + 1; // slight penalty vs single-token hits
        if (key < bestDist || (key === bestDist && spell.length > bestSpellLen)) {
          best = { en, state };
          bestDist = key;
          bestSpellLen = spell.length;
        }
      }
    }
  };

  for (const [en, state, ...aliases] of DISTRICTS) {
    consider(en, en, state);
    for (const alias of aliases) consider(alias, en, state);
  }
  return best;
}

export const DISTRICT_COUNT = DISTRICTS.length;