# TicketHub Design

TicketHub is a website that sells tickets for concerts and events. It has 2 million registered users. Most days are quiet, but when a very popular concert goes on sale, tens of thousands of people arrive at the same moment and compete for the same seats. This document follows six parts: requirements, estimates, API, data model, architecture and trade-offs.

## 1. Requirements

### Functional requirements

What the system must do:

- A user can browse and search events by name, city and date.
- A user can open an event and see its **seat map**, where every seat is shown as available, held or sold.
- A user can **hold** the seats they choose for a short time (5 minutes) while they pay.
- A user can **pay** for the held seats and receive their tickets.
- A user can see their orders and tickets.
- A user can register and log in.
- Held seats are released automatically when the hold runs out or the user cancels.

Out of scope for this design: creating events (admin tools), refunds, ticket resale and pricing rules.

### Non-functional requirements

How well the system must do it:

- **Speed:**
  - Normal pages answer in under 500 ms, and the seat map in under 1 second.
  - During a big sale, 95% of requests are answered in under 2 seconds. If the system is too busy, users see a waiting room, never an error page.
- **Correctness:**
  - A seat is **never sold to two people**.
  - A customer is never charged without receiving their tickets, and a confirmed ticket is never lost.
  - Clicking Pay twice never buys twice.
- **Fairness:**
  - Seats are sold first come, first served, and nobody can jump the queue.
  - One customer can buy at most 6 tickets per event, and bots are rate limited, so a few people cannot take everything.
- **Availability:** 99.9% uptime (about 8.8 hours of downtime per year), and the system must stay up during on-sale moments, when it matters most.
- **Scalability:** traffic can jump by roughly 500 times within seconds, and the system must cope with that.
- **Durability:** a paid order is never lost, which means backups and a second copy of the data.
- **Security:** HTTPS everywhere, hashed passwords, and card details handled only by a payment provider, never stored by TicketHub.

## 2. Estimates

### Assumptions

- Registered users: 2,000,000
- A normal day: 50,000 visitors, each viewing 10 pages, and 5,000 tickets sold
- A big sale: 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds)
- Each person in a big sale sends about 10 requests during those 10 minutes (the event page, seat map refreshes, hold attempts and payment) and makes about 3 hold attempts
- One day = 86,400 seconds
- Normal peak = 5 × the average
- At the start of a sale, traffic bursts to about 3 × the average of the 10-minute window

### Normal traffic

- Page views per day = 50,000 × 10 = 500,000
- Average = 500,000 ÷ 86,400 ≈ **6 page views/s**
- Peak = 5 × 5.8 ≈ **29 page views/s**
- Tickets sold = 5,000 ÷ 86,400 ≈ **0.06 tickets/s**, which is about one ticket every 17 seconds
- Peak = 5 × 0.058 ≈ **0.3 tickets/s**

### The big sale (the first 10 minutes)

- People arriving = 200,000 ÷ 600 ≈ **333 new people/s**
- Requests = 200,000 × 10 = 2,000,000
  - Average over the window = 2,000,000 ÷ 600 ≈ **3,300 requests/s**
  - Burst at the opening = 3 × 3,333 ≈ **10,000 requests/s**
- Hold attempts = 200,000 × 3 = 600,000
  - Average = 600,000 ÷ 600 = **1,000 holds/s**
  - Burst = 3 × 1,000 = **3,000 holds/s**
- Completed purchases are limited by the seats: 20,000 ÷ 600 ≈ **33 tickets/s**, and about **100 tickets/s** at the burst
- Competition = 200,000 people ÷ 20,000 seats = **10 people for every seat**, so 180,000 people (90%) will not get one

### Comparing the two

| Measure | Normal day | Big sale | Increase |
|---|---|---|---|
| Page views or requests per second (average) | 6 | 3,300 | about 575 × |
| Page views or requests per second (peak) | 29 | 10,000 | about 345 × |
| Tickets sold per second (average) | 0.06 | 33 | about 575 × |

- A normal day of 500,000 page views arrives in **2.5 minutes** during a big sale.
- Storage is small in both cases: 5,000 tickets a day is about 1.8 million tickets a year, which is roughly 2 GB.

### What the numbers mean for the design

- **A system built for a normal day would fail on a sale day.** The load is about 500 times higher within seconds, so the design must be built for the sale.
- **Most of the sale traffic is reading,** such as the event page and the seat map. It can be served by a CDN and a cache, so it does not reach the database.
- **The hard part is the small number of competing writes.** Thousands of hold attempts per second fight over 20,000 seats, and the database must decide each one correctly. Correctness matters more here than raw speed.
- **Fairness is a requirement, not an extra.** With 10 people for every seat, how people are let in decides who gets a ticket, so the design needs a waiting room.

## 3. API

- **Base URL:** `https://api.tickethub.example/v1`
- **Format:** JSON. Every endpoint except browsing events and logging in needs the header `Authorization: Bearer <token>`.
- **Ownership:** the server finds the user from the token, so the client never sends a user id.
- **Prices** are whole numbers in cents (`8000` means 80.00), so no rounding errors can creep in.
- **Dates** use ISO 8601 in UTC.

### Endpoints

| # | Method | Path | Description | Token needed | Success status |
|---|--------|------|-------------|--------------|----------------|
| 1 | `GET` | `/events` | Browse and search events (`city`, `date`, `q`, `page`, `limit`) | No | `200 OK` |
| 2 | `GET` | `/events/{id}` | Get one event's details | No | `200 OK` |
| 3 | `GET` | `/events/{id}/seats` | View the seat map, with each seat's status | Yes | `200 OK` |
| 4 | `POST` | `/events/{id}/holds` | Hold the chosen seats for 5 minutes | Yes | `201 Created` |
| 5 | `DELETE` | `/events/{id}/holds` | Release the seats the user is holding | Yes | `204 No Content` |
| 6 | `POST` | `/orders` | Pay for the seats the user is holding and receive the tickets | Yes | `201 Created` |
| 7 | `GET` | `/orders` | List the user's orders | Yes | `200 OK` |
| 8 | `GET` | `/tickets` | List the user's tickets | Yes | `200 OK` |
| 9 | `POST` | `/users` | Register a new account | No | `201 Created` |
| 10 | `POST` | `/auth/login` | Log in and receive a token | No | `200 OK` |

Notes on the table:

- **Browsing events:** endpoints 1 and 2. **Viewing seats:** endpoint 3. **Holding seats:** endpoint 4 (and 5 to give them back). **Paying:** endpoint 6. **Viewing your tickets:** endpoints 7 and 8.
- A **hold** is a resource of its own, so holding seats is a `POST` to `/holds` and releasing them is a `DELETE`. The hold lasts 5 minutes, and a user can hold at most 6 seats for one event.
- **`POST /orders` does not list the seats.** The server pays for the seats the user is currently holding for that event, so a user cannot pay for seats they do not hold.
- The **seat map is for display only.** It may be a second or two old, and the database makes the real decision when seats are held.

### Examples

**Browse events:** `GET /v1/events?city=Nairobi&page=1&limit=2`, answered with `200 OK`

```json
{
  "data": [
    {
      "id": 7,
      "name": "Sauti Live",
      "venue": "Nairobi Arena",
      "city": "Nairobi",
      "startsAt": "2026-12-12T17:00:00Z",
      "seatsAvailable": 18342
    },
    {
      "id": 9,
      "name": "Jazz Under the Stars",
      "venue": "Uhuru Gardens",
      "city": "Nairobi",
      "startsAt": "2026-12-19T18:30:00Z",
      "seatsAvailable": 640
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 14
}
```

**View the seats:** `GET /v1/events/7/seats`, answered with `200 OK`

```json
{
  "eventId": 7,
  "asOf": "2026-11-12T09:59:58Z",
  "seats": [
    { "id": 1201, "section": "A", "row": "C", "number": 14, "priceCents": 8000, "status": "available" },
    { "id": 1202, "section": "A", "row": "C", "number": 15, "priceCents": 8000, "status": "held" },
    { "id": 1203, "section": "A", "row": "C", "number": 16, "priceCents": 8000, "status": "sold" }
  ]
}
```

`status` is `available`, `held` or `sold`. `asOf` tells the client how fresh the map is.

**Hold seats:** `POST /v1/events/7/holds`

```json
{
  "seatIds": [1201, 1204]
}
```

Answered with `201 Created`, and the hold runs out at `holdExpiresAt`:

```json
{
  "eventId": 7,
  "seats": [
    { "id": 1201, "section": "A", "row": "C", "number": 14, "priceCents": 8000 },
    { "id": 1204, "section": "A", "row": "C", "number": 17, "priceCents": 8000 }
  ],
  "totalCents": 16000,
  "holdExpiresAt": "2026-11-12T10:05:00Z"
}
```

Holding is **all or nothing**: if any chosen seat is already taken, no seat is held and the answer is `409 Conflict`.

**Pay for the held seats:** `POST /v1/orders`

```http
POST /v1/orders
Authorization: Bearer eyJhbGciOi...
Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7
```

```json
{
  "eventId": 7,
  "paymentToken": "tok_8f3a91c2"
}
```

Answered with `201 Created`:

```json
{
  "id": 5521,
  "eventId": 7,
  "status": "paid",
  "totalCents": 16000,
  "tickets": [
    { "id": 90011, "seat": { "section": "A", "row": "C", "number": 14 } },
    { "id": 90012, "seat": { "section": "A", "row": "C", "number": 17 } }
  ],
  "createdAt": "2026-11-12T10:01:30Z"
}
```

- The `paymentToken` comes from the payment provider, so card details never reach TicketHub.
- The **`Idempotency-Key`** is a unique value the client creates for each purchase. If the same request is sent twice, for example by a double click or a retry after a bad connection, the server recognises the key and returns the original order instead of charging again.

**View my tickets:** `GET /v1/tickets`, answered with `200 OK`

```json
{
  "data": [
    {
      "id": 90011,
      "orderId": 5521,
      "event": { "id": 7, "name": "Sauti Live", "startsAt": "2026-12-12T17:00:00Z" },
      "seat": { "section": "A", "row": "C", "number": 14 }
    }
  ]
}
```

### Error codes

Every error uses the same body: `{ "error": { "code": "...", "message": "..." } }`.

| Status | When it happens |
|--------|-----------------|
| `400 Bad Request` | The request is invalid, for example no `seatIds`, or more than 6 seats |
| `401 Unauthorized` | The token is missing, invalid or expired |
| `402 Payment Required` | The payment provider declined the payment |
| `404 Not Found` | The event does not exist |
| `409 Conflict` | A chosen seat has already been taken by someone else |
| `410 Gone` | The hold has expired, so the seats were released |
| `429 Too Many Requests` | Too many requests, or the sale is busy and the user is in the waiting room |
| `500 Internal Server Error` | Something broke on the server |

**409 Conflict** (someone else got a seat first)

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "One or more of the seats you chose are no longer available.",
    "details": [{ "seatId": 1202, "status": "held" }]
  }
}
```

**410 Gone** (the hold ran out before payment)

```json
{
  "error": {
    "code": "HOLD_EXPIRED",
    "message": "Your hold has expired and the seats were released. Please choose your seats again."
  }
}
```

**429 Too Many Requests** (with the header `Retry-After: 30`)

```json
{
  "error": {
    "code": "WAITING_ROOM",
    "message": "This sale is very busy. You are in the waiting room and will be let in shortly."
  }
}
```

## 4. Data Model

The system uses a relational database, because correctness matters most: a seat must never be sold twice, and the database can enforce that for us. The SQL is written to run in SQLite.

### Tables

- **users:** the people with an account.
- **events:** the concerts and events for sale.
- **seats:** one row for every seat of every event. A seat's `status` is `available`, `held` or `sold`, and a held seat also records who holds it and until when.
- **orders:** one row for every completed purchase. Orders exist only after payment succeeds.
- **tickets:** one row for every seat that was bought, linking an order to a seat.

### Relationships

```text
 users ----< orders ----< tickets >---- seats >----- events
   1   many    1    many   1     1      many   many    1
   |                                      ^
   +--- (holds, for a short time) --------+
```

(`----<` means "one to many", reading from the "one" side.)

- **users to orders is one-to-many.** One user can place many orders, and each order belongs to one user.
- **events to seats is one-to-many.** An event has many seats, and each seat belongs to one event.
- **events to orders is one-to-many.** An order is for one event.
- **orders to tickets is one-to-many.** One order can contain several tickets (several seats).
- **seats to tickets is one-to-one at most.** A seat can have **zero or one** ticket, never two. This is the relationship that prevents double-booking, and it is enforced with a `UNIQUE` constraint.
- **users to seats (holding) is one-to-many, for a short time.** A user can hold several seats until the hold runs out.
- **Users and seats are many-to-many over time,** through orders and tickets: a user can buy many seats, and a seat can belong to different users at different events. The `tickets` table is the join table for this.

### CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;  -- SQLite only enforces foreign keys when this is on

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  venue         TEXT NOT NULL,
  city          TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  sale_opens_at TEXT NOT NULL
);

CREATE TABLE seats (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL,
  section     TEXT NOT NULL,
  row_label   TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  status      TEXT NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'held', 'sold')),
  held_by     INTEGER,
  held_until  TEXT,
  FOREIGN KEY (event_id) REFERENCES events (id),
  FOREIGN KEY (held_by)  REFERENCES users (id),
  UNIQUE (event_id, section, row_label, seat_number),
  CHECK (
    (status = 'held' AND held_by IS NOT NULL AND held_until IS NOT NULL)
    OR (status <> 'held' AND held_by IS NULL AND held_until IS NULL)
  )
);

CREATE TABLE orders (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  event_id        INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL CHECK (total_cents > 0),
  status          TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  idempotency_key TEXT NOT NULL,
  payment_ref     TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id)  REFERENCES users (id),
  FOREIGN KEY (event_id) REFERENCES events (id),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE tickets (
  id       INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  seat_id  INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (order_id) REFERENCES orders (id),
  FOREIGN KEY (seat_id)  REFERENCES seats (id)
);
```

### Indexes

```sql
CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user        ON orders (user_id, created_at DESC);
CREATE INDEX idx_tickets_order      ON tickets (order_id);
```

- **`seats (event_id, status)`:** the seat map and the "seats available" count both look up the seats of one event, and during a sale this is the busiest query.
- **`orders (user_id, created_at DESC)`:** "my orders" filters by user and shows the newest first.
- **`tickets (order_id)`:** finding the tickets of an order. The `UNIQUE` on `seat_id` already creates an index for finding the ticket of a seat.

## 4b. How Double-Booking Is Prevented (part of the data model)

### The problem

During a big sale, thousands of people click on seats at the same moment, so two requests for the same seat can reach the system at the same instant, possibly on different app servers. If the code first **checks** that a seat is free and then **changes** it in a second step, both requests can pass the check before either one changes anything, and the seat is sold twice. This mistake is called a **race condition**. The design below makes it impossible, using several layers, so that one failing layer is not enough to cause a double sale.

### Layer 1: One atomic statement decides, not a check followed by a change

To hold seats, the app runs a single `UPDATE` that checks and changes in the same step:

```sql
BEGIN IMMEDIATE;

UPDATE seats
SET status = 'held', held_by = :user_id, held_until = :expires_at
WHERE event_id = :event_id
  AND id IN (:seat_ids)
  AND (
        status = 'available'
        OR (status = 'held' AND (held_until < :now OR held_by = :user_id))
      );

-- If the number of rows changed equals the number of seats requested, COMMIT.
-- Otherwise ROLLBACK and answer 409 Conflict.
```

- The `WHERE` clause only matches seats that are free: available, or held by an expired hold, or already held by this same user (so a double click is harmless).
- A seat that someone else holds, or that is sold, does not match, so it is **not changed**.
- The database reports how many rows it changed. That number is the answer to "did I get the seats?".

### Layer 2: A transaction makes it all or nothing

The user asked for several seats, so the number of rows changed must equal the number of seats requested. If even one seat was not free, the app runs `ROLLBACK`, which undoes the whole statement, and answers `409 Conflict`. The user never ends up holding half of the seats they chose. A **transaction** groups steps so that they either all happen or none do.

### Layer 3: The database makes competing requests take turns

If two transactions update the same seat row at the same time, the database does not run them at the same instant. It uses a **lock** on the row (SQLite locks the whole database for writes), so the second transaction waits until the first one has finished. When the second one runs, its `WHERE` clause looks at the seat's **new** state, sees that it is held, and changes **0 rows**. So the first request wins and the second gets `409 Conflict`. Which one wins is decided by who reaches the database first, which is also what makes the sale first come, first served.

### Layer 4: Paying is a second transaction that re-checks the hold

A hold only reserves the seats. When a payment request arrives, the app first looks for an existing order with this user's `Idempotency-Key`. If one exists, it returns that order and charges nothing, so a double click or a retry is harmless. If not, it asks the payment provider to take the payment, using the same key, and then runs one transaction to record the sale:

```sql
BEGIN IMMEDIATE;

-- 1. The seats must still be held by this user, and the hold must not have expired
UPDATE seats
SET status = 'sold', held_by = NULL, held_until = NULL
WHERE id IN (:seat_ids)
  AND status = 'held'
  AND held_by = :user_id
  AND held_until >= :now;
-- If the rows changed are fewer than the seats being paid for: ROLLBACK, refund, answer 410 Gone.

-- 2. Record the order
INSERT INTO orders (user_id, event_id, total_cents, idempotency_key, payment_ref)
VALUES (:user_id, :event_id, :total_cents, :idempotency_key, :payment_ref);

-- 3. One ticket for each seat (:order_id is the id of the order just created)
INSERT INTO tickets (order_id, seat_id)
VALUES (:order_id, :seat_id_1), (:order_id, :seat_id_2);

COMMIT;
```

- All three steps happen together. If any step fails, everything is undone, so there is never an order without tickets, or a sold seat without an order.
- If the hold ran out while the payment was being processed and another person has taken the seats, step 1 changes too few rows. The transaction is rolled back, the payment is **refunded automatically**, and the user is told the hold expired (`410 Gone`).

### Layer 5: Constraints are the last line of defence

Even if there were a bug in the app code, the database refuses to break these rules:

- **`tickets.seat_id` is `UNIQUE`.** A seat can have only one ticket, ever. A second ticket for the same seat is rejected with `UNIQUE constraint failed`, and the transaction is rolled back.
- **`CHECK` on `seats`.** A seat is `held` only if it has a holder and an expiry time, and is never held and sold at once. A half-updated seat is rejected.
- **`UNIQUE (user_id, idempotency_key)` and `UNIQUE (payment_ref)` on `orders`.** If two identical payment requests reach the database at the same moment, only one order can be recorded, and one payment cannot be used for two orders. This backs up the look-up in layer 4.
- **Foreign keys.** A ticket cannot point to a seat or an order that does not exist.

### Layer 6: Expired holds are released

A seat with an expired hold can be taken straight away, because the `WHERE` clause in layer 1 treats it as free. A background worker also puts expired seats back to `available` every few seconds, so the seat map is correct:

```sql
UPDATE seats
SET status = 'available', held_by = NULL, held_until = NULL
WHERE status = 'held' AND held_until < :now;
```

### The cache never decides

The seat map is cached for a second or two to survive the big sale, so it can show a seat as available when it has just been taken. That is harmless, because the cache is only for display. **The decision is always made by the database** at the moment of the hold.

### Example: two people click the same seat

Anna and Brian both click seat 1201 at 10:00:00. Their requests reach two different app servers.

1. Both servers run the `UPDATE` from layer 1.
2. The database handles them one after the other. Anna's runs first, changes 1 row, and she gets `201 Created` with a 5-minute hold.
3. Brian's runs second. The seat is now held by Anna, so his `WHERE` clause does not match and **0 rows change**. He is rolled back and gets `409 Conflict`: "One or more of the seats you chose are no longer available."
4. Anna pays within 5 minutes and gets her ticket. If she does not, the hold expires and the seat goes back on sale.

### Summary of the layers

| Layer | What it stops |
|---|---|
| 1. Atomic conditional `UPDATE` | Two requests both passing a "check" before either changes the seat |
| 2. Transaction, all or nothing | A user holding only part of the seats they chose |
| 3. Locks, one at a time | Two updates to the same seat running at the same instant |
| 4. Payment transaction that re-checks | Paying for seats whose hold has expired or belongs to someone else |
| 5. Constraints (`UNIQUE`, `CHECK`) | A bug in the code creating two tickets for one seat |
| 6. Hold expiry | Seats staying locked up by people who never pay |

## 5. Architecture

### Diagram

```text
                      [ Client (browser or app) ]
                                   |
          +------------------------+------------------------+
          | 1. DNS lookup          | 2. page files          | 3. API
          v                        v                        v
       [ DNS ]                  [ CDN ]             [ Waiting room ]
                                        (big sales only)    |
                                                            v
                                                    [ Load balancer ]
                                                            |
                                                  +---------+---------+
                                                  v                   v
                                          [ App server 1 ]    [ App server 2 ]
                                                  |                   |
     +--------------+-----------------+-----------+--+------------+---+
     | check cache  | holds, orders   | browse reads | jobs       | payments
     v              v                 v              v            v
 [ Cache ]   [ Primary DB ]-->[ Read replica ]   [ Queue ]  [ Payments ]
             replicates to the replica               |
                                                     v
                                                [ Worker ] emails, refunds
```

- **1. DNS lookup:** the client asks DNS for the address of `api.tickethub.example`.
- **2. page files:** the web page, its images and the event pages come from the CDN.
- **3. API:** requests for seats, holds and payments go through the waiting room (only during a big sale) and the load balancer to one of the app servers.
- **check cache:** an app server looks in the cache first for event details and the seat map.
- **holds, orders:** every hold and every payment is written to the primary database, and only there.
- **browse reads:** browsing events, "my orders" and "my tickets" are read from the read replica.
- **jobs:** an app server puts background jobs on the queue, and a worker takes them.
- **payments:** the app server asks the external payment provider to take the money.

### What each component does

- **Client:** the browser or mobile app that shows events and the seat map and sends the user's requests.
- **DNS:** turns the name `api.tickethub.example` into an address, which solves users having to remember numbers and lets us move servers without changing the name.
- **CDN:** serves the page files, images and event pages from servers near the user, which solves slow loading and takes most of the browsing traffic away from our own servers.
- **Waiting room:** during a big sale it lets in only as many buyers at a time as the system can handle and puts the rest in a fair queue, which solves 200,000 people hitting the servers in the same minute.
- **Load balancer:** spreads requests across the app servers and skips any that are down, which solves one server being overloaded or failing.
- **App servers (two or more):** run the API code, such as checking tokens and running the hold and payment transactions, and because they keep no user data in memory, any of them can answer any request and we can add more when traffic rises.
- **Cache:** keeps event details and the seat map in memory for a second or two, which solves thousands of people asking the database for the same seat map.
- **Primary database:** stores the users, seats, orders and tickets and is the only place that decides who gets a seat, which solves two people buying the same seat.
- **Read replica:** a live copy of the primary that answers browsing reads, which solves reads slowing down the primary while it handles holds and payments.
- **Queue:** holds background jobs, such as sending ticket emails, until a worker is free, which solves making the user wait for slow work and smooths out sudden bursts.
- **Worker:** takes jobs from the queue, sends ticket emails, issues refunds and puts expired holds back on sale, which solves slow work slowing down the app servers.
- **Payment provider (external):** takes the card payment, which solves TicketHub having to store card details and be responsible for their security.

### How the system survives the big sale

A big sale is 345 to 575 times busier than a normal day (see the estimates), so the design protects its weakest part, the primary database, which must decide every seat correctly.

1. **Before the sale:**
   - The app servers are scaled up in advance, because adding servers takes minutes, which is too slow to react to a sale that starts in seconds.
   - The event page and its images are already on the CDN, and the cache is filled.
   - Until the sale opens, people wait in the waiting room, and everyone who joins before the opening is placed in a **random order**, so a faster connection or a bot gives no advantage.
2. **The opening: 200,000 people arrive.**
   - The CDN serves the page files, so they never reach our servers.
   - The **waiting room** admits only a limited number of buyers at a time, for example 5,000. If each active buyer sends about one request every 3 seconds, that is 5,000 ÷ 3 ≈ **1,700 requests/s**, instead of a spike of 10,000 requests/s. The rest wait and see their place in the queue, so nobody sees an error page.
3. **Looking at seats:**
   - The seat map is cached for a second or two, so the database is asked for it about **once per second per event**, however many thousands of people are looking.
   - A seat that looks available but was just taken is harmless, because the database makes the real decision when the seat is held (see 4b).
4. **Holding seats:**
   - Holds go to the primary database. With the waiting room in front, there are hundreds of hold attempts per second and not 3,000.
   - Each is a tiny `UPDATE` that touches only a few seat rows, so one primary can process them quickly, and the competing requests take turns as described in 4b.
5. **Paying:**
   - Payments go to the external provider, and the 5-minute hold means a slow payment does not lose the seat.
   - Ticket emails go on the queue, so the user sees their tickets straight away and the emails follow.
6. **Protecting against bots:**
   - A CAPTCHA at the entrance of the waiting room, a limit on requests per user and per address (`429`), and the limit of 6 seats per customer stop a few people taking most of the seats.
7. **If it is still too busy:**
   - The waiting room admits people more slowly, so users wait longer and do not see errors.
   - The read replicas absorb browsing, and the cache can keep serving a seat map that is a few seconds old.
8. **After the sale:** the page changes to "Sold out", which the CDN and the cache serve, and the traffic drops back within minutes.

### What happens when something fails

| Failure | What happens |
|---------|--------------|
| An app server fails | The load balancer stops sending requests to it, and the others carry on |
| The cache fails | App servers read from the database instead, which is slower but correct, and the waiting room slows admission to protect the database |
| The primary database fails | A standby replica is promoted to primary. For seats and orders the standby is kept in step with the primary, so a sold seat is never lost |
| A read replica fails | Browsing reads go to the primary until a new replica is built |
| The payment provider is slow or down | Users keep their 5-minute hold and can retry, and the idempotency key stops a double charge |
| The queue or a worker fails | Only background work is delayed. Tickets are already saved, and failed jobs are tried again |

## 6. Trade-offs

1. **Waiting room: fairness and stability against convenience.**
   - **Benefit:** the system is never swamped, nobody sees an error page, and the queue is fair. People who join before the opening are placed in a random order, so a faster connection or a bot gives no advantage.
   - **Cost:** some people must wait, and a few will give up and leave. It is also an extra component to build and run, and random ordering means that someone who arrived first is not guaranteed to be served first.
   - **Choice:** I accept this, because with 10 people for every seat, a crash or an unfair rush would be far worse than a wait.

2. **One primary database for seats: correctness against scale.**
   - **Benefit:** all seat decisions are made in one place, so a seat cannot be sold twice and there are no conflicts between copies to resolve.
   - **Cost:** the primary is the one part that cannot simply be multiplied, so it limits how many holds can be processed per second.
   - **Choice:** correctness comes first. The waiting room and the cache keep the load on the primary to hundreds of small updates per second. If one event ever outgrew a single database, the seats could be split across databases by event, because a sale only touches the seats of one event.

3. **A 5-minute hold: fairness to buyers against seats locked up.**
   - **Benefit:** a buyer keeps their seats while they pay and does not lose them to someone else halfway through.
   - **Cost:** seats held by people who never pay look unavailable until the hold runs out, so other buyers may think the event is nearly sold out, and the organiser may sell slightly later than it could.
   - **Choice:** 5 minutes is long enough to pay and short enough to free the seat soon. The limit of 6 seats per customer and the worker that releases expired holds reduce the cost.

4. **A cached seat map: speed against freshness.**
   - **Benefit:** the database is asked for the seat map about once per second per event, instead of thousands of times per second.
   - **Cost:** the map can be a second or two old, so a user may click a seat that was just taken and get a `409 Conflict`.
   - **Choice:** this is acceptable because the map is only for display, and the database makes the real decision when a seat is held. A message such as "that seat was just taken, please choose another" is a small price.

5. **Keeping the standby database in step: safety against speed.**
   - **Benefit:** if the primary fails, the standby has every sale, so a seat that was already sold cannot be sold again.
   - **Cost:** each seat or order change must also reach the standby before it is confirmed, which makes writes slightly slower.
   - **Choice:** this is worth it for seats and orders, where a mistake is a double sale. Other data, such as the read replicas that serve browsing, can lag a little behind.