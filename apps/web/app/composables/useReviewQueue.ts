/**
 * The list you opened an item from, so its page can offer the one before and after it.
 *
 * Needs you opens each item on its own guide page rather than in a pane beside the list. To keep
 * working through the list from there, the list hands over its order — as filtered when you opened
 * it — and the page reads it back. Kept for the tab in sessionStorage, so a reload keeps your place;
 * a page opened from anywhere else is simply not in the queue and shows no stepper.
 */
export interface QueueItem {
  id: string;
  title: string;
}

const KEY = "passalong:review-queue";

function stored(): QueueItem[] {
  if (!import.meta.client) return [];
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "[]") as QueueItem[];
  } catch {
    return [];
  }
}

export function useReviewQueue() {
  const queue = useState<QueueItem[]>("review:queue", stored);
  function remember(items: QueueItem[]) {
    queue.value = items;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // Private browsing or a full store: the stepper works until the next reload.
    }
  }
  return { queue, remember };
}
