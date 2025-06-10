import {
  BaseModel,
  Collection,
  getFirestoreInstance,
  StringField,
  SubCollection,
  SubCollectionDoc,
  SubCollectionModel,
  Timestamp,
  TimestampField,
} from "../src";

@SubCollectionModel(() => MasterData, "access-logs")
class AccessLog extends BaseModel {
  @StringField({ required: true })
  ip!: string;

  @TimestampField({ autoFill: true })
  accessedAt?: Timestamp;

  constructor(data: Partial<AccessLog>, idOrParent?: string | BaseModel) {
    super(data, idOrParent);
  }
}

@SubCollectionModel(() => Employee, "advanced-data")
class MasterData extends BaseModel {
  @StringField({ required: true })
  accessLevel!: string;

  @SubCollection(() => AccessLog, "access-logs")
  accessLogs?: AccessLog[];

  constructor(data: Partial<MasterData>, idOrParent?: string | BaseModel) {
    super(data, idOrParent);
  }
}

@SubCollectionModel(() => Employee, "advanced-data")
class GeneralData extends BaseModel {
  @StringField({ required: true })
  location!: string;

  constructor(data: Partial<GeneralData>, idOrParent?: string | BaseModel) {
    super(data, idOrParent);
  }
}

@Collection("employees")
class Employee extends BaseModel {
  @StringField({ required: true })
  name!: string;

  @SubCollectionDoc(() => GeneralData, "general", {
    subcollection: "advanced-data",
  })
  generalData?: GeneralData;

  @SubCollectionDoc(() => MasterData, "master-data", {
    subcollection: "advanced-data",
  })
  masterData?: MasterData;

  constructor(data: Partial<Employee>, id?: string) {
    super(data, id);
  }
}

beforeEach(async () => {
  const db = getFirestoreInstance();
  const employeesSnap = await db.collection("employees").get();

  for (const employeeDoc of employeesSnap.docs) {
    const advancedDataColRef = employeeDoc.ref.collection("advanced-data");
    const advancedDataSnap = await advancedDataColRef.get();

    for (const advancedDoc of advancedDataSnap.docs) {
      if (advancedDoc.id === "master-data") {
        const accessLogsColRef = advancedDoc.ref.collection("access-logs");
        const accessLogsSnap = await accessLogsColRef.get();
        await Promise.all(
          accessLogsSnap.docs.map((logDoc) => logDoc.ref.delete())
        );
      }
      await advancedDoc.ref.delete();
    }

    await employeeDoc.ref.delete();
  }
});

describe("SubCollectionDoc and Nested SubCollection", () => {
  it("should populate a single document from a subcollection using findById", async () => {
    const employee = new Employee({ name: "John" });
    await employee.save();

    const general = new GeneralData({ location: "New York" }, employee);
    general.id = "general";
    await general.save();

    const fetchedEmployee = await Employee.findById(employee.id!, {
      populate: ["generalData"],
    });

    expect(fetchedEmployee).toBeInstanceOf(Employee);
    expect(fetchedEmployee?.generalData).toBeInstanceOf(GeneralData);
    expect(fetchedEmployee?.generalData?.location).toBe("New York");
    expect(fetchedEmployee?.generalData?.id).toBe("general");
    expect(fetchedEmployee?.masterData).toBeUndefined();
  });

  it("should populate multiple documents from the same subcollection", async () => {
    const employee = new Employee({ name: "Jane" });
    await employee.save();

    const general = new GeneralData({ location: "London" }, employee);
    general.id = "general";
    await general.save();

    const master = new MasterData({ accessLevel: "admin" }, employee);
    master.id = "master-data";
    await master.save();

    const fetchedEmployee = await Employee.findById(employee.id!, {
      populate: ["generalData", "masterData"],
    });

    expect(fetchedEmployee?.generalData).toBeInstanceOf(GeneralData);
    expect(fetchedEmployee?.generalData?.location).toBe("London");
    expect(fetchedEmployee?.masterData).toBeInstanceOf(MasterData);
    expect(fetchedEmployee?.masterData?.accessLevel).toBe("admin");
  });

  it("should return null for a populated property if the document does not exist", async () => {
    const employee = new Employee({ name: "Mike" });
    await employee.save();

    const fetchedEmployee = await Employee.findById(employee.id!, {
      populate: ["generalData"],
    });

    expect(fetchedEmployee).toBeInstanceOf(Employee);
    expect(fetchedEmployee?.generalData).toBeNull();
  });

  it("should handle population on an already-fetched instance", async () => {
    const employee = new Employee({ name: "Sarah" });
    await employee.save();

    const general = new GeneralData({ location: "Tokyo" }, employee);
    general.id = "general";
    await general.save();

    const fetchedEmployee = await Employee.findById(employee.id!);
    expect(fetchedEmployee?.generalData).toBeUndefined();

    await fetchedEmployee?.populate("generalData");

    expect(fetchedEmployee?.generalData).toBeInstanceOf(GeneralData);
    expect(fetchedEmployee?.generalData?.location).toBe("Tokyo");
  });

  it("should allow managing a subcollection within a SubCollectionDoc", async () => {
    const employee = new Employee({ name: "Admin User" });
    await employee.save();

    const masterData = new MasterData({ accessLevel: "super-admin" }, employee);
    masterData.id = "master-data";
    await masterData.save();

    const log1 = new AccessLog({ ip: "192.168.1.1" }, masterData);
    const log2 = new AccessLog({ ip: "127.0.0.1" }, masterData);
    await log1.save();
    await log2.save();

    const fetchedEmployee = await Employee.findById(employee.id!, {
      populate: ["masterData"],
    });

    const fetchedLogs =
      await fetchedEmployee?.masterData?.subcollection("accessLogs");

    expect(fetchedEmployee?.masterData).toBeInstanceOf(MasterData);
    expect(fetchedEmployee?.masterData?.accessLevel).toBe("super-admin");

    expect(fetchedLogs).toBeDefined();
    expect(fetchedLogs?.length).toBe(2);
    expect(fetchedLogs?.[0]).toBeInstanceOf(AccessLog);

    const ips = fetchedLogs?.map((log: any) => log.ip).sort();
    expect(ips).toEqual(["127.0.0.1", "192.168.1.1"]);
  });
});
