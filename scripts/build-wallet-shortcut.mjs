// Сборка команды iOS «CashFlow: покупка» (docs/apple-pay-inbox.md §16) — вместо ручной сборки в
// «Командах». Запуск: make shortcut (macOS: нужен `shortcuts sign`, вход в iCloud для режима anyone).
// Результат — public/cashflow-purchase.shortcut: открыть на iPhone (AirDrop/ссылка) → «Добавить» →
// вставить ключ (Меню → Apple Pay). Ключа в файле нет — его спрашивает «вопрос при импорте».
//
// Команда: Текст (ключ) → POST в wallet-ingest с полями входа автоматизации «Транзакция» → если в
// ответе alert не пустой → уведомление. Проверка связи и «показывать ли уведомление» решает сервер.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const BASE = process.env.REACT_APP_SUPABASE_URL;
if (!BASE) throw new Error("Нет REACT_APP_SUPABASE_URL (запуск: node --env-file=.env …)");
const URL = `${BASE}/functions/v1/wallet-ingest`;
const OUT = process.argv[2] || "public/cashflow-purchase.shortcut";

// Свойства входа автоматизации «Транзакция» — WFWalletTransactionContentItem (названия — как в
// английском интерфейсе «Команд», сверено с ContentKit macOS: transaction.currencyAmount → Amount,
// merchant.displayName → Merchant, paymentMethod → Card or Pass). Не совпало имя — поле придёт
// пустым; весь вход целиком уходит в `input` для разбора на сервере.
const FIELDS = { amount: "Amount", merchant: "Merchant", card: "Card or Pass", name: "Name" };

const OBJ = "￼";   // место переменной в строке «Команд»
const text = (string, attachments = {}) => ({
  Value: { string, attachmentsByRange: attachments }, WFSerializationType: "WFTextTokenString",
});
const varText = variable => text(OBJ, { "{0, 1}": variable });
const output = (uuid, name) => ({ Type: "ActionOutput", OutputUUID: uuid, OutputName: name });
const inputProp = property => ({ Type: "ExtensionInput", Aggrandizements: [{ Type: "WFPropertyVariableAggrandizement", PropertyName: property }] });
const inputAsText = { Type: "ExtensionInput", Aggrandizements: [{ Type: "WFCoercionVariableAggrandizement", CoercionItemClass: "WFStringContentItem" }] };
const dict = items => ({
  Value: { WFDictionaryFieldValueItems: items.map(([key, value]) => ({ WFItemType: 0, WFKey: text(key), WFValue: value })) },
  WFSerializationType: "WFDictionaryFieldValue",
});
const action = (id, params) => ({ WFWorkflowActionIdentifier: `is.workflow.actions.${id}`, WFWorkflowActionParameters: params });

const KEY = randomUUID().toUpperCase();
const POST = randomUUID().toUpperCase();
const ALERT = randomUUID().toUpperCase();
const IF = randomUUID().toUpperCase();

const workflow = {
  WFWorkflowClientVersion: "2612.0.3",
  WFWorkflowMinimumClientVersion: 900,
  WFWorkflowMinimumClientVersionString: "900",
  WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59511 },
  WFWorkflowTypes: [],
  WFWorkflowHasShortcutInputVariables: true,
  // Без WFWalletTransactionContentItem iOS не отдаёт команде покупку: вход пустой, сервер видит «проверку связи».
  WFWorkflowInputContentItemClasses: [
    "WFWalletTransactionContentItem",
    "WFAppContentItem", "WFArticleContentItem", "WFContactContentItem", "WFDateContentItem", "WFEmailAddressContentItem",
    "WFFolderContentItem", "WFGenericFileContentItem", "WFImageContentItem", "WFiTunesProductContentItem", "WFLocationContentItem",
    "WFDCMapsLinkContentItem", "WFAVAssetContentItem", "WFPDFContentItem", "WFPhoneNumberContentItem", "WFRichTextContentItem",
    "WFSafariWebPageContentItem", "WFStringContentItem", "WFURLContentItem",
  ],
  WFWorkflowImportQuestions: [{
    ActionIndex: 0, Category: "Parameter", ParameterKey: "WFTextActionText", DefaultValue: "",
    Text: "Ключ CashFlow: Меню → Apple Pay → «Создать ключ» → «Скопировать»",
  }],
  WFWorkflowActions: [
    action("gettext", { UUID: KEY, WFTextActionText: "вставьте ключ" }),
    action("downloadurl", {
      UUID: POST,
      WFURL: URL,
      WFHTTPMethod: "POST",
      ShowHeaders: true,
      WFHTTPHeaders: dict([["Authorization", text(`Bearer ${OBJ}`, { "{7, 1}": output(KEY, "Text") })]]),
      WFHTTPBodyType: "JSON",
      WFJSONValues: dict([
        ...Object.entries(FIELDS).map(([key, prop]) => [key, varText(inputProp(prop))]),
        ["input", varText(inputAsText)],
      ]),
    }),
    action("getvalueforkey", {
      UUID: ALERT,
      WFGetDictionaryValueType: "Value",
      WFDictionaryKey: "alert",
      WFInput: { Value: output(POST, "Contents of URL"), WFSerializationType: "WFTextTokenAttachment" },
    }),
    action("conditional", {
      GroupingIdentifier: IF, WFControlFlowMode: 0, WFCondition: 100,   // 100 — «имеет любое значение»
      WFInput: { Type: "Variable", Variable: { Value: output(ALERT, "Dictionary Value"), WFSerializationType: "WFTextTokenAttachment" } },
    }),
    action("notification", {
      WFNotificationActionTitle: "CashFlow",
      WFNotificationActionBody: varText(output(ALERT, "Dictionary Value")),
      WFNotificationActionSound: false,
    }),
    action("conditional", { GroupingIdentifier: IF, WFControlFlowMode: 2 }),
  ],
};

// JSON → бинарный plist (plutil) → подпись (shortcuts sign). Временные файлы — в системной tmp.
const dir = mkdtempSync(join(tmpdir(), "cashflow-shortcut-"));
try {
  const plist = join(dir, "unsigned.shortcut");
  writeFileSync(plist, JSON.stringify(workflow));
  execFileSync("plutil", ["-convert", "binary1", plist]);
  execFileSync("shortcuts", ["sign", "--mode", "anyone", "--input", plist, "--output", OUT], { stdio: "inherit" });
  console.log(`Готово: ${OUT} → адрес ${URL}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
