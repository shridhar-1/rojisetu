// RojiSetu livelihood intake engine. Ported from the MediKiosk conversational
// intake pattern. Deterministic floor first; AI can only rephrase, never decide.
//
// Guarantees:
//  1. Never re-ask. Answered essentials become KNOWN. Any assistant text whose
//     questionTopic() resolves to a KNOWN topic is swapped for the next
//     unknown essential via sanitizeCandidate().
//  2. Wrong-info guard. A change to a KNOWN value creates a warning; the
//     latest answer is kept and the official confirms later.
//  3. Zero-AI fallback. getDeterministicTurn() runs a complete interview
//     with no AI reachable. This file is pure and synchronous.

import { getDict, type Lang } from "./i18n";

export type Topic =
  | "education"
  | "familyOccupation"
  | "currentLivelihood"
  | "skillsInterests"
  | "mobility"
  | "workPreference"
  | "district";

export const TOPIC_ORDER: Topic[] = [
  "education",
  "familyOccupation",
  "currentLivelihood",
  "skillsInterests",
  "mobility",
  "workPreference",
  "district",
];

export type TopicStatus = "unknown" | "known" | "refused";

export interface TopicState {
  status: TopicStatus;
  value: string | null;
  canonical: string | null;
}

export interface ProfileWarning {
  topic: Topic;
  previous: string;
  latest: string;
}

export interface Profile {
  topics: Record<Topic, TopicState>;
  warnings: ProfileWarning[];
  complete: boolean;
}

export interface ChatMessage {
  role: "assistant" | "user";
  text: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?।,;:()\[\]"'‘’“”…-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Topic keyword banks. questionTopic() classifies ANY assistant text, so an
// AI paraphrase of a question still resolves to its topic (LLM-proof).
// Phrases are chosen to avoid cross-topic collisions; longer phrases score 2.
// ---------------------------------------------------------------------------

const TOPIC_TERMS: Record<Topic, string[]> = {
  education: [
    "education", "school", "class", "college", "study", "studied", "pass", "degree",
    "literate", "illiterate", "पढ़ाई", "स्कूल", "कक्षा", "कितनी पढ़ी", "निरक्षर", "शिक्षा",
    "পড়াশোনা", "স্কুল", "ক্লাস", "শিক্ষা", "নিরক্ষর",
    "ಶಿಕ್ಷಣ", "ಶಾಲೆ", "ತರಗತಿ", "ಓದಿದ್ದೀರಿ",
    "கல்வி", "பள்ளி", "வகுப்பு", "படித்தீர்கள்",
    "విద్య", "చదువు", "పాఠశాల", "తరగతి", "చదివారు",
    "शिक्षण", "शाळा", "वर्गापर्यंत", "शिकलात",
  ],
  familyOccupation: [
    "family", "father", "mother", "parents", "traditional", "traditionally",
    "परिवार", "पारंपरिक", "परंपरा", "पिता", "माता", "घर का",
    "পরিবার", "ঐতিহ্যবাহী", "পিতা", "মাতা", "বাবা", "মা",
    "ಕುಟುಂಬ", "ಸಂಪ್ರದಾಯಿಕ", "ಅಪ್ಪ", "ಅಮ್ಮ", "ತಂದೆ", "ತಾಯಿ",
    "குடும்ப", "பாரம்பரிய", "அப்பா", "அம்மா", "தந்தை",
    "కుటుంబ", "సంప్రదాయ", "నాన్న", "అమ్మ", "తండ్రి",
    "कुटुंब", "पारंपरिक", "वडील", "आई", "घरचे",
  ],
  currentLivelihood: [
    "earn", "earning", "income", "these days", "guzara", "kamate",
    "कमाते", "कमाई", "आजकल", "मजदूरी", "गुज़ारा", "रोज़ी", "चलाते",
    "উপার্জন", "আয়", "এখন", "কামাই", "চলান",
    "ಗಳಿಸುತ್ತೀರಿ", "ಗಳಿಕೆ", "ಈ ದಿನಗಳಲ್ಲಿ", "ಆದಾಯ",
    "சம்பாதிக்கிறீர்கள்", "சம்பாதி", "இன்று", "வருமானம்",
    "సంపాదిస్తున్నారు", "సంపాదన", "నేడు", "ఆదాయం", "కూలి",
    "कमावता", "कमाई", "आजकाल", "उदरनिर्वाह",
  ],
  skillsInterests: [
    "skill", "good at", "interest", "enjoy", "hobby", "learn",
    "हुनर", "रुचि", "पसंद", "सीखना", "अच्छे हैं किस",
    "দক্ষ", "আগ্রহ", "পছন্দ", "ভালো লাগে", "শিখতে", "পারদর্শী",
    "ಕೌಶಲ್ಯ", "ಆಸಕ್ತಿ", "ಇಷ್ಟ", "ಕಲಿಯಲು", "ಪರಿಣತಿ",
    "திறன", "ஆர்வம்", "பிடிக்கும்", "கற்க", "சிறந்த",
    "నైపుణ్య", "ఆసక్తి", "ఇష్టం", "నేర్చుకో", "నిపుణులు",
    "कौशल्य", "आवड", "शिकायला", "हुशार",
  ],
  mobility: [
    "travel", "migrate", "far", "distance", "bus", "train", "staying near",
    "near home", "physical", "disability", "wheelchair",
    "दूर जा", "यात्रा", "घर के पास", "घर रहना", "शारीरिक", "दिव्यांग",
    "দূরে যেতে", "যাতায়াত", "বাড়ির কাছে", "শারীরিক", "প্রতিবন্ধী",
    "ದೂর ಹೋಗ", "ಪ್ರಯಾಣ", "ಮನೆ ಹತ್ತಿರ", "ದೈಹিক",
    "தூரம் செல்ல", "பயணம்", "வீட்டுக்கு அருகில்", "உடல்", "மாற்றுத்திறனாளி",
    "దూరం వెళ్ల", "ప్రయాణం", "ఇంటి దగ్గర", "శారీరక", "వికలాంగ",
    "दूर जाऊ", "प्रवास", "घराजवळ", "शारीरिक", "दिव्यांग",
  ],
  workPreference: [
    "own work", "self employment", "self-employed", "wage job", "monthly wages",
    "salary", "business", "service",
    "नौकरी", "तनख्वाह", "पगार", "अपना काम", "खुद का", "बिज़नेस", "व्यवसाय", "स्वरोज़गार",
    "চাকরি", "বেতন", "নিজের কাজ", "ব্যবসা", "স্বনিয়োজিত",
    "ಉದ್ಯೋಗ", "ಸಂಬಳ", "ಸ್ವಂತ ಕೆಲಸ", "ವ್ಯಾಪಾರ", "ಸ್ವಯಂ ಉದ್ಯೋಗ",
    "வேலையா", "சம்பள", "சொந்தமாக", "தொழில்", "சுயதொழில்",
    "ఉద్యోగం", "ఉద్యోగమా", "జీతం", "స్వంత పని", "వ్యాపారం", "స్వయం ఉపాధి",
    "नोकरी", "पगार", "स्वतःचे काम", "व्यवसाय", "स्वयंरोजगार",
  ],
  district: [
    "district", "village", "town", "block", "state", "nearby", "available around",
    "ज़िला", "जिला", "गाँव", "शहर", "आसपास", "ब्लॉक",
    "জেলা", "গ্রাম", "শহর", "আশেপাশে", "ব্লক",
    "ಜಿಲ್ಲೆ", "ಊರು", "ಹಳ್ಳಿ", "ಹತ್ತির", "ಬ್ಲಾಕ್",
    "மாவட்டம்", "கிராமம்", "ஊர்", "அருகில்", "வட்டம்",
    "జిల్లా", "గ్రామం", "పట్టణం", "దగ్గరలో", "మండలం",
    "जिल्हा", "गाव", "शहर", "जवळ", "तालुका",
  ],
};

/** Classify assistant text into an essential topic, or null. */
export function questionTopic(text: string): Topic | null {
  const norm = normalize(text);
  let best: Topic | null = null;
  let bestScore = 0;
  for (const topic of TOPIC_ORDER) {
    let score = 0;
    for (const term of TOPIC_TERMS[topic]) {
      if (norm.includes(term)) score += term.length >= 8 || term.includes(" ") ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return bestScore > 0 ? best : null;
}

// ---------------------------------------------------------------------------
// Chit-chat and skip guards (deterministic, zero AI)
// ---------------------------------------------------------------------------

// Greetings may be followed by small talk ("namaste ji"), so prefix matching
// is allowed for them only. Ack words ("yes", "ok", "haan") must match
// EXACTLY - otherwise real answers like "yes i can travel anywhere" or
// "ok my father was a tailor" get swallowed as chit-chat and never mark.
const GREETINGS: Record<Lang, string[]> = {
  en: ["hi", "hello", "hey", "namaste", "good morning", "good afternoon", "good evening"],
  hi: ["नमस्ते", "नमस्कार", "हेलो", "राम राम"],
  bn: ["নমস্কার", "হ্যালো"],
  kn: ["ನಮಸ್ತೆ", "ನಮಸ್ಕಾರ", "ಹಲೋ"],
  ta: ["வணக்கம்", "ஹலோ"],
  te: ["నమస్తే", "నమస్కారం", "హలో"],
  mr: ["नमस्ते", "नमस्कार", "हॅलो"],
};

const ACK_WORDS: Record<Lang, string[]> = {
  en: ["thank you", "thanks", "ok", "okay", "yes", "right", "ji"],
  hi: ["धन्यवाद", "शुक्रिया", "जी", "ठीक है", "अच्छा", "हाँ"],
  bn: ["ধন্যবাদ", "আচ্ছা", "জি", "ভালো", "হ্যাঁ"],
  kn: ["ಧನ್ಯವಾದ", "ಸರಿ", "ಹೌದು", "ಚೆನ್ನಾಗಿ"],
  ta: ["நன்றி", "சரி", "ஆமாம்", "நல்லது"],
  te: ["ధన్యవాదాలు", "సరే", "అవును", "బాగుంది"],
  mr: ["धन्यवाद", "ठीक आहे", "बरं", "हो"],
};

const SKIP: Record<Lang, string[]> = {
  en: ["don't know", "do not know", "skip", "later", "no answer", "pata nahi", "gothilla", "theriyadu", "theliyadu", "mahit nahi", "jani na"],
  hi: ["पता नहीं", "मालूम नहीं", "छोड़ो", "छोड़ दो", "बाद में", "नहीं बताना"],
  bn: ["জানি না", "বাদ দিন", "পরে", "বলব না"],
  kn: ["ಗೊತ್ತಿಲ್ಲ", "ಬಿಡಿ", "ನಂತರ", "ಹೇಳಲಾರೆ"],
  ta: ["தெரியாது", "விடு", "பிறகு", "சொல்ல விரும்பவில்லை"],
  te: ["తెలియదు", "వదిలేయండి", "తర్వాత", "చెప్పలేను"],
  mr: ["माहीत नाही", "सोडा", "नंतर", "सांगू नये"],
};

function shortText(norm: string, max: number): boolean {
  return norm.length > 0 && norm.length <= max;
}

export function isChitChat(text: string, lang: Lang): boolean {
  const norm = normalize(text);
  if (!shortText(norm, 26)) return false;
  const greets = [...GREETINGS[lang], ...GREETINGS.en];
  if (greets.some((p) => norm === p || norm.startsWith(p + " "))) return true;
  const acks = [...ACK_WORDS[lang], ...ACK_WORDS.en];
  return acks.some((p) => norm === p);
}

export function isSkip(text: string, lang: Lang): boolean {
  const norm = normalize(text);
  if (!shortText(norm, 40)) return false;
  const bank = [...SKIP[lang], ...SKIP.en];
  return bank.some((p) => norm === p || norm.includes(p));
}

// ---------------------------------------------------------------------------
// Question bank, opening, ack, done — one gentle question at a time.
// ---------------------------------------------------------------------------

const QUESTIONS: Record<Lang, Record<Topic, string>> = {
  en: {
    education: "To begin, what is the last class you passed in school?",
    familyOccupation: "What work has your family traditionally done?",
    currentLivelihood: "And how do you earn money these days?",
    skillsInterests: "What are you good at, and what kind of work do you enjoy?",
    mobility: "Can you travel far for work or training, or do you need to stay near home?",
    workPreference: "Would you rather run your own work, or take a job with monthly wages?",
    district: "Which district do you live in, and what work is available around you?",
  },
  hi: {
    education: "शुरू करते हैं। आपने स्कूल में कौन सी कक्षा तक पढ़ाई की है?",
    familyOccupation: "आपके परिवार का पारंपरिक काम क्या रहा है?",
    currentLivelihood: "और आजकल आप कैसे पैसे कमाते हैं?",
    skillsInterests: "आप किस काम में अच्छे हैं, और कौन सा काम आपको पसंद है?",
    mobility: "क्या आप काम या प्रशिक्षण के लिए दूर जा सकते हैं, या घर के पास ही रहना चाहते हैं?",
    workPreference: "आप अपना काम करना पसंद करेंगे या महीने की तनख्वाह वाली नौकरी?",
    district: "आप किस ज़िले में रहते हैं, और आसपास क्या काम मिलता है?",
  },
  bn: {
    education: "চলুন শুরু করি। আপনি স্কুলে কোন ক্লাস পর্যন্ত পড়েছেন?",
    familyOccupation: "আপনার পরিবারের ঐতিহ্যবাহী কাজ কী?",
    currentLivelihood: "আর এখন আপনি কীভাবে টাকা উপার্জন করেন?",
    skillsInterests: "আপনি কোন কাজে পারদর্শী, আর কোন কাজ আপনার ভালো লাগে?",
    mobility: "কাজ বা প্রশিক্ষণের জন্য আপনি কি দূরে যেতে পারবেন, নাকি বাড়ির কাছেই থাকতে চান?",
    workPreference: "আপনি কি নিজের কাজ করতে চান, নাকি মাসিক বেতনের চাকরি?",
    district: "আপনি কোন জেলায় থাকেন, আর আশেপাশে কী কাজ পাওয়া যায়?",
  },
  kn: {
    education: "ಪ್ರಾರಂಭಿಸೋಣ. ನೀವು ಶಾಲೆಯಲ್ಲಿ ಯಾವ ತರಗತಿಯವರೆಗೆ ಓದಿದ್ದೀರಿ?",
    familyOccupation: "ನಿಮ್ಮ ಕುಟುಂಬದ ಸಂಪ್ರದಾಯಿಕ ಕೆಲಸ ಯಾವುದು?",
    currentLivelihood: "ಮತ್ತು ಈ ದಿನಗಳಲ್ಲಿ ನೀವು ಹೇಗೆ ಹಣ ಗಳಿಸುತ್ತೀರಿ?",
    skillsInterests: "ನೀವು ಯಾವ ಕೆಲಸದಲ್ಲಿ ಪರಿಣತಿ ಹೊಂದಿದ್ದೀರಿ, ಮತ್ತು ಯಾವ ಕೆಲಸ ನಿಮ್ಮ ಇಷ್ಟ?",
    mobility: "ಕೆಲಸ ಅಥವಾ ತರಬೇತಿಗಾಗಿ ನೀವು ದೂರ ಹೋಗಬಹುದೇ, ಅಥವಾ ಮನೆ ಹತ್ತಿರವೇ ಇರಬೇಕೇ?",
    workPreference: "ನೀವು ಸ್ವಂತ ಕೆಲಸ ಮಾಡಲು ಇಷ್ಟಪಡುತ್ತೀರಾ ಅಥವಾ ತಿಂಗಳ ಸಂಬಳದ ಉದ್ಯೋಗವೇ?",
    district: "ನೀವು ಯಾವ ಜಿಲ್ಲೆಯಲ್ಲಿ ವಾಸಿಸುತ್ತೀರಿ, ಮತ್ತು ಹತ್ತಿರದಲ್ಲಿ ಯಾವ ಕೆಲಸ ದೊರೆಯುತ್ತದೆ?",
  },
  ta: {
    education: "தொடங்குவோம். நீங்கள் பள்ளியில் எந்த வகுப்பு வரை படித்தீர்கள்?",
    familyOccupation: "உங்கள் குடும்பத்தின் பாரம்பரியத் தொழில் என்ன?",
    currentLivelihood: "மேலும் இன்று நீங்கள் எப்படிப் பணம் சம்பாதிக்கிறீர்கள்?",
    skillsInterests: "நீங்கள் எந்த வேலையில் சிறந்தவர், உங்களுக்கு எந்த வேலை பிடிக்கும்?",
    mobility: "வேலை அல்லது பயிற்சிக்காக நீங்கள் தூரம் செல்ல முடியுமா, அல்லது வீட்டுக்கு அருகில் இருக்க வேண்டுமா?",
    workPreference: "நீங்கள் சொந்தமாக வேலை செய்ய விரும்புகிறீர்களா, அல்லது மாதச் சம்பள வேலையா?",
    district: "நீங்கள் எந்த மாவட்டத்தில் வசிக்கிறீர்கள், அருகில் என்ன வேலைகள் கிடைக்கின்றன?",
  },
  te: {
    education: "ప్రారంభిద్దాం. మీరు పాఠశాలలో ఏ తరగతి వరకు చదివారు?",
    familyOccupation: "మీ కుటుంబ సంప్రదాయ వృత్తి ఏమిటి?",
    currentLivelihood: "మరియు నేడు మీరు ఎలా డబ్బు సంపాదిస్తున్నారు?",
    skillsInterests: "మీరు ఏ పనిలో నిపుణులు, మీకు ఏ పని ఇష్టం?",
    mobility: "పని లేదా శిక్షణ కోసం మీరు దూరం వెళ్లగలరా, లేదా ఇంటి దగ్గరే ఉండాలా?",
    workPreference: "మీరు స్వంత పని చేయాలనుకుంటున్నారా, లేదా నెల జీతంతో ఉద్యోగమా?",
    district: "మీరు ఏ జిల్లాలో నివసిస్తున్నారు, దగ్గరలో ఏ పనులు దొరుకుతాయి?",
  },
  mr: {
    education: "सुरू करूया. तुम्ही शाळेत कोणत्या वर्गापर्यंत शिकलात?",
    familyOccupation: "तुमच्या कुटुंबाची पारंपरिक कामे कोणती?",
    currentLivelihood: "आणि आजकाल तुम्ही पैसे कसे कमावता?",
    skillsInterests: "तुम्ही कोणत्या कामात हुशार आहात, आणि कोणते काम आवडते?",
    mobility: "कामासाठी किंवा प्रशिक्षणासाठी दूर जाऊ शकता का, की घराजवळच राहायचे?",
    workPreference: "तुम्हाला स्वतःचे काम करायला आवडेल की महिन्याला पगाराची नोकरी?",
    district: "तुम्ही कोणत्या जिल्ह्यात राहता, आणि जवळ कोणती कामे मिळतात?",
  },
};

const OPENING: Record<Lang, string> = {
  en: "Namaste. I am the RojiSetu assistant. I will ask you a few simple questions, one at a time. There is nothing to read and no form to fill.",
  hi: "नमस्ते। मैं रोज़ीसेतु की सहायक हूँ। मैं आपसे कुछ आसान सवाल पूछूँगी, एक-एक करके। न कुछ पढ़ना है, न कोई फ़ॉर्म भरना है।",
  bn: "নমস্কার। আমি রোজিসেতুর সহকারী। আমি আপনাকে কয়েকটি সহজ প্রশ্ন করব, একটিটি করে। কিছুই পড়তে হবে না, কোনো ফর্ম ভরতে হবে না।",
  kn: "ನಮಸ್ತೆ. ನಾನು ರೋಜಿಸೇತು ಸಹಾಯಕಿ. ನಾನು ನಿಮ್ಮನ್ನು ಕೆಲವು ಸುಲಭ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳುತ್ತೇನೆ, ಒಂದೊಂದೇ. ಓದುವ ಅಗತ್ಯವಿಲ್ಲ, ಫಾರಂ ತುಂಬಿಸುವ ಅಗತ್ಯವಿಲ್ಲ.",
  ta: "வணக்கம். நான் ரோஜிசேது உதவியாளர். நான் உங்களிடம் சில எளிய கேள்விகளை ஒவ்வன்றாகக் கேட்பேன். எதையும் படிக்க வேண்டாம், படிவம் நிரப்ப வேண்டாம்.",
  te: "నమస్తే. నేను రోజీసేతు సహాయకురాలిని. నేను మిమ్మల్ని కొన్ని సులభమైన ప్రశ్నలు ఒక్కటి చొప్పున అడుగుతాను. ఏమీ చదవాల్సిన అవసరం లేదు, ఫారం నింపాల్సిన అవసరం లేదు.",
  mr: "नमस्ते. मी रोजीसेतूची सहाय्यक आहे. मी तुम्हाला काही सोपे प्रश्न विचारेन, एकएक. काही वाचायचे नाही, फॉर्म भरायचा नाही.",
};

const ACK: Record<Lang, string> = {
  en: "Very well.",
  hi: "बहुत अच्छा।",
  bn: "খুব ভালো।",
  kn: "ತುಂಬಾ ಒಳ್ಳೆಯದು.",
  ta: "மிக நன்று.",
  te: "చాలా మంచిది.",
  mr: "खूप छान.",
};

const DONE: Record<Lang, string> = {
  en: "Thank you. Your profile is ready. Please check it on the next screen.",
  hi: "धन्यवाद। आपकी प्रोफ़ाइल तैयार है। कृपया अगली स्क्रीन पर उसे जाँच लें।",
  bn: "ধন্যবাদ। আপনার প্রোফাইল তৈরি। পরের স্ক্রিনে তা দেখে নিন।",
  kn: "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಸಿದ್ಧವಾಗಿದೆ. ಮುಂದಿನ ಪರದೆಯಲ್ಲಿ ಪരಿಶೀಲಿಸಿ.",
  ta: "நன்றி. உங்கள் சுயவிவரம் தயார். அடுத்தத் திரையில் சரிபார்க்கவும்.",
  te: "ధన్యవాదాలు. మీ ప్రొఫైల్ సిద్ధమైంది. తదుపరి స్క్రీన్‌లో తనిఖీ చేయండి.",
  mr: "धन्यवाद. तुमची प्रोफाइल तयार आहे. पुढील स्क्रीनवर ती तपासा.",
};

// ---------------------------------------------------------------------------
// Day 8: answer-type validation ("is this an answer to what I asked?").
// Each topic has a type signature. An answer that does not fit is NOT
// recorded; the assistant says so and re-asks (REPAIR). After MAX_REPAIRS
// repair turns the latest answer is accepted as-is, so a valid-but-unusual
// answer can never trap a beneficiary in a loop. Fully deterministic.
// ---------------------------------------------------------------------------

export const MAX_REPAIRS = 2;

const REPAIR: Record<Lang, string> = {
  en: "That does not answer what I asked. Let me ask again:",
  hi: "आपने जो बताया वह मेरे सवाल का जवाब नहीं है। फिर से पूछती हूँ:",
  bn: "যা বললেন তা আমার প্রশ্নের উত্তর নয়। আবার জিজ্ঞেস করছি:",
  kn: "ನೀವು ಹೇಳಿದ್ದು ನನ್ನ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರ ಅಲ್ಲ. ಮತ್ತೆ ಕೇಳುತ್ತಿದ್ದೇನೆ:",
  ta: "நீங்கள் சொன்னது என் கேள்விக்கான பதில் அல்ல. மீண்டும் கேட்கிறேன்:",
  te: "మీరు చెప్పింది నా ప్రశ్నకు సమాధానం కాదు. మళ్లీ అడుగుతున్నాను:",
  mr: "तुम्ही बोलला ते माझ्या प्रश्नाचे उत्तर नाही. पुन्हा विचारते:",
};

const RE_EDU_NONE =
  /(no formal|illiterate|never went|did not study|didn't study|नहीं पढ़|निरक्षर|পড়া নাই|অশিক্ষিত|নিরক্ষর|ಓದಿಲ್ಲ|ಅಕ್ಷರಸ್ಥರಲ್ಲ|படிக்கவில்லை|எழுதப் படிக்கத் தெரியாது|చదవలేదు|అక్షరాలు రావు|शिकलो नाही|अशिक्षित)/i;
const RE_EDU_CLASS = /(\d{1,2})\s*(th|st|rd|nd|वीं|वी|ম|শ্ৰ?েণী|ನೇ|வது|వ|व्या)?/i;
const RE_EDU_ITI = /(iti|आई टी आई|আইটিआই|আইটিআই|ಐಟಿಐ|ஐடிஐ|ఐటిఐ|आयटीआय)/i;
const RE_EDU_DIPLOMA = /(diploma|डिप्लोमा|ডিপ্লোমা|ಡಿಪ್ಲೊಮಾ|டிப்ளமோ|డిప్లొమా|डिप्लोमा)/i;
const RE_EDU_GRAD = /(graduate|graduation|degree|स्नातक|ग्रेजुएट|স্নাতক|পদবী|ಪದವೀಧರ|பட்டதாரி|గ్రాడ్యుయేట్|पदवी|पदवीधर)/i;

const RE_SELF =
  /(self|own work|own business|own shop|खुद का|अपना काम|अपने काम|स्वरोज़गार|बिज़नेस|व्यवसाय|নিজের কাজ|ব্যবসা|স্বনিয়োজিত|ಸ್ವಂತ ಕೆಲಸ|ವ್ಯಾಪಾರ|சொந்தமாக|சொந்தத் தொழில்|స్వంత పని|వ్యాపారం|स्वतःचे|स्वयंरोजगार)/i;
const RE_WAGE =
  /(wage|salary|job|service|नौकरी|तनख्वाह|पगार|চাকরি|বেতন|ಉದ್ಯೋಗ|ಸಂಬಳ|வேலை|சம்பளம்|ఉద్యోగం|ఉద్యోగమా|జీతం|नोकरी)/i;
const RE_EITHER =
  /(both|either|any|anything|दोनों|कोई भी|जो भी|দুটোই|যেকোনো|ಎರಡೂ|ಯಾವುದಾದರೂ|இரண்டும்|எதுவாயினும்|రెండూ|ఏదైనా|दोन्ही|काहीही)/i;

// Spelled-out ordinals in Indic scripts ("दहावी" = 10th, "बारहवीं" = 12th).
// Small, honest coverage: Devanagari ordinals 5-12 plus Bengali দশম.
const EDU_SPELLED: [string, number][] = [
  ["पाचवी", 5],
  ["छठी", 6],
  ["सातवी", 7],
  ["आठवी", 8],
  ["नववी", 9],
  ["दिसावी", 10],
  ["दसवीं", 10],
  ["दसवी", 10],
  ["दहावी", 10],
  ["দশম", 10],
  ["अकरावी", 11],
  ["ग्यारहवीं", 11],
  ["बारावी", 12],
  ["बारहवीं", 12],
];

const RE_MOBILITY =
  /(\byes\b|\byep\b|\byeah\b|\bno\b|cannot|can't|wont|won't|able|unable|travel|migrate|\bfar\b|\bnear home\b|हाँ|हो\b|नहीं|नाही|जा सक|शक्य|मी करू|দূরে|হ্যাঁ|না\b|পারি|পারব|বাড়ি|ಹೌದು|ಇಲ್ಲ|ಬಹುದು|ಸಾಧ್ಯವಿಲ್ಲ|ಮನೆ|ஆம்|இல்லை|முடியும்|முடியாது|வீட்|అవును|కాదు|వీలు|గలను|గలదు|ఇంటి|సాధ్యం)/i;

function eduSig(t: string): boolean {
  if (RE_EDU_NONE.test(t) || RE_EDU_ITI.test(t) || RE_EDU_DIPLOMA.test(t)) return true;
  if (RE_EDU_GRAD.test(t)) return true;
  if (EDU_SPELLED.some(([w]) => t.includes(w))) return true;
  // Bare numbers are NOT education evidence ("45 years" is an age, not a class).
  const m = t.match(RE_EDU_CLASS);
  if (m && m[1]) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return true;
  }
  return TOPIC_TERMS.education.some((w) => t.includes(w));
}

function mobSig(t: string): boolean {
  // Long/multi-word terms only: short ones ("far", "bus") collide with
  // ordinary answers like "We are farmers" when reused as an answer-type test.
  return RE_MOBILITY.test(t) || TOPIC_TERMS.mobility.some((w) => w.length >= 6 && t.includes(w));
}

function prefSig(t: string): boolean {
  return RE_SELF.test(t) || RE_WAGE.test(t) || RE_EITHER.test(t);
}

/** Substantive text: at least 3 letters (not bare numbers or a bare "hm"). */
function substance(t: string): boolean {
  return (t.replace(/[^\p{L}]/gu, "").length >= 3);
}

/** True only when exactly one strict signature matched (and it's not ours). */
function strictlyOtherSig(expected: Topic, edu: boolean, mob: boolean, pref: boolean): boolean {
  if (expected === "education") return false;
  if (expected === "mobility") return false;
  if (expected === "workPreference") return false;
  const matched: boolean[] = [edu, mob, pref];
  return matched.filter(Boolean).length === 1;
}

/** Contentless echo answers ("same", "ditto", "तेच") never answer any question. */
const RE_ANAPHORA =
  /^(same|ditto|as before|as usual|like before|वही|उही|उस्तै|एकই|আগের|అదే|அதே|तेच|ಹಿಂದಿನ|ಮೊದಲಿನದೇ)$/;

/** Is this answer the type of answer the question for `topic` expects? */
export function answerFits(topic: Topic, text: string): boolean {
  const t = normalize(text);
  if (t.length <= 26 && RE_ANAPHORA.test(t)) return false;
  const edu = eduSig(t);
  const mob = mobSig(t);
  const pref = prefSig(t);
  if (topic === "education") return edu;
  if (topic === "workPreference") return pref || (substance(t) && !edu && !mob);
  if (topic === "mobility") return mob || (substance(t) && !edu && !pref);
  // free-text topics: need substance and must not be purely another type's answer
  return substance(t) && !strictlyOtherSig(topic, edu, mob, pref);
}

/** Repair turns already used for this topic before history index `upto`. */
export function repairCountBefore(history: ChatMessage[], upto: number, topic: Topic, lang: Lang): number {
  let n = 0;
  for (let j = 0; j < upto; j++) {
    const m = history[j];
    if (m && m.role === "assistant" && m.text.startsWith(REPAIR[lang]) && questionTopic(m.text) === topic) n++;
  }
  return n;
}

/**
 * Repair text for a rejected answer: honest "you did not answer what I
 * asked", then the same question again in the beneficiary's language.
 */
export function repairQuestion(topic: Topic, lang: Lang): string {
  return REPAIR[lang] + " " + QUESTIONS[lang][topic];
}

function extractCanonical(topic: Topic, raw: string): string | null {
  const t = normalize(raw);
  if (topic === "education") {
    if (RE_EDU_NONE.test(raw) || RE_EDU_NONE.test(t)) return "none";
    if (RE_EDU_ITI.test(t)) return "iti";
    if (RE_EDU_DIPLOMA.test(t)) return "diploma";
    if (RE_EDU_GRAD.test(t)) return "graduate";
    const m = t.match(RE_EDU_CLASS);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 12) return "class-" + n;
    }
    for (const [word, n] of EDU_SPELLED) {
      if (t.includes(word)) return "class-" + n;
    }
    return null;
  }
  if (topic === "workPreference") {
    if (RE_EITHER.test(t)) return "either";
    if (RE_SELF.test(t)) return "self";
    if (RE_WAGE.test(t)) return "wage";
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Profile construction from history (the never-re-ask memory).
// ---------------------------------------------------------------------------

export function emptyProfile(): Profile {
  const topics = {} as Record<Topic, TopicState>;
  for (const t of TOPIC_ORDER) topics[t] = { status: "unknown", value: null, canonical: null };
  return { topics, warnings: [], complete: false };
}

function cleanValue(raw: string): string {
  const v = raw.replace(/\s+/g, " ").trim();
  return v.length > 140 ? v.slice(0, 140) : v;
}

function markTopic(profile: Profile, topic: Topic, rawValue: string): void {
  const prev = profile.topics[topic];
  const value = cleanValue(rawValue);
  if (
    prev.status === "known" &&
    prev.value !== null &&
    normalize(prev.value) !== normalize(value)
  ) {
    // Wrong-info guard: contradiction with an earlier answer.
    // Keep the latest, raise a warning, official confirms later.
    profile.warnings.push({ topic, previous: prev.value, latest: value });
  }
  profile.topics[topic] = {
    status: "known",
    value,
    canonical: extractCanonical(topic, value),
  };
}

/**
 * Walk the conversation. Every assistant message is classified; the user
 * answer that follows it resolves that topic. AI-paraphrased questions are
 * classified the same way, so marking works regardless of who phrased the
 * question. Skips mark the topic refused so it is not re-asked this session.
 */
export function markKnownFromHistory(history: ChatMessage[], lang: Lang): Profile {
  const profile = emptyProfile();
  for (let i = 0; i < history.length - 1; i++) {
    const a = history[i];
    const u = history[i + 1];
    if (a.role !== "assistant" || u.role !== "user") continue;
    const topic = questionTopic(a.text);
    if (!topic) continue;
    if (isChitChat(u.text, lang)) continue;
    if (isSkip(u.text, lang)) {
      if (profile.topics[topic].status === "unknown") {
        profile.topics[topic] = { status: "refused", value: null, canonical: null };
      }
      continue;
    }
    // Day 8: type check. Mismatched answers do not settle the topic; the
    // interview repairs and asks again. After MAX_REPAIRS repairs, accept.
    if (!answerFits(topic, u.text)) {
      // i+1: a repair turn at index i is itself a repair for this topic.
      if (repairCountBefore(history, i + 1, topic, lang) < MAX_REPAIRS) continue;
    }
    markTopic(profile, topic, u.text);
  }
  profile.complete = TOPIC_ORDER.every((t) => profile.topics[t].status !== "unknown");
  return profile;
}

/** The next essential to ask, or null when every topic is settled. */
export function nextQuestion(
  profile: Profile,
  lang: Lang
): { topic: Topic; text: string } | null {
  for (const topic of TOPIC_ORDER) {
    if (profile.topics[topic].status === "unknown") {
      return { topic, text: QUESTIONS[lang][topic] };
    }
  }
  return null;
}

/**
 * Deterministic question for an explicit topic. Used by the review screen's
 * tap-to-fix chips: asking it re-marks that one topic via the same
 * questionTopic() classification as everything else.
 */
export function questionForTopic(topic: Topic, lang: Lang): string {
  return QUESTIONS[lang][topic];
}

// ---------------------------------------------------------------------------
// Deterministic turn builder
// ---------------------------------------------------------------------------

export type ReplyKind = "opening" | "ack" | "question" | "done";

export interface DeterministicTurn {
  reply: string;
  replyKind: ReplyKind;
  topic: Topic | null; // which topic this question targets (null for opening/ack/done)
  repair: boolean; // true when the reply re-asks after a mismatched answer
  engine: "deterministic";
  profile: Profile;
  done: boolean;
}

export function getDeterministicTurn(history: ChatMessage[], lang: Lang): DeterministicTurn {
  const profile = markKnownFromHistory(history, lang);

  if (history.length === 0) {
    return {
      reply: OPENING[lang] + " " + QUESTIONS[lang].education,
      replyKind: "opening",
      topic: "education",
      repair: false,
      engine: "deterministic",
      profile,
      done: false,
    };
  }

  if (profile.complete) {
    return {
      reply: DONE[lang],
      replyKind: "done",
      topic: null,
      repair: false,
      engine: "deterministic",
      profile,
      done: true,
    };
  }

  const next = nextQuestion(profile, lang);
  if (!next) {
    return {
      reply: DONE[lang],
      replyKind: "done",
      topic: null,
      repair: false,
      engine: "deterministic",
      profile,
      done: true,
    };
  }

  const last = history[history.length - 1];
  if (last && last.role === "user" && isChitChat(last.text, lang)) {
    return {
      reply: ACK[lang] + " " + next.text,
      replyKind: "ack",
      topic: next.topic,
      repair: false,
      engine: "deterministic",
      profile,
      done: false,
    };
  }

  // Day 8: the previous question is still unsettled and the last answer did
  // not fit its type -> say so honestly and ask the same question again.
  // (The accepting-cap lives in markKnownFromHistory via repairCountBefore.)
  if (last && last.role === "user" && !isSkip(last.text, lang)) {
    const prevQ = history.length >= 2 ? history[history.length - 2] : null;
    const t = prevQ && prevQ.role === "assistant" ? questionTopic(prevQ.text) : null;
    if (
      t !== null &&
      profile.topics[t].status === "unknown" &&
      !answerFits(t, last.text)
    ) {
      return {
        reply: repairQuestion(t, lang),
        replyKind: "question",
        topic: t,
        repair: true,
        engine: "deterministic",
        profile,
        done: false,
      };
    }
  }

  return {
    reply: next.text,
    replyKind: "question",
    topic: next.topic,
    repair: false,
    engine: "deterministic",
    profile,
    done: false,
  };
}

// ---------------------------------------------------------------------------
// The LLM-proof swap. Any AI-generated candidate is validated here before a
// beneficiary ever sees it: it must ask about the expected topic AND that
// topic must still be unknown. Anything else is replaced by the
// deterministic question. Never throws.
// ---------------------------------------------------------------------------

export function sanitizeCandidate(
  candidate: string,
  expectedTopic: Topic,
  profile: Profile,
  deterministicFallback: string
): { text: string; engine: "ai-ok" | "guard-swap" } {
  const trimmed = candidate.trim();
  if (trimmed.length < 8 || trimmed.length > 360) {
    return { text: deterministicFallback, engine: "guard-swap" };
  }
  const asked = questionTopic(trimmed);
  if (asked !== expectedTopic || profile.topics[expectedTopic].status !== "unknown") {
    return { text: deterministicFallback, engine: "guard-swap" };
  }
  return { text: trimmed, engine: "ai-ok" };
}

/** Localised label for a topic (reuses the kiosk dictionary strings). */
export function topicLabel(topic: Topic, lang: Lang): string {
  return getDict(lang).kiosk.topics[topic];
}