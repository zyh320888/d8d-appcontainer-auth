import { assertEquals, assertNotEquals, assertRejects } from "https://deno.land/std@0.217.0/assert/mod.ts";
import { Auth } from "../src/core/auth.ts";
import { AuthError } from "../src/core/errors.ts";
import type { APIClient } from "@d8d-appcontainer/api";
import { TEST_CONFIG, getTestClient } from "./test-utils.ts";

Deno.test('Third Party Auth Tests', async () => {
  const client = await getTestClient();
  const auth = new Auth(client, TEST_CONFIG);

  try {
    // 初始化数据库表
    await auth.initialize();

    // 测试短信验证码登录
    await testSmsLogin(auth);

    // 测试微信网页登录
    await testWechatWebLogin(auth, client);

    // 测试微信小程序登录
    await testWechatMiniLogin(auth, client);

  } finally {
    // 清理测试数据
    await cleanupTestData(client);
  }
});

// 测试短信验证码登录
async function testSmsLogin(auth: Auth) {
  const phone = "13800138000";
  const code = "123456";
  
  // 存储验证码
  await auth.storeSmsCode(phone, code, "login", new Date(Date.now() + 300000));
  
  // 使用短信验证码登录
  const result = await auth.smsLogin(phone, code);
  assertEquals(result.user.phone, phone);
  assertNotEquals(result.token, undefined);
  assertNotEquals(result.refreshToken, undefined);

  // 使用错误的验证码
  await assertRejects(
    () => auth.smsLogin(phone, "wrong_code"),
    AuthError,
    "验证码无效或已过期"
  );
}

// 测试微信网页登录
async function testWechatWebLogin(auth: Auth, client: APIClient) {
  const mockCode = "test_wx_code";
  const mockOpenId = "test_openid";
  
  // Mock 微信接口返回
  client.wechat.getWebUserInfo = async () => ({
    openid: mockOpenId,
    nickname: "Test User",
    headimgurl: "http://test.com/avatar.jpg"
  });
  
  // 使用微信登录
  const result = await auth.wechatLogin(mockCode);
  assertNotEquals(result.token, undefined);
  assertNotEquals(result.refreshToken, undefined);
}

// 测试微信小程序登录
async function testWechatMiniLogin(auth: Auth, client: APIClient) {
  const mockCode = "test_mini_code";
  const mockOpenId = "test_mini_openid";
  
  // Mock 微信接口返回
  client.wechat.getMiniUserInfo = async () => ({
    openid: mockOpenId,
    session_key: "test_session_key"
  });
  
  // 使用小程序登录
  const result = await auth.wechatMiniLogin(mockCode);
  assertNotEquals(result.token, undefined);
  assertNotEquals(result.refreshToken, undefined);
}

// 清理测试数据
async function cleanupTestData(client: APIClient) {
  const schema = client.database.schema;
  const prefix = TEST_CONFIG.storagePrefix;
  
  // 删除测试表
  const tables = [
    `${prefix}_users`,
    `${prefix}_sessions`,
    `${prefix}_refresh_tokens`,
    `${prefix}_sms_codes`,
    `${prefix}_sms_logs`,
    `${prefix}_sms_blacklist`
  ];

  // 删除所有表
  for (const table of tables) {
    const exists = await schema.hasTable(table);
    if (exists) {
      await schema.dropTable(table);
    }
  }
}