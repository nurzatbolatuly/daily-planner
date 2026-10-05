import { pickablePeople, personUsage, findActiveByName, newPersonRecord } from "../people";

const people = [
  { id: "bek", name: "Бек" },
  { id: "old", name: "Ерлан", archived: true },
];

describe("people", () => {
  test("скрытые не показываются в пикере, кроме уже выбранных", () => {
    expect(pickablePeople(people).map(p => p.id)).toEqual(["bek"]);
    expect(pickablePeople(people, ["old"]).map(p => p.id)).toEqual(["bek", "old"]);
  });

  test("удалить можно, только если человек нигде не используется", () => {
    expect(personUsage("bek").canDelete).toBe(true);
    expect(personUsage("bek", { debtEvents: [{ person_id: "bek" }] })).toMatchObject({ debts: 1, canDelete: false });
    expect(personUsage("bek", { sharedMembers: [{ person_id: "bek" }] })).toMatchObject({ groups: 1, canDelete: false });
    expect(personUsage("bek", { sharedEntries: [{ sender_person_id: "bek" }] })).toMatchObject({ transfers: 1, canDelete: false });
  });

  test("имя ищется без учёта регистра и пробелов, скрытые не находятся", () => {
    expect(findActiveByName(people, "  бек ")?.id).toBe("bek");
    expect(findActiveByName(people, "Ерлан")).toBeUndefined();
  });

  test("новый человек: имя без пробелов по краям, цвет по кругу палитры", () => {
    const p = newPersonRecord("x", "  Асан ", people);
    expect(p).toMatchObject({ id: "x", name: "Асан", archived: false });
    expect(typeof p.color).toBe("string");
  });
});
