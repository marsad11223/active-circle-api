# Mobile app and web app contract

This contract is for both clients:

- The Expo mobile app
- The web frontend

Implement the same behaviour in both. The API already accepts these values. Do not invent a different label in one app.

Cancellation rules for both apps are in [FRONTEND_CANCELLATION_POLICY.md](./FRONTEND_CANCELLATION_POLICY.md). That document applies to the mobile app and the web app.

## Difficulty

Add **All levels** as a fourth difficulty option. Customers have asked for a session that is open to every ability, not only Beginner, Intermediate, or Advanced.

Show these options, in this order, everywhere a host picks a difficulty:

| Label shown | Value sent to the API |
| --- | --- |
| Beginner | `Beginner` |
| Intermediate | `Intermediate` |
| Advanced | `Advanced` |
| All levels | `All levels` |

The value is case-sensitive. Send `All levels`, not `All level`, `all levels`, or `All Levels`.

Difficulty stays optional. A host can still leave it unset.

### Where to show it

- Host create-activity form, on mobile and web.
- Host edit-activity form, on mobile and web.
- Recurring series edit, when the series difficulty can be changed.
- Activity detail, cards, and filters: display the stored `difficultyLevel` as-is. An activity saved as `All levels` must read **All levels**, not Beginner.

### Requests

Auth: `Authorization: Bearer <accessToken>`.

Create an activity: `POST /activities`

```json
{ "difficultyLevel": "All levels" }
```

Update an activity: `PUT /activities/:id`

```json
{ "difficultyLevel": "All levels" }
```

Update a recurring series: `PATCH /activities/series/:seriesId`

```json
{ "difficultyLevel": "All levels" }
```

Any other string returns `400`. Allowed values are only `Beginner`, `Intermediate`, `Advanced`, and `All levels`.

Existing activities keep whatever `difficultyLevel` they already have. Do not rewrite them unless the host edits that activity and chooses a new option.
