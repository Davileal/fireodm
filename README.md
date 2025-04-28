# 🔥FireODM

<p align="center">
  <img src="./logo.png" alt="FireODM Logo" width="200"/>
</p>

[![npm version](https://img.shields.io/npm/v/fireodm)](https://www.npmjs.com/package/fireodm)
[![Build](https://github.com/Davileal/fireodm/actions/workflows/actions.yml/badge.svg)](https://github.com/Davileal/fireodm/actions/workflows/actions.yml)
[![License](https://img.shields.io/github/license/Davileal/fireodm)](https://github.com/Davileal/fireodm/blob/main/LICENSE)
[![gzip size](https://img.shields.io/bundlephobia/minzip/fireodm)](https://bundlephobia.com/package/fireodm)
[![codecov](https://codecov.io/gh/Davileal/fireodm/branch/master/graph/badge.svg)](https://codecov.io/gh/Davileal/fireodm)


A basic, extensible ORM (Object-Relational Mapper) / ODM (Object-Document Mapper) for the [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) in Node.js, built with TypeScript. Simplifies interacting with Firestore using classes, decorators, Zod validation, and relationship handling (DocumentReference).

**Key Features:**

* **Model Definition with Classes:** Use TypeScript classes to define your data structures.
* **Decorators (`@Collection`, `@Relation`):** Declare metadata in a clear, declarative way.
* **Simplified CRUD Operations:** `save()`, `update()`, `delete()`, `findById()`, `findAll()`, `findOne()`, `findWhere()`.
* **Relationship Handling:** Store `DocumentReference` and populate related data on demand.
* **Zod Validation:** Define a `static schema` on your models for automatic validation before save/update.
* **Hooks (Lifecycle Callbacks):** Run custom logic before/after operations (`beforeSave`, `afterLoad`, etc.).
* **Pagination:** Support for `limit` and `startAfter` in `findAll`.
* **Strongly Typed:** Written in TypeScript for better DX and type safety.


## Installation

```bash
npm install fireodm firebase-admin reflect-metadata zod
# ou
yarn add fireodm firebase-admin reflect-metadata zod
```

**Peer Dependencies:**

* `firebase-admin`: The Firebase Admin SDK (peer dependency).
* `reflect-metadata`: Required for decorators to work (peer dependency).
* `zod`: Used for schema validation (peer dependency).


## Important: `reflect-metadata`

You **MUST** import `reflect-metadata` **once** in your application's entry point, **before** any other code that uses this library or decorators.


```typescript
// src/index.ts or src/server.ts (or wherever your app starts)
import 'reflect-metadata';

// ... rest of your application initialization
```

## Initialization

Before using any ORM model, you need to initialize `firebase-admin` and provide the Firestore instance to the library:

```typescript
import 'reflect-metadata'; // at the top!
import * as admin from 'firebase-admin';
import { setFirestoreInstance } from 'fireodm'; // replace with your package name

// 1. Initialize Firebase Admin (using your credentials)
admin.initializeApp({
  // credential: admin.credential.applicationDefault(), // e.g. using ADC
  // credential: admin.credential.cert(serviceAccount),   // e.g. using service account key
  // databaseURL: 'https://<YOUR_PROJECT_ID>.firebaseio.com' // optional
});

// 2. Get the Firestore instance
const db = admin.firestore();

// (Optional) Firestore settings
// db.settings({ ignoreUndefinedProperties: true });

// 3. Provide the instance to the ORM
setFirestoreInstance(db);

console.log('Firebase Admin initialized and ORM configured.');

// Now you can import and use your ORM-defined models
// import { User } from './models/User';
// ... your application code ...
```

## Running Tests

This library uses Jest for testing and relies on the Firestore Emulator for local development.

1.  **Install Firebase CLI:** If you haven't already, install the Firebase CLI globally:
    ```bash
    npm install -g firebase-tools
    ```
2.  **Run Tests:** In your main terminal, run the test command. This command will run the firestore emulator and the tests:
    ```bash
    npm test
    # or
    yarn test
    ```

## Basic Usage

**(Add clear examples here showing how to define a model, create, read, update, delete, use relations, validation, and hooks. Use the code from `examples/` as a reference).**

### Defining a Model

```typescript
import {
  ArrayField,
  BooleanField,
  DocumentReferenceField,
  EmailField,
  NumberField,
  StringField,
  TimestampField,
} from "fireodm";

@Collection("departments")
export class Department extends BaseModel {
  @StringField({ min: 1 })
  name!: string;

  @StringField({ required: false })
  location?: string;

  constructor(data: Partial<Department>, id?: string) {
    super(data, id);
  }
}

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

  constructor(data: Partial<User>, id?: string) {
    super(data, id);
  }
}
```

### Creating and Saving

```typescript
const newUser = new User({ name: 'Test User', email: 'test@example.com' });
try {
  await newUser.save();
  console.log('User created with ID:', newUser.id);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.issues);
  } else {
    console.error('Failed to save user:', error);
  }
}
```

### Fetching

```typescript
// By ID
const user = await User.findById('some-user-id');

// By ID with Relations Populated
const userWithDept = await User.findById('some-user-id', { populate: ['department'] });
if (userWithDept?.department instanceof Department) {
  console.log(userWithDept.department.name);
}

// All (with pagination)
const { results, lastVisible } = await User.findAll({ limit: 10, orderBy: { field: 'name' } });

// Next page
if (lastVisible) {
  const nextPage = await User.findAll({ limit: 10, orderBy: { field: 'name' }, startAfter: lastVisible });
}

// Simple Condition
const activeAdmins = await User.findWhere('tags', 'array-contains', 'admin', {
  queryFn: (ref) => ref.where('isActive', '==', true) // Combines findWhere with queryFn
});

// Complex Query
const recentUsers = await User.findOne(
  (ref) => ref.orderBy('createdAt', 'desc').limit(1)
);
```

### Updating

```typescript
const user = await User.findById('some-user-id');
if (user) {
  await user.update({ name: 'Updated Name', /* ... other fields ... */ });
}
```

### Populating Relations on an Instance

```typescript
const user = await User.findById('some-user-id'); // Fetch without populating relations
if (user) {
  await user.populate('department'); // Populates the 'department' relation
  if (user.department instanceof Department) {
     // ... use user.department.name ...
  }
}
```

### Deleting

```typescript
const user = await User.findById('some-user-id');
if (user) {
  await user.delete();
}
```

### Transactions and Batched Writes
You can perform atomic operations by using the ORM's `save`, `update`, and `delete` methods within Firestore Transactions or Batched Writes.

#### Important Considerations:
- Return Value: When passing a transaction or batch object to `save`, `update`, or `delete`, the methods return `Promise<void>` (indicating the operation was queued) instead of `Promise<WriteResult>`.
- `after` Hooks Skipped: Lifecycle hooks like `afterSave`, `afterUpdate`, and `afterDelete` are NOT executed automatically when using transactions or batches. This is because the operation is only finalized upon committing the transaction/batch externally. You must handle any post-commit logic yourself.
- `before` Hooks & Validation: Lifecycle hooks like `beforeSave`, `beforeUpdate`, `beforeDelete`, and Zod validation ARE executed before the operation is added to the transaction or batch.

#### Using Transactions (`runTransaction`)
Pass the `transaction` object provided by `db.runTransaction()` to the ORM methods. Remember to perform all reads before writes within the transaction callback.

```typescript
import { getFirestoreInstance, User, Department, Timestamp } from 'fireodm';

const db = getFirestoreInstance();

try {
    const result = await db.runTransaction(async (transaction) => {
        // --- Reads FIRST ---
        const userRef = User.getCollectionRef().doc('userId123');
        const userSnap = await transaction.get(userRef); // Use transaction.get()
        if (!userSnap.exists) {
            throw new Error("Transaction failed: User not found!");
        }
        // Create ORM instance from snapshot data within the transaction
        const userInstance = new User(userSnap.data() as Partial<User>, userSnap.id);

        // --- Writes SECOND ---
        const updateData = { name: 'Updated in Tx', lastLogin: Timestamp.now() };
        // Pass the transaction object to the ORM method
        await userInstance.update(updateData, transaction); // Returns Promise<void>

        // You can add other ORM operations to the same transaction
        const newDept = new Department({ name: `Dept for ${userInstance.name}`});
        await newDept.save(transaction); // Returns Promise<void>

        return { success: true, newDeptId: newDept.id }; // Return value from runTransaction
    });
    console.log("Transaction successful:", result);

} catch (error) {
    console.error("Transaction failed:", error);
}
```
#### Using Batched Writes (`batch`)
Create a `WriteBatch` using `db.batch()` and pass the `batch` object to the ORM methods. Commit the batch using `batch.commit()`.

```typescript
import { getFirestoreInstance, User, Department, WriteResult } from 'fireodm';

const db = getFirestoreInstance();
const batch = db.batch(); // Create a batch

try {
    // Prepare instances (no reads needed for batch)
    const userToUpdate = new User({}, 'userId1'); // Instance with ID for update
    const newUser = new User({ name: 'Batch User', email: 'batch@example.com' }); // New user
    const userToDelete = new User({}, 'userToDeleteId'); // Instance with ID for delete

    // Add ORM operations to the batch
    await userToUpdate.update({ name: 'Updated in Batch', tags: ['batch-op'] }, batch); // Returns Promise<void>
    await newUser.save(batch); // Returns Promise<void>, ID is assigned before adding
    await userToDelete.delete(batch); // Returns Promise<void>

    // Commit all operations atomically
    const results: WriteResult[] = await batch.commit();
    console.log(`Batch committed successfully with ${results.length} writes.`);

} catch (error) {
    console.error("Batch commit failed:", error);
}
```

## 📚 Property Decorators

FireODM provides several decorators that can be applied to model properties. These decorators enable automatic validation and advanced behaviors using [Zod](https://zod.dev/).

Below is a list of all available decorators:

---

### 🔤 `@StringField()`

Defines a property as a string with optional constraints.

**Options:**
- `min`: minimum number of characters
- `max`: maximum number of characters
- `message`: custom error message
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@StringField({ min: 3, max: 50, required: true })
name!: string;
```

### 📧 `@EmailField()`

Validates that the property is a valid email address.

**Options:**
- `message`: custom error message (default: `"Invalid email"`)
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@EmailField()
email?: string;
```

### 🔢 `@NumberField()`

Defines a property as a number with optional constraints.

**Options:**
- `min`: minimum value
- `max`: maximum value
- `message`: custom error message
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@NumberField({ min: 0 })
age?: number;
```

### ✅ `@BooleanField()`

Defines a property as a boolean, with optional default value.

**Options:**
- `required`: whether the field is required (default: `false`)
- `defaultValue`: default boolean value (`true` or `false`)

**Example:**
```ts
@BooleanField({ defaultValue: false })
isActive?: boolean;
```

### 🕑 `@TimestampField()`

Defines a property as a Firestore `Timestamp` and optionally autofills it.

**Options:**
- `required`: whether the field is required (default: `false`)
- `autoFill`: automatically set the current timestamp (default: `false`)

**Example:**
```ts
@TimestampField({ autoFill: true })
createdAt?: Firestore.Timestamp;
```

### 📍 `@GeoPointField()`

Defines a property as a Firestore `GeoPoint`.

**Options:**
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@GeoPointField()
location?: Firestore.GeoPoint;
```

### 📚 `@ArrayField(schemaDef)`

Defines a property as an array with a specified schema for its elements.

**Options:**
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@ArrayField(z.string())
tags?: string[];
```

### 🗺️ `@MapField(schemaDef)`

Defines a property as a map (key-value object) where the values follow a specified schema.

**Options:**
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@MapField(z.number())
settings?: Record<string, number>;
```

### 🔗 `@DocumentReferenceField()`

Defines a property as a Firestore `DocumentReference` or a related `BaseModel` instance.

**Options:**
- `required`: whether the field is required (default: `false`)

**Example:**
```ts
@DocumentReferenceField()
userRef?: DocumentReference<UserModel>;
```


## API (Main Exports)

* `BaseModel`: Abstract base class for your models.  
* `@Collection(name: string)`: Class decorator to set the collection name.  
* `@Relation(modelGetter: () => Constructor)`: Property decorator for `DocumentReference` relations.  
* `setFirestoreInstance(db: Firestore)`: Function to initialize the library.  
* `getFirestoreInstance()`: Gets the configured Firestore instance.  
* `ValidationError`: Error class for Zod validation failures.  
* `NotFoundError`: Error class for documents not found.  
* `FindOptions`, `FindAllResult`: Interfaces for query options and results.  
* `Timestamp`, `FieldValue`, `DocumentReference`, `CollectionReference`, etc.: Types re-exported from `firebase-admin/firestore`.  
* `z`: Zod object re-exported for convenience when defining schemas.  

## License

[MIT](./LICENSE)