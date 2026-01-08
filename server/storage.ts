import { db } from "./db";
import { users, profiles, moments, momentParticipants, momentMessages, momentPhotos, sosAlerts, flags, userRoles } from "../shared/schema";
import { eq, and, sql, desc, asc, gt, lt, gte, lte, isNull, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

export interface IStorage {
  createUser(email: string, password: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  getUserById(id: string): Promise<any>;
  validatePassword(email: string, password: string): Promise<any>;
  
  createProfile(data: any): Promise<any>;
  getProfile(userId: string): Promise<any>;
  updateProfile(userId: string, data: any): Promise<any>;
  
  createMoment(data: any): Promise<any>;
  getMoment(id: string): Promise<any>;
  getNearbyMoments(lat: number, lng: number, radiusMeters: number, limit: number): Promise<any[]>;
  searchMoments(query: string, lat: number, lng: number, radiusMeters: number, limit: number): Promise<any[]>;
  updateMomentStatus(id: string, status: string): Promise<any>;
  
  joinMoment(momentId: string, userId: string): Promise<any>;
  leaveMoment(momentId: string, userId: string): Promise<any>;
  getParticipants(momentId: string): Promise<any[]>;
  isParticipant(momentId: string, userId: string): Promise<boolean>;
  getMomentContext(momentId: string): Promise<any>;
  
  getMessages(momentId: string, limit: number): Promise<any[]>;
  sendMessage(momentId: string, userId: string, content: string): Promise<any>;
  
  createSosAlert(userId: string, momentId: string, lat: number | null, lng: number | null): Promise<any>;
  getActiveSosAlerts(): Promise<any[]>;
  
  createFlag(reporterId: string, targetType: string, targetId: string, reason: string): Promise<any>;
  
  getMomentPhotos(momentId: string, isPreview: boolean): Promise<any[]>;
  addMomentPhoto(momentId: string, uploaderId: string, photoUrl: string, isPreview: boolean): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async createUser(email: string, password: string): Promise<any> {
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
    }).returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || null;
  }

  async getUserById(id: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || null;
  }

  async validatePassword(email: string, password: string): Promise<any> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async createProfile(data: any): Promise<any> {
    const [profile] = await db.insert(profiles).values({
      id: data.id,
      displayName: data.displayName || data.display_name,
      homeCountry: data.homeCountry || data.home_country,
      languages: data.languages,
      userType: data.userType || data.user_type,
      profilePhotoUrl: data.profilePhotoUrl || data.profile_photo_url,
      profilePhotoUploadedAt: data.profilePhotoUrl ? new Date() : null,
    }).returning();
    return profile;
  }

  async getProfile(userId: string): Promise<any> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    return profile || null;
  }

  async updateProfile(userId: string, data: any): Promise<any> {
    const [profile] = await db.update(profiles)
      .set({
        displayName: data.displayName || data.display_name,
        homeCountry: data.homeCountry || data.home_country,
        languages: data.languages,
        userType: data.userType || data.user_type,
        profilePhotoUrl: data.profilePhotoUrl || data.profile_photo_url,
        profilePhotoUploadedAt: data.profilePhotoUrl ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();
    return profile;
  }

  async createMoment(data: any): Promise<any> {
    const [moment] = await db.insert(moments).values({
      creatorId: data.creatorId || data.creator_id,
      title: data.title,
      lat: data.lat,
      lng: data.lng,
      cityCode: data.cityCode || data.city_code || "UNKNOWN",
      startsAt: new Date(data.startsAt || data.starts_at),
      endsAt: new Date(data.endsAt || data.ends_at),
      maxParticipants: data.maxParticipants || data.max_participants,
      status: "active",
    }).returning();
    
    await db.insert(momentParticipants).values({
      momentId: moment.id,
      userId: moment.creatorId,
    });
    
    return moment;
  }

  async getMoment(id: string): Promise<any> {
    const [moment] = await db.select().from(moments).where(eq(moments.id, id));
    return moment || null;
  }

  async getNearbyMoments(lat: number, lng: number, radiusMeters: number = 5000, limit: number = 50): Promise<any[]> {
    const latDegrees = radiusMeters / 111000;
    const lngDegrees = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
    
    const result = await db.select({
      id: moments.id,
      title: moments.title,
      lat: moments.lat,
      lng: moments.lng,
      startsAt: moments.startsAt,
      endsAt: moments.endsAt,
      maxParticipants: moments.maxParticipants,
      status: moments.status,
    })
    .from(moments)
    .where(
      and(
        eq(moments.status, "active"),
        gt(moments.endsAt, new Date()),
        gte(moments.lat, lat - latDegrees),
        lte(moments.lat, lat + latDegrees),
        gte(moments.lng, lng - lngDegrees),
        lte(moments.lng, lng + lngDegrees),
      )
    )
    .limit(limit);
    
    const momentsWithCounts = await Promise.all(
      result.map(async (moment) => {
        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
          .from(momentParticipants)
          .where(eq(momentParticipants.momentId, moment.id));
        
        const distance = this.calculateDistance(lat, lng, moment.lat!, moment.lng!);
        
        return {
          ...moment,
          participant_count: Number(count),
          distance_meters: distance,
        };
      })
    );
    
    return momentsWithCounts.sort((a, b) => a.distance_meters - b.distance_meters);
  }

  async searchMoments(query: string, lat: number, lng: number, radiusMeters: number = 10000, limit: number = 20): Promise<any[]> {
    const latDegrees = radiusMeters / 111000;
    const lngDegrees = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
    
    const result = await db.select({
      id: moments.id,
      title: moments.title,
      lat: moments.lat,
      lng: moments.lng,
      startsAt: moments.startsAt,
      endsAt: moments.endsAt,
      maxParticipants: moments.maxParticipants,
      status: moments.status,
    })
    .from(moments)
    .where(
      and(
        eq(moments.status, "active"),
        gt(moments.endsAt, new Date()),
        gte(moments.lat, lat - latDegrees),
        lte(moments.lat, lat + latDegrees),
        gte(moments.lng, lng - lngDegrees),
        lte(moments.lng, lng + lngDegrees),
        sql`lower(${moments.title}) LIKE ${`%${query.toLowerCase()}%`}`,
      )
    )
    .limit(limit);
    
    const momentsWithCounts = await Promise.all(
      result.map(async (moment) => {
        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
          .from(momentParticipants)
          .where(eq(momentParticipants.momentId, moment.id));
        
        const distance = this.calculateDistance(lat, lng, moment.lat!, moment.lng!);
        
        return {
          ...moment,
          participant_count: Number(count),
          distance_meters: distance,
        };
      })
    );
    
    return momentsWithCounts.sort((a, b) => a.distance_meters - b.distance_meters);
  }

  async updateMomentStatus(id: string, status: string): Promise<any> {
    const [moment] = await db.update(moments)
      .set({ status })
      .where(eq(moments.id, id))
      .returning();
    return moment;
  }

  async joinMoment(momentId: string, userId: string): Promise<any> {
    const existing = await this.isParticipant(momentId, userId);
    if (existing) return { success: false, error: "Already joined" };
    
    const moment = await this.getMoment(momentId);
    if (!moment || moment.status !== "active" || moment.endsAt < new Date()) {
      return { success: false, error: "Cannot join this moment" };
    }
    
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(momentParticipants)
      .where(eq(momentParticipants.momentId, momentId));
    
    if (Number(count) >= moment.maxParticipants) {
      return { success: false, error: "Moment is full" };
    }
    
    const [participant] = await db.insert(momentParticipants).values({
      momentId,
      userId,
    }).returning();
    
    return { success: true, data: participant };
  }

  async leaveMoment(momentId: string, userId: string): Promise<any> {
    await db.delete(momentParticipants)
      .where(and(
        eq(momentParticipants.momentId, momentId),
        eq(momentParticipants.userId, userId),
      ));
    return { success: true };
  }

  async getParticipants(momentId: string): Promise<any[]> {
    const participants = await db.select({
      id: momentParticipants.id,
      userId: momentParticipants.userId,
      joinedAt: momentParticipants.joinedAt,
      displayName: profiles.displayName,
      userType: profiles.userType,
      profilePhotoUrl: profiles.profilePhotoUrl,
    })
    .from(momentParticipants)
    .leftJoin(profiles, eq(momentParticipants.userId, profiles.id))
    .where(eq(momentParticipants.momentId, momentId))
    .orderBy(asc(momentParticipants.joinedAt));
    
    return participants;
  }

  async isParticipant(momentId: string, userId: string): Promise<boolean> {
    const [participant] = await db.select()
      .from(momentParticipants)
      .where(and(
        eq(momentParticipants.momentId, momentId),
        eq(momentParticipants.userId, userId),
      ));
    return !!participant;
  }

  async getMomentContext(momentId: string): Promise<any> {
    const participants = await this.getParticipants(momentId);
    return {
      participant_count: participants.length,
      badges: [],
    };
  }

  async getMessages(momentId: string, limit: number = 100): Promise<any[]> {
    const messages = await db.select({
      id: momentMessages.id,
      content: momentMessages.content,
      createdAt: momentMessages.createdAt,
      userId: momentMessages.userId,
      displayName: profiles.displayName,
      profilePhotoUrl: profiles.profilePhotoUrl,
    })
    .from(momentMessages)
    .leftJoin(profiles, eq(momentMessages.userId, profiles.id))
    .where(eq(momentMessages.momentId, momentId))
    .orderBy(asc(momentMessages.createdAt))
    .limit(limit);
    
    return messages.map(m => ({
      ...m,
      profiles: {
        display_name: m.displayName,
        profile_photo_url: m.profilePhotoUrl,
      },
    }));
  }

  async sendMessage(momentId: string, userId: string, content: string): Promise<any> {
    const [message] = await db.insert(momentMessages).values({
      momentId,
      userId,
      content,
    }).returning();
    return message;
  }

  async createSosAlert(userId: string, momentId: string, lat: number | null, lng: number | null): Promise<any> {
    const [alert] = await db.insert(sosAlerts).values({
      userId,
      momentId,
      lat,
      lng,
    }).returning();
    return alert;
  }

  async getActiveSosAlerts(): Promise<any[]> {
    const alerts = await db.select({
      id: sosAlerts.id,
      lat: sosAlerts.lat,
      lng: sosAlerts.lng,
      createdAt: sosAlerts.createdAt,
      momentId: sosAlerts.momentId,
      momentTitle: moments.title,
    })
    .from(sosAlerts)
    .leftJoin(moments, eq(sosAlerts.momentId, moments.id))
    .where(isNull(sosAlerts.resolvedAt));
    
    return alerts;
  }

  async createFlag(reporterId: string, targetType: string, targetId: string, reason: string): Promise<any> {
    const [flag] = await db.insert(flags).values({
      reporterId,
      targetType,
      targetId,
      reason,
    }).returning();
    return flag;
  }

  async getMomentPhotos(momentId: string, isPreview: boolean): Promise<any[]> {
    const photos = await db.select()
      .from(momentPhotos)
      .where(and(
        eq(momentPhotos.momentId, momentId),
        eq(momentPhotos.isPreview, isPreview),
      ))
      .orderBy(asc(momentPhotos.uploadedAt));
    return photos;
  }

  async addMomentPhoto(momentId: string, uploaderId: string, photoUrl: string, isPreview: boolean): Promise<any> {
    const [photo] = await db.insert(momentPhotos).values({
      momentId,
      uploaderId,
      photoUrl,
      isPreview,
    }).returning();
    return photo;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

export const storage = new DatabaseStorage();
