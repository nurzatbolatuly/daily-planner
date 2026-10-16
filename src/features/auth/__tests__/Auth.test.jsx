import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "../../../lib/supabase";
import { LoginPage } from "../LoginPage";
import { AuthProvider, useAuth } from "../AuthProvider";
import { AccountCard } from "../AccountCard";
import { LAST_EMAIL_KEY, OTP_LENGTH } from "../../../constants/auth";

jest.mock("../../../lib/supabase", () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn(), signOut: jest.fn(), onAuthStateChange: jest.fn() } },
}));

const CODE = "1".repeat(OTP_LENGTH);
let emitAuth;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  supabase.auth.signInWithOtp.mockResolvedValue({ error: null });
  supabase.auth.verifyOtp.mockResolvedValue({ error: null });
  supabase.auth.signOut.mockImplementation(async () => { emitAuth("SIGNED_OUT", null); return { error: null }; });
  supabase.auth.onAuthStateChange.mockImplementation(cb => {
    emitAuth = (e, s) => act(() => cb(e, s));
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
});

const toCodeStep = async (email = "Me@Mail.kz ") => {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
  return screen.findByLabelText("Код из письма");
};

test("email → код: адрес нормализуется, новых пользователей не создаём, email запоминается", async () => {
  render(<LoginPage/>);
  await toCodeStep();
  expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({ email: "me@mail.kz", options: { shouldCreateUser: false } });
  expect(screen.getByText("me@mail.kz")).toBeInTheDocument();
  expect(localStorage.getItem(LAST_EMAIL_KEY)).toBe("me@mail.kz");
  expect(screen.getByRole("button", { name: /Отправить снова через/ })).toBeDisabled();
});

test("неверный email — письмо не отправляется", () => {
  render(<LoginPage/>);
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "me@" } });
  fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
  expect(screen.getByText(/введите email/)).toBeInTheDocument();
  expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
});

test("незарегистрированный email — понятная ошибка, остаёмся на шаге email", async () => {
  supabase.auth.signInWithOtp.mockResolvedValue({ error: { code: "otp_disabled", status: 422 } });
  render(<LoginPage/>);
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "x@y.kz" } });
  fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Для этого email вход не открыт");
  expect(screen.queryByLabelText("Код из письма")).not.toBeInTheDocument();
});

test("код: только цифры, полный код отправляется сам", async () => {
  render(<LoginPage/>);
  const input = await toCodeStep();
  fireEvent.change(input, { target: { value: `${CODE.slice(0, -1)}a-${CODE.slice(-1)}9` } });
  await waitFor(() => expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "me@mail.kz", token: CODE, type: "email" }));
});

test("неверный код — ошибка и пустое поле для нового ввода", async () => {
  supabase.auth.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
  render(<LoginPage/>);
  const input = await toCodeStep();
  fireEvent.change(input, { target: { value: CODE } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Код неверный или устарел");
  expect(input).toHaveValue("");
});

function Probe() {
  const { status, email } = useAuth();
  return <div>{status}:{email ?? "-"}<AccountCard/></div>;
}

test("сессия: загрузка → вошёл → выход стирает данные устройства, кроме email", async () => {
  render(<AuthProvider><Probe/></AuthProvider>);
  expect(screen.getByText(/^loading/)).toBeInTheDocument();
  emitAuth("INITIAL_SESSION", { user: { id: "u1", email: "me@mail.kz" } });
  expect(screen.getByText(/^signedIn:me@mail.kz/)).toBeInTheDocument();

  localStorage.setItem(LAST_EMAIL_KEY, "me@mail.kz");
  localStorage.setItem("shared.draft.new", "{\"amount\":5000}");
  fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Выйти" }).at(-1));

  await waitFor(() => expect(screen.getByText(/^signedOut/)).toBeInTheDocument());
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(localStorage.getItem("shared.draft.new")).toBeNull();
  expect(localStorage.getItem(LAST_EMAIL_KEY)).toBe("me@mail.kz");
});

test("выход без сети — ошибка, данные устройства не стёрты", async () => {
  supabase.auth.signOut.mockResolvedValue({ error: { name: "AuthRetryableFetchError", status: 0 } });
  render(<AuthProvider><Probe/></AuthProvider>);
  emitAuth("INITIAL_SESSION", { user: { id: "u1", email: "me@mail.kz" } });
  localStorage.setItem("shared.draft.new", "{}");
  fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Выйти" }).at(-1));
  expect(await screen.findByText("Нет соединения — попробуйте ещё раз")).toBeInTheDocument();
  expect(localStorage.getItem("shared.draft.new")).toBe("{}");
  expect(screen.getByText(/^signedIn/)).toBeInTheDocument();
});
