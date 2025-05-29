<p align="center">
  <img src="./logo.png" alt="FireODM Logo" width="300"/>
</p>

[![npm version](https://img.shields.io/npm/v/fireodm)](https://www.npmjs.com/package/fireodm)
[![Build](https://github.com/Davileal/fireodm/actions/workflows/actions.yml/badge.svg)](https://github.com/Davileal/fireodm/actions/workflows/actions.yml)
[![License](https://img.shields.io/github/license/Davileal/fireodm)](https://github.com/Davileal/fireodm/blob/main/LICENSE)
[![gzip size](https://img.shields.io/bundlephobia/minzip/fireodm)](https://bundlephobia.com/package/fireodm)
[![codecov](https://codecov.io/gh/Davileal/fireodm/branch/master/graph/badge.svg)](https://codecov.io/gh/Davileal/fireodm)
[![Contributors](https://img.shields.io/github/contributors/Davileal/fireodm.svg)](https://github.com/Davileal/fireodm/graphs/contributors)

[Documentation](https://fireodm.netlify.app)

A basic, extensible ORM (Object-Relational Mapper) / ODM (Object-Document Mapper) for the [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) in Node.js, built with TypeScript. Simplifies interacting with Firestore using classes, decorators, Zod validation, and relationship handling (DocumentReference).

## Contributors

Thanks to everyone who has contributed to this project! Below are some of our amazing contributors:

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/Davileal">
        <img src="https://avatars.githubusercontent.com/Davileal?s=100" width="60" alt="charlie" style="border-radius:50%;"/>
        <br />
        <sub><b>Davileal</b></sub>
      </a>
    </td>
     <td align="center">
      <a href="https://github.com/wesleygonalv">
        <img src="https://avatars.githubusercontent.com/wesleygonalv?s=100" width="60" alt="bob" style="border-radius:50%;"/>
        <br />
        <sub><b>wesleygonalv</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/ferreramfe">
        <img src="https://avatars.githubusercontent.com/ferreramfe?s=100" width="60" alt="alice" style="border-radius:50%;"/>
        <br />
        <sub><b>ferreramfe</b></sub>
      </a>
    </td>
  </tr>
</table>


## Key Features

- **Model Definition with Classes:** Use TypeScript classes to define your data structures.
- **Decorators (`@Collection`, `@Relation`):** Declare metadata in a clear, declarative way.
- **Simplified CRUD Operations:** `save()`, `update()`, `delete()`, `findById()`, `findAll()`, `findOne()`, `findWhere()`.
- **Relationship Handling:** Store `DocumentReferenöce` and populate related data on demand.
- **Zod Validation:** Define a `static schema` on your models for automatic validation before save/update.
- **Hooks (Lifecycle Callbacks):** Run custom logic before/after operations (`beforeSave`, `afterLoad`, etc.).
- **Pagination:** Support for `limit` and `startAfter` in `findAll`.
- **Strongly Typed:** Written in TypeScript for better DX and type safety.

## Installation

```bash
npm install fireodm firebase-admin
# or
yarn add fireodm firebase-admin
```

## TypeScript Configuration

By default, subclass field initializers will override the values assigned via `BaseModel`’s `Object.assign`.  
If you’d rather **not** write manual `this.foo = data.foo` bindings in every constructor, add the following to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    // …
    "useDefineForClassFields": false
  }
}
```

## Initialization

Before using any ORM model, you need to initialize `firebase-admin` and provide the Firestore instance to the library:

```typescript
import * as admin from "firebase-admin";
import { setFirestoreInstance } from "fireodm"; // replace with your package name

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

console.log("Firebase Admin initialized and ORM configured.");

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
const newUser = new User({ name: "Test User", email: "test@example.com" });
try {
  await newUser.save();
  console.log("User created with ID:", newUser.id);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Validation failed:", error.issues);
  } else {
    console.error("Failed to save user:", error);
  }
}
```

### Fetching

```typescript
// By ID
const user = await User.findById("some-user-id");

// By ID with Relations Populated
const userWithDept = await User.findById("some-user-id", {
  populate: ["department"],
});
if (userWithDept?.department instanceof Department) {
  console.log(userWithDept.department.name);
}

// All (with pagination)
const { results, lastVisible } = await User.findAll({
  limit: 10,
  orderBy: { field: "name" },
});

// Next page
if (lastVisible) {
  const nextPage = await User.findAll({
    limit: 10,
    orderBy: { field: "name" },
    startAfter: lastVisible,
  });
}

// Simple Condition
const activeAdmins = await User.findWhere("tags", "array-contains", "admin", {
  queryFn: (ref) => ref.where("isActive", "==", true), // Combines findWhere with queryFn
});

// Complex Query
const recentUsers = await User.findOne((ref) =>
  ref.orderBy("createdAt", "desc").limit(1)
);
```

### Updating

```typescript
const user = await User.findById("some-user-id");
if (user) {
  await user.update({ name: "Updated Name" /* ... other fields ... */ });
}
```

### Populating Relations on an Instance

```typescript
const user = await User.findById("some-user-id"); // Fetch without populating relations
if (user) {
  await user.populate("department"); // Populates the 'department' relation
  if (user.department instanceof Department) {
    // ... use user.department.name ...
  }
}
```

### Deleting

```typescript
const user = await User.findById("some-user-id");
if (user) {
  await user.delete();
}
```

## Transactions and Batched Writes

You can perform atomic operations by using the ORM's `save`, `update`, and `delete` methods within an asynchronous context managed by helper functions `runInTransaction` and `runInBatch`. These helpers use Node.js `AsyncLocalStorage` internally, so you **do not** need to explicitly pass the transaction or batch object to the ORM methods when called inside the helper's callback.

### Important Considerations:

- **Implicit Context:** ORM methods (`save`, `update`, `delete`) automatically detect if they are being run inside a context started by `runInTransaction` or `runInBatch`.
- **Return Value:** When executed within one of these contexts, `save`, `update`, and `delete` now return `Promise<undefined>` because the actual `WriteResult` is only available after the entire transaction or batch commits externally. Direct calls outside these contexts still return `Promise<WriteResult>`.
- **`after` Hooks Skipped:** Lifecycle hooks like `afterSave`, `afterUpdate`, and `afterDelete` are **NOT** executed automatically when the ORM methods run within a transaction or batch context. This is because the operation is only finalized upon committing the transaction/batch externally. You must handle any post-commit logic yourself if needed.
- **`before` Hooks & Validation:** Lifecycle hooks like `beforeSave`, `beforeUpdate`, `beforeDelete`, and Zod validation **ARE** still executed before the operation is added to the implicit transaction or batch.

### Using Transactions (`runInTransaction`)

Wrap your transaction logic within the `runInTransaction` helper function. Remember to perform all reads **before** writes within the transaction callback. The `transaction` object passed to your callback is the standard Firestore `Transaction` object, primarily used for `transaction.get()`.

```typescript
import {
  getFirestoreInstance,
  User,
  Department,
  Timestamp,
  runInTransaction,
  WriteResult,
} from "fireodm"; // Make sure to import runInTransaction

const db = getFirestoreInstance(); // Not strictly needed here if you only use ORM methods

try {
  // Wrap operations in runInTransaction
  const result = await runInTransaction(async (transaction) => {
    // --- Reads FIRST (using the provided transaction object) ---
    const userRef = User.getCollectionRef().doc("userId123");
    const userSnap = await transaction.get(userRef); // Use transaction object for reads
    if (!userSnap.exists) {
      throw new Error("Transaction failed: User not found!");
    }
    // Create ORM instance from snapshot data
    const userInstance = new User(
      userSnap.data() as Partial<User>,
      userSnap.id
    );

    // --- Writes SECOND (using ORM methods WITHOUT passing transaction) ---
    const updateData = {
      name: "Updated via Context",
      lastLogin: Timestamp.now(),
    };
    // The ORM method implicitly uses the active transaction from runInTransaction
    await userInstance.update(updateData); // No transaction parameter needed! Returns Promise<undefined>

    // Other ORM operations also use the context implicitly
    const newDept = new Department({ name: `Dept for ${userInstance.name}` });
    await newDept.save(); // No transaction parameter needed! Returns Promise<undefined>

    // You can still return values from the transaction callback
    return { success: true, newDeptId: newDept.id };
  });

  console.log("Transaction successful:", result);
} catch (error) {
  // Catches errors from reads, writes, validation, or the commit attempt
  console.error("Transaction failed:", error);
}
```

## Transactions and Batched Writes

You can perform atomic operations by using the ORM's `save`, `update`, and `delete` methods within an asynchronous context managed by helper functions `runInTransaction` and `runInBatch`. These helpers use Node.js `AsyncLocalStorage` internally, so you **do not** need to explicitly pass the transaction or batch object to the ORM methods when called inside the helper's callback.

### Important Considerations:

- **Implicit Context:** ORM methods (`save`, `update`, `delete`) automatically detect if they are being run inside a context started by `runInTransaction` or `runInBatch`.
- **Return Value:** When executed within one of these contexts, `save`, `update`, and `delete` now return `Promise<undefined>` because the actual `WriteResult` is only available after the entire transaction or batch commits externally. Direct calls outside these contexts still return `Promise<WriteResult>`.
- **`after` Hooks Skipped:** Lifecycle hooks like `afterSave`, `afterUpdate`, and `afterDelete` are **NOT** executed automatically when the ORM methods run within a transaction or batch context. This is because the operation is only finalized upon committing the transaction/batch externally. You must handle any post-commit logic yourself if needed.
- **`before` Hooks & Validation:** Lifecycle hooks like `beforeSave`, `beforeUpdate`, `beforeDelete`, and Zod validation **ARE** still executed before the operation is added to the implicit transaction or batch.

### Using Transactions (`runInTransaction`)

Wrap your transaction logic within the `runInTransaction` helper function. Remember to perform all reads **before** writes within the transaction callback. The `transaction` object passed to your callback is the standard Firestore `Transaction` object, primarily used for `transaction.get()`.

```typescript
import {
  getFirestoreInstance,
  User,
  Department,
  Timestamp,
  runInTransaction,
  WriteResult,
} from "fireodm"; // Make sure to import runInTransaction

try {
  // Wrap operations in runInTransaction
  const result = await runInTransaction(async (transaction) => {
    // --- Reads FIRST (using the provided transaction object) ---
    const userRef = User.getCollectionRef().doc("userId123");
    const userSnap = await transaction.get(userRef); // Use transaction object for reads
    if (!userSnap.exists) {
      throw new Error("Transaction failed: User not found!");
    }
    // Create ORM instance from snapshot data
    const userInstance = new User(
      userSnap.data() as Partial<User>,
      userSnap.id
    );

    // --- Writes SECOND (using ORM methods WITHOUT passing transaction) ---
    const updateData = {
      name: "Updated via Context",
      lastLogin: Timestamp.now(),
    };
    // The ORM method implicitly uses the active transaction from runInTransaction
    await userInstance.update(updateData); // No transaction parameter needed! Returns Promise<undefined>

    // Other ORM operations also use the context implicitly
    const newDept = new Department({ name: `Dept for ${userInstance.name}` });
    await newDept.save(); // No transaction parameter needed! Returns Promise<undefined>

    // You can still return values from the transaction callback
    return { success: true, newDeptId: newDept.id };
  });

  console.log("Transaction successful:", result);
} catch (error) {
  // Catches errors from reads, writes, validation, or the commit attempt
  console.error("Transaction failed:", error);
}
```

### Using Batched Writes (runInBatch)

Wrap your batch operations logic within the runInBatch helper function. The ORM methods called inside will automatically add operations to the batch. The batch is committed automatically after your callback function successfully completes.

```typeScript
import { getFirestoreInstance, User, Department, WriteResult, runInBatch, BatchResult } from 'fireodm'; // Make sure to import runInBatch and BatchResult

try {
    // Prepare instances
    const userToUpdate = new User({}, 'userId1'); // Instance with ID for update
    const newUser = new User({ name: 'Batch Context User', email: 'batchctx@example.com' }); // New user
    const userToDelete = new User({}, 'userToDeleteId'); // Instance with ID for delete

    // Wrap operations in runInBatch
    const { commitResults, callbackResult } = await runInBatch(async (/* batch */) => { // 'batch' argument usually not needed for ORM calls
        // Call ORM methods WITHOUT the batch parameter
        // They implicitly use the batch context provided by runInBatch
        await userToUpdate.update({ name: 'Updated via Batch Context', tags: ['batch-ctx'] }); // Returns Promise<undefined>
        await newUser.save(); // Returns Promise<undefined>, ID assigned before adding
        await userToDelete.delete(); // Returns Promise<undefined>

        // Optional: return a value from the callback
        return { userId: newUser.id };
    });

    // Results contains commit results and the callback's return value
    console.log(`Batch committed successfully with ${commitResults.length} writes.`);
    console.log("Callback result:", callbackResult); // { userId: '...' }

} catch (error) {
    // Catches errors from ORM methods (e.g., validation) or the batch.commit() call
    console.error("Batch failed:", error);
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

- `BaseModel`: Abstract base class for your models.
- `@Collection(name: string)`: Class decorator to set the collection name.
- `@SubcollectionModel(name: string)`: Class decorator to set the subcollection name
- `@Subcollection(property: string)`: Property decorator for subcollections.
- `@Relation(modelGetter: () => Constructor)`: Property decorator for `DocumentReference` relations.
- `setFirestoreInstance(db: Firestore)`: Function to initialize the library.
- `getFirestoreInstance()`: Gets the configured Firestore instance.
- `ValidationError`: Error class for Zod validation failures.
- `NotFoundError`: Error class for documents not found.
- `FindOptions`, `FindAllResult`: Interfaces for query options and results.
- `Timestamp`, `FieldValue`, `DocumentReference`, `CollectionReference`, etc.: Types re-exported from `firebase-admin/firestore`.
- `z`: Zod object re-exported for convenience when defining schemas.

# Contributing

First, thanks for considering a contribution! Whether you’re filing a bug report, requesting a feature, or sending a pull request, your help is greatly appreciated.

## 1. Getting the Code

Clone the repository and install dependencies:

```bash
git clone https://github.com/Davileal/fireodm.git
cd fireodm
npm install
```

## 2. Development Workflow

### Run the Firestore Emulator + Tests

FireODM uses the Firebase Emulator for integration tests. Simply run:

```bash
npm test
```

This will start the emulator and execute the Jest test suite.

### Building the Library

To compile TypeScript into JavaScript and generate type definitions:

```bash
npm run build
```

Your output will be in the `dist/` directory.

### Linting & Formatting

We enforce code style with ESLint and Prettier. To check:

```bash
npm run lint
```

## 3. Submitting Changes

1. **Fork** the repo.
2. Create a **feature branch**: `git checkout -b feat/my-new-feature`.
3. **Commit** your changes with clear, descriptive messages.
4. **Rebase** or **merge** the latest `main` to keep your branch up to date.
5. **Push** to your fork and open a **Pull Request** in this repo.
6. Fill out the PR template and describe the motivation and context.

We’ll review your PR, suggest any changes, and merge once it’s ready.

## 4. Issues

Please search existing issues before opening a new one. For bug reports, provide:

- **Steps to reproduce**
- **Expected vs. actual behavior**
- **Code snippets** or **logs**

Feature requests should include a clear use case and proposed API if possible.

## 5. Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/). Please be respectful and inclusive.

## License

[MIT](./LICENSE)
