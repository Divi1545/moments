import { pgTable, text, timestamp, integer, boolean, uuid, doublePrecision, varchar, serial, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  homeCountry: varchar("home_country", { length: 2 }).notNull(),
  languages: text("languages").array().notNull(),
  userType: text("user_type").notNull(),
  profilePhotoUrl: text("profile_photo_url"),
  profilePhotoUploadedAt: timestamp("profile_photo_uploaded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const moments = pgTable("moments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: uuid("creator_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  cityCode: text("city_code").default("UNKNOWN"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  maxParticipants: integer("max_participants").notNull(),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const momentParticipants = pgTable("moment_participants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  momentId: uuid("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const momentMessages = pgTable("moment_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  momentId: uuid("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const momentPhotos = pgTable("moment_photos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  momentId: uuid("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  isPreview: boolean("is_preview").default(false),
});

export const sosAlerts = pgTable("sos_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  momentId: uuid("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: uuid("resolved_by").references(() => profiles.id),
});

export const flags = pgTable("flags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: uuid("reporter_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type Moment = typeof moments.$inferSelect;
export type InsertMoment = typeof moments.$inferInsert;
export type MomentParticipant = typeof momentParticipants.$inferSelect;
export type MomentMessage = typeof momentMessages.$inferSelect;
export type MomentPhoto = typeof momentPhotos.$inferSelect;
export type SosAlert = typeof sosAlerts.$inferSelect;
export type Flag = typeof flags.$inferSelect;
