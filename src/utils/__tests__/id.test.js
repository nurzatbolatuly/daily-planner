import { newId } from "../id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.restoreAllMocks());

test("newId: crypto.randomUUID, когда он есть", () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-2222-4333-8444-555555555555");
  expect(newId()).toBe("11111111-2222-4333-8444-555555555555");
});

describe("newId без randomUUID (http по локальному IP)", () => {
  let original;
  beforeEach(() => { original = crypto.randomUUID; Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true }); });
  afterEach(() => Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true }));

  test("UUID v4 из getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    expect(newId()).toMatch(UUID_V4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("байты версии и варианта выставлены поверх случайных", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation(a => a.fill(0xff));
    expect(newId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  test("не повторяется", () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
  });
});
