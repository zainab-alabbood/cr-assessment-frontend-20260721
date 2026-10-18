# Implementation Notes

> Fill this in as part of your submission. 1–2 pages, bullet points are fine. Delete these
> instructions before submitting.

## 1. What I changed

### Starting failures
- **Diff classification** (`diff.util.ts`): `computeDiff` only compared `unitPrice`, so a quantity-only
  change was reported as `unchanged`. It now compares quantity, unit price and description.
- **Permission gating** (`cr-detail.component.ts`): `canApprove` only checked the CR status, so a
  read-only user was offered Approve. It now requires `PENDING_APPROVAL` **and** the user's approve
  policy (`canApprovePolicy`). `canReject` uses the same rule.

### List screen
- **Status filter** (`cr-list.component.ts` / template): added a `visibleRows` getter that narrows the
  rows by the selected status. The table renders from `visibleRows`, not the raw list.
- **No-match message**: a filter with no results shows its own message, separate from the
  "no change requests at all" empty state.
- Loading, loaded, empty and error states are unchanged and still driven by one `state` object.

### Detail screen
- **Timeline**: sorted oldest to newest by timestamp, on a copy of the array so the API data is not mutated.
- **Diff, totals and delta**: the diff table shows each line as added, removed, changed or unchanged. Totals and delta come from the API (`baselineTotal`, `newTotal`, `delta`), shown as money in the header. I did not recompute them in the UI, because the server is the source of truth for money values and a second calculation could disagree with it. They match the line items on all the fixtures.
- **Action availability**: Approve and Reject are offered only when the CR is `PENDING_APPROVAL` **and** the user has an approve policy (`canApprove` / `canReject`). Read-only users, and CRs in any other status, get a disabled Approve button and no reject box.



### Safe actions
- **Approve / Reject** call the provided API and replace the whole CR with the response, so status,
  timeline and buttons stay consistent.
- **Duplicate prevention**: a `submitting` flag is set synchronously before the `await`, and checked
  inside the methods, not only through `[disabled]`.
- **Reject reason**: required, and whitespace-only is rejected. The trimmed reason is sent.
- **Failures**: the error is shown, the previous CR data is kept, and the buttons are enabled again.

### Tests
- <number> new tests: diff cases, list states and filtering, detail diff and timeline, permissions,
  approve and reject flows, failure paths, duplicate clicks, reject validation.



## 2. Component & state model

### Screens
- **App shell**: demo only. It shows the list and detail side by side, with an "Acting as" user switcher.
- **List** (`CrListComponent`): loads the user's change requests into a table with a status filter. Clicking a row opens it in the detail.
- **Detail** (`CrDetailComponent`): loads one CR by `id` and shows the diff, totals/delta, the approval timeline, and Approve / Reject.

### State
Both components use one `state` object (`idle | loading | loaded | empty | error`). The template shows only one view at a time.

**List**
- `state`: load status and all rows
- `statusFilter`: selected status or `'ALL'`
- `visibleRows`: rows after filtering. The table renders this.

**Detail**
- `state`: load status and the CR (the single source of truth)
- `submitting`: true while Approve/Reject is running, so duplicate clicks are blocked
- `actionError`: error from a failed action, kept separate from load errors
- `rejectControl`: the reason field, required
- Getters: `diff`, `timeline` (oldest first), `canApprove` / `canReject` (status **and** policy)

### Data flow
1. The component calls the mock API with the current user from `SessionService`.
2. `load()` sets `loading`, then `loaded`, `empty` or `error`.
3. The template only reads state and getters.
4. On Approve/Reject success, `state.data` is replaced with the CR returned by the API, so status, timeline and buttons update together. On failure, the data is left alone and `actionError` is shown.
5. The API does not check permissions, so the UI does.



## 3. Invariants I keep

| Invariant | How it is enforced |
|---|---|
| Only one view shows at a time (loading, loaded, empty, error) | One `state` object, and the template switches on `state.status` |
| The table only shows rows that match the filter | The table renders `visibleRows`, never the raw list |
| "No CRs at all" and "no match for this filter" are different messages | Separate empty-state and no-match elements |
| The timeline is always oldest to newest | `timeline` sorts a copy of the audit array, so API data is not changed |
| Approve/Reject are offered only if the CR is `PENDING_APPROVAL` **and** the user has the approve policy | `canApprove` / `canReject` check both. Read-only users cannot act |
| No duplicate actions | `submitting` is set before the `await`, and checked inside `approve()` / `reject()`, not only in `[disabled]` |
| Reject always has a reason | `rejectControl` is required, whitespace-only is invalid, and the API is not called if it is invalid |
| The view is never half-updated | On success, the whole CR is replaced with the API response. On failure, `state` is not touched |
| A failed action never breaks the page | The error goes to `actionError`, `submitting` is reset in `finally`, and the buttons work again |
| Derived values cannot go stale | `diff`, `timeline` and `can*` are getters computed from `state.data`, not stored copies |



## 4. Testing strategy

- **Component/DOM tests for behavior.** The list and detail tests render the real component with the mock API and check what the user sees: states, rows, buttons, messages. They don't check private fields, so they still pass if I refactor.
- **Pure unit tests for logic.** `computeDiff` is a plain function, so it is tested directly: added, removed, quantity-only, price-only, description-only, unchanged.
- **What the DOM tests cover:**
  - List: loading, empty, error with Retry, filter narrows the rows, filter with no match.
  - Detail: diff rows, totals/delta, timeline order (using CR-1, whose data is out of order).
  - Permissions: a read-only user cannot act, and non-pending CRs have no actions.
  - Actions: approve success, reject success, API failure (error shown, view unchanged, buttons usable again), double click sends one call, empty or whitespace-only reason is blocked.
- **Slow/failing calls** use the mock API's `latencyMs` and `failNext`, so there are no real timers or network.
- **Checking the tests are meaningful:** I broke key code on purpose (removed the `submitting` guard, the policy check and the sort) and confirmed the matching test failed.
- **Skipped on purpose:** visual styling and CSS; the app shell and user switcher (demo glue only); keyboard and accessibility checks; timestamp and money formatting (the provided helpers are already simple and pure); list refresh after an action (not implemented, see section 7); races between a slow response and the user opening another CR; and end-to-end browser tests. I put the time into behavior that can lose data or let a user act wrongly: permissions, duplicate actions, failures and reject validation.



## 5. Assumptions

- **Reject uses the same permission as Approve.** The policies only define read and approve, so anyone who can approve can reject. Read-only users can do neither.
- **Approve scope.** `cr_a_u`, `cr_a_w` and `cr_a_o` all count as "can approve". The fixtures have no ownership or workspace data, so I did not add finer checks.
- **Only `PENDING_APPROVAL` CRs can be acted on.** Draft, approved, applied, rejected and cancelled CRs show no actions, even for an approver.
- **A "changed" line** means quantity, unit price or description differs for the same SKU. SKU is the identity of a line.
- **Totals and delta:** I show the values from the API (`baselineTotal`, `newTotal`, `delta`) and do not recompute them. The server is the source of truth for money, and a second calculation in the UI could disagree with it. They agree with the line items on all fixtures.
- **Timeline order:** oldest first, by timestamp. Entries with equal timestamps keep their API order.
- **Reject reason:** whitespace-only counts as empty, and the trimmed text is sent.
- **The UI does the permission checks,** because the mock API does not enforce them. In a real system the server must enforce them too.
- **Filter is client-side only.** The list is loaded once and filtered in the browser. No new API call per filter change.
- **After an action,** the CR returned by the API replaces the detail data. I do not reload the list, so the list row's status stays out of date until it is reloaded. I accepted this to keep the change small (see section 7).



## 6. Where I used AI

- **Tool:** Claude (chat). I used no other AI tools.
- **Orientation:** I gave Claude the brief and the repo. It explained the structure and the two starting failures, and proposed the order of work: bugs, list, detail, actions, tests, notes.
- **Code:** Claude wrote most of the implementation: the diff fix, the permission fix, the list status filter, the timeline sort, and the approve/reject logic with the `submitting` guard and the reject validation. I read each change, ran it, and went through it until I could explain it.
- **Tests:** Claude drafted the tests. I ran them and the lint, format and build checks myself.
- **Notes:** Claude drafted the structure and first wording of this file. I edited it to match the code.
- **Debugging:** Claude helped with a lint error (mixed tabs and spaces) and a TypeScript editor warning that came from VS Code using a newer TypeScript than the project.
- **What I did myself:** I ran the app, switched between the approver and the read-only user, tried the reject and error cases, and recorded the walkthrough. I can explain and change any part of the code.



## 7. What I'd improve with more time

- **Refresh the list after an action.** After Approve or Reject, the detail updates but the list row keeps the old status until it reloads. I would have the detail emit an event so the list updates its row.
- **Stale responses.** If the user opens another CR while a load or action is in flight, an old response could overwrite the new view. With a real HTTP service I would use Observables and cancel the old request (`switchMap`).
- **Totals and delta.** The header shows the values from the API. I would also check them against the sum of the line items and warn if they differ.
- **Confirm before rejecting or approving,** since these actions cannot be undone.
- **Accessibility.** Move focus to the error or success message after an action, add `aria-live` regions for status changes, and check keyboard use of the filter and the table rows (rows are clickable but not focusable).
- **Display.** Format timeline timestamps and the list delta as money, and show user names instead of IDs.
- **Scale.** For many CRs, add pagination and move the status filter to the server.
- **More tests.** Add end-to-end tests of the whole list-to-detail flow, a test for switching users, and tests for other-org users and keyboard use.
- **Retry after a failed action** with a clear "try again" message, and a distinction between network errors and rejections by the server (for example, the CR was already approved by someone else).
