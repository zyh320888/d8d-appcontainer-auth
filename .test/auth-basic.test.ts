import { assertEquals, assertNotEquals, assertRejects } from "https://deno.land/std@0.217.0/assert/mod.ts";
import { Auth } from "../src/core/auth.ts";
import { AuthError } from "../src/core/errors.ts";
import type { APIClient } from "@d8d-appcontainer/api";
import type { User } from "../src/types.ts";
import { TEST_CONFIG, getTestClient, ensureString } from "./test-utils.ts";

Deno.test('Basic Auth Tests', async () => {
  const client = await getTestClient();
  const auth = new Auth(client, TEST_CONFIG);

  try {
    // 初始化数据库表
    await auth.initialize();

    // 测试用户名密码认证
    await testPasswordAuth(auth);

    // 测试令牌验证
    await testTokenVerification(auth);

    // 测试刷新令牌
    await testTokenRefresh(auth);

  } finally {
    // 清理测试数据
    await cleanupTestData(client);
  }
});

// 测试用户名密码认证
async function testPasswordAuth(auth: Auth) {
  // 测试正确的用户名和密码
  const result = await auth.authenticate("admin", "admin123");
  const user = result.user as Required<Pick<User, 'username' | 'email'>>;
  assertEquals(user.username, "admin");
  assertEquals(user.email, "admin@test.com");
  assertNotEquals(result.token, undefined);
  assertNotEquals(result.refreshToken, undefined);

  // 测试错误的密码
  await assertRejects(
    () => auth.authenticate("admin", "wrong_password"),
    AuthError,
    "用户名或密码错误"
  );

  // 测试不存在的用户
  await assertRejects(
    () => auth.authenticate("not_exist", "password"),
    AuthError,
    "用户名或密码错误"
  );
}

// 测试令牌验证
async function testTokenVerification(auth: Auth) {
  // 先登录获取令牌
  const { token } = await auth.authenticate("admin", "admin123");
  
  // 验证有效令牌
  const user = await auth.verifyToken(token);
  assertEquals(ensureString(user.username), "admin");
  assertEquals(user.email, "admin@test.com");

  // 验证无效令牌
  await assertRejects(
    () => auth.verifyToken("invalid_token"),
    AuthError,
    "Invalid token"
  );
}

// 测试刷新令牌
async function testTokenRefresh(auth: Auth) {
  // 先登录获取令牌
  const { refreshToken, user } = await auth.authenticate("admin", "admin123");
  
  // 使用刷新令牌获取新令牌
  const result = await auth.refreshToken(refreshToken, user.id);
  assertNotEquals(result.token, undefined);
  assertNotEquals(result.refreshToken, undefined);
  assertEquals(ensureString(result.user.username), "admin");

  // 使用无效的刷新令牌
  await assertRejects(
    () => auth.refreshToken("invalid_refresh_token", user.id),
    AuthError,
    "Invalid refresh token"
  );
}

// 清理测试数据
async function cleanupTestData(client: APIClient) {
  const schema = client.database.schema;
  const prefix = TEST_CONFIG.storagePrefix;
  
  // 删除测试表
  const tables = [
    `${prefix}_users`,
    `${prefix}_sessions`,
    `${prefix}_refresh_tokens`
  ];

  // 删除所有表
  for (const table of tables) {
    const exists = await schema.hasTable(table);
    if (exists) {
      await schema.dropTable(table);
    }
  }
} 