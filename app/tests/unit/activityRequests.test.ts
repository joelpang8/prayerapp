import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("friend requests can be answered from Activity, and count on the bell", () => {
  const activity = readFileSync("src/app/activity.tsx", "utf8");
  expect(activity).toContain("ListHeaderComponent={<FriendRequests />}");
  const requests = readFileSync("src/components/FriendRequests.tsx", "utf8");
  expect(requests).toContain("acceptRequest(db, me.uid, uid)");
  expect(requests).toContain("declineRequest(db, me.uid, uid)");
  // Never from people I've blocked (they aren't told), and no reason shown on failure.
  expect(requests).toContain("!blocked.has(uid)");
  expect(requests).not.toContain("errorReason");
  expect(readFileSync("src/components/ActivityBell.tsx", "utf8")).toContain("useIncomingRequests().length");
});
