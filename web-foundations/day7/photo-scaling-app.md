# SnapShare Scaling Plan

## Assumptions

- Registered users: 10,000,000
- Active each day: 10%
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- Average photo size: 2 MB
- Thumbnail size: 50 KB (one thumbnail per photo)
- One day = 86,400 seconds
- Peak traffic = 5 × average
- Units are decimal: 1 TB = 1,000 GB, 1 GB = 1,000 MB, 1 MB = 1,000 KB

## Estimates

### Daily active users

- DAU = 10,000,000 × 10% = **1,000,000**

### Uploads per second

- Uploads per day = 1,000,000 × 1 = 1,000,000
- Average = 1,000,000 ÷ 86,400 ≈ **12 uploads/s**
- Peak = 5 × 11.6 ≈ **58 uploads/s**

### Feed views per second

- Feed views per day = 1,000,000 × 50 = 50,000,000
- Average = 50,000,000 ÷ 86,400 ≈ **579 views/s**
- Peak = 5 × 579 ≈ **2,900 views/s**

### Storage per year

- Originals per day = 1,000,000 × 2 MB = 2 TB
- Thumbnails per day = 1,000,000 × 50 KB = 50 GB
- Per day = about 2.05 TB
- Per year = 2.05 TB × 365 ≈ **750 TB (about 0.75 PB)**
  - Originals: 730 TB
  - Thumbnails: 18.25 TB

## Read-heavy or write-heavy?

SnapShare is **read-heavy**. About 579 feed views happen every second but only about 12 uploads, so there are roughly 50 reads for every write (579 ÷ 12 ≈ 50). This makes sense for the app, because a photo is uploaded once but then viewed again and again by many people.

What this means for my design:

- Because reads dominate, I put most of my effort into making reads fast and cheap. The CDN serves photos from servers near the user, the cache answers popular feed requests from memory, and the read replica answers database reads so the primary database is not overloaded.
- Writes are small by comparison (about 58 per second even at peak), so one primary database is enough for them. I do not need to make the write side more complicated.
- At peak, about 2,900 views per second is too much traffic to send to one database. My aim is that most requests never reach it, because the CDN and the cache answer them first.
- I accept that the feed can be slightly out of date, for example a new photo showing up a few seconds late. That is a fair price for speed, and I explain it in the trade-offs.
- If SnapShare were write-heavy instead, I would focus on queues and on splitting the database, because the writes would be the bottleneck.

## Why photos are not stored in the database

I would not store the photos in the database, for four reasons:

1. **Size.** Photos add about 750 TB per year. A database is designed for small rows of structured data, such as a name, a date or a number, not for millions of 2 MB files. It would grow far too large.
2. **Speed.** Big files make queries and backups slower. The read replica would also have to copy every photo, so replication would fall behind. The files also take up the database's memory, leaving less room for the data it should answer quickly.
3. **Cost.** Storing a terabyte in a database costs much more than storing it in object storage, which is built for large, cheap storage.
4. **Serving.** If the photos were in the database, every view would go through the database and an app server. If they are in object storage, the CDN can fetch the file directly and deliver it, and the database is not involved at all.

So the photos go into **object storage**, which stores files cheaply at huge scale and keeps several copies so nothing is lost. The database stores only each photo's **metadata**: its id, its owner, the location of the original and thumbnail, the upload time and the caption. In simple terms, the database holds the address of the photo, and object storage holds the photo itself.

## Architecture

```text
                          [ Users: phones, browsers ]
                                       |
            +--------------------------+----------------------+
            | photos, thumbnails        feed + upload requests|
            v                                                 v
         [ CDN ]                                      [ Load balancer ]
            |                                                 |
            | on a miss                                       |
            |                                                 v
            |                                   [ App servers (many copies) ]
            |                                                 |
            |             +-------------+-------------+-------+-------+
            |             |save photo   |read feed    |metadata       |job
            |             |             v             v               v
            |             |         [ Cache ]  [ Primary DB ]     [ Queue ]
            |             | cache miss  |             | replicates    |
            |             |             v             v               v
            |             |            [ Read replica ]          [ Worker ]
            |             |           reads original, saves thumbnail |
            +-------------+--------------+----------------------------+
                                         v
                    [ Object storage: originals + thumbnails ]
```

How to read the diagram:

- **Photos and thumbnails:** requested through the CDN. If the CDN does not have the file, it fetches it from object storage.
- **Feed and upload requests:** go to the load balancer, which sends each one to an app server.
- **Reading the feed:** the app server asks the cache first. On a cache miss, it reads from the read replica.
- **Uploading:** the app server saves the original photo to object storage, writes the metadata to the primary database, and puts a thumbnail job on the queue.
- **Thumbnails:** the worker takes jobs from the queue, reads the original from object storage, and saves the thumbnail back to object storage.
- **Replication:** the primary database copies every change to the read replica.

## What each component does

- **CDN:** serves photos and thumbnails from servers close to the user, which solves slow loading for people far from our servers and takes load off object storage.
- **Load balancer:** spreads incoming requests across the app servers, which solves one server being overloaded and lets the system keep working if a server fails.
- **App servers:** run the SnapShare code for the feed, uploads and login, and having many identical copies solves the problem that one server cannot handle about 2,900 views per second.
- **Cache:** keeps popular feed data in memory, which solves the database answering the same read over and over.
- **Primary database:** stores the users, follows and photo records and accepts every write, which solves the need for one reliable source of truth.
- **Read replica:** a live copy of the primary database that only answers reads, which solves the primary being overloaded by read traffic.
- **Object storage:** stores the photo and thumbnail files cheaply and safely at huge scale, which solves 750 TB of new photos per year not fitting in a database.
- **Queue:** holds thumbnail jobs until a worker is free, which solves making the user wait for a slow job and smooths out sudden bursts of uploads.
- **Worker:** takes jobs from the queue and creates the thumbnails, which solves slow, heavy work slowing down the app servers.

## Upload flow

1. The user picks a photo in the app, and the app sends the upload request to the **load balancer**.
2. The load balancer passes the request to one of the **app servers**.
3. The app server checks the request: the user is logged in, the file is really an image, and its size is within the limit.
4. The app server saves the original photo (about 2 MB) in **object storage**.
5. The app server writes the photo's metadata (id, owner, file location, upload time) to the **primary database**.
6. The app server adds a "create thumbnail" job, containing the photo id and file location, to the **queue**.
7. The app server immediately tells the user that the upload worked. The user does not wait for the thumbnail.
8. Later, a **worker** takes the job from the queue, reads the original from object storage, creates the 50 KB thumbnail, and saves it back to object storage under a predictable name based on the photo id.
9. The primary database copies the new photo record to the **read replica**, so it can appear in followers' feeds.
10. When followers load their feed, the thumbnail reaches them through the **CDN**, which fetches it from object storage the first time and keeps a copy for later views.

## Trade-offs

1. **Cache: speed against fresh data.**
   - The cache makes the feed fast and protects the database, but it can show old data, such as a new photo or a like count that is missing for a short while.
   - I also have to decide how long to keep data in the cache. A short time means fresher data but more work for the database, and a long time is faster but more out of date.
   - I choose a short time, such as a minute, because a feed that is slightly behind is acceptable and a slow feed is not.

2. **Queue and worker: a fast upload against a delayed thumbnail.**
   - The user gets a reply straight away because the thumbnail is made in the background, but the thumbnail is not available instantly. Followers may briefly see a placeholder.
   - The queue and the worker are also extra parts that must be run and watched.
   - I accept this because a quick upload matters more to users than a thumbnail that appears a few seconds later.

3. **Read replica: less load on the primary against replication lag.**
   - The replica takes read traffic away from the primary, but it copies data a moment after the primary, so a user might not see their own new photo in the feed straight away.
   - It also costs more because it is an extra database that has to be kept healthy.
   - If this became a problem, I could show a user's own recent uploads directly from the primary database for the first few moments.