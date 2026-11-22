// One piece of work by its public link. The id is an address; the **key is the secret**, and
// holding it is the whole authorisation check. A key exists only once the author chose Share, so
// work nobody shared answers 404 here (server/utils/work-page.ts).

import { db } from "../../../utils/d1";
import {
  ID_RE,
  KEY_RE,
  noSuchWork,
  WORK_PAGE_COLUMNS,
  type WorkPageRow,
  workPage,
} from "../../../utils/work-page";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") || "";
  const key = getRouterParam(event, "key") || "";
  // A malformed address is not found, not "bad request": both answers have to look the same.
  if (!ID_RE.test(id) || !KEY_RE.test(key)) throw noSuchWork();
  const row = await db(event)
    .prepare(`SELECT ${WORK_PAGE_COLUMNS} FROM work WHERE id = ? AND share_key = ?`)
    .bind(id, key)
    .first<WorkPageRow>();
  if (!row) throw noSuchWork();
  return workPage(event, row, { public: true });
});
