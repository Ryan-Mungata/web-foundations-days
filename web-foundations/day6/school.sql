-- School database - Day 6
--- Settings and reset ---
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- Create Students Table --
CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

--Courses Table --
CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

-- Enrolments Table: The Join Table --
CREATE TABLE enrolments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  grade INTEGER CHECK (grade BETWEEN 0 AND 100),
  FOREIGN KEY (student_id) REFERENCES students (id),
  FOREIGN KEY (course_id) REFERENCES courses (id),
  UNIQUE (student_id, course_id)
);

-- Data --
-- 1. Students Table (Parent) --
INSERT INTO students (id, name, email) VALUES
(1, 'Clementine Wanjiru', 'wanjiruclem@gmail.com'),
(2, 'Abawata Leonne', 'chamaleo@gmail.com'),
(3, 'Jabir Abdi', 'abdiibir@gmail.com'),
(4, 'Natasha Koskei', 'nattykos@gmail.com'),
(5, 'Ryan Kyalo', 'rkyalo@gmail.com'),
(6, 'Kimberly Anne', 'kimeyanne@gmail.com');

-- 2. Courses Table (Parent) --
INSERT INTO courses (id, title) VALUES
(1, 'Graphic Design'),
(2, 'Cyber Security'),
(3, 'Photography'),
(4, 'Web Development'),
(5, 'Networking');

-- 3. Enrolment Table --
INSERT INTO enrolments (student_id, course_id, grade) VALUES
(1, 1, 85),
(1, 2, 78),
(2, 1, 90),
(2, 3, NULL),
(3, 2, 66),
(3, 1, 72),
(4, 4, 90),
(4, 5, 99),
(5, 3, 99),
(5, 2, 60);


-- Queries
-- 1. All Courses for one student (found by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses ON courses.id = enrolments.course_id
WHERE students.name = 'Clementine Wanjiru'
ORDER BY courses.title;

-- 2. All students on one course
SELECT students.name, enrolments.grade
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students ON students.id = enrolments.student_id
WHERE courses.title = 'Graphic Design'
ORDER BY students.name;

-- 3. Number of Students per course
SELECT courses.title, COUNT(enrolments.id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id, courses.title
ORDER BY student_count DESC, courses.title;

-- 4. Students with no enrolments
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.id IS NULL;

-- 5. Update one Enrolment's grade
UPDATE enrolments
SET grade = 75
WHERE student_id = 2 AND course_id = 3;


-- Check if the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses ON courses.id = enrolments.course_id
WHERE enrolments.student_id = 2 AND enrolments.course_id = 3;