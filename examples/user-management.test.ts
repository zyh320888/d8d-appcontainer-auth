import { Auth, AuthError } from "@d8d-appcontainer/auth";
import { APIClient } from "@d8d-appcontainer/api";

const client = new APIClient({
  scope: 'user',
  config: {
    serverUrl: 'https://23920.dev.d8dcloud.com',
    type: 'http',
    workspaceKey: 'ws_jriefsvehkb'
  }
});

client.on("connected", async () => {
  console.log("连接成功");
  
  const auth = new Auth(client, {
    jwtSecret: "your-secret-key",
    initialUsers: [{
      username: "admin",
      password: "123123"
    }]
  });

  try {
    await auth.initialize();
    
    // 测试用户名验证
    console.log("\n验证用户名...");
    try {
      // 验证已存在的管理员用户名
      await auth.validateUsername("admin");
    } catch (error) {
      if (error instanceof AuthError) {
        console.log("预期的错误 (已存在的用户名):", error.message);
      }
    }

    // 验证新用户名
    await auth.validateUsername("testuser");
    console.log("新用户名验证通过");
    
    // 创建测试用户
    console.log("\n创建新用户...");
    const newUser = await auth.createUser("testuser", "password123");
    console.log("用户创建成功:", {
      id: newUser.id,
      username: newUser.username
    });

    // 尝试创建重复用户名
    try {
      console.log("\n尝试创建重复用户名...");
      await auth.createUser("testuser", "different_password");
    } catch (error) {
      if (error instanceof AuthError) {
        console.log("预期的错误 (重复用户名):", error.message);
      }
    }

    // 尝试更新为已存在的用户名
    try {
      console.log("\n尝试更新为已存在的用户名...");
      await auth.updateUser(newUser.id, {
        username: "admin"
      });
    } catch (error) {
      if (error instanceof AuthError) {
        console.log("预期的错误 (更新为已存在用户名):", error.message);
      }
    }

    // 列出所有用户
    console.log("\n获取用户列表...");
    const users = await auth.listUsers();
    console.log("当前用户列表:", users.map(u => ({
      id: u.id,
      username: u.username
    })));

    // 更新用户信息
    console.log("\n更新用户信息...");
    const updatedUser = await auth.updateUser(newUser.id, {
      username: "testuser_updated"
    });
    console.log("用户信息更新成功:", {
      id: updatedUser.id,
      username: updatedUser.username
    });

    try {
      // 验证更新后的用户可以登录
      console.log("\n测试更新后的用户登录...");
      const loginResult = await auth.authenticate("testuser_updated", "password123");
      console.log("登录成功:", {
        username: loginResult.user.username,
        sessionId: loginResult.sessionId
      });

      // 删除用户
      console.log("\n删除用户...");
      await auth.deleteUser(newUser.id);
      console.log("用户删除成功");

      // 验证用户已被删除
      console.log("\n验证用户列表...");
      const finalUsers = await auth.listUsers();
      console.log("剩余用户数:", finalUsers.length);

    } catch (error) {
      if (error instanceof AuthError) {
        console.error("操作失败:", error.message);
      } else {
        console.error("未知错误:", error);
      }
    }

  } catch (error) {
    if (error instanceof AuthError) {
      console.error("认证错误:", error.message);
    } else {
      console.error("未知错误:", error);
    }
  }
}); 