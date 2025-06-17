import {
  BaseModel,
  Collection,
  DocumentReference,
  DocumentReferenceField,
  getFirestoreInstance,
  NumberField,
  Relation,
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

  @SubCollection(() => SchoolReport, "school-reports")
  schoolReports?: SchoolReport[];
}

@SubCollectionModel(() => Child, "toys")
class Toy extends BaseModel {
  @StringField({ required: true })
  name!: string;

  @StringField()
  category?: string;
}

@SubCollectionModel(() => Child, "school-reports")
class SchoolReport extends BaseModel {
  @StringField({ required: true })
  subject!: string;

  @NumberField({ required: true })
  grade!: number;

  @NumberField({ required: true })
  year!: number;

  @DocumentReferenceField({ required: false })
  @Relation(() => SchoolReport)
  previousReport?: DocumentReference<SchoolReport> | SchoolReport | null;

  @DocumentReferenceField({ required: false })
  @Relation(() => SchoolReport)
  nextReport?: DocumentReference<SchoolReport> | SchoolReport | null;
}

@Collection("users")
class User extends BaseModel {
  @StringField({ required: true }) declare name: string;
}

@SubCollectionModel(() => User, "gift-cards")
class GiftCard extends BaseModel {
  @StringField({ required: true }) declare code: string;
  @NumberField() declare amount: number;

  // CORREÇÃO: Construtor compatível com BaseModel
  constructor(data: Partial<GiftCard>, idOrParent?: string | BaseModel) {
    super(data, idOrParent);
  }
}

beforeEach(async () => {
  const db = getFirestoreInstance();
  // Limpeza robusta para todas as coleções de teste
  const collections = ["parents", "users"];
  for (const col of collections) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      // Deleta subcoleções conhecidas (pode ser expandido conforme necessário)
      if (col === "parents") {
        const childrenSnap = await doc.ref.collection("children").get();
        for (const childDoc of childrenSnap.docs) {
          const toysSnap = await childDoc.ref.collection("toys").get();
          await Promise.all(toysSnap.docs.map((d) => d.ref.delete()));
          const reportsSnap = await childDoc.ref
            .collection("school-reports")
            .get();
          await Promise.all(reportsSnap.docs.map((d) => d.ref.delete()));
          await childDoc.ref.delete();
        }
      }
      if (col === "users") {
        const giftCardsSnap = await doc.ref.collection("gift-cards").get();
        await Promise.all(giftCardsSnap.docs.map((d) => d.ref.delete()));
      }
      await doc.ref.delete();
    }
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

describe("Querying Subcollections", () => {
  it("should filter documents in a subcollection using a where clause", async () => {
    const p = new Parent({ name: "Parent for Query" });
    await p.save();
    const c = new Child({ value: "Child for Query" }, p);
    await c.save();
    await new Toy({ name: "Car", category: "vehicle" }, c).save();
    await new Toy({ name: "Train", category: "vehicle" }, c).save();
    await new Toy({ name: "Doll", category: "figure" }, c).save();

    const vehicles = await c.subcollection<Toy>("toys", (ref) =>
      ref.where("category", "==", "vehicle")
    );

    expect(vehicles.length).toBe(2);
    const names = vehicles.map((v) => v.name).sort();
    expect(names).toEqual(["Car", "Train"]);
  });

  it("should order documents in a subcollection using orderBy", async () => {
    const p = new Parent({ name: "Parent for Order" });
    await p.save();
    const c = new Child({ value: "Child for Order" }, p);
    await c.save();
    await new SchoolReport(
      { subject: "Math", grade: 85, year: 2023 },
      c
    ).save();
    await new SchoolReport(
      { subject: "History", grade: 92, year: 2023 },
      c
    ).save();
    await new SchoolReport(
      { subject: "Science", grade: 78, year: 2023 },
      c
    ).save();

    const reports = await c.subcollection<SchoolReport>(
      "schoolReports",
      (ref) => ref.orderBy("grade", "desc")
    );

    expect(reports.length).toBe(3);
    const grades = reports.map((r) => r.grade);
    expect(grades).toEqual([92, 85, 78]);
  });

  it("should limit the number of documents returned from a subcollection", async () => {
    const p = new Parent({ name: "Parent for Limit" });
    await p.save();
    const c = new Child({ value: "Child for Limit" }, p);
    await c.save();
    await new Toy({ name: "Toy 1" }, c).save();
    await new Toy({ name: "Toy 2" }, c).save();
    await new Toy({ name: "Toy 3" }, c).save();

    const limitedToys = await c.subcollection<Toy>("toys", (ref) =>
      ref.limit(2)
    );

    expect(limitedToys.length).toBe(2);
  });

  it("should combine multiple query functions like where, orderBy, and limit", async () => {
    const p = new Parent({ name: "Parent for Combo" });
    await p.save();
    const c = new Child({ value: "Child for Combo" }, p);
    await c.save();
    await new SchoolReport(
      { subject: "Math", grade: 85, year: 2023 },
      c
    ).save();
    await new SchoolReport({ subject: "Art", grade: 95, year: 2022 }, c).save(); // Outro ano
    await new SchoolReport(
      { subject: "History", grade: 92, year: 2023 },
      c
    ).save();
    await new SchoolReport(
      { subject: "Science", grade: 78, year: 2023 },
      c
    ).save();

    const topReports2023 = await c.subcollection<SchoolReport>(
      "schoolReports",
      (ref) => ref.where("year", "==", 2023).orderBy("grade", "desc").limit(2)
    );

    expect(topReports2023.length).toBe(2);
    const grades = topReports2023.map((r) => r.grade);
    expect(grades).toEqual([92, 85]);
    expect(topReports2023[0].subject).toBe("History");
    expect(topReports2023[1].subject).toBe("Math");
  });
});

describe("SubCollectionModel CRUD operations", () => {
  it("save() writes to the subcollection path", async () => {
    const db = getFirestoreInstance();
    const user = new User({ name: "Alice" });
    await user.save();

    const gc = new GiftCard({ code: "XMAS", amount: 50 }, user);
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

describe("SubCollectionModel with Relations", () => {
  it("allows populating related reports in a subcollection", async () => {
    const db = getFirestoreInstance();

    const p = new Parent({ name: "P2" });
    await p.save();
    const c = new Child({ value: "C1" }, p);
    await c.save();

    const sc2022 = new SchoolReport(
      {
        subject: "Science",
        grade: 78,
        year: 2022,
        previousReport: null,
      },
      c
    );

    await sc2022.save();

    const sc2022Ref = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2022.id!);

    const sc2023 = new SchoolReport(
      {
        subject: "Science",
        grade: 83,
        year: 2023,
        previousReport: sc2022Ref,
      },
      c
    );

    await sc2023.save();

    const sc2023Ref = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2023.id!);

    const sc2024 = new SchoolReport(
      {
        subject: "Science",
        grade: 91,
        year: 2024,
        previousReport: sc2023Ref,
      },
      c
    );
    await sc2024.save();

    const reports = await c.subcollection<SchoolReport>("schoolReports");
    expect(reports.length).toBe(3);

    const lastSchoolReport = reports.find((r) => r.year === 2024);
    expect(lastSchoolReport!.year).toBe(2024);
    expect(lastSchoolReport!.grade).toBe(91);
    expect(lastSchoolReport!.previousReport).toBeInstanceOf(DocumentReference);

    // Populate the previousReport
    await lastSchoolReport!.populate("previousReport");

    const schoolReport2023 = lastSchoolReport?.previousReport as SchoolReport;
    expect(schoolReport2023).not.toBe(null);
    expect(schoolReport2023).toBeInstanceOf(SchoolReport);
    expect(schoolReport2023.year).toBe(2023);
    expect(schoolReport2023.grade).toBe(83);
    expect(schoolReport2023.previousReport).toBeInstanceOf(DocumentReference);

    await schoolReport2023.populate("previousReport");

    const schoolReport2022 = schoolReport2023.previousReport as SchoolReport;
    expect(schoolReport2023).toBeInstanceOf(SchoolReport);
    expect(schoolReport2022.year).toBe(2022);
    expect(schoolReport2022.grade).toBe(78);
    expect(schoolReport2022.previousReport).toBeNull();
  });

  it("allows updating populated related reports from a subcollection", async () => {
    const db = getFirestoreInstance();

    const p = new Parent({ name: "P2" });
    await p.save();
    const c = new Child({ value: "C1" }, p);
    await c.save();

    const sc2022 = new SchoolReport(
      {
        subject: "Science",
        grade: 78,
        year: 2022,
        previousReport: null,
      },
      c
    );

    await sc2022.save();

    const sc2022Ref = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2022.id!);

    const sc2023 = new SchoolReport(
      {
        subject: "Science",
        grade: 83,
        year: 2023,
        previousReport: sc2022Ref,
      },
      c
    );

    await sc2023.save();

    const sc2023Ref = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2023.id!);

    const sc2024 = new SchoolReport(
      {
        subject: "Science",
        grade: 91,
        year: 2024,
        previousReport: sc2023Ref,
      },
      c
    );
    await sc2024.save();

    const sc2024Ref = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2024.id!);

    const reports = await c.subcollection<SchoolReport>("schoolReports");
    expect(reports.length).toBe(3);

    const lastSchoolReport = reports.find((r) => r.year === 2024);
    expect(lastSchoolReport!.year).toBe(2024);
    expect(lastSchoolReport!.grade).toBe(91);
    expect(lastSchoolReport!.previousReport).toBeInstanceOf(DocumentReference);
    expect(lastSchoolReport!.nextReport).not.toBeDefined();

    // Populate the previousReport
    await lastSchoolReport!.populate("previousReport");

    const schoolReport2023 = lastSchoolReport?.previousReport as SchoolReport;
    expect(schoolReport2023).not.toBe(null);
    expect(schoolReport2023).toBeInstanceOf(SchoolReport);
    expect(schoolReport2023.year).toBe(2023);
    expect(schoolReport2023.grade).toBe(83);
    expect(schoolReport2023.previousReport).toBeInstanceOf(DocumentReference);
    expect(schoolReport2023.nextReport).not.toBeDefined();

    // Update the 2023 report to point to the revised 2024 report
    await sc2023.update({ grade: 87, nextReport: sc2024Ref });
    const docSnap2023 = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2023.id!)
      .get();

    expect(docSnap2023.exists).toBe(true);

    const updatedSc2023 = new SchoolReport(docSnap2023.data() as any, c);

    await updatedSc2023!.populate("nextReport");

    const nextReport2023 = updatedSc2023!.nextReport as SchoolReport;
    expect(nextReport2023).not.toBe(null);
    expect(nextReport2023).toBeInstanceOf(SchoolReport);
    expect(nextReport2023.year).toBe(2024);
    expect(nextReport2023.grade).toBe(91);
    expect(updatedSc2023.grade).toBe(87);
    expect(nextReport2023.nextReport).not.toBeDefined();

    await schoolReport2023.populate("previousReport");

    const schoolReport2022 = schoolReport2023.previousReport as SchoolReport;
    expect(schoolReport2023).toBeInstanceOf(SchoolReport);
    expect(schoolReport2022.year).toBe(2022);
    expect(schoolReport2022.grade).toBe(78);
    expect(schoolReport2022.previousReport).toBeNull();
    expect(schoolReport2022.nextReport).not.toBeDefined();

    // Update the 2022 report to point to the revised 2023 report
    await sc2022.update({ grade: 92, nextReport: sc2023Ref });

    const docSnap2022 = await db
      .collection("parents")
      .doc(p.id!)
      .collection("children")
      .doc(c.id!)
      .collection("school-reports")
      .doc(sc2022.id!)
      .get();

    expect(docSnap2022.exists).toBe(true);

    const updatedSc2022 = new SchoolReport(docSnap2022.data() as any, c);

    await updatedSc2022!.populate("nextReport");

    const nextReport2022 = updatedSc2022!.nextReport as SchoolReport;
    expect(nextReport2022).not.toBe(null);
    expect(nextReport2022).toBeInstanceOf(SchoolReport);
    expect(nextReport2022.year).toBe(2023);
    expect(nextReport2022.grade).toBe(87);
    expect(updatedSc2022.grade).toBe(92);
    expect(nextReport2022.nextReport).toBeInstanceOf(DocumentReference);
  });
});
