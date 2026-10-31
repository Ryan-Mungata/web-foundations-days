# School Database Design

This document explains the design of the school database in `school.sql`. It stores students, the courses they can take, and the grade each student gets on each course.

## Tables

### students

- Stores each student **once**.
- Columns:
  - `id` is the primary key, so every student has a different number.
  - `name` is required (`NOT NULL`).
  - `email` is required and `UNIQUE`, so two students can never share the same email address.
- Example: student 1 is Clementine Wanjiru.

### courses

- Stores each course **once**.
- Columns:
  - `id` is the primary key.
  - `title` is required (`NOT NULL`).
- Example: course 1 is Graphic Design.

### enrolments

- Stores **one row for every student who is on a course**, together with their grade.
- Columns:
  - `id` is the primary key.
  - `student_id` is a foreign key to `students(id)` and is required.
  - `course_id` is a foreign key to `courses(id)` and is required.
  - `grade` is a number from 0 to 100 (`CHECK`). It can be empty (`NULL`) until the student has been graded.
- `UNIQUE (student_id, course_id)` is the rule that stops the same student enrolling on the same course twice.
- Example: the row `(1, 1, 85)` means student 1 (Clementine) is on course 1 (Graphic Design) with a grade of 85.

## Relationships

- **students to enrolments is one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses to enrolments is one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students to courses is many-to-many.** One student can take many courses, and one course can have many students. For example, Clementine is on both Graphic Design and Cyber Security, and Cyber Security also has Jabir and Ryan.
- **Why a join table is needed:**
  - A table cell can hold only one value, so a student row cannot store a list of courses and still be searched, counted or checked by a foreign key.
  - The `enrolments` table solves this by holding one row per student-and-course pair, so the many-to-many relationship becomes two one-to-many relationships.
  - It is also the right home for the `grade`, because a grade belongs to one student on one course, not to the student or the course alone.
  - Because every fact is stored in only one place (a normalised design), changing a student's email means updating one row.

## Index

- **Index to add:** an index on `enrolments(course_id)`.

  ```sql
  CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);
  ```

- **Reason:**
  - Two of the queries search by course: finding all students on one course, and counting the students per course.
  - The `UNIQUE (student_id, course_id)` rule already creates an automatic index, but it is sorted by `student_id` first, so it only helps searches by student and not searches by course.
  - Without an index on `course_id`, SQLite has to read every row of `enrolments` (a `SCAN`). With the index, it jumps straight to the matching rows (a `SEARCH`).
  - This makes little difference with 10 rows, but it matters a lot when a real school has thousands of enrolments.
- **Trade-off:** an index uses extra storage and makes inserts and updates slightly slower, so it should only be added to columns that are searched often.

