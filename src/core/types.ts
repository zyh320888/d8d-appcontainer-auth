import type { User } from "../types.ts";

export interface AuthStore {
  getUser(id: string): Promise<User | null>;
  validateCredentials(username: string, password: string): Promise<User | null>;
  saveRefreshToken?(userId: string, token: string): Promise<void>;
  validateRefreshToken?(userId: string, token: string): Promise<boolean>;
  createUser(user: User, password: string): Promise<void>;
  updateUser(id: string, user: User): Promise<void>;
} 