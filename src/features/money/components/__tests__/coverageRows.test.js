import { feesFromEntry, toShare, initialRows } from "../coverageRows";
import { perHeadOf } from "../../../../utils/sharedExpenses";

describe("feesFromEntry — запись сохранена без колонки fees (до миграции v30)", () => {
  test("сборы есть в записи — берутся как есть", () => {
    expect(feesFromEntry({ id: "b", fees: [{ id: "d", title: "Доставка", amount: 1500, split: "equal" }] }))
      .toEqual([{ id: "d", title: "Доставка", amount: "1500", split: "equal" }]);
  });
  test("в записи нет — восстанавливаются из долей: поровну на человека → «поровну»", () => {
    const entry = { id: "b", shares: [{ member_id: "me", heads: 1, fee: 500 }, { member_id: "bek", heads: 3, fee: 1500 }, { member_id: "a", heads: 1, fee: 500 }] };
    expect(feesFromEntry(entry)).toEqual([{ id: "restored-b", title: "Сборы", amount: "2500", split: "equal" }]);
  });
  test("разные части на человека → «по заказу»; сборов нет — пусто", () => {
    expect(feesFromEntry({ id: "b", shares: [{ member_id: "me", heads: 1, fee: 250 }, { member_id: "a", heads: 1, fee: 750 }] })[0].split).toBe("proportional");
    expect(feesFromEntry({ id: "b", shares: [{ member_id: "me", amount: 100 }] })).toEqual([]);
  });
});

describe("проценты / части / суммы — компашка × 3 остаётся тремя людьми", () => {
  const members = [{ id: "me", is_me: true, heads: 1 }, { id: "co", heads: 3 }];
  const rows = { me: { included: true, heads: 1, weight: "40" }, co: { included: true, heads: 3, weight: "60" } };

  test("heads сохраняется в доле и восстанавливается при правке", () => {
    const share = toShare({ member_id: "co", amount: 6000 }, rows, "percent");
    expect(share).toMatchObject({ heads: 3, mode: "percent", value: 60, amount: 6000 });
    expect(initialRows(members, { shares: [share] }).co).toMatchObject({ heads: 3, weight: "60" });
  });

  test("«за 1» в переводе делит долю компашки на троих", () => {
    const bill = { id: "b", kind: "bill", payer_member_id: "me", amount: 10000, shares: [toShare({ member_id: "co", amount: 6000 }, rows, "percent")] };
    expect(perHeadOf([bill], "co", "me", { precision: 0 }).perHead).toBe(2000);
  });
});
