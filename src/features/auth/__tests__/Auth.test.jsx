import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "../../../lib/supabase";
import { requestCode, verifyCode, signInWithPassword, AuthOtpError } from "../../../lib/auth";
import { LoginPage } from "../LoginPage";
import { AuthProvider, useAuth } from "../AuthProvider";
import { AccountCard } from "../AccountCard";
import { LAST_EMAIL_KEY } from "../../../constants/auth";

jest.mock("../../../lib/supabase", () => ({
  supabase: { auth: { signOut: jest.fn(), onAuthStateChange: jest.fn() } },
}));
jest.mock("../../../lib/auth", () => {
  class AuthOtpError extends Error {
    constructor(code, { retryAfter = null, minLength = null } = {}) {
      super(code); this.code = code; this.retryAfter = retryAfter; this.minLength = minLength;
    }
  }
  return { requestCode: jest.fn(), verifyCode: jest.fn(), signInWithPassword: jest.fn(), AuthOtpError };
});

// Длину кода и паузу задаёт сервер — в тестах намеренно не 6 и не 15, чтобы ловить захардкоженные значения.
const SERVER = { code_length: 5, resend_after: 20, expires_in: 600, new_user: true };
const CODE = "12345";
const PW = "correct-horse";
let emitAuth;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  requestCode.mockResolvedValue(SERVER);
  verifyCode.mockResolvedValue(undefined);
  signInWithPassword.mockResolvedValue(undefined);
  supabase.auth.signOut.mockImplementation(async () => { emitAuth("SIGNED_OUT", null); return { error: null }; });
  supabase.auth.onAuthStateChange.mockImplementation(cb => {
    emitAuth = (e, s) => act(() => cb(e, s));
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
});

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = name => fireEvent.click(screen.getByRole("button", { name }));
const toSignup = () => fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
const fillCodeForm = ({ email = "New@Mail.kz ", password = PW, passwordLabel = "Пароль" } = {}) => {
  type("Email", email);
  type(passwordLabel, password);
  click("Получить код");
};

// ── Вход по паролю ──
test("вход: email нормализуется, пароль уходит в Supabase, email запоминается, писем нет", async () => {
  render(<LoginPage/>);
  type("Email", "Me@Mail.kz ");
  type("Пароль", PW);
  click("Войти");
  await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith("me@mail.kz", PW));
  expect(localStorage.getItem(LAST_EMAIL_KEY)).toBe("me@mail.kz");
  expect(requestCode).not.toHaveBeenCalled();
});

test("вход: неверный пароль — понятная ошибка, «Забыли пароль?» под рукой", async () => {
  signInWithPassword.mockRejectedValue({ code: "invalid_credentials", status: 400 });
  render(<LoginPage/>);
  type("Email", "me@mail.kz");
  type("Пароль", "wrong");
  click("Войти");
  expect(await screen.findByRole("alert")).toHaveTextContent("Неверный email или пароль");
  expect(screen.getByRole("button", { name: "Забыли пароль?" })).toBeInTheDocument();
});

test("вход: неполный email и пустой пароль — запрос не уходит", () => {
  render(<LoginPage/>);
  type("Email", "me@");
  click("Войти");
  expect(screen.getByRole("alert")).toHaveTextContent("Введите email полностью");
  type("Email", "me@mail.kz");
  click("Войти");
  expect(screen.getByRole("alert")).toHaveTextContent("Введите пароль");
  expect(signInWithPassword).not.toHaveBeenCalled();
});

test("пароль можно показать", () => {
  render(<LoginPage/>);
  expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
  click("Показать пароль");
  expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "text");
});

// ── Регистрация: email + пароль → код ──
test("регистрация: код с intent signup, пароль задаётся вместе с кодом, длина и пауза — от сервера", async () => {
  render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  const input = await screen.findByLabelText("Код из письма");
  expect(requestCode).toHaveBeenCalledWith("new@mail.kz", "signup");
  expect(screen.getByRole("heading", { name: "Подтвердите email" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Отправить снова через 0:20" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Создать аккаунт" })).toBeDisabled();
  fireEvent.change(input, { target: { value: `${CODE.slice(0, -1)} a-${CODE.slice(-1)}` } });
  await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("new@mail.kz", CODE, PW));
});

test("регистрация: короткий пароль — код не запрашивается", () => {
  render(<LoginPage/>);
  toSignup();
  fillCodeForm({ password: "1234567" });
  expect(screen.getByRole("alert")).toHaveTextContent("Пароль — не короче 8 символов");
  expect(requestCode).not.toHaveBeenCalled();
});

test("регистрация на существующий email — код подтвердит новый пароль, а не второй аккаунт", async () => {
  requestCode.mockResolvedValue({ ...SERVER, new_user: false });
  render(<LoginPage/>);
  toSignup();
  fillCodeForm({ email: "me@mail.kz" });
  expect(await screen.findByRole("status")).toHaveTextContent("Аккаунт с этим email уже есть");
  expect(screen.getByRole("button", { name: "Сохранить пароль и войти" })).toBeInTheDocument();
});

test("пароль слабее требований сервера — назад к паролю, с его минимумом", async () => {
  verifyCode.mockRejectedValue(new AuthOtpError("weak_password", { minLength: 10 }));
  render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  fireEvent.change(await screen.findByLabelText("Код из письма"), { target: { value: CODE } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Пароль — не короче 10 символов");
  expect(screen.getByLabelText("Пароль")).toHaveValue(PW);
});

test("неверный код — ошибка и пустое поле для нового ввода", async () => {
  verifyCode.mockRejectedValue(new AuthOtpError("invalid_code"));
  render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  const input = await screen.findByLabelText("Код из письма");
  fireEvent.change(input, { target: { value: CODE } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Код неверный");
  expect(input).toHaveValue("");
});

test("регистрация закрыта / письмо не ушло — понятный текст", async () => {
  requestCode.mockRejectedValueOnce(new AuthOtpError("signup_closed")).mockRejectedValueOnce(new AuthOtpError("send_failed"));
  render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("Регистрация новых пользователей сейчас закрыта");
  click("Получить код");
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Не удалось отправить письмо"));
});

test("сервер просит подождать — отсчёт по его числу, кнопка недоступна", async () => {
  requestCode.mockRejectedValue(new AuthOtpError("too_soon", { retryAfter: 37 }));
  render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("Новое письмо можно запросить через 37 сек");
  expect(screen.getByRole("button", { name: "Получить код через 0:37" })).toBeDisabled();
});

test("часовой лимит на адрес — в минутах; общий лимит регистраций кнопку не блокирует", async () => {
  requestCode.mockRejectedValueOnce(new AuthOtpError("too_many", { retryAfter: 1500 }));
  const first = render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("повторить можно через 25 мин");
  first.unmount();

  requestCode.mockRejectedValueOnce(new AuthOtpError("signup_busy", { retryAfter: 600 }));
  render(<LoginPage/>);
  toSignup();
  fillCodeForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("попробуйте через 10 мин");
  expect(screen.getByRole("button", { name: "Получить код" })).toBeEnabled();
});

// ── Забыли пароль ──
test("забыли пароль: email переносится, intent reset, новый пароль — после кода", async () => {
  requestCode.mockResolvedValue({ ...SERVER, new_user: false });
  render(<LoginPage/>);
  type("Email", "me@mail.kz");
  click("Забыли пароль?");
  expect(screen.getByRole("heading", { name: "Новый пароль" })).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveValue("me@mail.kz");
  type("Новый пароль", PW);
  click("Получить код");
  fireEvent.change(await screen.findByLabelText("Код из письма"), { target: { value: CODE } });
  expect(requestCode).toHaveBeenCalledWith("me@mail.kz", "reset");
  await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("me@mail.kz", CODE, PW));
});

test("забыли пароль, а аккаунта нет — одно нажатие: регистрация с тем же email и паролем", async () => {
  requestCode.mockRejectedValueOnce(new AuthOtpError("user_not_found"));
  render(<LoginPage/>);
  click("Забыли пароль?");
  fillCodeForm({ email: "x@y.kz", passwordLabel: "Новый пароль" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Аккаунта с этим email нет");
  click("зарегистрироваться с ним?");
  fireEvent.change(await screen.findByLabelText("Код из письма"), { target: { value: CODE } });
  expect(requestCode).toHaveBeenLastCalledWith("x@y.kz", "signup");
  await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("x@y.kz", CODE, PW));
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
