import { assertEquals, assertNotEquals, assertRejects } from "https://deno.land/std@0.217.0/assert/mod.ts";
import { Auth } from "../src/core/auth.ts";
import { AuthError } from "../src/core/errors.ts";
import type { APIClient } from "@d8d-appcontainer/api";
import { TEST_CONFIG, getTestClient } from "./test-utils.ts";
import debug from "https://esm.sh/debug@4.4.0";
import type { User,AuthConfig } from "../src/types.ts";

const log = debug('auth:custom-test');

// 自定义用户表配置
const CUSTOM_CONFIG: AuthConfig = {
  ...TEST_CONFIG,
  userTable: 'custom_users',  // 直接指定用户表名
  fieldNames: {
    id: 'user_id',
    username: 'account',
    password: 'pwd',
    phone: 'mobile',
    email: 'mail',
    is_disabled: 'status'
  }
};

Deno.test('Custom User Table Auth Tests', async () => {
  const client = await getTestClient();
  const auth = new Auth(client, CUSTOM_CONFIG);

  try {
    log('开始初始化自定义用户表测试');
    await initCustomUserTable(client);

    // 测试用户名密码登录
    await testPasswordLogin(auth);

    // 测试手机号登录
    await testPhoneLogin(auth);

    // 测试邮箱登录
    // await testEmailLogin(auth);

  } finally {
    await cleanupTestData(client);
  }
});

// 初始化自定义用户表
async function initCustomUserTable(client: APIClient) {
  const schema = client.database.schema;
  const tableName = CUSTOM_CONFIG.userTable!;  // 添加非空断言

  log('创建自定义用户表');
  
  // 删除已存在的表
  if (await schema.hasTable(tableName)) {
    await schema.dropTable(tableName);
  }

  // 创建自定义用户表
  await schema.createTable(tableName, (table) => {
    table.increments('user_id').primary();
    table.string('account').unique();
    table.string('pwd');
    table.string('mobile').unique();
    table.string('mail').unique();
    table.integer('status').defaultTo(0);
    table.integer('company_id');
    table.string('department');
    table.string('position');
    table.integer('is_deleted').defaultTo(0);  // 添加软删除字段
    table.integer('is_disabled').defaultTo(0);  // 添加禁用字段
    table.timestamps(true, true);
  });

  // 创建测试用户
  log('创建测试用户');
  const auth = new Auth(client, CUSTOM_CONFIG);
  await auth.createUser({
    username: 'testuser',
    password: 'password123',
    phone: '13900139000',
    email: 'test@example.com'
  });
}

// 测试用户名密码登录
async function testPasswordLogin(auth: Auth) {
  log('测试用户名密码登录');
  
  // 正确的用户名和密码
  const result = await auth.authenticate('testuser', 'password123');
  log(`登录结果: ${JSON.stringify(result)}`);
  assertEquals((result.user as User).username, 'testuser');
  assertNotEquals(result.token, undefined);
  
  // 错误的密码
  log('测试错误密码登录');
  await assertRejects(
    () => auth.authenticate('testuser', 'wrong_password'),
    AuthError,
    "用户名或密码错误"
  );
}

// 测试手机号登录
async function testPhoneLogin(auth: Auth) {
  const phone = "13900139000";
  const code = "123456";
  
  log('测试手机号登录');
  
  // 存储验证码
  const expiresAt = new Date(Date.now() + 300000);
  await auth.storeSmsCode(phone, code, "login", expiresAt);
  
  // 使用验证码登录
  const result = await auth.smsLogin(phone, code);
  log(`手机号登录结果: ${JSON.stringify(result)}`);
  assertEquals((result.user as User).phone, phone);
  assertNotEquals(result.token, undefined);
}

// 测试邮箱登录
async function testEmailLogin(auth: Auth) {
  const email = "test@example.com";
  const code = "123456";
  
  log('测试邮箱登录');
  
  // 检查发送权限
  const canSend = await auth.canSendEmailCode(email, "login");
  log(`检查邮箱验证码发送权限结果: ${JSON.stringify(canSend)}`);
  assertEquals(canSend.allowed, true);
  
  // 存储验证码
  const expiresAt = new Date(Date.now() + 300000);
  await auth.storeEmailCode(email, code, "login", expiresAt);
  
  // 使用验证码登录
  const result = await auth.emailLogin(email, code);
  log(`邮箱登录结果: ${JSON.stringify(result)}`);
  assertEquals((result.user as User).email, email);
  assertNotEquals(result.token, undefined);
  
  // 错误的验证码
  log('测试错误验证码');
  await assertRejects(
    () => auth.emailLogin(email, "wrong_code"),
    AuthError,
    "验证码无效或已过期"
  );

  // 验证码已使用，再次使用应该失败
  log('测试重复使用已使用的验证码');
  await assertRejects(
    () => auth.emailLogin(email, code),
    AuthError,
    "验证码无效或已过期"
  );
}

// 清理测试数据
async function cleanupTestData(client: APIClient) {
  const schema = client.database.schema;
  const prefix = CUSTOM_CONFIG.storagePrefix;
  
  log('清理测试数据');
  
  // 删除测试表
  const tables = [
    CUSTOM_CONFIG.userTable!,  // 添加非空断言
  ];

  for (const table of tables) {
    if (await schema.hasTable(table)) {
      await schema.dropTable(table);
    }
  }

  // 清理 Redis 数据
  const redisKeys = await client.redis.keys(`${prefix}_*`);
  for (const key of redisKeys) {
    await client.redis.del(key);
  }
} 