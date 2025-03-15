import { assertEquals } from "https://deno.land/std@0.217.0/assert/mod.ts";
import { Auth } from "../src/core/auth.ts";
import type { APIClient } from "@d8d-appcontainer/api";
import { TEST_CONFIG, getTestClient, ensureString } from "./test-utils.ts";

Deno.test('Session and Department Tests', async () => {
  const client = await getTestClient();
  const auth = new Auth(client, TEST_CONFIG);

  try {
    // 初始化数据库表
    await auth.initialize();

    // 创建部门表
    const departmentTable = TEST_CONFIG.departmentConfig.departmentTable;
    const schema = client.database.schema;
    const hasDeptsTable = await schema.hasTable(departmentTable);
    if (hasDeptsTable) {
      await schema.dropTable(departmentTable);
    }
    await schema.createTable(departmentTable, (table) => {
      table.increments("id").primary();
      table.string("name", 255).notNullable();
      table.string("code", 50).notNullable();
      table.string("parent_id", 36);
      table.timestamps(true, true);
    });

    // 插入测试部门数据
    await client.database.table(departmentTable).insert([
      {
        name: "技术部",
        code: "tech",
      },
      {
        name: "产品部",
        code: "product",
      },
    ]);

    // 更新用户的门店信息
    await auth.updateUser(1, {
      department_ids: JSON.stringify([1, 2, 3])
    });

    // 测试会话管理
    await testSessionManagement(auth);

    // 测试门店管理
    await testDepartmentManagement(auth);

  } finally {
    // 清理测试数据
    await cleanupTestData(client);
  }
});

// 测试会话管理
async function testSessionManagement(auth: Auth) {
  // 登录创建会话
  const { token, user } = await auth.authenticate("admin", "admin123");
  
  // 检查登录状态
  const status = await auth.checkLoginStatus(token);
  assertEquals(status.isValid, true);
  assertEquals(ensureString(status.user?.username), "admin");

  // 获取用户会话列表
  const sessions = await auth.getUserSessions(user.id);
  assertEquals(sessions.length > 0, true);

  // 登出
  await auth.logout(token);
  
  // 验证会话已失效
  const statusAfterLogout = await auth.checkLoginStatus(token);
  assertEquals(statusAfterLogout.isValid, false);
}

// 测试门店管理
async function testDepartmentManagement(auth: Auth) {
  // 先登录获取令牌
  const { token, user } = await auth.authenticate("admin", "admin123");

  // 获取用户门店列表
  const departments = await auth.getUserDepartments(token);
  assertEquals(Array.isArray(departments), true);

  // 设置当前门店
  await auth.setCurrentDepartment(1, token);
  
  // 验证当前门店已更新
  const status = await auth.checkLoginStatus(token);
  assertEquals(status.user?.current_department_id, 1);
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

  // 如果配置了门店表，添加到待删除列表
  if (TEST_CONFIG.departmentConfig) {
    tables.push(TEST_CONFIG.departmentConfig.departmentTable);
  }

  // 删除所有表
  for (const table of tables) {
    const exists = await schema.hasTable(table);
    if (exists) {
      await schema.dropTable(table);
    }
  }
} 