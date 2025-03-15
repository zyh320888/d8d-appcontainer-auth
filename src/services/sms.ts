import type { APIClient } from "@d8d-appcontainer/api";

export class SmsService {
  private storageKeys: {
    codes: string;
    logs: string;
    blacklist: string;
  };

  constructor(
    private client: APIClient,
    prefix: string = 'auth'
  ) {
    this.storageKeys = {
      codes: `${prefix}_sms_codes`,
      logs: `${prefix}_sms_logs`,
      blacklist: `${prefix}_sms_blacklist`
    };
  }

  async storeSmsCode(phone: string, code: string, type: string, expiresAt: Date): Promise<void> {
    const key = `${this.storageKeys.codes}:${type}:${phone}`;
    const value = JSON.stringify({
      code,
      type,
      expiresAt: expiresAt.toISOString()
    });

    // 计算从现在到过期时间的秒数
    const expiry = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (expiry <= 0) {
      throw new Error("过期时间无效");
    }

    await this.client.redis.set(key, value, expiry);
    await this.logSmsSend(phone, type);
  }

  async validateSmsCode(phone: string, code: string, type: string): Promise<boolean> {
    const key = `${this.storageKeys.codes}:${type}:${phone}`;
    const data = await this.client.redis.get(key);
    
    if (!data) {
      return false;
    }

    const smsData = JSON.parse(data);
    const isValid = smsData.code === code && new Date(smsData.expiresAt) > new Date();

    if (isValid) {
      // 验证成功后删除验证码
      await this.client.redis.del(key);
    }

    return isValid;
  }

  private async logSmsSend(phone: string, type: string): Promise<void> {
    const key = `${this.storageKeys.logs}:${type}:${phone}`;
    const now = Date.now();
    await this.client.redis.set(key, now.toString(), 60); // 1分钟内限制
  }

  async canSendSms(phone: string, type: string): Promise<{
    allowed: boolean;
    message?: string;
    remainingSeconds?: number;
  }> {
    // 检查黑名单
    const blacklistKey = `${this.storageKeys.blacklist}:${phone}`;
    const isBlocked = await this.client.redis.get(blacklistKey);
    
    if (isBlocked) {
      const expiry = await this.client.redis.ttl(blacklistKey);
      return {
        allowed: false,
        message: "该手机号已被封禁",
        remainingSeconds: expiry
      };
    }

    // 检查发送频率
    const logKey = `${this.storageKeys.logs}:${type}:${phone}`;
    const lastSent = await this.client.redis.get(logKey);
    
    if (lastSent) {
      const elapsed = Date.now() - parseInt(lastSent);
      const remaining = Math.ceil((60 * 1000 - elapsed) / 1000);
      
      if (remaining > 0) {
        return {
          allowed: false,
          message: "发送过于频繁，请稍后再试",
          remainingSeconds: remaining
        };
      }
    }

    return { allowed: true };
  }

  async addToBlacklist(phone: string, duration: number): Promise<void> {
    const key = `${this.storageKeys.blacklist}:${phone}`;
    await this.client.redis.set(key, "1", duration);
  }
} 