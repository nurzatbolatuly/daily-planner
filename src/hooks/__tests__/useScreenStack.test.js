import { act, renderHook } from "@testing-library/react";
import { useScreenStack } from "../useScreenStack";

test("стек экранов: вперёд, назад, замена, закрыть несколько, к корню", () => {
  const reload = vi.fn();
  const { result } = renderHook(() => useScreenStack(reload));
  expect(result.current.screen).toBeNull();

  act(() => { result.current.navigate("group", { id: 1 }); result.current.navigate("settings", { id: 1 }); });
  expect(result.current.screen).toEqual({ name: "settings", data: { id: 1 } });

  act(() => result.current.goBack());
  expect(result.current.screen.name).toBe("group");
  expect(reload).not.toHaveBeenCalled();

  act(() => result.current.replace("entry", { id: 2 }));
  expect(result.current.screen).toEqual({ name: "entry", data: { id: 2 } });
  expect(reload).toHaveBeenCalledTimes(1);

  act(() => { result.current.navigate("a"); result.current.navigate("b"); result.current.pop(2); });
  expect(result.current.screen.name).toBe("entry");

  act(() => result.current.reset());
  expect(result.current.screen).toBeNull();
  expect(reload).toHaveBeenCalledTimes(2);
});

test("колбэки стабильны и вызывают свежий reload", () => {
  const first = vi.fn(), second = vi.fn();
  const { result, rerender } = renderHook(({ reload }) => useScreenStack(reload), { initialProps: { reload: first } });
  const { goBack } = result.current;
  rerender({ reload: second });
  expect(result.current.goBack).toBe(goBack);
  act(() => result.current.goBack(true));
  expect(second).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});
