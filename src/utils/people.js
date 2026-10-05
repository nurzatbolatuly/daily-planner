import { PALETTE } from "../constants/money";

// «Люди» (debt_people) — общий список для «Долгов», «Оплатил за других» и «Общих расходов».

// Кого показывать в пикере: только не скрытые, но уже выбранных — всегда (иначе при правке
// старого сплита со скрытым человеком он молча пропал бы из выбора).
export const pickablePeople = (people, selectedIds = []) =>
  people.filter(p => !p.archived || selectedIds.includes(p.id));

// Где человек используется. Удалять можно, только если нигде: debt_events.person_id —
// ON DELETE CASCADE, удаление молча стёрло бы его долги и зачёты (docs/shared-expenses.md §7.5).
export function personUsage(personId, { debtEvents = [], sharedMembers = [], sharedEntries = [] } = {}) {
  const usage = {
    debts: debtEvents.filter(e => e.person_id === personId).length,
    groups: sharedMembers.filter(m => m.person_id === personId).length,
    transfers: sharedEntries.filter(e => e.sender_person_id === personId).length,
  };
  return { ...usage, canDelete: !usage.debts && !usage.groups && !usage.transfers };
}

// Имя для сравнения: без регистра и крайних пробелов.
export const normName = s => (s || "").trim().toLocaleLowerCase("ru");

// Не скрытый человек с таким же именем (без учёта регистра и пробелов) — чтобы «＋ Бек» выбрал
// существующего Бека, а не плодил дубликаты.
export const findActiveByName = (people, name) =>
  people.find(p => !p.archived && normName(p.name) === normName(name));

// Цвет нового человека — по кругу палитры, как раньше в SplitToggle/DebtFormPage.
export const nextPersonColor = people => PALETTE[people.length % PALETTE.length];

export const newPersonRecord = (id, name, people) =>
  ({ id, name: name.trim(), color: nextPersonColor(people), archived: false });
