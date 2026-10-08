-- Claims stored the whole path of the worktree, so the hub showed the person's login name and their
-- folder layout to everyone on the team. Keep the folder's own name, which is what tells two
-- checkouts apart. New claims are cut the same way where they arrive (claims.leaf).
UPDATE claim
   SET worktree = replace(
         rtrim(replace(worktree, char(92), '/'), '/'),
         rtrim(rtrim(replace(worktree, char(92), '/'), '/'),
               replace(rtrim(replace(worktree, char(92), '/'), '/'), '/', '')),
         '')
 WHERE worktree LIKE '%/%' OR worktree LIKE '%' || char(92) || '%';
