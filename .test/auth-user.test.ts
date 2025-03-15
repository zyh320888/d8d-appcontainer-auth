import { assertEquals, assertRejects } from "https://deno.land/std@0.217.0/assert/mod.ts";
import { Auth } from "../src/core/auth.ts";
import { AuthError } from "../src/core/errors.ts";
import type { CreateUserInput } from "../src/types.ts";
import { TEST_CONFIG, getTestClient, ensureString } from "./test-utils.ts";
import type { APIClient } from "@d8d-appcontainer/api";
Deno.test('User Management Tests', async () => {
  const client = await getTestClient();
  const auth = new Auth(client, TEST_CONFIG);

  try {
    // 初始化数据库表
    await auth.initialize();

    // 测试用户管理
    await testUserManagement(auth);

  } finally {
    // 清理测试数据
    await cleanupTestData(client);
  }
});

// 测试用户管理
async function testUserManagement(auth: Auth) {
  // 创建新用户
  const newUser: CreateUserInput = {
    username: "test_user",
    password: "test123",
    email: "test@test.com",
    phone: "13800138000"
  };
  
  const createdUser = await auth.createUser(newUser);
  assertEquals(ensureString(createdUser.username), "test_user");
  assertEquals(createdUser.email, "test@test.com");
  assertEquals(createdUser.phone, "13800138000");

  // 更新用户
  const updatedUser = await auth.updateUser(createdUser.id, {
    nickname: "Test User",
    email: "new_test@test.com"
  });
  assertEquals(updatedUser?.nickname, "Test User");
  assertEquals(updatedUser?.email, "new_test@test.com");

  // 获取用户列表
  const users = await auth.listUsers();
  assertEquals(users.length >= 2, true);

  // 删除用户
  await auth.deleteUser(createdUser.id);

  // 等待一小段时间确保数据库操作完成
  await new Promise(resolve => setTimeout(resolve, 100));

  // 验证用户已被删除
  const usersAfterDelete = await auth.listUsers();
  console.log('Users after delete:', usersAfterDelete);
  assertEquals(usersAfterDelete.find(u => u.id === createdUser.id), undefined);
  
  await assertRejects(
    () => auth.authenticate("test_user", "test123"),
    AuthError,
    "用户名或密码错误"
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