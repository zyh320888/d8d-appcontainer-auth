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
  
  // 创建支持单点登录的 Auth 实例
  const auth = new Auth(client, {
    jwtSecret: "your-secret-key",
    initialUsers: [{
      username: "admin",
      password: "123123"
    }],
    singleSession: true  // 启用单设备登录
  });

  try {
    await auth.initialize();
    
    // 模拟第一个设备登录
    console.log("设备1开始登录...");
    const device1 = await auth.authenticate("admin", "123123");
    console.log("设备1登录成功:", {
      sessionId: device1.sessionId,
      token: device1.token.substring(0, 20) + "..."
    });

    // 检查当前活跃会话
    let activeSessions = await auth.getUserSessions(device1.user.id);
    console.log("当前活跃会话数:", activeSessions.length);

    // 模拟第二个设备登录
    console.log("\n设备2开始登录...");
    const device2 = await auth.authenticate("admin", "123123");
    console.log("设备2登录成功:", {
      sessionId: device2.sessionId,
      token: device2.token.substring(0, 20) + "..."
    });

    // 再次检查活跃会话 - 由于启用了单设备登录，设备1应该被踢下线
    activeSessions = await auth.getUserSessions(device1.user.id);
    console.log("当前活跃会话数:", activeSessions.length);

    // 验证设备1的token是否已失效
    console.log("\n验证设备1登录状态...");
    console.time('设备1登录状态检查耗时');
    const device1Status = await auth.checkLoginStatus(device1.token);
    console.timeEnd('设备1登录状态检查耗时');
    console.log("设备1是否仍然有效:", device1Status.isValid);

    // 验证设备2的token是否有效
    console.log("\n验证设备2登录状态...");
    console.time('设备2登录状态检查耗时');
    const device2Status = await auth.checkLoginStatus(device2.token);
    console.timeEnd('设备2登录状态检查耗时');
    console.log("设备2是否有效:", device2Status.isValid);

    // 测试注销
    console.log("\n设备2执行注销...");
    await auth.logout(device2.token);
    
    // 检查注销后的会话状态
    activeSessions = await auth.getUserSessions(device1.user.id);
    console.log("注销后的活跃会话数:", activeSessions.length);

  } catch (error) {
    if (error instanceof AuthError) {
      console.error("认证错误:", error.message);
    } else {
      console.error("未知错误:", error);
    }
  }
}); 