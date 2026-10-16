import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "../../../lib/supabase";
import { requestCode, verifyCode, AuthOtpError } from "../../../lib/authOtp";
import { LoginPage } from "../LoginPage";
import { AuthProvider, useAuth } from "../AuthProvider";
import { AccountCard } from "../AccountCard";
import { LAST_EMAIL_KEY } from "../../../constants/auth";

jest.mock("../../../lib/supabase", () => ({
  supabase: { auth: { signOut: jest.fn(), onAuthStateChange: jest.fn() } },
}));
jest.mock("../../../lib/authOtp", () => {
  class AuthOtpError extends Error {
    constructor(code, retryAfter = null) { super(code); this.code = code; this.retryAfter = retryAfter; }
  }
  return { requestCode: jest.fn(), verifyCode: jest.fn(), AuthOtpError };
});

// Длину кода и паузу задаёт сервер — в тестах намеренно не 6 и не 15, чтобы ловить захардкоженные значения.
const SERVER = { code_length: 5, resend_after: 20, expires_in: 600 };
const CODE = "12345";
let emitAuth;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  requestCode.mockResolvedValue(SERVER);
  verifyCode.mockResolvedValue(undefined);
  supabase.auth.signOut.mockImplementation(async () => { emitAuth("SIGNED_OUT", null); return { error: null }; });
  supabase.auth.onAuthStateChange.mockImplementation(cb => {
    emitAuth = (e, s) => act(() => cb(e, s));
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
});

const typeEmail = (email = "Me@Mail.kz ") => {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
};
const toCodeStep = async email => { typeEmail(email); return screen.findByLabelText("Код из письма"); };

test("email → код: адрес нормализуется, email запоминается, пауза — из ответа сервера", async () => {
  render(<LoginPage/>);
  await toCodeStep();
  expect(requestCode).toHaveBeenCalledWith("me@mail.kz");
  expect(screen.getByText("me@mail.kz")).toBeInTheDocument();
  expect(localStorage.getItem(LAST_EMAIL_KEY)).toBe("me@mail.kz");
  expect(screen.getByRole("button", { name: "Отправить снова через 0:20" })).toBeDisabled();
});

test("неверный email — письмо не отправляется", () => {
  render(<LoginPage/>);
  typeEmail("me@");
  expect(screen.getByRole("alert")).toHaveTextContent("Введите email полностью");
  expect(requestCode).not.toHaveBeenCalled();
});

test("незарегистрированный email — понятная ошибка, остаёмся на шаге email", async () => {
  requestCode.mockRejectedValue(new AuthOtpError("user_not_found"));
  render(<LoginPage/>);
  typeEmail("x@y.kz");
  expect(await screen.findByRole("alert")).toHaveTextContent("Для этого email вход не открыт");
  expect(screen.queryByLabelText("Код из письма")).not.toBeInTheDocument();
});

test("сервер просит подождать — отсчёт по его числу, кнопка недоступна", async () => {
  requestCode.mockRejectedValue(new AuthOtpError("too_soon", 37));
  render(<LoginPage/>);
  typeEmail("me@mail.kz");
  expect(await screen.findByRole("alert")).toHaveTextContent("Новое письмо можно запросить через 37 сек");
  expect(screen.getByRole("button", { name: "Получить код через 0:37" })).toBeDisabled();
});

test("часовой лимит на адрес — в минутах", async () => {
  requestCode.mockRejectedValue(new AuthOtpError("too_many", 1500));
  render(<LoginPage/>);
  typeEmail("me@mail.kz");
  expect(await screen.findByRole("alert")).toHaveTextContent("повторить можно через 25 мин");
});

test("код: длина из ответа сервера, только цифры, полный код отправляется сам", async () => {
  render(<LoginPage/>);
  const input = await toCodeStep();
  fireEvent.change(input, { target: { value: `${CODE.slice(0, -1)} a-${CODE.slice(-1)}` } });
  await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("me@mail.kz", CODE));
});

test("неполный код — «Войти» недоступна", async () => {
  render(<LoginPage/>);
  const input = await toCodeStep();
  fireEvent.change(input, { target: { value: CODE.slice(0, -1) } });
  expect(screen.getByRole("button", { name: "Войти" })).toBeDisabled();
  expect(verifyCode).not.toHaveBeenCalled();
});

test("неверный код — ошибка и пустое поле для нового ввода", async () => {
  verifyCode.mockRejectedValue(new AuthOtpError("invalid_code"));
  render(<LoginPage/>);
  const input = await toCodeStep();
  fireEvent.change(input, { target: { value: CODE } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Код неверный");
  expect(input).toHaveValue("");
});

test("письмо не ушло (SMTP) — понятная ошибка", async () => {
  requestCode.mockRejectedValue(new AuthOtpError("send_failed"));
  render(<LoginPage/>);
  typeEmail("me@mail.kz");
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось отправить письмо");
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
