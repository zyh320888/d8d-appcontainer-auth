export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401,
    public code: string = "AUTH_ERROR"
  ) {
    super(message);
    this.name = "AuthError";
  }

  static invalidCredentials(): AuthError {
    return new AuthError("用户名或密码错误", 401, "INVALID_CREDENTIALS");
  }

  static tokenExpired(): AuthError {
    return new AuthError("令牌已过期", 401, "TOKEN_EXPIRED"); 
  }

  static unauthorized(): AuthError {
    return new AuthError("未授权访问", 401, "UNAUTHORIZED");
  }
} 