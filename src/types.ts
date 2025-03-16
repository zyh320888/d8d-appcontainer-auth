export interface RoleInfo {
  roleId: string;
  menuIds: number[];
  menuList: any[];
}

// 数据库中的用户结构
export interface DbUser {
  id: number;  // 自增主键
  username: string | null;  // 用户登录名
  phone: string | null;  // 用户的手机号码
  email: string | null;  // 用户的电子邮箱
  nickname: string | null;  // 用户的昵称
  name: string | null;  // 用户的真实姓名
  password: string | null;  // 用户登录密码
  role_id: number | null;  // 用户的角色ID
  department_ids: number[] | null;  // 用户所属部门ID列表
  is_disabled: number | null;  // 用户账号是否被禁用
  is_deleted: number | null;  // 用户账号是否被删除
  created_at: Date | null;  // 创建时间
  updated_at: Date | null;  // 更新时间
  wx_web_openid: string | null;
  wx_mini_openid: string | null;
}

// 创建用户时的输入结构
export interface CreateUserInput {
  username?: string;
  password?: string;
  phone?: string;
  email?: string;
  nickname?: string;
  avatar?: string;
  wx_web_openid?: string;
  wx_mini_openid?: string;
}

export interface UpdateUserInput {
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
  nickname?: string;
  name?: string;
  role_id?: number;
  department_ids?: string;
  is_disabled?: number;
  is_deleted?: number;
}

// API 返回的用户信息结构(不包含敏感信息如密码)
export interface User {
  id: number;
  username: string;
  email?: string | null;
  phone?: string | null;
  nickname?: string | null;
  name?: string | null;
  role_id?: number | null;
  department_ids?: number[] | null;
  is_disabled?: number | null;
  is_deleted?: number | null;
  roleInfo?: RoleInfo | null;
  current_department_id?: number | null;
}

export interface AuthResult {
  token: string;
  user: User;
  refreshToken: string;
  sessionId: string;
}

export interface FieldNames {
  id: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  nickname: string;
  name: string;
  role_id: string;
  department_ids: string;
  is_disabled: string;
  is_deleted: string;
  created_at: string;
  updated_at: string;
  wx_web_openid: string;
  wx_mini_openid: string;
}

export interface AuthConfig {
  /** JWT 密钥  */
  jwtSecret: string;
  /** JWT 过期时间（秒） */
  tokenExpiry?: number;
  /** 刷新令牌过期时间（秒） */
  refreshTokenExpiry?: number;
  /** 初始用户列表 */
  initialUsers?: CreateUserInput[];
  /** 单一会话模式 */
  singleSession?: boolean;
  /** 存储前缀 */
  storagePrefix?: string;
  /** 自定义用户表名 */
  userTable?: string;
  /** 自定义字段名映射 */
  fieldNames?: Partial<FieldNames>;
  /** 角色表配置 */
  roleConfig?: {
    /** 自定义角色表名  */
    roleTable: string;
    /** 自定义菜单表名  */
    menuTable: string;
    /** 自定义角色ID字段名 */
    roleIdField: string;
    /** 自定义菜单ID字段名 */
    menuIdsField: string;
  };
  /** 部门表配置 */
  departmentConfig?: {
    /** 自定义部门表名  */
    departmentTable: string;
    /** 自定义部门ID字段名 */
    departmentIdField: string;
  };
}

export interface SessionInfo {
  userId: string;
  sessionId: string;
  token: string;
  refreshToken: string;
  createdAt: Date;
  lastActivityAt: Date;
  isRevoked?: boolean;
  user?: User;
}

export interface TokenPayload {
  sub: string;
  username: string;
  sessionId: string;
  roleInfo?: RoleInfo | null;
  iat: number;
  exp: number;
}

// 短信验证码相关类型
export interface SmsCodeResult {
  allowed: boolean;
  message?: string;
  remainingSeconds?: number;
}

// 会员认证结果
export interface MemberAuthResult {
  token: string;
  refreshToken: string;
  sessionId: string;
  user: User;
}

// 微信用户信息类型
export interface WechatWebUserInfo {
  openid: string;
  nickname: string;
  headimgurl: string;
}

export interface WechatMiniUserInfo {
  openid: string;
}
