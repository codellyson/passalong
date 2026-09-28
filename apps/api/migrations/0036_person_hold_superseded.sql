-- A person's browser hold that their own agent has since taken over.
--
-- Saying "I'll do this" in the hub holds a handoff as the person (agent `person-…`, no place). When
-- that person's agent then took it in a repo, both holds stood: the guide showed as handed in from
-- the repo and still being worked on in the browser, by the same name, for a week. claims.take and
-- claims.handIn now let the browser hold go; this clears the ones already left behind.
DELETE FROM claim
 WHERE place = ''
   AND state = 'claimed'
   AND agent_id LIKE 'person-%'
   AND EXISTS (
     SELECT 1 FROM claim other
      WHERE other.guide_id = claim.guide_id
        AND other.account_id = claim.account_id
        AND other.place <> ''
   );
