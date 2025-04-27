import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreInstance, NotFoundError, ValidationError } from "../src"; // Import from your library
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
    expect(writeResult.writeTime).toBeInstanceOf(Timestamp);

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
    expect(writeResult.writeTime).toBeInstanceOf(Timestamp);

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

    expect(writeResult.writeTime).toBeInstanceOf(Timestamp);

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

    expect(writeResult.writeTime).toBeInstanceOf(Timestamp);
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
});
