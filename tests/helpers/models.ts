import { z } from "zod";
import {
  BaseModel,
  Collection,
  DocumentReference,
  Relation,
  Timestamp,
  WriteResult,
} from "../../src";
import {
  ArrayField,
  BooleanField,
  DocumentReferenceField,
  EmailField,
  EnumField,
  NumberField,
  StringField,
  TimestampField,
} from "../../src/core/decorators";
@Collection("departments")
export class Department extends BaseModel {
  @StringField({ min: 1 })
  name!: string;

  @StringField({ required: false })
  location?: string;

  constructor(data: Partial<Department>, id?: string) {
    super(data, id);
    this.name = data.name ?? "Default Dept Name";
  }
}

// Hooks spy functions
export const userHooks = {
  beforeSave: jest.fn(),
  afterSave: jest.fn(),
  beforeUpdate: jest.fn(),
  afterUpdate: jest.fn(),
  beforeDelete: jest.fn(),
  afterDelete: jest.fn(),
  afterLoad: jest.fn(),
  reset: () => {
    Object.values(userHooks).forEach((fn) => {
      if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
    });
  },
};

export enum UserStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING'
};

@Collection("users")
export class User extends BaseModel {
  @StringField({ min: 1, required: true })
  name!: string;

  @EmailField()
  email!: string;

  @NumberField({ min: 0, max: 120 })
  age?: number;

  @BooleanField({ defaultValue: true })
  isActive!: boolean;

  @TimestampField({ required: false })
  lastLogin?: Timestamp;

  @ArrayField(z.string(), { required: false })
  tags?: string[];

  @NumberField({ min: 0, required: false })
  loginCount?: number;

  @StringField({ required: false })
  hookValue?: string;

  @TimestampField({ autoFill: true, required: false })
  createdAt?: Timestamp;

  @TimestampField({ autoFill: true, required: false })
  updatedAt?: Timestamp;

  @DocumentReferenceField({ required: false })
  @Relation(() => Department)
  department?: DocumentReference | Department | null;

  @DocumentReferenceField({ required: false })
  @Relation(() => User)
  manager?: DocumentReference | User | null;

  @EnumField(UserStatusEnum, { required: true, defaultValue: UserStatusEnum.ACTIVE })
  status!: UserStatusEnum;

  constructor(data: Partial<User>, id?: string) {
    super(data, id);
  }

  async beforeSave() {
    userHooks.beforeSave(this);
    this.hookValue = "set_on_beforeSave";
    if (!this.createdAt) this.createdAt = Timestamp.now();
    this.updatedAt = Timestamp.now();
  }

  async afterSave(result: WriteResult) {
    userHooks.afterSave(this, result);
  }

  async beforeUpdate(data: any) {
    userHooks.beforeUpdate(this, data);
    data.hookValue = "set_on_beforeUpdate";
    data.updatedAt = Timestamp.now();
  }

  async afterUpdate(result: WriteResult, data: any) {
    userHooks.afterUpdate(this, result, data);
  }

  async beforeDelete() {
    userHooks.beforeDelete(this);
  }

  async afterDelete(result: WriteResult, originalId: string) {
    userHooks.afterDelete(originalId, result);
  }

  async afterLoad() {
    userHooks.afterLoad(this);
  }
}
