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

  // Sub-collection decorator for “many” children
  @SubCollection(() => Child, "children")
  children?: Child[];
}

@SubCollectionModel(() => Parent, "children")
class Child extends BaseModel {
  @StringField({ required: true })
  value!: string;
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

describe("SubCollection population (findById & findAll)", () => {
  it("findById loads children via populateSub", async () => {
    const db = getFirestoreInstance();
    const p = new Parent({ name: "P1" });
    await p.save();

    // write two children under parents/{p.id}/children
    const col: any = db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .withConverter(Child._getFirestoreConverter());
    const child1 = new Child({ value: "c1" });
    const child2 = new Child({ value: "c2" });
    await col.doc().set(child1);
    await col.doc().set(child2);

    const loaded = (await Parent.findById(p.id!, {
      populateSub: ["children"],
    })) as Parent;

    expect(loaded).not.toBeNull();
    expect(loaded!.children).toHaveLength(2);
    expect(loaded!.children![0]).toBeInstanceOf(Child);
    const vals = loaded!.children!.map((c) => c.value).sort();
    expect(vals).toEqual(["c1", "c2"]);
  });

  it("findAll loads children for multiple parents", async () => {
    const db = getFirestoreInstance();
    const pA = new Parent({ name: "A" });
    const pB = new Parent({ name: "B" });
    await pA.save();
    await pB.save();

    // children under A
    const colA: any = db
      .collection("parents")
      .doc(pA.id!)
      .collection("children")
      .withConverter(Child._getFirestoreConverter());
    const child = new Child({ value: "a1" });
    await colA.doc().set(child);

    // children under B
    const colB: any = db
      .collection("parents")
      .doc(pB.id!)
      .collection("children")
      .withConverter(Child._getFirestoreConverter());
    const child1 = new Child({ value: "b1" });
    const child2 = new Child({ value: "b2" });

    await colB.doc().set(child1);
    await colB.doc().set(child2);

    const { results } = await Parent.findAll({
      populateSub: ["children"],
    });

    expect(results).toHaveLength(2);
    const loadedA: any = results.find((x: any) => x.name === "A")!;
    expect(loadedA.children).toHaveLength(1);
    expect(loadedA.children![0].value).toBe("a1");
    const loadedB: any = results.find((x: any) => x.name === "B")!;
    const vb = loadedB.children!.map((c: any) => c.value).sort();
    expect(vb).toEqual(["b1", "b2"]);
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
