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
  console.log("connected");
  
  const auth = new Auth(client, {
    jwtSecret: "your-secret-key",
    initialUsers: [{
      username: "admin",
      password: "123123"
    }]
  });

  try {
    await auth.initialize();
    
    const result = await auth.authenticate("admin", "123123");
    console.log("认证成功:", result);

    const newUser = await auth.createUser("newuser", "password");
    console.log("创建用户成功:", newUser);

  } catch (error) {
    if (error instanceof AuthError) {
      console.error("认证错误:", error.message);
    } else {
      console.error("未知错误:", error);
    }
  }
});

