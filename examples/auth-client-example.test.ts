import { Auth } from "../src/mod.ts";
import type { SessionInfo, User } from "../src/types.ts";
import { APIClient } from "../../../packages/d8d-appcontainer-api/mod.ts";

const prefix = "test_auth_";
const tables = {
  users: `${prefix}users`,
  departments: `${prefix}departments`,
  roles: `${prefix}role_info`,
  menus: `${prefix}menu_info`,
};


async function main() {
  // 1. 通过 workspaceKey 获取 token
  const tokenFromKey = await APIClient.getToken({
    serverUrl: 'https://23920.dev.d8dcloud.com',
    workspaceKey: 'ws_mphxpy6prf9'
  });

  // 2. 创建客户端并使用获取到的 token
  const client = new APIClient({
    scope: 'user',
    config: {
      serverUrl: 'https://23920.dev.d8dcloud.com',
      token: tokenFromKey,
      type: 'http'
    }
  });

  try {
    await client.connect();
    console.log("连接成功");

    const auth = new Auth(client, {
      jwtSecret: "test-secret",
      storagePrefix: "test_auth",
      fieldNames: {
        id: "id",
        username: "username",
        phone: "phone",
        email: "email",
        nickname: "nickname",
        name: "name",
        password: "password",
        role_id: "role_id",
        department_ids: "department_ids",
        is_disabled: "is_disabled",
        is_deleted: "is_deleted",
        created_at: "created_at",
        updated_at: "updated_at",
      },
      roleConfig: {
        roleTable: tables.roles,
        menuTable: tables.menus,
        roleIdField: "id",
        menuIdsField: "menu_ids",
      },
      departmentConfig: {
        departmentTable: tables.departments,
        departmentIdField: "id",
      },
    });

    await auth.initialize();
    console.log("Auth初始化成功");

    // 创建测试表
    const hasDeptsTable = await client.database.schema.hasTable(
      tables.departments
    );
    if (hasDeptsTable) {
      await client.database.schema.dropTable(tables.departments);
    }
    const hasUsersTable = await client.database.schema.hasTable(tables.users);
    if (hasUsersTable) {
      await client.database.schema.dropTable(tables.users);
    }
    const hasRolesTable = await client.database.schema.hasTable(tables.roles);
    if (hasRolesTable) {
      await client.database.schema.dropTable(tables.roles);
    }
    const hasMenusTable = await client.database.schema.hasTable(tables.menus);
    if (hasMenusTable) {
      await client.database.schema.dropTable(tables.menus);
    }

    // 创建用户表
    await client.database.schema.createTable(tables.users, (table) => {
      table.increments("id").primary();
      table.string("username", 255).nullable().comment("用户登录名");
      table.string("password", 255).nullable().comment("用户登录密码");
      table.string("email", 255).nullable().comment("用户的电子邮箱");
      table.string("phone", 50).nullable().comment("用户的手机号码");
      table.string("nickname", 255).nullable().comment("用户的昵称");
      table.string("name", 255).nullable().comment("用户的真实姓名");
      table.integer("role_id").nullable().comment("用户的角色ID");
      table.jsonb("department_ids").nullable().comment("用户所属部门ID列表");
      table.integer("is_disabled").nullable().comment("用户账号是否被禁用");
      table.integer("is_deleted").nullable().comment("用户账号是否被删除");
      table.timestamps(true, true);
    });

    // 创建部门表
    await client.database.schema.createTable(tables.departments, (table) => {
      table.increments("id").primary();
      table.string("name", 255).notNullable();
      table.string("code", 50).notNullable();
      table.string("parent_id", 36);
      table.timestamps(true, true);
    });

    // 创建角色表
    await client.database.schema.createTable(tables.roles, (table) => {
      table.increments("id").primary();
      table.string("role_name").nullable().comment("角色的名称");
      table.jsonb("menu_ids").nullable().comment("关联的菜单ID列表");
      table.integer("is_disabled").nullable().comment("是否被禁用");
      table.integer("is_deleted").nullable().comment("是否被删除");
      table.timestamps(true, true);
    });

    // 创建菜单表
    await client.database.schema.createTable(tables.menus, (table) => {
      table.increments("id").primary();
      table.string("key").nullable().comment("字段键");
      table.string("name").nullable().comment("菜单的名称");
      table.integer("parent_id").nullable().comment("上级菜单的主键ID");
      table.string("type").nullable().comment("菜单的类型");
      table.integer("sort").nullable().comment("菜单的排序值");
      table.string("page_path").nullable().comment("菜单对应的页面路径");
      table.string("api_path").nullable().comment("菜单对应的接口路径");
      table.integer("is_disabled").nullable().comment("是否被禁用");
      table.integer("is_deleted").nullable().comment("是否被删除");
      table.timestamps(true, true);
    });

    // 插入测试数据 - 部门
    await client.database.table(tables.departments).insert([
      {
        name: "技术部",
        code: "tech",
      },
      {
        name: "产品部",
        code: "product",
      },
    ]);

    // 插入测试数据 - 菜单
    await client.database.table(tables.menus).insert([
      {
        key: "dashboard",
        name: "仪表盘",
        type: "menu",
        sort: 1,
        page_path: "/dashboard",
        api_path: "/api/dashboard",
      },
      {
        key: "user",
        name: "用户管理",
        type: "menu",
        sort: 2,
        page_path: "/user",
        api_path: "/api/user",
      },
    ]);

    // 插入测试数据 - 角色
    await client.database.table(tables.roles).insert([
      {
        role_name: "管理员",
        menu_ids: JSON.stringify([1, 2]), // dashboard和user菜单的ID
        is_disabled: 0,
        is_deleted: 0,
      },
    ]);

    // 测试创建用户
    console.log("测试创建用户...");
    const user = await auth.createUser({
      username: "test_user",
      password: "test123",
      email: "test@example.com",
      phone: "1234567890",
      nickname: "Test User",
      name: "Test User",
      role_id: 1,
      department_ids: JSON.stringify([1, 2]),
    });
    console.log("创建用户成功:", user);

    // 测试登录
    console.log("\n测试登录...");
    const loginResult = await auth.authenticate("test_user", "test123");
    console.log("登录成功:", loginResult);

    // 测试获取当前用户
    console.log("\n测试获取当前用户...");
    const { isValid, user: currentUser } = await auth.checkLoginStatus(
      loginResult.token
    );
    if (!isValid || !currentUser) {
      throw new Error("登录状态验证失败");
    }
    console.log("当前用户:", currentUser);

    // 测试获取用户部门
    console.log("\n测试获取用户部门...");
    const departments = await auth.getUserDepartments(loginResult.token);
    console.log("用户部门:", departments);

    // 测试设置当前部门
    console.log("\n测试设置当前部门...");
    await auth.setCurrentDepartment(1, loginResult.token); // 传入 token 进行验证
    const { isValid: stillValid, sessionInfo } = await auth.checkLoginStatus(
      loginResult.token
    );
    if (!stillValid || !sessionInfo) {
      throw new Error("登录状态验证失败");
    }
    console.log("更新后的会话(已设置当前部门):", sessionInfo);

    // 退出登录
    await auth.logout(loginResult.token);
    console.log("退出登录成功");
  } catch (error) {
    console.error("测试过程中出现错误:", error);
    throw error;
  } finally {
    // 清理测试表
    try {
      console.log("\n清理测试表...");
      const hasDeptsTable = await client.database.schema.hasTable(
        tables.departments
      );
      if (hasDeptsTable) {
        await client.database.schema.dropTable(tables.departments);
      }
      const hasMenusTable = await client.database.schema.hasTable(tables.menus);
      if (hasMenusTable) {
        await client.database.schema.dropTable(tables.menus);
      }
      const hasRolesTable = await client.database.schema.hasTable(tables.roles);
      if (hasRolesTable) {
        await client.database.schema.dropTable(tables.roles);
      }
      const hasUsersTable = await client.database.schema.hasTable(tables.users);
      if (hasUsersTable) {
        await client.database.schema.dropTable(tables.users);
      }
      console.log("清理测试表成功");
    } catch (error) {
      console.error("清理测试表失败:", error);
    }
    client.close();
    Deno.exit(0);
  }
};

main().catch(console.error);
