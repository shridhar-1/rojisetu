// i18n skeleton for RojiSetu. 7 languages, same set as the MediKiosk engine.
// Dictionaries are plain typed objects, checked against the master Dict type in en.ts.
import { en, type Dict } from "./dictionaries/en";
import { hi } from "./dictionaries/hi";
import { bn } from "./dictionaries/bn";
import { kn } from "./dictionaries/kn";
import { ta } from "./dictionaries/ta";
import { te } from "./dictionaries/te";
import { mr } from "./dictionaries/mr";

export const LANGS = [
  { code: "en", nativeName: "English" },
  { code: "hi", nativeName: "हिन्दी" },
  { code: "bn", nativeName: "বাংলা" },
  { code: "kn", nativeName: "ಕನ್ನಡ" },
  { code: "ta", nativeName: "தமிழ்" },
  { code: "te", nativeName: "తెలుగు" },
  { code: "mr", nativeName: "मराठी" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

const DICTS: Record<Lang, Dict> = { en, hi, bn, kn, ta, te, mr };

export function isLang(value: string | undefined | null): value is Lang {
  return !!value && value in DICTS;
}

export function getDict(lang: Lang): Dict {
  return DICTS[lang];
}

/** Safe resolver: unknown or missing value falls back to English. */
export function toLang(value: string | undefined | null): Lang {
  return isLang(value) ? value : "en";
}

export type { Dict };
