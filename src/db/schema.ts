import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// One row per beneficiary interview. Filled by the conversation engine (Day 2).
// Never-re-ask rule: fields once set are treated as KNOWN by the engine.
export const beneficiaries = pgTable("beneficiaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lang: text("lang").notNull().default("en"),
  name: text("name"),
  phone: text("phone"),
  district: text("district"),
  state: text("state"),
  education: text("education"),
  familyOccupation: text("family_occupation"),
  currentLivelihood: text("current_livelihood"),
  skills: jsonb("skills").$type<string[]>().default([]),
  interests: jsonb("interests").$type<string[]>().default([]),
  mobilityNotes: text("mobility_notes"),
  workPreference: text("work_preference"), // "self" | "wage" | "either"
  // Full structured profile blob plus the raw conversation, kept for audit.
  profile: jsonb("profile").$type<Record<string, string | string[] | null>>(),
  transcript:
    jsonb("transcript").$type<{ role: string; text: string; lang: string }[]>()
      .default([]),
});

// NSQF-aligned recommendations. Every row carries its engine label,
// same pattern rule as MediKiosk: deterministic floor first, AI can only ADD.
export const recommendations = pgTable("recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  beneficiaryId: uuid("beneficiary_id")
    .references(() => beneficiaries.id)
    .notNull(),
  nsqfRoleCode: text("nsqf_role_code"),
  roleTitle: text("role_title").notNull(),
  nsqfLevel: integer("nsqf_level"),
  sector: text("sector"),
  rank: integer("rank").notNull().default(1),
  eligible: boolean("eligible").notNull().default(true),
  reasons: jsonb("reasons").$type<string[]>().default([]),
  reasonsByLang: jsonb("reasons_by_lang").$type<Record<string, string[]>>(),
  engine: text("engine").notNull().default("deterministic-floor"),
});

// Post-training tracking, the coordination layer the PS asks for.
// status: recommended -> enrolled -> completed -> placed | self_employed
//         (plus dropped | needs_support at any point)
export const outcomes = pgTable("outcomes", {
  id: uuid("id").defaultRandom().primaryKey(),
  beneficiaryId: uuid("beneficiary_id")
    .references(() => beneficiaries.id)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  status: text("status").notNull().default("recommended"),
  notes: text("notes"),
});

export type Beneficiary = typeof beneficiaries.$inferSelect;
export type NewBeneficiary = typeof beneficiaries.$inferInsert;
export type Recommendation = typeof recommendations.$inferSelect;
export type Outcome = typeof outcomes.$inferSelect;
