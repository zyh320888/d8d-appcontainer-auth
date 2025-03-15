import type { APIClient } from "@d8d-appcontainer/api";
import type { DbUser, FieldNames, CreateUserInput, UpdateUserInput } from "../types.ts";
// import * as bcrypt from "bcrypt";

export class DbService {
  private readonly tableName: string;
  private fieldNames: FieldNames;

  constructor(
    private client: APIClient,
    prefix: string = 'auth',
    fieldNames: Partial<FieldNames> = {}
  ) {
    if (!prefix) {
      prefix = 'auth';
    }
    this.tableName = `${prefix}_users`;
    this.fieldNames = {
      id: fieldNames.id || 'id',
      username: fieldNames.username || 'username',
      password: fieldNames.password || 'password',
      email: fieldNames.email || 'email',
      phone: fieldNames.phone || 'phone',
      nickname: fieldNames.nickname || 'nickname',
      name: fieldNames.name || 'name',
      role_id: fieldNames.role_id || 'role_id',
      department_ids: fieldNames.department_ids || 'department_ids',
      is_disabled: fieldNames.is_disabled || 'is_disabled',
      is_deleted: fieldNames.is_deleted || 'is_deleted',
      created_at: fieldNames.created_at || 'created_at',
      updated_at: fieldNames.updated_at || 'updated_at',
      wx_web_openid: fieldNames.wx_web_openid || 'wx_web_openid',
      wx_mini_openid: fieldNames.wx_mini_openid || 'wx_mini_openid'
    } as FieldNames;
  }

  async initializeTables(): Promise<void> {
    const schema = this.client.database.schema;
    const tableName = this.tableName;

    const hasTable = await schema.hasTable(tableName);
    if (!hasTable) {
      await schema.createTable(tableName, (table) => {
        table.increments(this.fieldNames.id).primary();
        table.string(this.fieldNames.username, 255).nullable().comment('用户登录名');
        table.string(this.fieldNames.password, 255).nullable().comment('用户登录密码');
        table.string(this.fieldNames.email, 255).nullable().comment('用户的电子邮箱');
        table.string(this.fieldNames.phone, 50).nullable().comment('用户的手机号码');
        table.string(this.fieldNames.nickname, 255).nullable().comment('用户的昵称');
        table.string(this.fieldNames.name, 255).nullable().comment('用户的真实姓名');
        table.integer(this.fieldNames.role_id).nullable().comment('用户的角色ID');
        table.jsonb(this.fieldNames.department_ids).nullable().comment('用户所属部门ID列表');
        table.integer(this.fieldNames.is_disabled).nullable().comment('用户账号是否被禁用');
        table.integer(this.fieldNames.is_deleted).nullable().comment('用户账号是否被删除');
        table.string(this.fieldNames.wx_web_openid, 255).nullable().comment('微信网页 openid');
        table.string(this.fieldNames.wx_mini_openid, 255).nullable().comment('微信小程序 openid');
        table.timestamps(true, true);
        table.index([this.fieldNames.username], `username_index`);
        table.index([this.fieldNames.phone], `phone_index`);
        table.index([this.fieldNames.wx_web_openid], `wx_web_openid_index`);
        table.index([this.fieldNames.wx_mini_openid], `wx_mini_openid_index`);
      });
    }
  }

  async findUserByUsername(username: string): Promise<DbUser | null> {
    const user = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.username]: username })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();
    
    return user ? this.mapToDbUser(user) : null;
  }

  async findUserByPhone(phone: string): Promise<DbUser | null> {
    const user = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.phone]: phone })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();
    
    return user ? this.mapToDbUser(user) : null;
  }
  
  async findUserByEmail(email: string): Promise<DbUser | null> {
    const user = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.email]: email })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();

    return user ? this.mapToDbUser(user) : null;
  }

  async findUserByWxWebOpenId(openid: string): Promise<DbUser | null> {
    const user = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.wx_web_openid]: openid })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();
    
    return user ? this.mapToDbUser(user) : null;
  }

  async findUserByWxMiniOpenId(openid: string): Promise<DbUser | null> {
    const user = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.wx_mini_openid]: openid })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();
    
    return user ? this.mapToDbUser(user) : null;
  }

  async createUser(users: CreateUserInput[]): Promise<DbUser[]>;
  async createUser(user: CreateUserInput): Promise<DbUser>;
  async createUser(userOrUsers: CreateUserInput | CreateUserInput[]): Promise<DbUser | DbUser[]> {
    const processUser = async (input: CreateUserInput) => {
      const data = {
        ...input,
        is_disabled: 0,
        is_deleted: 0
      };

      if (input.password) {
        data.password = await this.hashPassword(input.password);
      }

      return this.mapFromDbUser(data);
    };

    if (Array.isArray(userOrUsers)) {
      const processedUsers = await Promise.all(userOrUsers.map(processUser));
      const [firstId] = await this.client.database.table(this.tableName).insert(processedUsers);
      const createdUsers = await this.client.database.table(this.tableName)
        .where(this.fieldNames.id, '>=', firstId)
        .where(this.fieldNames.id, '<', firstId + userOrUsers.length)
        .orderBy(this.fieldNames.id)
        .select();
      return createdUsers.map(user => this.mapToDbUser(user));
    } else {
      const processedUser = await processUser(userOrUsers);
      const [id] = await this.client.database.table(this.tableName).insert(processedUser);
      const user = await this.getUser(id.toString());
      if (!user) {
        throw new Error('Failed to create user');
      }
      return user;
    }
  }

  async getUser(id: string): Promise<DbUser | null> {
    const user = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.id]: id })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();

    return user ? this.mapToDbUser(user) : null;
  }

  async validateCredentials(identifier: string, password: string): Promise<DbUser | null> {
    // 支持使用用户名或手机号登录
    const user = await this.client.database
      .table(this.tableName)
      .where((builder) => {
        builder.where(this.fieldNames.username, identifier)
          .orWhere(this.fieldNames.phone, identifier);
      })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .first();

    if (!user || !user[this.fieldNames.password]) {
      return null;
    }

    const isValid = await this.verifyPassword(password, user[this.fieldNames.password]);
    if (!isValid) {
      return null;
    }

    const dbUser = this.mapToDbUser(user);
    if (dbUser.is_deleted === 1) {
      return null;
    }

    return dbUser;
  }

  async listUsers(): Promise<DbUser[]> {
    const users = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.is_deleted]: 0 })
      .select();
    
    return users.map(user => this.mapToDbUser(user));
  }

  async deleteUser(id: string): Promise<void> {
    await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.id]: id })
      .update({ 
        [this.fieldNames.is_deleted]: 1,
        [this.fieldNames.updated_at]: this.client.database.fn.now()
      });
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<DbUser | null> {
    // 确保不能更新 id
    const { id: _, ...updateData } = data as Partial<DbUser>;
    
    if (updateData.password) {
      updateData.password = await this.hashPassword(updateData.password);
    }

    const mappedData = this.mapFromDbUser(updateData);
    mappedData[this.fieldNames.updated_at] = this.client.database.fn.now();

    await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.id]: id })
      .update(mappedData);

    return this.getUser(id);
  }

  async isUsernameExists(username: string): Promise<boolean> {
    const result = await this.client.database
      .table(this.tableName)
      .where({ [this.fieldNames.username]: username })
      .where({ [this.fieldNames.is_deleted]: 0 })
      .count();
    
    return Number(result) > 0;
  }

  private mapToDbUser(data: Record<string, any>): DbUser {
    return {
      id: data[this.fieldNames.id],
      username: data[this.fieldNames.username],
      password: data[this.fieldNames.password],
      email: data[this.fieldNames.email],
      phone: data[this.fieldNames.phone],
      nickname: data[this.fieldNames.nickname],
      name: data[this.fieldNames.name],
      role_id: data[this.fieldNames.role_id],
      department_ids: data[this.fieldNames.department_ids],
      is_disabled: data[this.fieldNames.is_disabled],
      is_deleted: data[this.fieldNames.is_deleted],
      created_at: data[this.fieldNames.created_at],
      updated_at: data[this.fieldNames.updated_at],
      wx_web_openid: data[this.fieldNames.wx_web_openid],
      wx_mini_openid: data[this.fieldNames.wx_mini_openid]
    };
  }

  private mapFromDbUser(user: Partial<DbUser>): Record<string, any> {
    const result: Record<string, any> = {};
    if (user.id !== undefined) result[this.fieldNames.id] = user.id;
    if (user.username !== undefined) result[this.fieldNames.username] = user.username;
    if (user.password !== undefined) result[this.fieldNames.password] = user.password;
    if (user.email !== undefined) result[this.fieldNames.email] = user.email;
    if (user.phone !== undefined) result[this.fieldNames.phone] = user.phone;
    if (user.nickname !== undefined) result[this.fieldNames.nickname] = user.nickname;
    if (user.name !== undefined) result[this.fieldNames.name] = user.name;
    if (user.role_id !== undefined) result[this.fieldNames.role_id] = user.role_id;
    if (user.department_ids !== undefined) result[this.fieldNames.department_ids] = user.department_ids;
    if (user.is_disabled !== undefined) result[this.fieldNames.is_disabled] = user.is_disabled;
    if (user.is_deleted !== undefined) result[this.fieldNames.is_deleted] = user.is_deleted;
    if (user.created_at !== undefined) result[this.fieldNames.created_at] = user.created_at;
    if (user.updated_at !== undefined) result[this.fieldNames.updated_at] = user.updated_at;
    if (user.wx_web_openid !== undefined) result[this.fieldNames.wx_web_openid] = user.wx_web_openid;
    if (user.wx_mini_openid !== undefined) result[this.fieldNames.wx_mini_openid] = user.wx_mini_openid;
    return result;
  }

  private async hashPassword(password: string): Promise<string> {
    // return await bcrypt.hash(password, 10);
    return password;
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    // return await bcrypt.compare(password, hash);
    return password === hash;
  }
}
