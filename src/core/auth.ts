// import { create, verify, type Payload } from "djwt";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { 
  AuthConfig, 
  User, 
  AuthResult, 
  TokenPayload, 
  RoleInfo, 
  SessionInfo, 
  CreateUserInput, 
  DbUser, 
  UpdateUserInput,
  SmsCodeResult,
  MemberAuthResult,
  WechatWebUserInfo,
  WechatMiniUserInfo
} from "../types.ts";
import { AuthError } from "./errors.ts";
import type { APIClient } from "@d8d-appcontainer/api";
import { DbService } from "../services/db.ts";
import { SessionService } from "../services/session.ts";
import { SmsService } from "../services/sms.ts";
// import crypto from "node:crypto";
import { nanoid } from "nanoid";
const { sign, verify } = jwt;

export class Auth {
  private config: AuthConfig & {
    tokenExpiry: number;
    refreshTokenExpiry: number;
    initialUsers: CreateUserInput[];
    singleSession: boolean;
    storagePrefix: string;
    fieldNames?: {
      id?: string;  // 自增主键字段名
      username?: string;  // 用户登录名字段名
      phone?: string;  // 手机号码字段名
      email?: string;  // 电子邮箱字段名
      nickname?: string;  // 昵称字段名
      name?: string;  // 真实姓名字段名
      password?: string;  // 登录密码字段名
      role_id?: string;  // 角色ID字段名
      department_ids?: string;  // 部门ID列表字段名
      is_disabled?: string;  // 是否禁用字段名
      is_deleted?: string;  // 是否删除字段名
      created_at?: string;  // 创建时间字段名
      updated_at?: string;  // 更新时间字段名
    };
  };
  private key!: string;
  private dbService: DbService;
  private sessionService: SessionService;
  private smsService: SmsService;

  constructor(
    private client: APIClient,
    config: AuthConfig
  ) {
    this.config = {
      tokenExpiry: 24 * 60 * 60,
      refreshTokenExpiry: 30 * 24 * 60 * 60,
      initialUsers: [],
      singleSession: false,
      storagePrefix: 'auth',
      ...config
    };

    const fieldNames = this.config.fieldNames || {};

    this.dbService = new DbService(
      client,
      this.config.storagePrefix,
      fieldNames
    );
    this.sessionService = new SessionService(client, this.config.storagePrefix);
    this.smsService = new SmsService(client, this.config.storagePrefix);
    this.initializeKey().catch(error => {
      throw new AuthError("密钥初始化失败: " + error.message);
    });
  }

  private async initializeKey(): Promise<void> {
    this.key = this.config.jwtSecret;
  }

  /**
   * 将数据库用户对象转换为API用户对象
   */
  private toApiUser(dbUser: DbUser): User {
    const departmentIds = dbUser.department_ids && typeof dbUser.department_ids === 'string'
      ? JSON.parse(dbUser.department_ids) as number[]
      : Array.isArray(dbUser.department_ids) ? dbUser.department_ids : null;

    return {
      id: dbUser.id,
      username: dbUser.username || '',  // 确保非空
      email: dbUser.email,
      phone: dbUser.phone,
      nickname: dbUser.nickname,
      name: dbUser.name,
      role_id: dbUser.role_id,
      department_ids: departmentIds,
      is_disabled: dbUser.is_disabled,
      is_deleted: dbUser.is_deleted
    };
  }

  async initialize(): Promise<void> {
    try {
      // 初始化数据库表结构
      await this.initializeTables();
      // 初始化默认用户
      if (this.config.initialUsers.length > 0) {
        await this.initializeUsers(this.config.initialUsers);
      }
    } catch (error) {
      throw new AuthError("初始化失败: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async initializeTables(): Promise<void> {
    await this.dbService.initializeTables();
  }

  private async initializeUsers(users: CreateUserInput[]): Promise<void> {
    for (const user of users) {
      await this.createUser(user);
    }
  }

  async authenticate(username: string, password: string): Promise<AuthResult> {
    const store = this.ensureStore();
    try {
      const dbUser = await store.validateCredentials(username, password);
      if (!dbUser) {
        throw new AuthError("用户名或密码错误");
      }

      // const sessionId = crypto.randomUUID();
      const sessionId = nanoid();
      if (this.config.singleSession) {
        await this.sessionService.invalidateUserSessions(String(dbUser.id));
      }

      // 获取角色信息
      let roleInfo: RoleInfo | null = null;
      const roleConfig = this.config.roleConfig;
      if (roleConfig && dbUser.role_id) {
        try {
          roleInfo = await this.getRoleInfo(dbUser.role_id);
        } catch (error) {
          console.warn('获取角色信息失败:', error);
        }
      }

      const user = this.toApiUser(dbUser);
      const token = await this.createToken(user, sessionId, roleInfo);
      const refreshToken = await this.createRefreshToken(String(dbUser.id), sessionId);

      const userWithRole = roleInfo ? { ...user, roleInfo } : user;

      await this.sessionService.saveSession({
        userId: String(dbUser.id),
        sessionId,
        token,
        refreshToken,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        user: userWithRole
      }, this.config.tokenExpiry);

      return { token, user: userWithRole, refreshToken, sessionId };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      console.error(error);
      throw new AuthError("认证失败");
    }
  }

  async verifyToken(token: string): Promise<User> {
    try {
      const store = this.ensureStore();
      const payload = verify(token, this.key) as JwtPayload & TokenPayload;
      const dbUser = await store.getUser(payload.sub);
      if (!dbUser) {
        throw new AuthError("User not found");
      }
      return this.toApiUser(dbUser);
    } catch (_error) {
      throw new AuthError("Invalid token");
    }
  }

  async refreshToken(refreshToken: string, userId: string | number): Promise<AuthResult> {
    const userIdStr = String(userId);
    const isValid = await this.sessionService.validateRefreshToken(userIdStr, refreshToken);
    if (!isValid) {
      throw new AuthError("Invalid refresh token");
    }

    const dbUser = await this.dbService.getUser(userIdStr);
    if (!dbUser) {
      throw new AuthError("User not found");
    }

    const user = this.toApiUser(dbUser);
    // const sessionId = crypto.randomUUID();
    const sessionId = nanoid();
    const token = await this.createToken(user, sessionId);
    const newRefreshToken = await this.createRefreshToken(String(dbUser.id), sessionId);

    await this.sessionService.saveSession({
      userId: String(dbUser.id),
      sessionId,
      token,
      refreshToken: newRefreshToken,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      user
    }, this.config.tokenExpiry);

    return { token, user, refreshToken: newRefreshToken, sessionId };
  }

  private async createToken(user: User, sessionId: string, roleInfo?: RoleInfo | null): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      sub: user.id.toString() || '',
      username: user.username || '',
      sessionId,
      roleInfo,
      iat: now,
      exp: now + this.config.tokenExpiry
    };
    
    return sign(payload, this.key, { algorithm: 'HS256' });
  }

  private async createRefreshToken(userId: string, sessionId: string): Promise<string> {
    const token = crypto.randomUUID();
    await this.sessionService.saveRefreshToken(userId, token, sessionId);
    return token;
  }

  private ensureStore() {
    if (!this.dbService) {
      throw new AuthError("认证存储未初始化");
    }
    return this.dbService;
  }

  async createUser(params: CreateUserInput): Promise<User> ;
  async createUser(username: string, password: string): Promise<User> ;
  async createUser(...args: any[]): Promise<User> {
    let params: CreateUserInput;
    if (args.length === 2) {
      const [username, password] = args;
      await this.validateUsername(username);
      params = { username, password };
    } else if (args.length === 1) {
      params = args[0];
    } else {
      throw new AuthError("Invalid arguments");
    }

    const userData: CreateUserInput = {
      username: params.username,
      password: params.password,
      email: params.email,
      phone: params.phone,
      nickname: params.nickname,
      avatar: params.avatar,
      wx_web_openid: params.wx_web_openid,
      wx_mini_openid: params.wx_mini_openid,
    };
    // 按各平台用户名查找用户
    const findMethods = {
      username: this.dbService.findUserByUsername.bind(this.dbService),
      phone: this.dbService.findUserByPhone.bind(this.dbService),
      email: this.dbService.findUserByEmail.bind(this.dbService),
      wx_web_openid: this.dbService.findUserByWxWebOpenId.bind(this.dbService),
      wx_mini_openid: this.dbService.findUserByWxMiniOpenId.bind(this.dbService)
    };

    for (const [key, findMethod] of Object.entries(findMethods)) {
      if (params[key as keyof typeof params]) {
        const exists = await findMethod(params[key as keyof typeof params] as string);
        if (exists) {
          // 移除密码字段
          const { password: _, ...userInfo } = exists;
          return userInfo as User;
        }
      }
    }

    
    

    // 创建用户并获取创建后的用户信息（包含自增ID）
    const createdUser = await this.dbService.createUser(userData);
    if (!createdUser) {
      throw new AuthError("创建用户失败");
    }

    // 移除密码字段
    const { password: _, ...userInfo } = createdUser;
    return userInfo as User;
  }

  async checkLoginStatus(token: string): Promise<{
    isValid: boolean;
    user?: User;
    sessionInfo?: SessionInfo;
  }> {
    try {
      const payload = verify(token, this.key) as JwtPayload & TokenPayload;
      if (!payload.sessionId) {
        return { isValid: false };
      }

      const sessionInfo = await this.sessionService.getSessionInfo(payload.sessionId);
      
      if (!sessionInfo || sessionInfo.isRevoked) {
        return { isValid: false };
      }

      const user = sessionInfo.user;
      if (!user) {
        return { isValid: false };
      }

      await this.sessionService.updateSessionActivity(payload.sessionId).catch(err => {
        console.warn('Failed to update session activity:', err);
      });

      return { isValid: true, user, sessionInfo };
    } catch (_error) {
      return { isValid: false };
    }
  }

  async logout(token: string): Promise<void> {
    try {
      const payload = verify(token, this.key) as JwtPayload & TokenPayload;
      if (payload.sessionId) {
        await this.sessionService.invalidateSession(payload.sessionId);
      }
    } catch (_error) {
      console.warn("Logout attempted with invalid token");
    }
  }

  async getUserSessions(userId: string | number): Promise<string[]> {
    const userIdStr = String(userId);
    return await this.sessionService.getUserSessions(userIdStr);
  }

  /**
   * 获取所有用户列表
   */
  async listUsers(): Promise<User[]> {
    const store = this.ensureStore();
    try {
      const dbUsers = await store.listUsers();
      return dbUsers.map(user => this.toApiUser(user));
    } catch (error) {
      console.error(error);
      throw new AuthError("获取用户列表失败");
    }
  }

  /**
   * 删除指定用户
   */
  async deleteUser(userId: string | number): Promise<void> {
    const store = this.ensureStore();
    const userIdStr = String(userId);
    try {
      // 先检查用户是否存在
      const user = await store.getUser(userIdStr);
      if (!user) {
        throw new AuthError("用户不存在");
      }

      // 删除用户相关的会话
      await this.sessionService.invalidateUserSessions(userIdStr);
      
      // 删除用户
      await store.deleteUser(userIdStr);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      console.error(error);
      throw new AuthError("删除用户失败");
    }
  }

  /**
   * 更新用户信息
   */
  async updateUser(userId: string | number, data: UpdateUserInput): Promise<User> {
    const store = this.ensureStore();
    try {
      // 先检查用户是否存在
      const user = await store.getUser(String(userId));
      if (!user) {
        throw new AuthError("用户不存在");
      }

      // 如果要更新用户名，先验证新用户名是否可用
      if (data.username && data.username !== user.username) {
        await this.validateUsername(data.username);
      }

      const updatedUser = await store.updateUser(String(userId), data);
      if (!updatedUser) {
        throw new AuthError("更新用户失败");
      }

      return this.toApiUser(updatedUser);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      console.error(error);
      throw new AuthError("更新用户失败");
    }
  }

  /**
   * 验证用户名是否可用
   * @throws {AuthError} 当用户名已存在时抛出错误
   */
  async validateUsername(username: string): Promise<void> {
    const store = this.ensureStore();
    try {
      const exists = await store.isUsernameExists(username);
      if (exists) {
        throw new AuthError("用户名已存在");
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      console.error(error);
      throw new AuthError("验证用户名失败");
    }
  }

  private async getRoleInfo(roleId: number | string): Promise<RoleInfo | null> {
    if (!this.config.roleConfig) {
      return null;
    }

    const { roleTable, menuTable, menuIdsField } = this.config.roleConfig;
    
    try {
      // 获取角色信息
      const roleInfo = await this.client.database.table(roleTable).where('id', '=', roleId).first();
      if (!roleInfo) {
        return null;
      }

      // 解析菜单IDs
      let menuIds: number[] = [];
      if (roleInfo[menuIdsField]) {
        if (typeof roleInfo[menuIdsField] === 'string') {
          try {
            menuIds = JSON.parse(roleInfo[menuIdsField]);
          } catch (e) {
            menuIds = [];
          }
        } else if(Array.isArray(roleInfo[menuIdsField])) {
          menuIds = roleInfo[menuIdsField];
        }
      }

      // 获取菜单列表
      const menuList = await this.client.database.table(menuTable).whereIn('id', menuIds).execute();

      return {
        roleId: roleInfo.id,
        menuIds,
        menuList
      };
    } catch (error) {
      console.error('获取角色信息失败:', error);
      return null;
    }
  }

  /**
   * 获取用户所属门店列表
   */
  async getUserDepartments(token: string): Promise<any[]> {
    // 验证登录状态
    const { isValid, sessionInfo } = await this.checkLoginStatus(token);
    if (!isValid || !sessionInfo) {
      throw new AuthError("用户未登录");
    }
    const userId = sessionInfo.userId;
    try {
      const departmentConfig = this.config.departmentConfig;
      if (!departmentConfig) {
        return [];
      }
      const { departmentTable, departmentIdField } = departmentConfig;
      const user = await this.dbService.getUser(userId);
      if (!user) {
        throw new AuthError("用户不存在");
      }
      
      // 从用户信息中获取门店ID列表
      const departmentIds = user.department_ids ? (typeof user.department_ids === 'string' ?
        JSON.parse(user.department_ids)
        : user.department_ids)
        : [];
      
      // 查询门店信息
      const departments = await this.client.database.table(departmentTable)
        .whereIn(departmentIdField, departmentIds)
        .execute();
      
      return departments;
    } catch (error) {
      console.error('获取用户门店失败:', error);
      throw new AuthError("获取用户门店失败");
    }
  }

  /**
   * 设置当前门店
   */
  async setCurrentDepartment(departmentId: number, token: string): Promise<void> {
    // 验证登录状态
    const { isValid, sessionInfo } = await this.checkLoginStatus(token);
    if (!isValid || !sessionInfo) {
      throw new AuthError("用户未登录");
    }
    
    // 验证用户是否有权限访问该门店
    const user = sessionInfo.user;
    
    if (!user || !user.department_ids?.includes(departmentId)) {
      throw new AuthError("无权访问该门店");
    }
    
    user.current_department_id = departmentId;
    // 更新会话中的当前门店
    const updatedSession = {
      ...sessionInfo,
      user,
      lastActivityAt: new Date()
    };

    // 获取剩余的过期时间
    const ttl = await this.sessionService.getSessionTTL(sessionInfo.sessionId);
    if (ttl <= 0) {
      throw new AuthError("会话已过期");
    }
    // 保存更新后的会话
    await this.sessionService.saveSession(updatedSession, ttl);
  }

  // 短信相关方法
  async canSendSmsCode(phone: string, type: string): Promise<SmsCodeResult> {
    try {
      return await this.smsService.canSendSms(phone, type);
    } catch (error) {
      console.error('检查短信发送权限失败:', error);
      throw new AuthError("检查短信发送权限失败");
    }
  }

  async storeSmsCode(phone: string, code: string, type: string, expiresAt: Date): Promise<void> {
    try {
      await this.smsService.storeSmsCode(phone, code, type, expiresAt);
    } catch (error) {
      console.error('存储短信验证码失败:', error);
      throw new AuthError("存储短信验证码失败");
    }
  }

  async sendSms(phone: string, content: string): Promise<void> {
    try {
      // 调用短信服务发送验证码
      // 这里需要根据实际使用的短信服务进行实现
      await this.client.sms.send(phone, content);
    } catch (error) {
      console.error('发送短信失败:', error);
      throw new AuthError("发送短信失败");
    }
  }

  // 登录相关方法
  async smsLogin(phone: string, code: string): Promise<MemberAuthResult> {
    try {
      // 验证短信验证码
      const isValid = await this.smsService.validateSmsCode(phone, code, 'login');
      if (!isValid) {
        throw new AuthError("验证码无效或已过期");
      }

      // 查找或创建用户
      let dbUser = await this.dbService.findUserByPhone(phone);
      if (!dbUser) {
        dbUser = await this.dbService.createUser({
          phone,
          username: phone,
        });
      }

      // 生成会话信息
      // const sessionId = crypto.randomUUID();
      const sessionId = nanoid();
      const user = this.toApiUser(dbUser);
      const token = await this.createToken(user, sessionId);
      const refreshToken = await this.createRefreshToken(String(dbUser.id), sessionId);

      // 保存会话
      await this.sessionService.saveSession({
        userId: String(dbUser.id),
        sessionId,
        token,
        refreshToken,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        user
      }, this.config.tokenExpiry);

      return { token, user, refreshToken, sessionId };
    } catch (error) {
      console.error('短信登录失败:', error);
      throw error instanceof AuthError ? error : new AuthError("短信登录失败");
    }
  }

  async passwordLogin(phone: string, password: string): Promise<MemberAuthResult> {
    try {
      // 验证用户名密码
      const dbUser = await this.dbService.validateCredentials(phone, password);
      if (!dbUser) {
        throw new AuthError("手机号或密码错误");
      }

      // 生成会话信息
      const sessionId = crypto.randomUUID();
      const user = this.toApiUser(dbUser);
      const token = await this.createToken(user, sessionId);
      const refreshToken = await this.createRefreshToken(String(dbUser.id), sessionId);

      // 保存会话
      await this.sessionService.saveSession({
        userId: String(dbUser.id),
        sessionId,
        token,
        refreshToken,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        user
      }, this.config.tokenExpiry);

      return { token, user, refreshToken, sessionId };
    } catch (error) {
      console.error('密码登录失败:', error);
      throw error instanceof AuthError ? error : new AuthError("密码登录失败");
    }
  }

  async wechatLogin(code: string): Promise<MemberAuthResult> {
    try {
      // 获取微信用户信息
      const wxUserInfo = await this.client.wechat.getWebUserInfo(code);
      if (!wxUserInfo) {
        throw new AuthError("获取微信用户信息失败");
      }

      // 查找或创建用户
      let dbUser = await this.dbService.findUserByWxWebOpenId(wxUserInfo.openid);
      if (!dbUser) {
        dbUser = await this.dbService.createUser({
          wx_web_openid: wxUserInfo.openid,
          nickname: wxUserInfo.nickname,
        });
      }

      // 生成会话信息
      // const sessionId = crypto.randomUUID();
      const sessionId = nanoid();
      const user = this.toApiUser(dbUser);
      const token = await this.createToken(user, sessionId);
      const refreshToken = await this.createRefreshToken(String(dbUser.id), sessionId);

      // 保存会话
      await this.sessionService.saveSession({
        userId: String(dbUser.id),
        sessionId,
        token,
        refreshToken,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        user
      }, this.config.tokenExpiry);

      return { token, user, refreshToken, sessionId };
    } catch (error) {
      console.error('微信登录失败:', error);
      throw error instanceof AuthError ? error : new AuthError("微信登录失败");
    }
  }

  async wechatMiniLogin(code: string): Promise<MemberAuthResult> {
    try {
      // 获取微信小程序用户信息
      const wxUserInfo = await this.client.wechat.getMiniUserInfo(code);
      if (!wxUserInfo) {
        throw new AuthError("获取微信用户信息失败");
      }

      // 查找或创建用户
      let dbUser = await this.dbService.findUserByWxMiniOpenId(wxUserInfo.openid);
      if (!dbUser) {
        dbUser = await this.dbService.createUser({
          wx_mini_openid: wxUserInfo.openid
        });
      }

      // 生成会话信息
      // const sessionId = crypto.randomUUID();
      const sessionId = nanoid();
      const user = this.toApiUser(dbUser);
      const token = await this.createToken(user, sessionId);
      const refreshToken = await this.createRefreshToken(String(dbUser.id), sessionId);

      // 保存会话
      await this.sessionService.saveSession({
        userId: String(dbUser.id),
        sessionId,
        token,
        refreshToken,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        user
      }, this.config.tokenExpiry);

      return { token, user, refreshToken, sessionId };
    } catch (error) {
      console.error('微信小程序登录失败:', error);
      throw error instanceof AuthError ? error : new AuthError("微信小程序登录失败");
    }
  }
}
