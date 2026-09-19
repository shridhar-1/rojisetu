// English dictionary. This file is the master: every other language
// file must satisfy the Dict type below, so tsc catches any missing key.
export const en = {
  appName: "RojiSetu",
  tagline: "The livelihood bridge. Speak, and we will find your path.",
  landing: {
    beneficiary: "I am a beneficiary",
    beneficiaryHint: "Talk to the assistant in your own language",
    official: "Official dashboard",
    officialHint: "Profiles, recommendations and outcomes",
  },
  picker: {
    label: "Choose your language",
  },
  kiosk: {
    welcome: "Welcome",
    introLine:
      "We will have a short, friendly talk. No forms to read. Just speak, in your own words.",
    topicsTitle: "What we will talk about",
    topics: {
      education: "Your education",
      familyOccupation: "Your family's traditional work",
      currentLivelihood: "How you earn today",
      skillsInterests: "Your skills and interests",
      mobility: "Travel and physical constraints",
      workPreference: "Your own work or a job?",
      district: "Your district and the work available near you",
    },
    comingSoon:
      "The voice conversation engine is being connected next. Today this screen shows the conversation plan in your language.",
    back: "Back",
    changeLanguage: "Change language",
    chat: {
      typePlaceholder: "Type your answer…",
      send: "Send",
      retryNote: "No reply. Check your connection and try again.",
    },
    review: {
      title: "Check your details",
      note: "Tap any item to change it. You will re-answer just that one question.",
      notAnswered: "Not answered",
      warning:
        "You earlier gave a different answer for this. We kept the latest one; the official will confirm it.",
      finish: "Confirm and finish",
      startOver: "Start over",
      thanksTitle: "Thank you!",
      thanksNote:
        "Your profile is saved in this demo session. Training recommendations will appear here in the next build step.",
    },
  },
  dashboard: {
    title: "District dashboard",
    subtitle: "PM-AJAY livelihood mapping, recommendations and outcomes",
    profiles: "Profiles",
    recommendations: "Recommendations",
    enrolled: "Enrolled in training",
    placed: "Placed or self-employed",
    recentProfiles: "Recent profiles",
    colName: "Name",
    colDistrict: "District",
    colEducation: "Education",
    colRecommendation: "Top recommendation",
    colStatus: "Status",
    demoBanner:
      "Demo data is ON. Set DATABASE_URL and run drizzle-kit push to store real profiles.",
    empty: "No profiles yet. They will appear here after beneficiary interviews.",
    backHome: "Back to home",
  },
  footer: "Team EcoLogic - SIH 2026 - PM-AJAY, Ministry of Social Justice and Empowerment",
};

export type Dict = typeof en;
