import { FieldValue, Timestamp, WriteResult } from "firebase-admin/firestore";
import { getFirestoreInstance, NotFoundError, ValidationError } from "../src"; // Import from your library
import { runInBatch, runInTransaction } from "../src/core/transaction-manager";
import { User, userHooks } from "./helpers/models";

describe("BaseModel - CRUD Operations", () => {
  // Clears the hook mocks before each test in this file
  beforeEach(() => {
    userHooks.reset();
  });

  it("should create a new document with save() and assign ID", async () => {
    const userData = { name: "Create User", email: "create@test.com", age: 30 };
    const user = new User(userData);

    // Checks that there is no ID before saving
    expect(user.id).toBeUndefined();
    // Checks that hooks have not been called yet
    expect(userHooks.beforeSave).not.toHaveBeenCalled();
    expect(userHooks.afterSave).not.toHaveBeenCalled();

    const writeResult = await user.save();

    // Checks if ID was assigned
    expect(user.id).toBeDefined();
    expect(user.id?.length).toBeGreaterThan(10); // Firestore ID has a standard size

    // Checks if WriteResult was returned
    expect(writeResult).toBeDefined();
    expect(writeResult!.writeTime).toBeInstanceOf(Timestamp);

    // Checks if instance data was kept/updated by hooks
    expect(user.name).toBe("Create User");
    expect(user.email).toBe("create@test.com");
    expect(user.age).toBe(30);
    expect(user.isActive).toBe(true); // Default from Zod/class
    expect(user.hookValue).toBe("set_on_beforeSave"); // Hook modified the value
    expect(user.createdAt).toBeInstanceOf(Timestamp); // Hook added it
    expect(user.updatedAt).toBeInstanceOf(Timestamp); // Hook added it

    // Checks if hooks were called correctly
    expect(userHooks.beforeSave).toHaveBeenCalledTimes(1);
    expect(userHooks.beforeSave).toHaveBeenCalledWith(user); // Hook receives the instance
    expect(userHooks.afterSave).toHaveBeenCalledTimes(1);
    expect(userHooks.afterSave).toHaveBeenCalledWith(user, writeResult);

    // Checks directly in Firestore (Emulator)
    const db = getFirestoreInstance();
    const docSnap = await db.collection("users").doc(user.id!).get();
    expect(docSnap.exists).toBe(true);
    const data = docSnap.data();
    expect(data).toBeDefined();
    expect(data?.name).toBe("Create User");
    expect(data?.email).toBe("create@test.com");
    expect(data?.age).toBe(30);
    expect(data?.isActive).toBe(true);
    expect(data?.hookValue).toBe("set_on_beforeSave");
    expect(data?.createdAt).toBeInstanceOf(Timestamp);
    expect(data?.updatedAt).toBeInstanceOf(Timestamp);
  });

  it("should overwrite an existing document with save() when ID exists", async () => {
    // Creates an initial user
    const initialUser = new User({
      name: "Initial User",
      email: "overwrite@test.com",
    });
    await initialUser.save();
    const userId = initialUser.id!;

    // Creates a new instance with the same ID and different data
    const updatedUserData = {
      name: "Overwritten User",
      email: "overwritten@test.com",
      tags: ["updated"],
    };
    const userToOverwrite = new User(updatedUserData, userId); // Passes the existing ID

    // Resets hooks to test the second call
    userHooks.reset();

    const writeResult = await userToOverwrite.save(); // Calls save() again

    expect(userToOverwrite.id).toBe(userId); // ID should not change
    expect(writeResult!.writeTime).toBeInstanceOf(Timestamp);

    // Checks hooks
    expect(userHooks.beforeSave).toHaveBeenCalledTimes(1);
    expect(userHooks.afterSave).toHaveBeenCalledTimes(1);

    // Checks data in the instance
    expect(userToOverwrite.name).toBe("Overwritten User");
    expect(userToOverwrite.email).toBe("overwritten@test.com");
    expect(userToOverwrite.tags).toEqual(["updated"]);
    expect(userToOverwrite.age).toBeUndefined(); // Field 'age' was overwritten (not present in new data)
    expect(userToOverwrite.hookValue).toBe("set_on_beforeSave"); // beforeSave hook ran again
    expect(userToOverwrite.updatedAt?.seconds).toBeGreaterThanOrEqual(
      userToOverwrite.createdAt?.seconds ?? 0
    ); // updatedAt was updated

    // Checks directly in Firestore
    const db = getFirestoreInstance();
    const docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(true);
    const data = docSnap.data();
    expect(data?.name).toBe("Overwritten User");
    expect(data?.email).toBe("overwritten@test.com");
    expect(data?.tags).toEqual(["updated"]);
    expect(data?.age).toBeUndefined(); // Field was removed in overwrite
    expect(data?.hookValue).toBe("set_on_beforeSave");
  });

  it("should find a document by ID using findById()", async () => {
    const user = new User({ name: "Find Me", email: "find@test.com" });
    await user.save();
    const userId = user.id!;

    // Resets hooks before fetching
    userHooks.reset();

    const foundUser: User = (await User.findById(userId)) as User;

    expect(foundUser).toBeInstanceOf(User);
    expect(foundUser?.id).toBe(userId);
    expect(foundUser?.name).toBe("Find Me");
    expect(foundUser?.email).toBe("find@test.com");

    // The afterLoad hook receives the newly created instance
    expect(userHooks.afterLoad).toHaveBeenCalledWith(
      expect.objectContaining({ id: userId, name: "Find Me" })
    );
  });

  it("should return null from findById() if document does not exist", async () => {
    const foundUser = await User.findById("non-existent-id");
    expect(foundUser).toBeNull();
    expect(userHooks.afterLoad).not.toHaveBeenCalled(); // Should not call if not found
  });

  it("should update specific fields using update()", async () => {
    const user = new User({
      name: "Update User",
      email: "update@test.com",
      age: 40,
      loginCount: 5,
    });
    await user.save();
    const userId = user.id!;
    const initialCreatedAt = user.createdAt;

    // Resets hooks before updating
    userHooks.reset();

    const updatePayload = {
      name: "User Updated",
      age: 41,
      tags: ["a", "b"],
      lastLogin: Timestamp.now(),
      loginCount: FieldValue.increment(2), // Uses FieldValue
    };
    const writeResult = await user.update(updatePayload);

    expect(writeResult!.writeTime).toBeInstanceOf(Timestamp);

    // Checks updated data in instance (except FieldValue which doesn't update locally)
    expect(user.name).toBe("User Updated");
    expect(user.age).toBe(41);
    expect(user.tags).toEqual(["a", "b"]);
    expect(user.lastLogin).toBeInstanceOf(Timestamp);
    expect(user.email).toBe("update@test.com"); // Not modified
    expect(user.loginCount).toBe(5); // FieldValue.increment does not modify locally
    expect(user.hookValue).toBe("set_on_beforeUpdate"); // beforeUpdate hook triggered
    expect(user.createdAt).toEqual(initialCreatedAt); // createdAt should not change
    expect(user.updatedAt?.seconds).toBeGreaterThanOrEqual(
      initialCreatedAt?.seconds ?? 0
    ); // updatedAt was updated

    // Checks hooks
    expect(userHooks.beforeUpdate).toHaveBeenCalledTimes(1);
    expect(userHooks.beforeUpdate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ name: "User Updated", age: 41 })
    ); // Hook receives processed data
    expect(userHooks.afterUpdate).toHaveBeenCalledTimes(1);
    expect(userHooks.afterUpdate).toHaveBeenCalledWith(
      user,
      writeResult,
      expect.anything()
    );

    // Checks directly in Firestore
    const db = getFirestoreInstance();
    const docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(true);
    const data = docSnap.data();
    expect(data?.name).toBe("User Updated");
    expect(data?.age).toBe(41);
    expect(data?.tags).toEqual(["a", "b"]);
    expect(data?.lastLogin).toBeInstanceOf(Timestamp);
    expect(data?.email).toBe("update@test.com"); // Preserved
    expect(data?.loginCount).toBe(7); // Increment verified
    expect(data?.hookValue).toBe("set_on_beforeUpdate");
    expect(data?.createdAt).toEqual(initialCreatedAt);
    expect(data?.updatedAt).toBeInstanceOf(Timestamp);
  });

  it("should throw error when updating without an ID", async () => {
    const user = new User({ name: "No ID", email: "noid@test.com" });
    // User was not saved, so it has no ID
    await expect(user.update({ name: "Wont work" })).rejects.toThrow(
      "Cannot update document without an ID"
    );
  });

  it("should delete a document using delete()", async () => {
    const user = new User({ name: "Delete User", email: "delete@test.com" });
    await user.save();
    const userId = user.id!;
    const userName = user.name; // Save to check in the hook

    // Checks existence before deletion
    const db = getFirestoreInstance();
    let docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(true);

    // Resets hooks
    userHooks.reset();

    const writeResult = await user.delete();

    expect(writeResult!.writeTime).toBeInstanceOf(Timestamp);
    // Checks that ID was removed from the instance
    expect(user.id).toBeUndefined();

    // Checks hooks
    expect(userHooks.beforeDelete).toHaveBeenCalledTimes(1);
    expect(userHooks.beforeDelete).toHaveBeenCalledWith(user); // Instance passed before ID invalidation
    expect(userHooks.afterDelete).toHaveBeenCalledTimes(1);
    expect(userHooks.afterDelete).toHaveBeenCalledWith(userId, writeResult); // Original ID passed

    // Checks if document was removed from Firestore
    docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(false);
  });

  it("should throw error when deleting without an ID", async () => {
    const user = new User({ name: "No ID Delete", email: "noiddel@test.com" });
    await expect(user.delete()).rejects.toThrow(
      "Cannot delete document without an ID"
    );
  });

  it("should reload instance data using reload()", async () => {
    const user = new User({
      name: "Reload User",
      email: "reload@test.com",
      age: 50,
    });
    await user.save();
    const userId = user.id!;

    // Modifies the document directly in Firestore to simulate external change
    const db = getFirestoreInstance();
    await db
      .collection("users")
      .doc(userId)
      .update({ name: "Reloaded Externally", age: 51, tags: ["external"] });

    // Checks that the local instance is outdated
    expect(user.name).toBe("Reload User");
    expect(user.age).toBe(50);
    expect(user.tags).toBeUndefined();

    const reloadedUser = await user.reload();

    // Checks if the return is the same instance
    expect(reloadedUser).toBe(user);

    // Checks if instance data was updated
    expect(user.name).toBe("Reloaded Externally");
    expect(user.age).toBe(51);
    expect(user.tags).toEqual(["external"]);
    expect(user.email).toBe("reload@test.com"); // Email not modified externally
  });

  it("should throw NotFoundError from reload() if document was deleted", async () => {
    const user = new User({ name: "Reload Deleted", email: "reldel@test.com" });
    await user.save();
    const userId = user.id!;

    // Deletes directly in Firestore
    const db = getFirestoreInstance();
    await db.collection("users").doc(userId).delete();

    await expect(user.reload()).rejects.toThrow(NotFoundError);
    await expect(user.reload()).rejects.toThrow(
      `Document not found: User with ID ${userId}`
    );
  });

  it("should handle validation errors on save()", async () => {
    const invalidUserData = { name: "Valid Name", email: "invalid-email" }; // Invalid email
    const user = new User(invalidUserData);

    await expect(user.save()).rejects.toThrow(ValidationError);
    await expect(user.save()).rejects.toThrow(/Validation failed.*email/); // Checks that message contains 'email'

    // Checks that user was not saved
    expect(user.id).toBeUndefined();
    // Checks that afterSave was not called
    expect(userHooks.afterSave).not.toHaveBeenCalled();
  });

  it("should find documents by field using findWhere()", async () => {
    // Setup two users with different names and ages
    const u1 = new User({ name: "FindOne", email: "one@test.com", age: 25 });
    const u2 = new User({ name: "FindTwo", email: "two@test.com", age: 30 });
    await u1.save();
    await u2.save();

    // Query by name
    const nameResult = await User.findWhere("name", "==", "FindOne");
    expect(Array.isArray(nameResult)).toBe(true);
    expect(nameResult).toHaveLength(1);
    expect(nameResult[0].id).toBe(u1.id);

    // Query by age
    const ageResult = await User.findWhere("age", ">=", 30);
    expect(ageResult).toHaveLength(1);
    expect(ageResult[0].id).toBe(u2.id);
  });

  it("should return an empty array when no documents match findWhere()", async () => {
    const results = await User.findWhere(
      "email",
      "==",
      "doesnotexist@test.com"
    );
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });
});

// =======================================================================
// TESTS FOR FIRESTORE TRANSACTIONS
// =======================================================================
describe("BaseModel - Firestore Transactions", () => {
  let db: FirebaseFirestore.Firestore;

  beforeAll(() => {
    db = getFirestoreInstance();
  });

  beforeEach(() => {
    userHooks.reset();
  });

  // Example Transaction Test Modification:
  it("should save a new document using runInTransaction", async () => {
    const user = new User({ name: "Tx ALS Save", email: "txals@test.com" });
    let userId: string | undefined;
    let hookCalledInside = false;

    await runInTransaction(async () => {
      const result = await user.save();
      expect(result).toBeUndefined();
      expect(user.id).toBeDefined();
      userId = user.id;
      expect(userHooks.beforeSave).toHaveBeenCalledTimes(1);
      expect(userHooks.afterSave).not.toHaveBeenCalled();
      hookCalledInside = true;
    });

    expect(hookCalledInside).toBe(true);
    expect(userHooks.afterSave).not.toHaveBeenCalled(); // Still not called

    expect(userId).toBeDefined();
    const docSnap = await getFirestoreInstance()
      .collection("users")
      .doc(userId!)
      .get();
    expect(docSnap.exists).toBe(true);
    expect(docSnap.data()?.name).toBe("Tx ALS Save");
  });

  it("should delete a document within a transaction", async () => {
    const user = new User({ name: "Tx Delete", email: "txdel@test.com" });
    await user.save();
    const userId = user.id!;
    userHooks.reset();

    let hookCalledInsideTx = false;

    await runInTransaction(async () => {
      const userInstance = new User({}, userId);
      await userInstance.delete();

      expect(userHooks.beforeDelete).toHaveBeenCalledTimes(1);
      expect(userHooks.afterDelete).not.toHaveBeenCalled();
      hookCalledInsideTx = userHooks.beforeDelete.mock.calls.length > 0;
    });

    expect(hookCalledInsideTx).toBe(true);
    expect(userHooks.afterDelete).not.toHaveBeenCalled();

    const docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(false);
  });

  it("should handle multiple ORM operations within a single transaction", async () => {
    const userA = new User({ name: "User A Tx Multi", email: "a@tx.com" });
    const userB = new User({ name: "User B Tx Multi", email: "b@tx.com" });
    await userA.save();
    await userB.save();
    const userAId = userA.id!;
    const userBId = userB.id!;
    userHooks.reset();

    const userC = new User({ name: "User C Tx Multi", email: "c@tx.com" }); // Novo usuário
    let userCId: string | undefined;

    await runInTransaction(async (transaction) => {
      const userARef = db.collection("users").doc(userAId);
      const userASnap = await transaction.get(userARef);
      if (!userASnap.exists) throw new Error("User A missing");
      const userAInstance = new User(userASnap.data() as any, userAId);

      await userAInstance.update({ name: "User A Updated in Tx" });

      await userC.save();
      userCId = userC.id;

      const userBInstance = new User({}, userBId);
      await userBInstance.delete();

      expect(userHooks.beforeUpdate).toHaveBeenCalledTimes(1);
      expect(userHooks.beforeSave).toHaveBeenCalledTimes(1);
      expect(userHooks.beforeDelete).toHaveBeenCalledTimes(1);
      expect(userHooks.afterUpdate).not.toHaveBeenCalled();
      expect(userHooks.afterSave).not.toHaveBeenCalled();
      expect(userHooks.afterDelete).not.toHaveBeenCalled();
    });

    const snapA = await db.collection("users").doc(userAId).get();
    const snapB = await db.collection("users").doc(userBId).get();
    expect(userCId).toBeDefined();
    const snapC = await db.collection("users").doc(userCId!).get();

    expect(snapA.exists).toBe(true);
    expect(snapA.data()?.name).toBe("User A Updated in Tx");
    expect(snapB.exists).toBe(false);
    expect(snapC.exists).toBe(true);
    expect(snapC.data()?.name).toBe("User C Tx Multi");

    expect(userHooks.afterUpdate).not.toHaveBeenCalled();
    expect(userHooks.afterSave).not.toHaveBeenCalled();
    expect(userHooks.afterDelete).not.toHaveBeenCalled();
  });

  it("should fail transaction if ORM validation fails inside", async () => {
    const invalidUser = new User({ name: "TX Invalid", email: "bad-email" });
    let transactionReachedEnd = false;

    await expect(
      runInTransaction(async (transaction) => {
        await invalidUser.save();
        transactionReachedEnd = true;
      })
    ).rejects.toThrow(ValidationError);

    expect(transactionReachedEnd).toBe(false);
    expect(invalidUser.id).toBeUndefined();
  });

  it("should rollback transaction if an error is thrown after ORM calls", async () => {
    const user = new User({ name: "TX Rollback", email: "rollback@test.com" });
    let userId: string | undefined;

    await expect(
      runInTransaction(async (transaction) => {
        await user.save();
        userId = user.id;
        expect(userId).toBeDefined();
        throw new Error("Something went wrong after ORM operation!");
      })
    ).rejects.toThrow("Something went wrong after ORM operation!");

    expect(userId).toBeDefined();
    const docSnap = await db.collection("users").doc(userId!).get();
    expect(docSnap.exists).toBe(false);
  });
});

// =======================================================================
// TESTS FOR FIRESTORE BATCHED WRITES
// =======================================================================
describe("BaseModel - Batched Writes", () => {
  let db: FirebaseFirestore.Firestore;

  beforeAll(() => {
    db = getFirestoreInstance();
  });

  beforeEach(() => {
    userHooks.reset();
  });

  it("should save a new document within a batch", async () => {
    let userId;
    await runInBatch(async () => {
      const user = new User({
        name: "Batch Save",
        email: "batchsave@test.com",
      });
      await user.save();
      userId = user.id;
    });

    expect(userId).toBeDefined();
    expect(userHooks.beforeSave).toHaveBeenCalledTimes(1);
    expect(userHooks.afterSave).not.toHaveBeenCalled();
    expect(userHooks.afterSave).not.toHaveBeenCalled();

    const docSnap = await db.collection("users").doc(userId!).get();
    expect(docSnap.exists).toBe(true);
    expect(docSnap.data()?.name).toBe("Batch Save");
    expect(docSnap.data()?.hookValue).toBe("set_on_beforeSave");
  });

  it("should update a document within a batch", async () => {
    const user = new User({
      name: "Batch Update Init",
      email: "batchupd@test.com",
    });
    await user.save();
    const userId = user.id!;
    userHooks.reset();

    await runInBatch(async () => {
      const userInstance = new User({}, userId);
      const updateData = { name: "Batch Updated Name", age: 55 };

      await userInstance.update(updateData);
      expect(userHooks.beforeUpdate).toHaveBeenCalledTimes(1);
      expect(userHooks.beforeUpdate).toHaveBeenCalledWith(
        userInstance,
        expect.objectContaining(updateData)
      );
    });

    expect(userHooks.afterUpdate).not.toHaveBeenCalled();
    expect(userHooks.afterUpdate).not.toHaveBeenCalled();

    const docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(true);
    expect(docSnap.data()?.name).toBe("Batch Updated Name");
    expect(docSnap.data()?.age).toBe(55);
    expect(docSnap.data()?.hookValue).toBe("set_on_beforeUpdate");
  });

  it("should delete a document within a batch", async () => {
    const user = new User({ name: "Batch Delete", email: "batchdel@test.com" });
    await user.save();
    const userId = user.id!;
    userHooks.reset();

    await runInBatch(async () => {
      const userInstance = new User({}, userId);
      await userInstance.delete();
    });

    expect(userHooks.beforeDelete).toHaveBeenCalledTimes(1);
    expect(userHooks.afterDelete).not.toHaveBeenCalled();
    expect(userHooks.afterDelete).not.toHaveBeenCalled();

    const docSnap = await db.collection("users").doc(userId).get();
    expect(docSnap.exists).toBe(false);
  });

  it("should perform multiple operations using runInBatch", async () => {
    const userA = new User({ name: "User A Batch ALS", email: "a@als.com" });
    await userA.save();
    const userAId = userA.id!;
    userHooks.reset();

    const userAInstance = new User({}, userAId);
    const userBNew = new User({ name: "User B Batch ALS", email: "b@als.com" });
    const userToDelete = new User({}, "some-id-to-delete");

    let userBId: string | undefined;

    const { commitResults, callbackResult } = await runInBatch(async () => {
      const updateResult = await userAInstance.update({
        name: "User A Updated in Batch ALS",
      });
      const saveResult = await userBNew.save();
      const deleteResult = await userToDelete.delete();

      expect(updateResult).toBeUndefined();
      expect(saveResult).toBeUndefined();
      expect(deleteResult).toBeUndefined();

      userBId = userBNew.id;

      expect(userHooks.beforeUpdate).toHaveBeenCalledTimes(1);
      expect(userHooks.beforeSave).toHaveBeenCalledTimes(1);
      expect(userHooks.beforeDelete).toHaveBeenCalledTimes(1);
      expect(userHooks.afterUpdate).not.toHaveBeenCalled();
      expect(userHooks.afterSave).not.toHaveBeenCalled();
      expect(userHooks.afterDelete).not.toHaveBeenCalled();

      return "Callback Finished";
    });

    expect(commitResults.length).toBe(3);
    expect(commitResults[0]).toBeInstanceOf(WriteResult);
    expect(callbackResult).toBe("Callback Finished");

    expect(userHooks.afterUpdate).not.toHaveBeenCalled();
    expect(userHooks.afterSave).not.toHaveBeenCalled();
    expect(userHooks.afterDelete).not.toHaveBeenCalled();

    const snapA = await getFirestoreInstance()
      .collection("users")
      .doc(userAId)
      .get();
    const snapB = await getFirestoreInstance()
      .collection("users")
      .doc(userBId!)
      .get();
    expect(snapA.data()?.name).toBe("User A Updated in Batch ALS");
    expect(snapB.exists).toBe(true);
    expect(snapB.data()?.name).toBe("User B Batch ALS");
  });

  it("should throw validation error synchronously when adding invalid data to batch", async () => {
    const batch = db.batch();

    const invalidUser = new User({ name: "Batch Invalid", email: "bad-email" });
    await runInBatch(async () => {
      await expect(invalidUser.save()).rejects.toThrow(ValidationError);
    });

    expect(invalidUser.id).toBeUndefined();
  });
});
