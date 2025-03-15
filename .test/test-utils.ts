import { APIClient } from "@d8d-appcontainer/api";

// 测试配置
export const TEST_CONFIG = {
  jwtSecret: "test_secret_key",
  tokenExpiry: 3600,
  refreshTokenExpiry: 86400,
  singleSession: false,
  storagePrefix: "test_auth",
  initialUsers: [{
    username: "admin",
    password: "admin123",
    email: "admin@test.com"
  }],
  roleConfig: {
    roleTable: "test_roles",
    menuTable: "test_menus",
    roleIdField: "id",
    menuIdsField: "menu_ids"
  },
  departmentConfig: {
    departmentTable: "test_departments",
    departmentIdField: "id"
  }
};

// 获取测试客户端
export async function getTestClient(): Promise<APIClient> {
  const tokenFromKey = await APIClient.getToken({
    serverUrl: 'https://23920.dev.d8dcloud.com',
    workspaceKey: 'ws_mphxpy6prf9'
  });

  const client = new APIClient({
    scope: "user",
    config: {
      serverUrl: 'https://23920.dev.d8dcloud.com',
      token: tokenFromKey,
      type: 'http'
    }
  });
  // 等待连接完成
  await client.connect();

  // 连接成功
  return client;
}

// 修复类型问题的工具函数
export function ensureString(value: string | undefined | null): string {
  return value || '';
} 