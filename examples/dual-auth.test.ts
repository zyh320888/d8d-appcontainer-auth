import { Auth, AuthError } from "@d8d-appcontainer/auth";
import { APIClient } from "@d8d-appcontainer/api";

// 创建共用的客户端
const client = new APIClient({
  scope: 'user',
  config: {
    serverUrl: 'https://23920.dev.d8dcloud.com',
    type: 'http',
    workspaceKey: 'ws_jriefsvehkb'
  }
});

// 初始化管理员认证
const adminAuth = new Auth(client, {
  jwtSecret: "admin-secret-key",
  storagePrefix: "admin_auth",
  initialUsers: [{
    username: "superadmin",
    password: "admin123"
  }]
});

// 初始化用户认证
const userAuth = new Auth(client, {
  jwtSecret: "user-secret-key",
  storagePrefix: "user_auth"
});

async function testAdminAuth() {
  console.log("\n=== 测试管理员认证 ===");
  
  try {
    await adminAuth.initialize();
    
    // 创建新管理员
    const newAdmin = await adminAuth.createUser("admin2", "admin456");
    console.log("创建管理员成功:", {
      id: newAdmin.id,
      username: newAdmin.username
    });

    // 管理员登录
    const adminLogin = await adminAuth.authenticate("admin2", "admin456");
    console.log("管理员登录成功:", {
      username: adminLogin.user.username,
      sessionId: adminLogin.sessionId
    });

  } catch (error) {
    console.error("管理员认证错误:", error instanceof AuthError ? error.message : error);
  }
}

async function testUserAuth() {
  console.log("\n=== 测试用户认证 ===");
  
  try {
    await userAuth.initialize();
    
    // 创建普通用户
    const newUser = await userAuth.createUser("user1", "pass123");
    console.log("创建用户成功:", {
      id: newUser.id,
      username: newUser.username
    });

    // 用户登录
    const userLogin = await userAuth.authenticate("user1", "pass123");
    console.log("用户登录成功:", {
      username: userLogin.user.username,
      sessionId: userLogin.sessionId
    });

  } catch (error) {
    console.error("用户认证错误:", error instanceof AuthError ? error.message : error);
  }
}

// 运行测试
client.on("connected", async () => {
  console.log("客户端连接成功");
  await testAdminAuth();
  await testUserAuth();
}); 