import { periodFilter } from "../period";

// Среда, 4 ноября 2026.
const TODAY = "2026-11-04";
const pick = (period, offset, dates) => dates.filter(periodFilter(period, offset, TODAY).matches);

test("день: сегодня, вчера и дальше — дата", () => {
  expect(periodFilter("day", 0, TODAY).label).toBe("Сегодня");
  expect(periodFilter("day", -1, TODAY).label).toBe("Вчера");
  expect(periodFilter("day", -2, TODAY).label).toBe("2026-11-02");
  expect(pick("day", -1, ["2026-11-02", "2026-11-03", "2026-11-04"])).toEqual(["2026-11-03"]);
});

test("неделя — с понедельника по воскресенье, включая края", () => {
  const f = periodFilter("week", 0, TODAY);
  expect(f.label).toBe("2 Ноя – 8 Ноя");
  expect(pick("week", 0, ["2026-11-01", "2026-11-02", "2026-11-08", "2026-11-09"])).toEqual(["2026-11-02", "2026-11-08"]);
  // Воскресенье — последний день своей недели, а не первый следующей.
  expect(periodFilter("week", 0, "2026-11-08").label).toBe("2 Ноя – 8 Ноя");
});

test("неделя через границу месяца и года", () => {
  expect(periodFilter("week", 0, "2026-12-31").label).toBe("28 Дек – 3 Янв");
  expect(periodFilter("week", 0, "2027-01-03").matches("2026-12-28")).toBe(true);
});

test("месяц: сдвиг через границу года", () => {
  expect(periodFilter("month", 0, TODAY).label).toBe("ноября 2026");
  expect(periodFilter("month", -11, TODAY).label).toBe("декабря 2025");
  expect(pick("month", -1, ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"])).toEqual(["2026-10-01", "2026-10-31"]);
});

test("год и «всё время»", () => {
  expect(periodFilter("year", -1, TODAY).label).toBe("2025");
  expect(pick("year", -1, ["2024-12-31", "2025-01-01", "2025-12-31", "2026-01-01"])).toEqual(["2025-01-01", "2025-12-31"]);
  expect(periodFilter("all", 0, TODAY)).toMatchObject({ label: "Всё время" });
  expect(pick("all", 0, ["1999-01-01"])).toEqual(["1999-01-01"]);
});
