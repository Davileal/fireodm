# FireODM

[![npm version](https://badge.fury.io/js/fireodm.svg)](https://badge.fury.io/js/fireodm)
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
npm install my-firestore-orm firebase-admin reflect-metadata zod
# ou
yarn add my-firestore-orm firebase-admin reflect-metadata zod
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
import { setFirestoreInstance } from 'my-firestore-orm'; // replace with your package name

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