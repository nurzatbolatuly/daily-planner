export function getSavedOrder(accounts) {
  try {
    const ids = JSON.parse(localStorage.getItem("accountOrder") || "null");
    if (!ids) return accounts;
    return [...accounts].sort((a, b) => {
      const ai = ids.indexOf(a.id), bi = ids.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } catch {
    return accounts;
  }
}
