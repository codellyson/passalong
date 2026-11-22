// One piece of work for whoever is signed in and may read it: its author or a member of its team,
// the rule `readableWork` applies in apps/api. This is what the hub's work page frames, so the
// document is read without a public link existing at all.

import { db } from "../../../utils/d1";
import {
  ID_RE,
  noSuchWork,
  sessionAccount,
  WORK_PAGE_COLUMNS,
  type WorkPageRow,
  workPage,
} from "../../../utils/work-page";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") || "";
  if (!ID_RE.test(id)) throw noSuchWork();
  const account = await sessionAccount(event);
  if (!account) throw noSuchWork();
  const row = await db(event)
    .prepare(
      `SELECT ${WORK_PAGE_COLUMNS} FROM work
        WHERE id = ? AND (account_id = ? OR team_id IN (SELECT team_id FROM membership WHERE account_id = ?))`,
    )
    .bind(id, account, account)
    .first<WorkPageRow>();
  if (!row) throw noSuchWork();
  setHeader(event, "cache-control", "private, no-store");
  return workPage(event, row, { public: false });
});
