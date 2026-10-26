/**
 * Jobs, dispatch, crew and fleet — real tRPC procedures.
 *
 * Tests cover:
 *   - crew and fleet records; wages visible to owners only
 *   - conflicts: overlapping jobs (crew and vehicle), absences, vehicle in
 *     maintenance, inspection (MFK) overdue; same day without overlap is fine
 *   - assign returns conflicts without saving; force saves and audits the override
 *   - crew lead must be part of the crew; foreign employees rejected
 *   - status changes: start needs crew, cancelling needs a reason
 *   - board list with crew, vehicles and conflict counts
 *   - permissions (jobs.assign) and tenant isolation
 *   - system task for an inspection that is due
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  HAS_LOCAL_DB,
  serviceClient,
  createTestCompany,
  createTestUser,
  callerFor,
  type Svc,
  type TestUser,
} from "../_helpers"

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip
const ts = Date.now()

let svc: Svc
let companyA: string
let companyB: string
let ownerA: TestUser
let dispatcherA: TestUser
let viewerA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let customerId: string
let anna: string
let beat: string
let carla: string
let truck: string
let van: string
let jobMorning: string
let jobAfternoon: string
let jobOther: string
let foreignEmployee: string

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

async function newJob(date: string, startTime: string, hours: number): Promise<string> {
  return (
    await owner.jobs.create({
      customerId,
      moveType: "local",
      scheduledDate: date,
      startTime,
      durationHours: hours,
      crewSizeRequired: 2,
      originAddress: "Bahnhofstrasse 1",
      originPostalCode: "8001",
      originCity: "Zürich",
      destAddress: "Bundesgasse 3",
      destPostalCode: "3011",
      destCity: "Bern",
    })
  ).id
}

describeWithDb("Jobs, dispatch, crew and fleet", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `job-a-${ts}`)
    companyB = await createTestCompany(svc, `job-b-${ts}`)
    ownerA = await createTestUser(svc, {
      email: `job-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    dispatcherA = await createTestUser(svc, {
      email: `job-disp-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["jobs.view", "jobs.edit", "jobs.assign", "employees.view", "vehicles.view"],
    })
    viewerA = await createTestUser(svc, {
      email: `job-view-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["jobs.view"],
    })
    ownerB = await createTestUser(svc, {
      email: `job-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)

    customerId = (await owner.customers.create({ firstName: "Kunde", lastName: "Test" })).id
    const mk = (firstName: string, role: "foreman" | "mover" | "driver") =>
      owner.crew.employees.create({
        firstName,
        lastName: "Crew",
        role,
        hourlyCostCents: 3500,
        skills: [],
      })
    anna = (await mk("Anna", "foreman")).id
    beat = (await mk("Beat", "mover")).id
    carla = (await mk("Carla", "driver")).id
    truck = (
      await owner.fleet.create({
        name: "LKW 1",
        type: "box_truck_16ft",
        licensePlate: "zh 123 456",
        capacityM3: 22,
      })
    ).id
    van = (await owner.fleet.create({ name: "Lieferwagen", type: "cargo_van", capacityM3: 12 })).id

    jobMorning = await newJob(day(10), "07:00", 5) // 07–12
    jobAfternoon = await newJob(day(10), "13:00", 4) // 13–17
    jobOther = await newJob(day(10), "10:00", 6) // 10–16 → overlaps both

    const otherOwner = await callerFor(ownerB)
    foreignEmployee = (
      await otherOwner.crew.employees.create({
        firstName: "Fremd",
        lastName: "Firma",
        role: "mover",
        skills: [],
      })
    ).id
  })

  afterAll(async () => {
    for (const userId of [ownerA.id, dispatcherA.id, viewerA.id, ownerB.id])
      await svc.auth.admin.deleteUser(userId)
  })

  it("stores crew and fleet; wages only for owners", async () => {
    const list = await owner.crew.employees.list()
    expect(list.find((e) => e.id === anna)?.hourlyCostCents).toBe(3500)

    const dispatcher = await callerFor(dispatcherA)
    expect((await dispatcher.crew.employees.list()).every((e) => e.hourlyCostCents === null)).toBe(
      true,
    )

    const vehicles = await owner.fleet.list()
    expect(vehicles.find((v) => v.id === truck)).toMatchObject({
      licensePlate: "ZH 123456",
      capacityM3: 22,
    })
  })

  it("allows the same crew on the same day without overlap", async () => {
    const dispatcher = await callerFor(dispatcherA)
    const a = await dispatcher.jobs.assign({
      id: jobMorning,
      employeeIds: [anna, beat],
      leadEmployeeId: anna,
      vehicleIds: [truck],
    })
    const b = await dispatcher.jobs.assign({
      id: jobAfternoon,
      employeeIds: [anna, beat],
      leadEmployeeId: anna,
      vehicleIds: [truck],
    })
    expect(a).toEqual({ saved: true, conflicts: [] })
    expect(b).toEqual({ saved: true, conflicts: [] })
  })

  it("reports double bookings and does not save without force", async () => {
    const dispatcher = await callerFor(dispatcherA)
    const result = await dispatcher.jobs.assign({
      id: jobOther,
      employeeIds: [anna, carla],
      vehicleIds: [truck],
    })

    expect(result.saved).toBe(false)
    const kinds = result.conflicts.map((c) => `${c.resourceName}:${c.conflict}`).sort()
    expect(kinds).toEqual(
      [
        "Anna Crew:employee_double_booked",
        "Anna Crew:employee_double_booked",
        "LKW 1:vehicle_double_booked",
        "LKW 1:vehicle_double_booked",
      ].sort(),
    )
    expect((await owner.jobs.get({ id: jobOther })).crew).toEqual([])
  })

  it("saves with force and records the override", async () => {
    const dispatcher = await callerFor(dispatcherA)
    const result = await dispatcher.jobs.assign({
      id: jobOther,
      employeeIds: [carla],
      vehicleIds: [van],
      force: true,
    })
    expect(result).toEqual({ saved: true, conflicts: [] })

    const forced = await dispatcher.jobs.assign({
      id: jobOther,
      employeeIds: [carla, beat],
      vehicleIds: [van],
      force: true,
    })
    expect(forced.saved).toBe(true)
    const { data: log } = await svc
      .from("activity_logs")
      .select("metadata")
      .eq("entity_id", jobOther)
      .eq("action", "job.assigned")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    expect(log?.metadata).toEqual({
      overridden_conflicts: ["employee_double_booked", "employee_double_booked"],
    })
  })

  it("detects absences, maintenance and overdue inspection", async () => {
    await owner.crew.absences.create({
      employeeId: carla,
      kind: "vacation",
      startsOn: day(9),
      endsOn: day(11),
    })
    await owner.fleet.update({
      id: van,
      name: "Lieferwagen",
      type: "cargo_van",
      status: "maintenance",
      nextInspectionOn: day(5),
    })

    const job = await owner.jobs.get({ id: jobOther })
    const kinds = job.conflicts.map((c) => c.conflict).sort()
    expect(kinds).toEqual(
      [
        "employee_absent",
        "employee_double_booked",
        "employee_double_booked",
        "vehicle_inspection_due",
        "vehicle_unavailable",
      ].sort(),
    )
  })

  it("lists jobs for the board with crew, vehicles and conflict counts", async () => {
    const cards = await owner.jobs.list({ from: day(10), to: day(10) })
    const byId = new Map(cards.map((c) => [c.id, c]))
    expect(byId.get(jobMorning)).toMatchObject({
      startTime: "07:00",
      crew: [
        { id: anna, name: "Anna Crew", role: "lead" },
        { id: beat, name: "Beat Crew", role: "mover" },
      ],
      vehicles: [{ id: truck, name: "LKW 1" }],
      conflictCount: 1, // Beat overlaps with jobOther
    })
    expect(byId.get(jobOther)?.conflictCount).toBe(5)
  })

  it("validates crew lead and foreign resources", async () => {
    await expect(
      owner.jobs.assign({
        id: jobMorning,
        employeeIds: [beat],
        leadEmployeeId: anna,
        vehicleIds: [],
      }),
    ).rejects.toThrow(/crew lead must be part of the crew/)
    await expect(
      owner.jobs.assign({ id: jobMorning, employeeIds: [foreignEmployee], vehicleIds: [] }),
    ).rejects.toThrow(/Employee or vehicle not found/)
  })

  it("guards status changes", async () => {
    const empty = await newJob(day(20), "08:00", 4)
    await owner.jobs.transition({ id: empty, to: "confirmed" })
    await expect(owner.jobs.transition({ id: empty, to: "in_progress" })).rejects.toThrow(
      /crew assignment/,
    )
    await expect(owner.jobs.transition({ id: empty, to: "cancelled" })).rejects.toThrow(/reason/)
    await owner.jobs.transition({ id: empty, to: "cancelled", reason: "Kunde hat abgesagt" })
    expect((await owner.jobs.get({ id: empty })).cancellationReason).toBe("Kunde hat abgesagt")

    await owner.jobs.transition({ id: jobMorning, to: "confirmed" })
    await owner.jobs.transition({ id: jobMorning, to: "in_progress" })
    await owner.jobs.transition({ id: jobMorning, to: "completed", completionNotes: "Alles gut" })
    const done = await owner.jobs.get({ id: jobMorning })
    expect(done).toMatchObject({ status: "completed", completionNotes: "Alles gut" })
    expect(done.actualStartAt).not.toBeNull()
    expect(done.actualEndAt).not.toBeNull()
  })

  it("enforces permissions and tenant isolation", async () => {
    const viewer = await callerFor(viewerA)
    await expect(
      viewer.jobs.assign({ id: jobAfternoon, employeeIds: [], vehicleIds: [] }),
    ).rejects.toThrow(/Missing permission: jobs.assign/)
    await expect(
      viewer.jobs.transition({ id: jobAfternoon, to: "cancelled", reason: "x" }),
    ).rejects.toThrow(/Missing permission: jobs.cancel/)

    const other = await callerFor(ownerB)
    await expect(other.jobs.get({ id: jobAfternoon })).rejects.toThrow(/Job not found/)
    await expect(
      other.jobs.assign({ id: jobAfternoon, employeeIds: [], vehicleIds: [] }),
    ).rejects.toThrow(/Job not found/)
    expect(await other.jobs.list({ from: day(0), to: day(30) })).toEqual([])
  })

  it("creates a task when a vehicle inspection is due", async () => {
    await svc.rpc("sync_system_tasks", { p_company_id: companyA })
    const { data } = await svc
      .from("tasks")
      .select("rule_key, status")
      .eq("entity_id", van)
      .eq("source", "system")
    expect(data).toEqual([{ rule_key: "vehicle.inspection_due", status: "open" }])
  })
})
