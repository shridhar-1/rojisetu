// Demo rows for the official dashboard. Shown ONLY when DEMO_MODE=true,
// same backdoor gate as MediKiosk. Clearly labelled, never mistaken for real data.
export type DemoProfile = {
  name: string;
  district: string;
  education: string;
  topRecommendation: string;
  status: "recommended" | "enrolled" | "placed";
};

export const demoProfiles: DemoProfile[] = [
  {
    name: "Lakshmi (demo)",
    district: "Kalaburagi, KA",
    education: "8th pass",
    topRecommendation: "Sewing Machine Operator - NSQF L3",
    status: "enrolled",
  },
  {
    name: "Ramesh (demo)",
    district: "Varanasi, UP",
    education: "10th pass",
    topRecommendation: "Solar PV Installer - NSQF L4",
    status: "recommended",
  },
  {
    name: "Sunita (demo)",
    district: "Gaya, BR",
    education: "5th pass",
    topRecommendation: "Beauty and Wellness Assistant - NSQF L3",
    status: "placed",
  },
];
