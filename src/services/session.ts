import type { APIClient } from "@d8d-appcontainer/api";
import type { SessionInfo } from "../types.ts";

export class SessionService {
  private storageKeys: {
    sessions: string;
    refreshTokens: string;
    userSessions: string;
  };

  private readonly UPDATE_INTERVAL = 60 * 1000; // 1分钟的更新间隔

  constructor(
    private client: APIClient,
    prefix: string = 'auth'
  ) {
    this.storageKeys = {
      sessions: `${prefix}_session`,
      refreshTokens: `${prefix}_refresh`,
      userSessions: `${prefix}_user_sessions`
    };
  }

  async saveSession(session: SessionInfo, expiry: number): Promise<void> {
    const sessionKey = `${this.storageKeys.sessions}:${session.sessionId}`;
    const sessionValue = JSON.stringify({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString()
    });

    await this.client.redis.set(sessionKey, sessionValue, expiry);
    
    await this.client.redis.hset(
      `${this.storageKeys.userSessions}:${session.userId}`,
      session.sessionId,
      expiry.toString()
    );
  }

  async getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
    const key = `${this.storageKeys.sessions}:${sessionId}`;
    const data = await this.client.redis.get(key);
    if (!data) return null;

    const session = JSON.parse(data);
    return {
      ...session,
      createdAt: new Date(session.createdAt),
      lastActivityAt: new Date(session.lastActivityAt)
    };
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const key = `${this.storageKeys.sessions}:${sessionId}`;
    const lastUpdateKey = `${key}:last_update`;
    
    // 检查上次更新时间
    const lastUpdate = await this.client.redis.get(lastUpdateKey);
    const now = Date.now();
    
    if (lastUpdate && now - parseInt(lastUpdate) < this.UPDATE_INTERVAL) {
      return; // 如果在更新间隔内，直接返回
    }

    const data = await this.client.redis.get(key);
    if (!data) return;

    const session = JSON.parse(data);
    session.lastActivityAt = new Date().toISOString();
    
    const ttl = await this.client.redis.ttl(key);
    if (ttl > 0) {
      await this.client.redis.set(key, JSON.stringify(session), ttl);
      await this.client.redis.set(lastUpdateKey, now.toString(), ttl);
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const session = await this.getSessionInfo(sessionId);
    if (session) {
      await this.client.redis.del(`${this.storageKeys.sessions}:${sessionId}`);
      await this.client.redis.hdel(
        `${this.storageKeys.userSessions}:${session.userId}`,
        sessionId
      );
      await this.removeRefreshToken(session.userId, sessionId);
    }
  }

  async getUserSessions(userId: string): Promise<string[]> {
    const sessions = await this.client.redis.hkeys(`${this.storageKeys.userSessions}:${userId}`);
    
    const validSessions = [];
    for (const sessionId of sessions) {
      const exists = await this.client.redis.exists(`${this.storageKeys.sessions}:${sessionId}`);
      if (exists) {
        validSessions.push(sessionId);
      } else {
        await this.client.redis.hdel(`${this.storageKeys.userSessions}:${userId}`, sessionId);
      }
    }
    
    return validSessions;
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    await Promise.all(
      sessions.map(sessionId => this.invalidateSession(sessionId))
    );
  }

  async saveRefreshToken(userId: string, token: string, sessionId: string): Promise<void> {
    const key = `${this.storageKeys.refreshTokens}:${userId}:${token}`;
    const value = JSON.stringify({ sessionId });
    const expiry = 30 * 24 * 60 * 60; // 30天过期时间
    
    await this.client.redis.set(key, value, expiry);
  }

  async validateRefreshToken(userId: string, token: string): Promise<boolean> {
    const key = `${this.storageKeys.refreshTokens}:${userId}:${token}`;
    const exists = await this.client.redis.get(key);
    return !!exists;
  }

  async removeRefreshToken(userId: string, sessionId: string): Promise<void> {
    const pattern = `${this.storageKeys.refreshTokens}:${userId}:*`;
    const keys = await this.client.redis.keys(pattern);
    
    for (const key of keys) {
      const value = await this.client.redis.get(key);
      if (value) {
        const data = JSON.parse(value);
        if (data.sessionId === sessionId) {
          await this.client.redis.del(key);
        }
      }
    }
  }

  async getSessionTTL(sessionId: string): Promise<number> {
    const key = `${this.storageKeys.sessions}:${sessionId}`;
    return await this.client.redis.ttl(key);
  }
}
