import { Auth } from "../src/core/auth.ts";
import { APIClient } from "@d8d-appcontainer/api";
import { assertEquals ,assertGreater} from "https://deno.land/std@0.208.0/assert/mod.ts";
import _ from "npm:lodash";

const client = new APIClient({
  scope: 'user',
  config: {
    serverUrl: 'https://23920.dev.d8dcloud.com',
    type: 'http',
    workspaceKey: 'ws_jriefsvehkb'
  }
});

// 测试配置
const config = {
  jwtSecret: "your-secret-key",
  initialUsers: [{
    username: "admin",
    password: "123123"
  }],
  storagePrefix: 'admin_auth',
  roleConfig: {
    roleTable: 'role_info',
    menuTable: 'menu_info',
    roleIdField: 'role_id',
    menuIdsField: 'menu_ids'
  }
};

Deno.test({
  name: "Auth with Role Test",
  async fn() {
    await client.connect();
    // 创建 Auth 实例
    const auth = new Auth(client, config);
    await auth.initialize();

    // 测试登录
    const result = await auth.authenticate('admin', '123123');
    console.log(result);
    // 验证用户信息
    assertEquals(result.user.username, 'admin');
    assertEquals(_.toString(result.user.id), _.toString(1));
    assertEquals(_.toString(result.user.role_id), _.toString(1));
    
    // 验证角色信息
    const roleInfo = result.user.roleInfo;
    assertGreater(roleInfo?.menuIds.length, 0);
    assertGreater(roleInfo?.menuList.length, 0);
    assertEquals(roleInfo?.menuList.length, roleInfo?.menuIds.length);
    assertEquals(roleInfo?.menuList[0].name, '综合管理');

    // 验证 token
    const verifiedUser = await auth.verifyToken(result.token);
    assertEquals(verifiedUser.id, result.user.id);
    assertEquals(verifiedUser.username, result.user.username);

    // 测试刷新 token
    const refreshResult = await auth.refreshToken(result.refreshToken!, result.user.id);
    assertEquals(refreshResult.user.id, result.user.id);
    assertEquals(refreshResult.user.username, result.user.username);
  },
}); 