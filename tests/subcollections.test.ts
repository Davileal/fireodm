import {
  BaseModel,
  Collection,
  getFirestoreInstance,
  NumberField,
  StringField,
  SubCollection,
  SubCollectionModel,
} from "../src";

@Collection("parents")
class Parent extends BaseModel {
  @StringField({ required: true })
  name!: string;

  @SubCollection(() => Child, "children")
  children?: Child[];
}

@SubCollectionModel(() => Parent, "children")
class Child extends BaseModel {
  @StringField({ required: true })
  value!: string;

  @SubCollection(() => Toy, "toys")
  toys?: Toy[];
}

@SubCollectionModel(() => Child, "toys")
class Toy extends BaseModel {
  @StringField({ required: true })
  name!: string;
}

@Collection("users")
class User extends BaseModel {
  @StringField({ required: true }) declare name: string;
}

@SubCollectionModel(() => User, "gift-cards")
class GiftCard extends BaseModel {
  @StringField({ required: true }) declare code: string;
  @NumberField() declare amount: number;

  constructor(data: Partial<GiftCard>, parent: User) {
    super(data, parent);
  }
}

beforeEach(async () => {
  // Clear parents & children
  const db = getFirestoreInstance();
  const parentsSnap = await db.collection("parents").get();
  for (const doc of parentsSnap.docs) {
    const sub = db.collection("parents").doc(doc.id).collection("children");
    const subs = await sub.get();
    await Promise.all(subs.docs.map((c) => c.ref.delete()));
    await doc.ref.delete();
  }

  // Clear users & gift-cards
  const usersSnap = await db.collection("users").get();
  for (const doc of usersSnap.docs) {
    const sub = db.collection("users").doc(doc.id).collection("gift-cards");
    const subs = await sub.get();
    await Promise.all(subs.docs.map((c) => c.ref.delete()));
    await doc.ref.delete();
  }
});

describe("Nested SubCollection population", () => {
  it("allows access to a subcollection inside another subcollection", async () => {
    const p = new Parent({ name: "P2" });
    await p.save();
    const c = new Child({ value: "child2" }, p);
    await c.save();

    const t1 = new Toy({ name: "Train" }, c);
    const t2 = new Toy({ name: "Doll" }, c);
    await t1.save();
    await t2.save();

    let toys = await c.subcollection<Toy>("toys");
    expect(toys.map((t) => t.name).sort()).toEqual(["Doll", "Train"]);

    await t1.update({ name: "Rocket" });
    toys = await c.subcollection<Toy>("toys");
    expect(toys.map((t) => t.name).sort()).toEqual(["Doll", "Rocket"]);

    await t2.delete();
    toys = await c.subcollection<Toy>("toys");
    expect(toys.map((t) => t.name)).toEqual(["Rocket"]);
  });
});

describe("SubCollectionModel CRUD operations", () => {
  it("save() writes to the subcollection path", async () => {
    const db = getFirestoreInstance();
    const user = new User({ name: "Alice" });
    await user.save();

    const gc = new GiftCard({ code: "XMAS", amount: 50 }, user);
    expect(gc.id).toBeUndefined();
    await gc.save();
    expect(gc.id).toBeDefined();

    const snap = await db
      .collection("users")
      .doc(user.id!)
      .collection("gift-cards")
      .doc(gc.id!)
      .get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.code).toBe("XMAS");
    expect(snap.data()?.amount).toBe(50);
  });

  it("update() modifies the subcollection document", async () => {
    const db = getFirestoreInstance();
    const user = new User({ name: "Bob" });
    await user.save();

    const gc = new GiftCard({ code: "PROMO", amount: 20 }, user);
    await gc.save();

    await gc.update({ amount: 30 });
    const snap = await db
      .collection("users")
      .doc(user.id!)
      .collection("gift-cards")
      .doc(gc.id!)
      .get();
    expect(snap.data()?.amount).toBe(30);
  });

  it("delete() removes the subcollection document", async () => {
    const db = getFirestoreInstance();
    const user = new User({ name: "Carol" });
    await user.save();

    const gc = new GiftCard({ code: "DEL", amount: 10 }, user);
    await gc.save();

    const id = gc.id;
    await gc.delete();
    const snap = await db
      .collection("users")
      .doc(user.id!)
      .collection("gift-cards")
      .doc(id!)
      .get();
    expect(snap.exists).toBe(false);
  });
});
