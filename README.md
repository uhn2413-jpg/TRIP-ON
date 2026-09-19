# TRIP:ON v0.11.4

Small UX patch for trip management.

## Changes
- The top-right `...` button on a trip now opens a menu instead of jumping straight into edit mode.
- The menu exposes two clear actions: **여행 수정** and **여행 삭제**.
- Deleting still shows a destructive confirmation and removes the trip plus its linked data.
- The old delete button hidden on step 3 of the edit flow was removed to avoid confusion.

## Files changed
- `src/App.jsx`
- `src/styles.css`
