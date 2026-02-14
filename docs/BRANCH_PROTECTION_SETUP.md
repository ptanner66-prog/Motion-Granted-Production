# Branch Protection Setup — Motion Granted

## When to Configure
After the CI workflow (`.github/workflows/ci.yml`) is merged and running successfully on at least one PR.

## Settings (GitHub → Settings → Branches → Branch protection rules)

### Rule: `main`

1. **Require a pull request before merging** ✅
   - Required number of approvals: `0` (Porter is sole developer — self-merge is fine)
   - Dismiss stale pull request approvals: ✅
   - Require review from Code Owners: ❌ (no CODEOWNERS file yet)

2. **Require status checks to pass before merging** ✅
   - Status checks that are required:
     - `Quality Gates` (this is the job name from ci.yml)
   - Require branches to be up to date before merging: ✅

3. **Require conversation resolution before merging** ❌ (optional — enable later)

4. **Require signed commits** ❌ (not required for two-person team)

5. **Require linear history** ❌ (merge commits are fine)

6. **Include administrators** ✅
   - Even Porter's direct pushes should go through CI

7. **Restrict who can push to matching branches** ❌ (unnecessary for two-person team)

8. **Allow force pushes** ❌
   - NEVER force push to main — it breaks Vercel deployment history

9. **Allow deletions** ❌

## Verification

After enabling:
1. Create a test branch: `git checkout -b test/branch-protection`
2. Make a trivial change (add a comment to any file)
3. Push and create a PR
4. Verify the "Quality Gates" check runs automatically
5. Verify you cannot merge until the check passes
6. Merge the PR and delete the test branch

## Emergency Override

If CI is broken and you need to deploy urgently:
1. Go to Settings → Branches → main rule
2. Temporarily uncheck "Require status checks to pass"
3. Merge the fix
4. IMMEDIATELY re-enable the check
5. Document the override in the PR description

## Future Enhancements
- Add CODEOWNERS file when team grows beyond Porter
- Add required reviewers when Clay or other developers join
- Add deployment environment protection rules
- Promote lint from advisory to required (after SP-12 ESLint cleanup)
